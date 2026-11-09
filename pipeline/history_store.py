"""콘텐츠(유튜브 영상 또는 한경 기사)별로 등장한 키워드를 누적 기록해 ⑤ 반복 노출도 채점의
근거로 쓴다. 유튜브와 한경을 모두 모니터링하게 되면서 이 이력이 원래 취지("여러 매체에서
반복 등장")에 더 가까워졌다."""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

import config


def _norm_key(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[\s\-_/()\[\]·,.]+", "", s)
    return s


def load_history() -> dict:
    if config.HISTORY_FILE.exists():
        return json.loads(config.HISTORY_FILE.read_text(encoding="utf-8"))
    return {}


def save_history(history: dict) -> None:
    config.HISTORY_FILE.write_text(
        json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def get_history_context(limit: int = 150) -> list[dict]:
    """프롬프트에 함께 넣어줄 과거 이력 요약. 등장 횟수가 많은 순."""
    history = load_history()
    items = [
        {
            "term": rec.get("term", ""),
            "korean_name": rec.get("korean_name", ""),
            "prior_article_count": rec.get("article_count", 0),
            "last_seen": rec.get("last_seen", ""),
        }
        for rec in history.values()
    ]
    items.sort(key=lambda x: x["prior_article_count"], reverse=True)
    return items[:limit]


def _find_existing_key(history: dict, term: str, korean_name: str) -> str | None:
    for candidate in (term, korean_name):
        key = _norm_key(candidate)
        if key and key in history:
            return key
    return None


def record_video_results(
    video_id: str, video_title: str, published_date: str, keywords: list[dict]
) -> None:
    """video_id/video_title/published_date는 기본값이며, keywords 안에 항목별
    video_id/video_title/first_seen이 있으면 그쪽을 우선한다 (한경 배치처럼 키워드마다
    출처 기사가 다른 경우를 지원하기 위함)."""
    history = load_history()
    now_iso = datetime.now(timezone.utc).isoformat()

    for kw in keywords:
        term = kw.get("term", "")
        korean_name = kw.get("korean_name", "") or term
        if not term and not korean_name:
            continue

        kw_video_id = kw.get("video_id") or video_id
        kw_video_title = kw.get("video_title") or video_title
        kw_published_date = kw.get("first_seen") or published_date

        existing_key = _find_existing_key(history, term, korean_name)
        key = existing_key or _norm_key(term or korean_name)

        rec = history.get(key)
        if rec is None:
            rec = {
                "term": term,
                "korean_name": korean_name,
                "english_name": kw.get("english_name", ""),
                "category": kw.get("category", ""),
                "first_seen": kw_published_date or now_iso,
                "last_seen": kw_published_date or now_iso,
                "article_count": 0,
                "video_ids": [],
                "video_titles": [],
            }

        rec["last_seen"] = kw_published_date or now_iso
        if kw_video_id not in rec["video_ids"]:
            rec["video_ids"].append(kw_video_id)
            rec["video_titles"].append(kw_video_title)
            rec["article_count"] = len(rec["video_ids"])
        rec["last_grade"] = kw.get("grade", "")
        rec["last_total_score"] = kw.get("total_score", 0)

        history[key] = rec

    save_history(history)


def get_prior_article_count(term: str, korean_name: str) -> int:
    history = load_history()
    key = _find_existing_key(history, term, korean_name)
    if key:
        return history[key].get("article_count", 0)
    return 0
