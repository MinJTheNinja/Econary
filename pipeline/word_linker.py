"""기사에서 추출한 TESAT 용어를 고정 핵심 단어 목록(Supabase words)에 연결한다 (PRD 2.1).

매칭은 정규화된 표기 키로만 한다 (textnorm.match_keys): 원표기, 괄호 뗀 표기, 괄호 안 병기, 'A / B' 각각.
같은 키가 여러 단어에 걸리면 먼저 등록된(id 작은) 단어가 이긴다. 비활성 단어에는 연결하지 않는다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from textnorm import match_keys


@dataclass
class Word:
    id: int
    term: str
    meaning: str
    english_name: str | None = None
    is_active: bool = True


@dataclass
class LinkResult:
    linked: list[tuple[Word, dict]] = field(default_factory=list)   # (단어, 추출 키워드)
    unmatched: list[dict] = field(default_factory=list)             # 목록에 없는 용어 → term_candidates


class WordIndex:
    def __init__(self, words: list[Word]):
        self._by_key: dict[str, Word] = {}
        for w in sorted(words, key=lambda w: w.id):
            if not w.is_active:
                continue
            for k in match_keys(w.term, w.english_name or ""):
                self._by_key.setdefault(k, w)

    def __len__(self) -> int:
        return len(self._by_key)

    def find(self, *names: str) -> Word | None:
        for k in match_keys(*names):
            if k in self._by_key:
                return self._by_key[k]
        return None


def link_keywords(index: WordIndex, keywords: list[dict]) -> LinkResult:
    """keyword_extractor 결과(점수순)를 단어에 연결. 같은 단어에 여러 키워드가 걸리면 점수 높은 하나만."""
    result = LinkResult()
    seen: set[int] = set()
    for kw in keywords:
        word = index.find(kw.get("korean_name", ""), kw.get("term", ""), kw.get("english_name", ""))
        if word is None:
            result.unmatched.append(kw)
        elif word.id not in seen:
            seen.add(word.id)
            result.linked.append((word, kw))
    return result
