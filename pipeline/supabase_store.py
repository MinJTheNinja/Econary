"""Supabase REST(PostgREST) 접근. service_role 키로 RLS 를 우회하므로 이 모듈은 로컬/서버에서만 쓴다.
외부 의존성 없이 urllib 만 사용 (슈카월드 프로젝트와 같은 방식)."""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import config
from word_linker import Word


class StoreError(Exception):
    pass


def _request(method: str, path: str, body=None, headers: dict | None = None) -> tuple[list | dict | None, dict]:
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise StoreError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (pipeline/.env).")
    key = config.SUPABASE_SERVICE_ROLE_KEY
    req = urllib.request.Request(
        f"{config.SUPABASE_URL.rstrip('/')}/rest/v1/{path}",
        data=None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method=method,
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read()
            return (json.loads(raw) if raw else None), dict(resp.headers)
    except urllib.error.HTTPError as e:
        raise StoreError(f"{method} {path.split('?')[0]} → {e.code}: {e.read().decode('utf-8', 'replace')[:300]}") from e


def fetch_words() -> list[Word]:
    words: list[Word] = []
    page = 1000
    while True:
        rows, _ = _request(
            "GET", "words?select=id,term,meaning,english_name,is_active&order=id",
            headers={"Range-Unit": "items", "Range": f"{len(words)}-{len(words) + page - 1}"},
        )
        words += [Word(r["id"], r["term"], r["meaning"], r.get("english_name"), r["is_active"]) for r in rows or []]
        if not rows or len(rows) < page:
            return words


def recent_content_word_ids(days: int) -> set[int]:
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows, _ = _request("GET", f"word_contents?select=word_id&review_status=neq.excluded&created_at=gte.{urllib.parse.quote(since)}")
    return {r["word_id"] for r in rows or []}


def record_run(source: str, stage: str, status: str, item_count: int = 0, detail: str = "") -> int:
    rows, _ = _request(
        "POST", "pipeline_runs",
        [{"source": source, "stage": stage, "status": status, "item_count": item_count, "detail": detail[:2000] or None}],
        headers={"Prefer": "return=representation"},
    )
    return rows[0]["id"]


def update_run(run_id: int, status: str, item_count: int, detail: str) -> None:
    _request("PATCH", f"pipeline_runs?id=eq.{run_id}",
             {"status": status, "item_count": item_count, "detail": detail[:2000] or None},
             headers={"Prefer": "return=minimal"})


def insert_contents(rows: list[dict], pipeline_run_id: int) -> None:
    if rows:
        _request("POST", "word_contents", [{**r, "pipeline_run_id": pipeline_run_id} for r in rows],
                 headers={"Prefer": "return=minimal"})


def upsert_candidate(kw: dict, source: str) -> None:
    _request("POST", "rpc/upsert_term_candidate", {
        "p_term": kw.get("korean_name") or kw.get("term"),
        "p_english_name": kw.get("english_name") or None,
        "p_definition": kw.get("definition") or None,
        "p_category": kw.get("category") or None,
        "p_score": int(kw.get("total_score", 0)),
        "p_grade": kw.get("grade"),
        "p_source": source,
        "p_source_url": (kw.get("source_urls") or [None])[0],
    })
