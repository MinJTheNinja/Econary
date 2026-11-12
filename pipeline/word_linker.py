"""기사에서 추출한 TESAT 용어를 고정 핵심 단어 목록(Supabase words)에 연결한다 (PRD 2.1).

매칭은 정규화된 표기 키로만 한다 (textnorm.match_keys): 원표기, 괄호 뗀 표기, 괄호 안 병기, 'A / B' 각각.
같은 키가 여러 단어에 걸리면 먼저 등록된(id 작은) 단어가 이긴다. 비활성 단어에는 연결하지 않는다.

연결 경로는 두 가지다.
1) link_keywords: LLM 이 뽑은 용어 → 단어. 정확히 안 맞으면 띄어쓰기로 나눈 부분 표기
   ('매수 사이드카' → '사이드카')도 한 번 더 본다.
2) scan_articles: 기사 본문에 고정 단어 표기가 직접 나오는지 훑는다. LLM 이 신조어 위주로 뽑아서
   목록 단어(대부분 교과서 용어)를 놓치는 경우가 많아, 이게 실제 연결의 대부분을 만든다.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field

from textnorm import match_keys, normalize_term


@dataclass
class Word:
    id: int
    term: str
    meaning: str
    english_name: str | None = None
    is_active: bool = True
    importance: int = 50


@dataclass
class LinkResult:
    linked: list[tuple[Word, dict]] = field(default_factory=list)   # (단어, 추출 키워드)
    unmatched: list[dict] = field(default_factory=list)             # 목록에 없는 용어 → term_candidates


@dataclass
class ScanHit:
    word: Word
    key: str
    mentions: int = 0                                   # 전체 기사에서 나온 횟수
    article_counts: dict[str, int] = field(default_factory=dict)   # url → 횟수

    @property
    def best_url(self) -> str:
        return max(self.article_counts.items(), key=lambda kv: kv[1])[0]


_HANGUL = re.compile(r"[가-힣]")
_ASCII_KEY = re.compile(r"^[a-z0-9]+$")
_TAIL = r"(?=$|[^가-힣]|은|는|이|가|을|를|의|에|와|과|도|로|만|으로)"
# U+2011 같은 특수 하이픈, 전각 문자 등은 textnorm 규칙에 안 걸리므로 공백으로 바꿔 둔다 (괄호·슬래시는 구조라 유지)
_ODD = re.compile(r"[^\w\s()/\[\]]")


def _clean(name: str) -> str:
    return _ODD.sub(" ", unicodedata.normalize("NFKC", name or ""))


class WordIndex:
    def __init__(self, words: list[Word]):
        self._by_key: dict[str, Word] = {}
        for w in sorted(words, key=lambda w: w.id):
            if not w.is_active:
                continue
            for k in match_keys(_clean(w.term), _clean(w.english_name or "")):
                self._by_key.setdefault(k, w)
        # 본문 스캔용 키: 괄호 안 병기 중 두 글자짜리('관리(대상)종목'의 '대상')는 일반어라 뺀다
        weak: set[str] = set()
        for w in words:
            for inner in re.findall(r"\(([^()]*)\)", w.term or ""):
                k = normalize_term(inner)
                if len(k) < 3 and k not in (normalize_term(w.term), normalize_term(w.english_name or "")):
                    weak.add(k)
        strong = {k for w in words if w.is_active for k in (normalize_term(w.term),)}
        self._scan_keys = sorted((k for k in self._by_key if k not in weak or k in strong), key=len, reverse=True)

    def __len__(self) -> int:
        return len(self._by_key)

    def find(self, *names: str) -> Word | None:
        for k in match_keys(*(_clean(n) for n in names)):
            if k in self._by_key:
                return self._by_key[k]
        return None

    def find_partial(self, *names: str) -> Word | None:
        """띄어쓰기로 나눈 부분 표기 중 3글자 이상(영문 약어는 3자 이상)인 것으로 찾는다. 긴 조각 우선."""
        parts: list[str] = []
        for n in names:
            toks = [t for t in re.split(r"\s+", _clean(n)) if t]
            if len(toks) > 1:
                parts += toks
        for p in sorted(set(parts), key=len, reverse=True):
            if len(normalize_term(p)) >= 3:
                w = self.find(p)
                if w is not None:
                    return w
        return None

    def scan(self, text: str) -> dict[str, int]:
        """본문에 나오는 단어 키 → 등장 횟수. 긴 키 안에만 나오는 짧은 키는 뺀다 ('국가부채비율' 안의 '부채')."""
        lower = _clean(text).lower()
        squashed = normalize_term(lower)
        found: dict[str, int] = {}
        for k in self._scan_keys:
            if _ASCII_KEY.match(k):
                if len(k) <= 5:
                    # 약어(ETF, GDP …): 영문/숫자 경계가 있어야
                    n = len(re.findall(rf"(?<![a-z0-9]){re.escape(k)}(?![a-z0-9])", lower)) if k in lower else 0
                else:
                    n = squashed.count(k)
            elif len(k) == 2 and _HANGUL.search(k):
                # 두 글자 한글 키는 어절 시작이고, 뒤가 한글이 아니거나 조사일 때만.
                # '소금리'·'리스크'(리스) 같은 오탐 방지
                n = len(re.findall(rf"(?<![가-힣]){re.escape(k)}{_TAIL}", lower)) if k in lower else 0
            else:
                n = squashed.count(k)
            if n:
                found[k] = n
        # 더 긴 키 안에서만 나온 짧은 키 제거
        keys = sorted(found, key=len, reverse=True)
        for short in keys:
            inside = sum(found[long] * long.count(short) for long in keys
                         if len(long) > len(short) and short in long and long in found)
            if inside and found[short] <= inside:
                del found[short]
        return found

    def scan_articles(self, articles: list[dict]) -> list[ScanHit]:
        """articles: [{"url","title","text"}, ...] → 단어별 등장 정보 (한 단어에 여러 키가 걸리면 합산)."""
        hits: dict[int, ScanHit] = {}
        for art in articles:
            for k, n in self.scan(f"{art.get('title', '')}\n{art.get('text', '')}").items():
                w = self._by_key[k]
                h = hits.setdefault(w.id, ScanHit(w, k))
                h.mentions += n
                h.article_counts[art["url"]] = h.article_counts.get(art["url"], 0) + n
        return list(hits.values())


def link_keywords(index: WordIndex, keywords: list[dict]) -> LinkResult:
    """keyword_extractor 결과(점수순)를 단어에 연결. 같은 단어에 여러 키워드가 걸리면 점수 높은 하나만.
    정확히 안 맞으면 부분 표기로 한 번 더 찾고, 그렇게 연결된 키워드에는 link_via='partial' 을 남긴다."""
    result = LinkResult()
    seen: set[int] = set()
    for kw in keywords:
        names = (kw.get("korean_name", ""), kw.get("term", ""), kw.get("english_name", "") or "")
        word = index.find(*names)
        if word is None:
            word = index.find_partial(*names)
            if word is not None:
                result.unmatched.append(kw)   # 전체 표기는 목록에 없으므로 후보로도 쌓는다
                kw = {**kw, "link_via": "partial"}
        if word is None:
            result.unmatched.append(kw)
        elif word.id not in seen:
            seen.add(word.id)
            result.linked.append((word, kw))
    return result
