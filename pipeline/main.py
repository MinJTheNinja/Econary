"""YTN + 한경 기사 → TESAT 용어 추출·채점 → 고정 단어 연결 → 시사 설명·퀴즈 후보 생성 → Supabase(pending).

출처마다 독립적으로 처리해서 한쪽이 실패해도 다른 쪽과 그날의 학습 콘텐츠 전체가 멈추지 않는다 (PRD 2.1).
단계별 결과(fetch/parse/link/generate)는 pipeline_runs 에 기록된다.

실행:
    py pipeline/main.py              # 두 출처 모두
    py pipeline/main.py --source ytn # 하나만
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from email.utils import parsedate_to_datetime

import config
import content_generator
import hankyung_article
import hankyung_feed
import history_store
import keyword_extractor
import supabase_store
import ytn
from word_linker import WordIndex, link_keywords

log = logging.getLogger("tesat_pipeline")

CANDIDATE_MIN_SCORE = 60  # 목록에 없는 용어 중 MEDIUM 이상만 후보로 쌓는다


def _ymd(published: str, source: str) -> str:
    """출처별 발행시각 표기 → YYYY-MM-DD"""
    try:
        if source == "ytn":
            return datetime.strptime(published[:8], "%Y%m%d").strftime("%Y-%m-%d")
        return parsedate_to_datetime(published).strftime("%Y-%m-%d")
    except Exception:
        return ""


SOURCES = {
    "ytn": {"label": "YTN", "feed": ytn, "fetch": ytn.fetch_article,
            "errors": (ytn.FeedFetchError,), "article_errors": (ytn.ArticleFetchError,)},
    "hankyung": {"label": "한국경제신문(한경)", "feed": hankyung_feed, "fetch": hankyung_article.fetch_article,
                 "errors": (hankyung_feed.FeedFetchError,), "article_errors": (hankyung_article.ArticleFetchError,)},
}


def process_source(source: str, index: WordIndex) -> None:
    spec = SOURCES[source]
    feed = spec["feed"]

    # 1) 새 기사 감지
    try:
        entries = feed.find_new_articles()
    except Exception as e:
        log.exception("%s 목록 수집 실패", source)
        supabase_store.record_run(source, "fetch", "fetch_failed", 0, str(e))
        return
    supabase_store.record_run(source, "fetch", "ok", len(entries))
    if not entries:
        log.info("%s: 새 기사 없음", source)
        return
    log.info("%s: 새 기사 %d건", source, len(entries))

    # 2) 본문 추출 (개별 실패는 건너뛰고 기록)
    articles, failed_ids, failures = [], [], []
    for e in entries:
        try:
            body = spec["fetch"](e.url)
        except Exception as ex:
            failed_ids.append(e.article_id)
            failures.append(f"{e.url}: {ex}")
            continue
        articles.append({"url": e.url, "title": e.title or body.get("title", ""), "category": e.category,
                         "text": body["text"], "article_id": e.article_id,
                         "published_ymd": _ymd(e.published, source).replace("-", "")})
    supabase_store.record_run(source, "parse", "ok" if articles else "parse_failed", len(articles),
                              "\n".join(failures))
    if not articles:
        feed.mark_processed(failed_ids)  # 재시도해도 같은 결과 (유료 기사 등)
        return

    # 3) 용어 추출·채점 (슈카월드 채점 기준 그대로)
    try:
        keywords = keyword_extractor.extract_keywords_from_articles(articles, spec["label"])
    except keyword_extractor.ExtractionError as e:  # QuotaExceededError 포함 → 다음 실행에서 재시도
        log.warning("%s 용어 추출 실패: %s", source, e)
        supabase_store.record_run(source, "generate", "generate_failed", 0, f"용어 추출: {e}")
        feed.mark_processed(failed_ids)
        return
    history_store.record_video_results("", "", "", keywords)
    _save_results(source, articles, keywords)

    # 4) 고정 단어 연결 + 목록에 없는 용어는 후보로
    linked = link_keywords(index, keywords)
    for kw in linked.unmatched:
        if kw.get("total_score", 0) >= CANDIDATE_MIN_SCORE:
            supabase_store.upsert_candidate(kw, source)
    supabase_store.record_run(
        source, "link", "ok" if linked.linked else "no_match", len(linked.linked),
        "연결: " + ", ".join(w.term for w, _ in linked.linked)
        + f"\n목록에 없음({len(linked.unmatched)}): " + ", ".join((k.get("korean_name") or k.get("term", "")) for k in linked.unmatched),
    )
    log.info("%s: 용어 %d개 중 %d개 단어 연결", source, len(keywords), len(linked.linked))

    # 5) 설명·퀴즈 생성 (최근에 만든 단어는 건너뜀)
    recent = supabase_store.recent_content_word_ids(config.CONTENT_COOLDOWN_DAYS)
    by_url = {a["url"]: a for a in articles}
    tasks = []
    for word, kw in linked.linked:
        if word.id in recent:
            continue
        art = by_url.get((kw.get("source_urls") or [""])[0]) or articles[0]
        tasks.append(content_generator.WordTask(
            word_id=word.id, term=word.term, meaning=word.meaning, article_title=art["title"],
            article_url=art["url"], article_text=art["text"], source=source,
            source_date=_ymd(art["published_ymd"], "ytn") if art["published_ymd"] else "", keyword=kw,
        ))
    tasks = tasks[: config.MAX_WORDS_TO_GENERATE_PER_RUN]

    if tasks:
        try:
            rows, rejected = content_generator.generate(tasks)
        except keyword_extractor.ExtractionError as e:
            log.warning("%s 콘텐츠 생성 실패: %s", source, e)
            supabase_store.record_run(source, "generate", "generate_failed", 0, str(e))
            feed.mark_processed(failed_ids)
            return
        run_id = supabase_store.record_run(
            source, "generate", "ok" if rows else "generate_failed", len(rows) // 2,
            ("버림: " + "; ".join(rejected)) if rejected else "")
        try:
            supabase_store.insert_contents(rows, run_id)
        except supabase_store.StoreError as e:
            # 단계 기록을 먼저 남겨야 콘텐츠가 run id 를 참조할 수 있으므로, 저장 실패 시 그 기록을 실패로 고친다
            supabase_store.update_run(run_id, "generate_failed", 0, f"콘텐츠 저장 실패: {e}")
            raise
        log.info("%s: 단어 %d개 콘텐츠 생성(검수 대기), %d개 버림", source, len(rows) // 2, len(rejected))
    else:
        supabase_store.record_run(source, "generate", "ok", 0, "새로 만들 단어 없음 (연결 없음 또는 최근 생성됨)")

    feed.mark_processed([a["article_id"] for a in articles] + failed_ids)


def _save_results(source: str, articles: list[dict], keywords: list[dict]) -> None:
    out = config.RESULTS_DIR / f"{source}_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps({"articles": [{k: a[k] for k in ("url", "title", "published_ymd")} for a in articles],
                               "keywords": keywords}, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=list(SOURCES), action="append")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.FileHandler(config.LOG_DIR / f"run_{datetime.now():%Y%m%d}.log", encoding="utf-8"),
                  logging.StreamHandler(sys.stdout)],
    )
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    words = supabase_store.fetch_words()
    index = WordIndex(words)
    log.info("고정 단어 %d개 로드 (매칭 키 %d개)", len(words), len(index))

    for source in args.source or list(SOURCES):
        try:
            process_source(source, index)
        except Exception as e:  # 한 출처의 예기치 못한 오류가 다른 출처를 막지 않도록
            log.exception("%s 처리 중 오류", source)
            try:
                supabase_store.record_run(source, "generate", "generate_failed", 0, f"예기치 못한 오류: {e}")
            except Exception:
                log.exception("처리 상태 기록 실패")
    return 0


if __name__ == "__main__":
    sys.exit(main())
