"""YTN 경제 섹션에서 새 기사를 감지하고 본문을 추출한다.

YTN 은 공식 RSS 를 제공하지 않아 섹션 목록 페이지(/news/list.php?mcd=0102)의 기사 링크를 읽는다.
robots.txt 는 /news, /_ln 경로를 막지 않는다 (/_comm 등만 차단). 본문은 <div id="CmAdContent" class="paragraph">.
"""
from __future__ import annotations

import html
import re
import urllib.request
from dataclasses import dataclass

import config
import feed_state

# 기사 id 예: 0102_202611091838541824 (섹션코드_작성시각+일련번호)
_LINK_RE = re.compile(r'<a[^>]*href="(https://www\.ytn\.co\.kr/_ln/(\d{4}_(\d{14})\d*))"[^>]*>\s*([^<]*)', re.I)
_BODY_START_RE = re.compile(r'<div\b[^>]*id="CmAdContent"[^>]*>', re.I)
_DIV_TAG_RE = re.compile(r"<div\b[^>]*>|</div\s*>", re.I)
_PUBLISHED_RE = re.compile(r'<meta property="article:published_time" content="([^"]+)"', re.I)
_TITLE_RE = re.compile(r'<meta property="og:title" content="([^"]*)"', re.I)


class FeedFetchError(Exception):
    pass


class ArticleFetchError(Exception):
    pass


@dataclass
class ArticleEntry:
    article_id: str
    title: str
    url: str
    published: str  # YYYYMMDDhhmmss (id 에서 추출)
    category: str


def _get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": config.USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def parse_list_page(page: str, category: str) -> list[ArticleEntry]:
    """목록 페이지 HTML → 기사 목록 (같은 기사의 썸네일/제목 링크 중복 제거, 제목 있는 링크 우선)."""
    found: dict[str, ArticleEntry] = {}
    for url, article_id, stamp, title in _LINK_RE.findall(page):
        title = html.unescape(title).strip()
        prev = found.get(article_id)
        if prev is None or (not prev.title and title):
            found[article_id] = ArticleEntry(article_id, title, url, stamp, category)
    return list(found.values())


def get_latest_articles() -> list[ArticleEntry]:
    entries: list[ArticleEntry] = []
    errors: list[str] = []
    for category, list_url in config.YTN_LIST_URLS.items():
        try:
            entries += parse_list_page(_get(list_url), category)
        except Exception as e:
            errors.append(f"{category}: {e}")
    if errors and len(errors) == len(config.YTN_LIST_URLS):
        raise FeedFetchError("; ".join(errors))
    return entries


def find_new_articles() -> list[ArticleEntry]:
    processed = feed_state.load(config.YTN_STATE_FILE)
    new_ones = [a for a in get_latest_articles() if a.article_id not in processed]
    new_ones.sort(key=lambda a: a.published, reverse=True)  # 최신 우선
    return new_ones[: config.MAX_ARTICLES_PER_SOURCE]


def mark_processed(article_ids: list[str]) -> None:
    feed_state.mark_processed(config.YTN_STATE_FILE, article_ids)


def _extract_body(page: str) -> str:
    m = _BODY_START_RE.search(page)
    if not m:
        return ""
    depth, pos = 1, m.end()
    for tm in _DIV_TAG_RE.finditer(page, pos):
        depth += -1 if tm.group(0).startswith("</") else 1
        if depth == 0:
            return page[pos:tm.start()]
    return page[pos:]


def clean_html(fragment: str) -> str:
    fragment = re.sub(r"<(script|style|figure)\b.*?</\1>", " ", fragment, flags=re.S | re.I)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    fragment = html.unescape(fragment)
    fragment = re.sub(r"[ \t\xa0]+", " ", fragment)
    fragment = re.sub(r"\n\s*\n+", "\n\n", fragment)
    # 기자 이메일·저작권 고지 등 꼬리말 제거
    fragment = re.split(r"\n\s*(※ '당신의 제보가 뉴스가 됩니다'|\[저작권자|YTN [가-힣]+ \()", fragment)[0]
    return fragment.strip()


def parse_article_page(page: str, url: str) -> dict:
    body = _extract_body(page)
    if not body:
        raise ArticleFetchError(f"본문 영역을 찾을 수 없습니다: {url}")
    text = clean_html(body)
    if len(text) < 30:
        raise ArticleFetchError(f"본문이 너무 짧습니다: {url}")
    published = _PUBLISHED_RE.search(page)
    title = _TITLE_RE.search(page)
    return {
        "url": url,
        "text": text,
        "published": published.group(1) if published else "",
        "title": html.unescape(title.group(1)) if title else "",
    }


def fetch_article(url: str) -> dict:
    try:
        page = _get(url)
    except Exception as e:
        raise ArticleFetchError(f"기사 요청 실패: {e}") from e
    return parse_article_page(page, url)


if __name__ == "__main__":
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    arts = get_latest_articles()
    print(len(arts), "articles")
    for a in arts[:5]:
        print(a.published, a.title, a.url)
    if arts:
        r = fetch_article(arts[0].url)
        print(len(r["text"]), "chars:", r["text"][:300])
