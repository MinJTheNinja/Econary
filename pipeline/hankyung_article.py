"""한경 기사 페이지에서 본문 텍스트를 추출한다 (별도 라이브러리 없이 정규식 기반 파싱)."""
from __future__ import annotations

import html
import re
import urllib.request

import config


class ArticleFetchError(Exception):
    pass


_BODY_START_RE = re.compile(r'<div\b[^>]*class="article-body"[^>]*>', re.I)
_DIV_TAG_RE = re.compile(r"<div\b[^>]*>|</div\s*>", re.I)
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t]+")
_BLANKLINES_RE = re.compile(r"\n{3,}")


def _extract_body_div(page: str) -> str:
    """<div class="article-body">...</div> 안쪽 HTML을 태그 중첩을 세면서 정확히 잘라낸다.
    기사마다 본문 뒤에 오는 형제 요소(article-license, ad-wrap 등)가 달라서 고정 종료
    마커를 찾는 방식은 기사 유형에 따라 실패했다."""
    m = _BODY_START_RE.search(page)
    if not m:
        return ""

    depth = 1
    pos = m.end()
    for tm in _DIV_TAG_RE.finditer(page, pos):
        if tm.group(0).startswith("</"):
            depth -= 1
        else:
            depth += 1
        if depth == 0:
            return page[pos:tm.start()]
    return page[pos:]  # 닫는 태그를 못 찾으면 나머지 전체를 반환 (그래도 텍스트는 뽑힘)


def _clean_html(fragment: str) -> str:
    fragment = re.sub(r"<figure.*?</figure>", " ", fragment, flags=re.S)  # 이미지 캡션 제거
    fragment = re.sub(r"<br\s*/?>", "\n", fragment)
    fragment = _TAG_RE.sub(" ", fragment)
    fragment = html.unescape(fragment)
    fragment = _WS_RE.sub(" ", fragment)
    fragment = _BLANKLINES_RE.sub("\n\n", fragment)
    return fragment.strip()


def fetch_article(url: str) -> dict:
    """반환: {"url", "text"}. 본문을 못 찾으면 ArticleFetchError."""
    req = urllib.request.Request(url, headers={"User-Agent": config.HANKYUNG_USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            html_bytes = resp.read()
    except Exception as e:
        raise ArticleFetchError(f"기사 요청 실패: {e}") from e

    page = html_bytes.decode("utf-8", errors="ignore")
    body_fragment = _extract_body_div(page)
    if not body_fragment:
        raise ArticleFetchError(f"본문 영역을 찾을 수 없습니다: {url}")

    text = _clean_html(body_fragment)
    if len(text) < 30:
        raise ArticleFetchError(f"본문이 너무 짧습니다(유료 구독 제한 가능성): {url}")

    return {"url": url, "text": text}


if __name__ == "__main__":
    import sys

    result = fetch_article(sys.argv[1])
    print(f"길이: {len(result['text'])}자")
    print(result["text"][:500])
