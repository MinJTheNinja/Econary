"""여러 단어장 파일(docx/xlsx)을 하나의 마스터 단어 목록 CSV로 합치고 중복을 제거한다.

사용법:
    py pipeline/scripts/merge_word_sources.py --out pipeline/seed/words_master.csv \
        --g 시사용어_단어장_ㄱ.docx --nh economic_dictionary_n-h.docx \
        --toss economic_terms_toss_xlsx.docx --dict 20261103_시사경제용어사전.xlsx

지원 형식 (2026-11 기준 사용자 제공 파일):
    --g     docx 표 [용어 | 뜻]               (KDI 시사용어 ㄱ, 직접 풀어 쓴 뜻)
    --nh    docx 문단 "용어␠␠뜻"              (ㄴ~ㅎ 사전, 직접 풀어 쓴 뜻)
    --toss  docx 문단 "용어␠␠뜻" (1부 토스피드, 2부 엑셀 보충)
    --dict  xlsx [순번 | 주제 | 용어 | 설명]  (원본 시사경제용어사전 3,029개)

중복 판정: 괄호 안 병기와 ※ 표시를 뗀 표기를 import_words.normalize_term 으로 정규화해 비교.
같은 단어가 여러 파일에 있으면 뜻은 아래 우선순위로 하나만 고른다.
    ① ※(확신 낮음) 표시가 없는 뜻 우선
    ② 짧게 직접 풀어 쓴 사전 우선: g > nh > toss 1부 > toss 2부 > dict(원문)
카테고리는 dict 의 '주제'가 있으면 가져온다. 어느 출처든 ※ 이면 needs_check=Y.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from textnorm import normalize_term  # noqa: E402

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
SOURCE_RANK = {"g": 1, "nh": 2, "toss1": 3, "toss2": 4, "dict": 5}
FLAG = "※"
PAREN = re.compile(r"\s*\(([^()]*)\)\s*")


def _text(el) -> str:
    return "".join(t.text or "" for t in el.iter(W + "t"))


def docx_blocks(path: Path):
    """('p', style, text) 또는 ('row', '', [cell, ...]) 를 문서 순서대로."""
    body = ET.fromstring(zipfile.ZipFile(path).read("word/document.xml")).find(W + "body")
    for el in body:
        if el.tag == W + "p":
            st = el.find(f"{W}pPr/{W}pStyle")
            yield "p", (st.get(W + "val") if st is not None else ""), _text(el)
        elif el.tag == W + "tbl":
            for tr in el.iter(W + "tr"):
                yield "row", "", [_text(tc) for tc in tr.iter(W + "tc")]


def split_term(raw: str) -> tuple[str, str | None, bool]:
    """'가격고정(Price Fixing) ※' → ('가격고정', 'Price Fixing', True).
    괄호 안이 한글이면 표기에 남긴다: 'FSD (완전자율주행)' → 'FSD(완전자율주행)'."""
    flagged = FLAG in raw
    raw = raw.replace(FLAG, "").strip()
    english = None
    m = PAREN.search(raw)
    if m and re.search(r"[A-Za-z]", m.group(1)) and not re.search(r"[가-힣]", m.group(1)):
        english = m.group(1).strip()
        raw = PAREN.sub(" ", raw, count=1).strip()
    term = re.sub(r"\s*\(\s*", "(", raw)
    return re.sub(r"\s+", " ", term).strip(), english, flagged


def dedupe_key(term: str) -> str:
    return normalize_term(PAREN.sub("", term)) or normalize_term(term)


def entry(source: str, raw_term: str, meaning: str, category: str | None = None) -> dict | None:
    term, english, flag_t = split_term(raw_term)
    flag_m = FLAG in meaning
    meaning = re.sub(r"\s+", " ", meaning.replace(FLAG, "")).strip()
    if not term or not meaning:
        return None
    return {"term": term, "english_name": english, "meaning": meaning, "category": category,
            "needs_check": flag_t or flag_m, "source": source}


def read_paragraph_dict(path: Path, source_for_heading=lambda h, cur: cur, default="nh") -> list[dict]:
    out, cur = [], default
    for kind, style, text in docx_blocks(path):
        if kind != "p":
            continue
        if style.startswith("Heading") or style == "Title":
            cur = source_for_heading(text, cur) if style == "Heading1" else cur
            continue
        if "  " not in text or text.lstrip().startswith(("•", "※")):
            continue
        term, _, meaning = text.partition("  ")
        if (e := entry(cur, term, meaning)):
            out.append(e)
    return out


def read_g(path: Path) -> list[dict]:
    out = []
    for kind, _, cells in docx_blocks(path):
        if kind == "row" and len(cells) >= 2 and cells[0].strip() not in ("", "용어"):
            if (e := entry("g", cells[0], cells[1])):
                out.append(e)
    return out


def read_dict(path: Path) -> list[dict]:
    import openpyxl
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
    out = []
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not row or row[2] is None:
            continue
        if (e := entry("dict", str(row[2]), str(row[3] or ""), (str(row[1]).strip() or None) if row[1] else None)):
            out.append(e)
    return out


def merge(entries: list[dict]) -> tuple[list[dict], Counter]:
    groups: dict[str, list[dict]] = {}
    order: list[str] = []
    for e in entries:
        k = dedupe_key(e["term"])
        if k not in groups and "/" in e["term"]:
            # 'A / B' 로 묶인 항목은 A나 B가 이미 있으면 그 단어로 합친다 (예: 네트워크 외부성 / 네트워크 효과)
            k = next((ak for p in e["term"].split("/") if (ak := dedupe_key(p)) in groups), k)
        if k not in groups:
            groups[k] = []
            order.append(k)
        groups[k].append(e)

    merged, stats = [], Counter()
    for k in order:
        g = groups[k]
        best = min(g, key=lambda e: (e["needs_check"], SOURCE_RANK[e["source"]]))
        srcs = sorted({e["source"] for e in g}, key=SOURCE_RANK.get)
        merged.append({
            "term": best["term"],
            "english_name": best["english_name"] or next((e["english_name"] for e in g if e["english_name"]), ""),
            "meaning": best["meaning"],
            "category": next((e["category"] for e in g if e["category"]), ""),
            "needs_check": "Y" if best["needs_check"] else "N",
            "sources": "+".join(srcs),
        })
        stats["dup_removed"] += len(g) - 1
        stats[f"from_{best['source']}"] += 1
    return merged, stats


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--g", type=Path)
    ap.add_argument("--nh", type=Path)
    ap.add_argument("--toss", type=Path)
    ap.add_argument("--dict", type=Path)
    a = ap.parse_args()

    entries: list[dict] = []
    if a.g:
        entries += read_g(a.g)
    if a.nh:
        entries += read_paragraph_dict(a.nh, default="nh")
    if a.toss:
        entries += read_paragraph_dict(
            a.toss, default="toss1",
            source_for_heading=lambda h, cur: "toss2" if h.startswith("2부") else "toss1" if h.startswith("1부") else cur)
    if a.dict:
        entries += read_dict(a.dict)

    print("읽은 항목:", dict(Counter(e["source"] for e in entries)), "합계", len(entries))
    merged, stats = merge(entries)
    print(f"중복 제거 {stats['dup_removed']}개 → 고유 단어 {len(merged)}개")
    print("뜻 채택 출처:", {k[5:]: v for k, v in stats.items() if k.startswith("from_")})
    print("확인 필요(※):", sum(m["needs_check"] == "Y" for m in merged))

    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["term", "english_name", "meaning", "category", "needs_check", "sources"])
        w.writeheader()
        w.writerows(merged)
    print("저장:", a.out)


if __name__ == "__main__":
    main()
