"""출처별로 이미 처리한 기사 id 를 로컬 JSON 에 기록한다 (슈카월드 hankyung_feed 의 상태 관리 분리본).
슈카월드와 달리 최초 실행 때도 기준선만 세우지 않고 최근 기사를 바로 처리한다 (앱 콘텐츠를 채워야 하므로)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

KEEP_IDS = 3000


def load(path: Path) -> set[str]:
    if path.exists():
        return set(json.loads(path.read_text(encoding="utf-8")).get("processed_article_ids", []))
    return set()


def mark_processed(path: Path, article_ids: list[str]) -> None:
    state = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    processed = state.get("processed_article_ids", [])
    seen = set(processed)
    processed += [a for a in article_ids if a not in seen]
    state["processed_article_ids"] = processed[-KEEP_IDS:]
    state["last_checked_at"] = datetime.now(timezone.utc).isoformat()
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
