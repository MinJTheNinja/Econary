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
EVER_DAYS = 3650          # "콘텐츠가 한 번이라도 있었던 단어" 판단 기간 (본문 등장 단어 우선순위용)
MAX_EXTRACTION_ATTEMPTS = 3   # 용어 추출이 이만큼 실패한 기사는 포기하고 처리 완료로 표시
EXTRACTION_FAILURES_FILE = config.DATA_DIR / "extraction_failures.json"


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

    # 3) 용어 추출·채점 (슈카월드 채점 기준 그대로). 400 은 반으로 나눠 재시도하고, 그래도 실패한 기사는
    #    처리 완료로 표시하지 않아 다음 실행에서 다시 본다. 한도 초과면 그때까지 결과로 계속 진행한다.
    try:
        extraction = keyword_extractor.extract_articles(articles, spec["label"])
    except keyword_extractor.ExtractionError as e:  # 설정 오류·재시도 불가 오류
        log.warning("%s 용어 추출 실패: %s", source, e)
        extraction = keyword_extractor.ExtractionOutcome(
            failed_article_ids=[a["article_id"] for a in articles], quota_error=str(e))
    keywords = extraction.keywords
    log.info("%s: %s", source, extraction.summary().replace("\n", " / "))
    if keywords:
        history_store.record_video_results("", "", "", keywords)
    _save_results(source, articles, keywords)
    # 3회 포기 카운트는 400 으로 재시도까지 실패한 기사만 센다 (한도 초과로 건너뛴 기사는 그냥 다음에 다시)
    give_up = _note_extraction_failures(source, extraction.dropped_article_ids,
                                        [a["article_id"] for a in articles if a["article_id"] not in extraction.failed_article_ids]
                                        + extraction.dropped_article_ids)
    retry_later = [aid for aid in extraction.failed_article_ids if aid not in give_up]

    # 4) 고정 단어 연결: LLM 용어 + 기사 본문에 직접 나온 고정 단어. 목록에 없는 용어는 후보로
    linked = link_keywords(index, keywords)
    for kw in linked.unmatched:
        if kw.get("total_score", 0) >= CANDIDATE_MIN_SCORE:
            supabase_store.upsert_candidate(kw, source)
    llm_ids = {w.id for w, _ in linked.linked}
    scanned = [h for h in index.scan_articles(articles) if h.word.id not in llm_ids]

    recent = supabase_store.recent_content_word_ids(config.CONTENT_COOLDOWN_DAYS)
    ever = supabase_store.recent_content_word_ids(EVER_DAYS)
    # 우선순위: LLM 연결 > 본문 등장. 본문 등장은 콘텐츠가 한 번도 없던 단어 → 중요도 → 구체적인 표기(3글자+)
    #          → 여러 기사에 나온 단어 → 많이 나온 단어
    scanned.sort(key=lambda h: (h.word.id in ever, -h.word.importance, len(h.key) < 3,
                                -len(h.article_counts), -h.mentions, h.word.id))
    n_linked = len(linked.linked) + len(scanned)
    partial = [w.term for w, kw in linked.linked if kw.get("link_via") == "partial"]
    supabase_store.record_run(
        source, "link", "ok" if n_linked else "no_match", n_linked,
        extraction.summary()
        + f"\nLLM 용어 연결({len(linked.linked)}): " + ", ".join(w.term for w, _ in linked.linked)
        + (f" (부분 표기: {', '.join(partial)})" if partial else "")
        + f"\n본문 등장({len(scanned)}): " + ", ".join(f"{h.word.term}×{h.mentions}" for h in scanned[:60])
        + f"\n목록에 없음({len(linked.unmatched)}): " + ", ".join((k.get("korean_name") or k.get("term", "")) for k in linked.unmatched),
    )
    log.info("%s: 용어 %d개 중 %d개 단어 연결 + 본문 등장 단어 %d개", source, len(keywords), len(linked.linked), len(scanned))

    # 5) 설명·퀴즈 생성 (최근에 만든 단어는 건너뜀)
    by_url = {a["url"]: a for a in articles}
    tasks = []

    def add_task(word, kw: dict, url: str) -> None:
        art = by_url.get(url) or articles[0]
        tasks.append(content_generator.WordTask(
            word_id=word.id, term=word.term, meaning=word.meaning, article_title=art["title"],
            article_url=art["url"], article_text=art["text"], source=source,
            source_date=_ymd(art["published_ymd"], "ytn") if art["published_ymd"] else "", keyword=kw,
        ))

    for word, kw in linked.linked:
        if word.id not in recent:
            add_task(word, kw, (kw.get("source_urls") or [""])[0])
    for h in scanned:
        if h.word.id not in recent:
            add_task(h.word, {"term": h.word.term, "korean_name": h.word.term, "link_via": "body_scan",
                              "reason": f"오늘 기사 본문에 '{h.word.term}'이(가) {h.article_counts[h.best_url]}회 등장",
                              "related_distractor_terms": []}, h.best_url)
    skipped_recent = len(linked.linked) + len(scanned) - len(tasks)
    tasks = tasks[: config.MAX_WORDS_TO_GENERATE_PER_RUN]

    done_ids = [a["article_id"] for a in articles if a["article_id"] not in retry_later] + failed_ids
    if tasks:
        rows, rejected, error = _generate_paced(tasks)
        if error and not rows:
            log.warning("%s 콘텐츠 생성 실패: %s", source, error)
            supabase_store.record_run(source, "generate", "generate_failed", 0, error)
            feed.mark_processed(failed_ids)  # 기사는 다음 실행에서 다시
            return
        detail = [f"대상 {len(tasks)}개 (최근 생성돼 건너뜀 {skipped_recent}개)"]
        if rejected:
            detail.append("버림: " + "; ".join(rejected))
        if error:
            detail.append(f"중간에 중단: {error}")
        run_id = supabase_store.record_run(source, "generate", "ok" if rows else "generate_failed", len(rows) // 2,
                                           "\n".join(detail))
        try:
            supabase_store.insert_contents(rows, run_id)
        except supabase_store.StoreError as e:
            # 단계 기록을 먼저 남겨야 콘텐츠가 run id 를 참조할 수 있으므로, 저장 실패 시 그 기록을 실패로 고친다
            supabase_store.update_run(run_id, "generate_failed", 0, f"콘텐츠 저장 실패: {e}")
            raise
        log.info("%s: 단어 %d개 콘텐츠 생성(검수 대기), %d개 버림", source, len(rows) // 2, len(rejected))
    else:
        supabase_store.record_run(source, "generate", "ok", 0,
                                  f"새로 만들 단어 없음 (연결 {n_linked}개, 최근 생성됨 {skipped_recent}개)")

    feed.mark_processed(done_ids)
    if retry_later:
        log.info("%s: 용어 추출에 실패한 기사 %d건은 처리 완료로 표시하지 않음 (다음 실행에서 재시도)", source, len(retry_later))


def _generate_paced(tasks: list) -> tuple[list[dict], list[str], str]:
    """WORDS_PER_GENERATION_CALL 개씩 나눠 생성. 호출 전마다 공용 분당 토큰 윈도우에 자리가 날 때까지 기다리고,
    한도 초과·오류가 나면 그때까지 만든 결과는 살린다. 반환: (행, 버린 사유, 중단 사유)."""
    rows: list[dict] = []
    rejected: list[str] = []
    step = config.WORDS_PER_GENERATION_CALL
    fixed = keyword_extractor._estimate_tokens(
        content_generator.SYSTEM_PROMPT + json.dumps(content_generator.TOOL, ensure_ascii=False))
    for i in range(0, len(tasks), step):
        chunk = tasks[i:i + step]
        need = fixed + keyword_extractor._estimate_tokens(content_generator._build_message(chunk)) \
            + content_generator._COMPLETION_TOKENS
        keyword_extractor.limiter.wait_for(need)
        try:
            r, rej = content_generator.generate(chunk)
        except keyword_extractor.ExtractionError as e:
            keyword_extractor.limiter.add(need)
            return rows, rejected, str(e)[:500]
        # 생성 모듈은 실제 사용량을 돌려주지 않으므로 예약분(예상 prompt + max_tokens)으로 기록한다
        keyword_extractor.limiter.add(need)
        rows += r
        rejected += rej
    return rows, rejected, ""


def _note_extraction_failures(source: str, failed: list[str], processed: list[str]) -> set[str]:
    """용어 추출 실패 횟수를 기사별로 센다. MAX_EXTRACTION_ATTEMPTS 번 실패한 기사는 포기(처리 완료로 표시)해서
    같은 기사가 매일 토큰만 쓰고 막히는 일을 막는다. 포기할 기사 id 집합을 반환."""
    try:
        state = json.loads(EXTRACTION_FAILURES_FILE.read_text(encoding="utf-8"))
    except Exception:
        state = {}
    counts: dict[str, int] = state.get(source, {})
    for aid in processed:
        if aid not in failed:
            counts.pop(aid, None)
    give_up = set()
    for aid in failed:
        counts[aid] = counts.get(aid, 0) + 1
        if counts[aid] >= MAX_EXTRACTION_ATTEMPTS:
            give_up.add(aid)
            counts.pop(aid)
    if give_up:
        log.warning("%s: 용어 추출 %d회 실패한 기사 %d건은 포기 (본문 단어 연결은 이미 반영): %s",
                    source, MAX_EXTRACTION_ATTEMPTS, len(give_up), ", ".join(sorted(give_up)))
    state[source] = counts
    EXTRACTION_FAILURES_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    return give_up


def _save_results(source: str, articles: list[dict], keywords: list[dict]) -> None:
    out = config.RESULTS_DIR / f"{source}_{datetime.now():%Y%m%d_%H%M%S}.json"
    out.write_text(json.dumps({"articles": [{k: a[k] for k in ("url", "title", "published_ymd")} for a in articles],
                               "keywords": keywords}, ensure_ascii=False, indent=2), encoding="utf-8")


def _attach_importance(words: list) -> None:
    """words.importance (관리자 입력, 기본 50) 를 붙인다. 본문 등장 단어 우선순위에만 쓰므로 실패해도 계속."""
    try:
        imp: dict[int, int] = {}
        page = 1000
        while True:
            rows, _ = supabase_store._request(
                "GET", "words?select=id,importance&order=id",
                headers={"Range-Unit": "items", "Range": f"{len(imp)}-{len(imp) + page - 1}"})
            imp.update({r["id"]: r["importance"] for r in rows or []})
            if not rows or len(rows) < page:
                break
        for w in words:
            w.importance = imp.get(w.id, 50)
    except Exception as e:
        log.warning("단어 중요도 조회 실패 (기본값 50 사용): %s", e)


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
    _attach_importance(words)
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
