"""단어 표기 정규화. supabase/migrations 의 public.normalize_term 과 규칙이 같아야 한다
(소문자, 공백·구두점 제거). 단어 import, 단어장 병합, 기사 용어↔고정 단어 매칭이 모두 이걸 쓴다."""
from __future__ import annotations

import re

_PUNCT = re.compile(r"[\s\-_/()\[\]·,.'\"]+")
_PAREN = re.compile(r"\s*\([^()]*\)\s*")


def normalize_term(term: str) -> str:
    return _PUNCT.sub("", (term or "").lower())


def strip_parens(term: str) -> str:
    """'ETF(상장지수펀드)' → 'ETF'"""
    return _PAREN.sub(" ", term or "").strip()


def match_keys(*names: str) -> list[str]:
    """한 단어를 가리킬 수 있는 정규화 키들: 원표기, 괄호 뗀 표기, 괄호 안 표기, 'A / B' 각각."""
    keys: list[str] = []
    for name in names:
        if not name:
            continue
        parts = [name, strip_parens(name), *re.findall(r"\(([^()]*)\)", name), *name.split("/")]
        for p in parts:
            k = normalize_term(p)
            if len(k) >= 2 and k not in keys:
                keys.append(k)
    return keys
