"""한국경제신문(한경) 여러 카테고리 RSS를 합쳐서 새로 올라온 기사를 감지한다.
슈카월드 프로젝트에서 가져옴. 처리 상태는 feed_state 로 분리."""
from __future__ import annotations

import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import config
import feed_state

_ARTICLE_ID_RE = re.compile(r"/article/([^/?#]+)")


@dataclass
class ArticleEntry:
    article_id: str
    title: str
    url: str
    published: str  # RFC822 원문 그대로
    category: str


class FeedFetchError(Exception):
    pass


def _fetch_xml(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": config.HANKYUNG_USER_AGENT})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read()


def _extract_article_id(url: str) -> str:
    m = _ARTICLE_ID_RE.search(url)
    return m.group(1) if m else url


def get_latest_articles(limit_per_category: int = 30) -> list[ArticleEntry]:
    """카테고리 하나가 실패해도 나머지는 계속. 전부 실패하면 FeedFetchError (처리 상태 기록용)."""
    all_entries: list[ArticleEntry] = []
    errors: list[str] = []
    for category, feed_url in config.HANKYUNG_RSS_FEEDS.items():
        try:
            root = ET.fromstring(_fetch_xml(feed_url))
        except Exception as e:
            errors.append(f"{category}: {e}")
            continue
        items = root.findall(".//item")[:limit_per_category]
        for item in items:
            url = (item.findtext("link") or "").strip()
            title = (item.findtext("title") or "").strip()
            pub_date = (item.findtext("pubDate") or "").strip()
            if not url:
                continue
            all_entries.append(ArticleEntry(
                article_id=_extract_article_id(url), title=title, url=url,
                published=pub_date, category=category,
            ))

    if errors and len(errors) == len(config.HANKYUNG_RSS_FEEDS):
        raise FeedFetchError("; ".join(errors))

    # 같은 기사가 여러 카테고리에 동시 노출될 수 있으므로 article_id로 중복 제거
    seen = set()
    unique = []
    for e in all_entries:
        if e.article_id in seen:
            continue
        seen.add(e.article_id)
        unique.append(e)
    return unique


def find_new_articles() -> list[ArticleEntry]:
    processed = feed_state.load(config.HANKYUNG_STATE_FILE)
    new_ones = [a for a in get_latest_articles() if a.article_id not in processed]
    new_ones.sort(key=lambda a: parsedate_to_datetime(a.published) if a.published else datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return new_ones[: config.MAX_ARTICLES_PER_SOURCE]  # 최신 기사 우선


def mark_processed(article_ids: list[str]) -> None:
    feed_state.mark_processed(config.HANKYUNG_STATE_FILE, article_ids)


if __name__ == "__main__":
    for a in find_new_articles():
        print(a.published, a.category, a.title, a.url)
