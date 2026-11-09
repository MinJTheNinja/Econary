"""고정 핵심 단어 목록(CSV/XLSX)을 Supabase `words` 테이블에 적재한다 (PRD 1.1).

사용법:
    python pipeline/scripts/import_words.py 단어목록.xlsx --dry-run     # 검증만, DB 미반영
    python pipeline/scripts/import_words.py 단어목록.csv                # upsert

필요 환경변수 (pipeline/.env 또는 셸):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

열 이름은 아래 별칭 중 아무거나 (대소문자 무시):
    단어      : term, 단어, 용어, 표기
    뜻        : meaning, 뜻, 정의, definition
    중요도    : importance, 중요도   (0~100, 없으면 50 — 중요도는 관리자 수동값이며 자동 산정하지 않는다)
    영문명    : english_name, 영문명, english
    카테고리  : category, 카테고리
    활성      : is_active, 활성, active   (Y/N, true/false, 1/0 — 없으면 활성)

같은 단어(정규화 기준: 소문자, 공백·구두점 제거)가 여러 번 나오면 첫 행만 쓰고 경고한다.
기존 DB 단어와 겹치면 뜻/중요도/영문명/카테고리/활성 값을 파일 값으로 덮어쓴다.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PIPELINE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PIPELINE_DIR))
from textnorm import normalize_term  # noqa: E402

ALIASES = {
    "term": ["term", "단어", "용어", "표기"],
    "meaning": ["meaning", "뜻", "정의", "definition"],
    "importance": ["importance", "중요도"],
    "english_name": ["english_name", "영문명", "english"],
    "category": ["category", "카테고리"],
    "is_active": ["is_active", "활성", "active"],
    "needs_check": ["needs_check", "확인필요"],
}
DEFAULT_IMPORTANCE = 50
BATCH_SIZE = 500




def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def read_rows(path: Path) -> list[dict[str, str]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(encoding="utf-8-sig", newline="") as f:
            return [{k: (v or "") for k, v in row.items() if k} for row in csv.DictReader(f)]
    if suffix in (".xlsx", ".xlsm"):
        try:
            import openpyxl
        except ImportError:
            sys.exit("xlsx 파일을 읽으려면 openpyxl 이 필요합니다: pip install openpyxl")
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
        header_idx = next((i for i, r in enumerate(rows) if _find_col([str(c or "") for c in r], "term") is not None), None)
        if header_idx is None:
            sys.exit("첫 시트에서 '단어/term' 열 머리글을 찾지 못했습니다.")
        header = [str(c or "").strip() for c in rows[header_idx]]
        return [
            {header[i]: ("" if v is None else str(v)) for i, v in enumerate(r) if i < len(header) and header[i]}
            for r in rows[header_idx + 1:]
        ]
    sys.exit(f"지원하지 않는 형식: {suffix} (csv, xlsx 만 지원)")


def _find_col(headers: list[str], field: str) -> int | None:
    lowered = [h.strip().lower() for h in headers]
    for alias in ALIASES[field]:
        if alias.lower() in lowered:
            return lowered.index(alias.lower())
    return None


def _parse_bool(v: str) -> bool:
    return v.strip().lower() not in ("n", "no", "false", "0", "비활성", "x")


def to_records(rows: list[dict[str, str]]) -> tuple[list[dict], list[str]]:
    """행 → words 레코드. (레코드, 경고 목록)"""
    if not rows:
        return [], ["빈 파일입니다."]
    headers = list(rows[0].keys())
    col = {f: (headers[i] if (i := _find_col(headers, f)) is not None else None) for f in ALIASES}
    if not col["term"] or not col["meaning"]:
        sys.exit(f"필수 열(단어, 뜻)을 찾지 못했습니다. 머리글: {headers}")

    records: list[dict] = []
    warnings: list[str] = []
    seen: dict[str, int] = {}
    for line_no, row in enumerate(rows, start=2):
        term = row.get(col["term"], "").strip()
        meaning = row.get(col["meaning"], "").strip()
        if not term:
            continue
        if not meaning:
            warnings.append(f"{line_no}행 '{term}': 뜻이 비어 있어 건너뜀")
            continue
        key = normalize_term(term)
        if key in seen:
            warnings.append(f"{line_no}행 '{term}': {seen[key]}행과 중복이라 건너뜀")
            continue
        seen[key] = line_no

        importance = DEFAULT_IMPORTANCE
        if col["importance"] and row.get(col["importance"], "").strip():
            try:
                importance = max(0, min(100, round(float(row[col["importance"]]))))
            except ValueError:
                warnings.append(f"{line_no}행 '{term}': 중요도 '{row[col['importance']]}' 해석 불가 → {DEFAULT_IMPORTANCE}")

        records.append({
            "term": term,
            "meaning": meaning,
            "importance": importance,
            "english_name": (row.get(col["english_name"], "").strip() or None) if col["english_name"] else None,
            "category": (row.get(col["category"], "").strip() or None) if col["category"] else None,
            "is_active": _parse_bool(row.get(col["is_active"], "")) if col["is_active"] else True,
            "needs_check": (row.get(col["needs_check"], "").strip().upper() in ("Y", "TRUE", "1")) if col["needs_check"] else False,
        })
    return records, warnings


def upsert(records: list[dict], url: str, key: str) -> None:
    endpoint = f"{url.rstrip('/')}/rest/v1/words?on_conflict=normalized_term"
    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        req = urllib.request.Request(
            endpoint,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=60):
                pass
        except urllib.error.HTTPError as e:
            sys.exit(f"업로드 실패 ({e.code}): {e.read().decode('utf-8', 'replace')}")
        print(f"  {i + len(batch)}/{len(records)} 업로드")


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", type=Path)
    ap.add_argument("--dry-run", action="store_true", help="검증·요약만 하고 DB에 쓰지 않음")
    args = ap.parse_args()

    records, warnings = to_records(read_rows(args.file))
    for w in warnings:
        print("경고:", w)
    active = sum(r["is_active"] for r in records)
    print(f"유효 단어 {len(records)}개 (활성 {active}, 비활성 {len(records) - active}), 경고 {len(warnings)}건")
    for r in sorted(records, key=lambda r: -r["importance"])[:5]:
        print(f"  [{r['importance']:>3}] {r['term']} — {r['meaning'][:40]}")

    if args.dry_run:
        print("--dry-run: DB에 쓰지 않았습니다.")
        return

    load_dotenv(PIPELINE_DIR / ".env")
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        sys.exit("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 없습니다 (pipeline/.env.example 참고).")
    upsert(records, url, key)
    print("완료")


if __name__ == "__main__":
    main()
