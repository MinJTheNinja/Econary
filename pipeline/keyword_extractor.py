"""기사 묶음(YTN/한경)을 Groq API(무료 티어)에 보내 TESAT 시사용어 후보를 추출/채점한다.
슈카월드 프로젝트의 keyword_extractor.py 에서 영상 처리 부분만 뺀 것 — 채점 로직은 그대로."""
from __future__ import annotations

import json
import logging
import re
import time
from datetime import date

import groq
from groq import Groq

import config
import history_store
from tesat_rubric import build_system_prompt, TOOL_SCHEMA

log = logging.getLogger(__name__)

SCORE_KEYS = [
    "term_label", "mc_potential", "distractor_power", "exposure",
    "econ_biz_link", "novelty", "korea_relevance", "freshness", "distractor_score",
]

# Groq 무료 티어는 레이트리밋/일시적 5xx 오류를 종종 반환한다. 짧게 기다렸다 재시도하면
# 대부분 해결되므로, 완전히 실패 처리하기 전에 빠르게 여러 번 재시도한다.
_RETRY_DELAYS_SEC = [1, 2, 4, 8]

# ---- 이 계정의 Groq 무료 티어 요청당/일일 토큰 한도 대응 ----
# 채점 시스템 프롬프트만으로도 이미 수천 토큰을 쓰기 때문에, 자막/기사 전문을 그대로 한
# 요청에 다 넣으면 413(Payload Too Large)이 난다. 안전 여유를 두고 조각내서 여러 번 호출한다.
# 이 한도(TPM=분당, TPD=일일)는 모델별로 완전히 별개라서, 유튜브/한경에 다른 모델을 써서
# (config.GROQ_MODEL_VIDEO / GROQ_MODEL_ARTICLES) 하루 처리량을 사실상 두 배로 늘린다.
# 분당 한도(429)는 Groq SDK가 서버의 Retry-After를 그대로 읽어 내부적으로 재시도해주므로
# (Groq(max_retries=...)), 직접 페이싱을 흉내내지 않는다 — 로컬에서 재현한 버킷은 서버의
# 실제 슬라이딩 윈도우와 어긋나서 오히려 429를 유발한 적이 있다.
_REQUEST_TOKEN_BUDGET = 7500          # 413 방지용 버퍼 (요청 하나당 상한, 분당 한도 8000의 여유분)
_COMPLETION_TOKENS = 2400             # 응답(추출 결과 JSON)에 허용할 토큰. gpt-oss 계열은
                                       # 보이지 않는 "추론 토큰"도 이 예산을 함께 쓰고 길이
                                       # 편차가 커서(reasoning_effort="low"를 써도), 넉넉히
                                       # 잡아야 응답이 잘려 파싱이 깨지는 일이 줄어든다.
_CHARS_PER_TOKEN = 1.15               # 실측(~1.33)보다 보수적으로 잡은 토큰 추정 비율
_DESCRIPTION_CHAR_LIMIT = 300
_INTER_CALL_DELAY_SEC = 3             # 같은 영상/배치 안에서 연속 호출 사이에 두는 여유 시간


class ExtractionError(Exception):
    pass


class QuotaExceededError(ExtractionError):
    """일일/분당 토큰 한도 초과처럼 사용자 설정 문제가 아니라 시간이 지나면 저절로
    풀리는 상황. main.py에서 설정 오류 팝업을 띄우지 않고 조용히 다음 실행으로 넘긴다."""


def grade_for_score(score: int) -> str:
    for grade, threshold in config.GRADE_THRESHOLDS:
        if score >= threshold:
            return grade
    return "IGNORE"


def _norm_term(s: str) -> str:
    s = (s or "").strip().lower()
    return re.sub(r"[\s\-_/()\[\]·,.]+", "", s)


def _estimate_tokens(text: str) -> int:
    return int(len(text) / _CHARS_PER_TOKEN) + 1


def _client() -> Groq:
    if not config.GROQ_API_KEY:
        raise ExtractionError(
            "GROQ_API_KEY가 설정되지 않았습니다. https://console.groq.com/keys 에서 "
            "무료로 키를 발급받아 .env 파일에 입력하세요 (.env.example 참고)."
        )
    # max_retries: 429(분당 한도)를 SDK가 서버의 Retry-After만큼 자동으로 기다렸다 재시도한다.
    return Groq(api_key=config.GROQ_API_KEY, max_retries=5)


def _tool_def() -> dict:
    return {
        "type": "function",
        "function": {
            "name": TOOL_SCHEMA["name"],
            "description": TOOL_SCHEMA["description"],
            "parameters": TOOL_SCHEMA["input_schema"],
        },
    }


_SYSTEM_PROMPT = build_system_prompt()
_TOOL_JSON = json.dumps(_tool_def(), ensure_ascii=False)

# 문자수->토큰수 추정은 부정확하고(한글/영문/JSON 밀도가 다 다름), 모델마다 토크나이저가
# 달라 같은 텍스트도 토큰 수가 다르다. 그래서 시스템 프롬프트+도구 스키마가 실제로 몇
# 토큰을 쓰는지 모델별로 첫 호출 때 서버 응답(usage.prompt_tokens)으로 직접 측정해서
# 캐싱한다. 측정 전까지는 보수적인 문자 기반 추정치를 임시로 쓴다.
_fixed_overhead_tokens_cache: dict[str, int] = {}


def _fixed_overhead_tokens(model: str) -> int:
    if model in _fixed_overhead_tokens_cache:
        return _fixed_overhead_tokens_cache[model]
    try:
        client = _client()
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": "ping"},
            ],
            tools=[_tool_def()],
            max_tokens=1,
            reasoning_effort="low",
        )
        _fixed_overhead_tokens_cache[model] = resp.usage.prompt_tokens
    except Exception:
        _fixed_overhead_tokens_cache[model] = _estimate_tokens(_SYSTEM_PROMPT) + _estimate_tokens(_TOOL_JSON)
    return _fixed_overhead_tokens_cache[model]


def _max_user_message_tokens(model: str) -> int:
    return max(200, _REQUEST_TOKEN_BUDGET - _fixed_overhead_tokens(model) - _COMPLETION_TOKENS)


def _max_user_message_chars(model: str) -> int:
    return int(_max_user_message_tokens(model) * _CHARS_PER_TOKEN)


def _split_text(text: str, max_chars: int) -> list[str]:
    """text를 max_chars 이하 조각들로 나눈다. 가능하면 줄바꿈/문장 경계에서 자른다."""
    text = text or ""
    if len(text) <= max_chars:
        return [text] if text else []

    chunks = []
    start, n = 0, len(text)
    while start < n:
        end = min(start + max_chars, n)
        if end < n:
            boundary = text.rfind("\n", start, end)
            if boundary <= start:
                boundary = text.rfind(". ", start, end)
            if boundary <= start:
                boundary = text.rfind(" ", start, end)
            if boundary > start:
                end = boundary + 1
        chunks.append(text[start:end])
        start = end
    return chunks


def _dedupe_raw_keywords(raw_keywords: list[dict]) -> list[dict]:
    """여러 조각/배치 호출에서 같은 용어가 중복 추출되면 세부점수 합이 더 높은 쪽만 남긴다."""
    best: dict[str, tuple[int, dict]] = {}
    for kw in raw_keywords:
        key = _norm_term(kw.get("term") or kw.get("korean_name") or "")
        if not key:
            continue
        scores = dict(kw.get("scores", {}))
        score = sum(int(scores.get(k, 0)) for k in SCORE_KEYS)
        prev = best.get(key)
        if prev is None or score > prev[0]:
            best[key] = (score, kw)
    return [kw for _, kw in best.values()]


def _call_groq(user_message: str, model: str) -> list[dict]:
    """Groq를 호출해서 raw keyword dict 리스트(채점 전)를 반환한다.
    user_message는 호출 전에 _max_user_message_chars(model) 이하로 잘려 있어야 한다."""
    client = _client()
    tool = _tool_def()

    max_retries = len(_RETRY_DELAYS_SEC)
    parse_retry = transient_retry = 0

    response = None
    while True:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                tools=[tool],
                tool_choice={"type": "function", "function": {"name": TOOL_SCHEMA["name"]}},
                max_tokens=_COMPLETION_TOKENS,
                reasoning_effort="low",
            )
            break
        except groq.RateLimitError as e:
            # 분당 한도(429)는 Groq SDK가 max_retries만큼 서버의 Retry-After를 그대로
            # 기다렸다가 내부적으로 재시도한다. 그래도 여기까지 올라왔다면 그 재시도마저
            # 실패했거나(부하가 매우 심함) 일일 한도(TPD)를 넘긴 것이므로, 더 기다려봐야
            # 소용없다고 보고 이 실행에서는 포기하고 다음 실행에서 재시도한다.
            raise QuotaExceededError(f"Groq 토큰 한도 초과({model}): {e}") from e
        except Exception as e:
            msg = str(e)
            if "Failed to parse tool call arguments" in msg:
                # 응답이 max_tokens에 걸려 중간에 잘려서 JSON이 깨진 경우. 재시도하면 모델이
                # 더 짧게 다시 쓸 수도 있으니 몇 번 재시도하고, 계속 실패하면 이 조각/배치만
                # 건너뛴다 (결과 손실이 있을 수 있어 로그를 남긴다).
                parse_retry += 1
                if parse_retry > max_retries:
                    log.warning("Groq 응답이 계속 잘려서 이 조각/배치는 건너뜁니다 (일부 후보 유실 가능)")
                    return []
                log.warning("Groq 응답이 잘려 JSON 파싱 실패, 재시도 %d/%d", parse_retry, max_retries)
                time.sleep(_RETRY_DELAYS_SEC[parse_retry - 1])
                continue
            if "did not call a tool" in msg or "tool_use_failed" in msg:
                # 이 조각/배치에는 뽑을 만한 후보가 없다고 모델이 판단한 경우 (강제 tool_choice를
                # 못 지킬 만큼 내용이 빈약할 때 종종 발생). 전체를 실패시키지 않고 빈 결과로 넘어간다.
                return []
            is_transient = isinstance(e, (groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError)) \
                or any(s in msg for s in ("500", "502", "503"))
            if is_transient:
                transient_retry += 1
                if transient_retry > max_retries:
                    raise ExtractionError(f"Groq API 호출 실패({model}): {e}") from e
                log.warning("Groq 호출 실패(재시도 가능), %d/%d 재시도: %s", transient_retry, max_retries, msg)
                time.sleep(_RETRY_DELAYS_SEC[transient_retry - 1])
                continue
            raise ExtractionError(f"Groq API 호출 실패({model}): {e}") from e

    tool_calls = response.choices[0].message.tool_calls or []
    call = next((c for c in tool_calls if c.function.name == TOOL_SCHEMA["name"]), None)

    if call is None:
        raise ExtractionError("모델이 구조화된 결과를 반환하지 않았습니다.")

    try:
        args = json.loads(call.function.arguments)
    except json.JSONDecodeError as e:
        raise ExtractionError(f"모델 응답 JSON 파싱 실패 (응답이 잘렸을 수 있음): {e}") from e

    return list(args.get("keywords", []))


def _score_and_filter(raw_keywords: list[dict]) -> list[dict]:
    """8개 항목 + distractor 점수를 합산해 등급을 매기고, 기준 미달 항목을 걸러낸다."""
    results = []
    for kw in raw_keywords:
        kw = dict(kw)
        scores = dict(kw.get("scores", {}))
        total = sum(int(scores.get(k, 0)) for k in SCORE_KEYS)
        total = max(0, min(110, total))
        grade = grade_for_score(total)

        forced = bool(kw.get("forced_flag"))
        if forced and grade not in ("MUST_STUDY", "HIGH"):
            total = max(total, 75)
            grade = grade_for_score(total)
            kw["reason"] = (kw.get("reason", "") + " [강제 FLAG 조건 적용으로 HIGH 이상 보정]").strip()

        if total < config.MIN_SCORE_TO_COLLECT and not forced:
            continue

        prior_count = history_store.get_prior_article_count(
            kw.get("term", ""), kw.get("korean_name", "")
        )

        results.append({
            **kw,
            "scores": scores,
            "total_score": total,
            "grade": grade,
            "article_count": prior_count + 1,
        })

    results.sort(key=lambda r: r["total_score"], reverse=True)
    return results


def _build_articles_message(articles: list[dict], body_char_limit: int, source_label: str = "한국경제신문(한경)") -> str:
    article_blocks = []
    for i, art in enumerate(articles, 1):
        article_blocks.append(
            f"--- 기사 {i} ---\n"
            f"URL: {art['url']}\n"
            f"카테고리: {art.get('category', '')}\n"
            f"제목: {art['title']}\n"
            f"본문:\n{art['text'][:body_char_limit]}"
        )
    articles_text = "\n\n".join(article_blocks)

    return f"""\
[오늘 날짜] {date.today().isoformat()}

[콘텐츠 종류] {source_label} 기사 {len(articles)}건 (오늘 새로 올라온 경제 기사)

[기사 목록]
{articles_text}

위 기사들에서 TESAT 시사용어 후보를 찾아 시스템 프롬프트의 기준대로 채점해서
submit_tesat_keywords 함수로 제출하라. 각 항목의 source_url은 실제로 그 용어가 등장한
기사의 URL을 위 목록에서 정확히 그대로 복사해서 적어라. 후보가 없으면 keywords를 빈 배열로 제출하라.
"""


def _pack_articles(articles: list[dict], max_chars: int, body_char_limit: int) -> list[list[dict]]:
    """기사들을 토큰 예산(max_chars) 안에서 최대한 채워 배치로 묶는다.
    기사 하나만으로도 예산을 넘으면 본문을 강제로 잘라서 단독 배치로 담는다."""
    batches: list[list[dict]] = []
    current: list[dict] = []
    current_len = 0

    def block_len(art: dict, limit: int) -> int:
        return (
            len(art["text"][:limit]) + len(art.get("title", ""))
            + len(art.get("category", "")) + len(art["url"]) + 60
        )

    for art in articles:
        length = block_len(art, body_char_limit)
        if current and current_len + length > max_chars:
            batches.append(current)
            current, current_len = [], 0

        if length > max_chars:
            fixed = len(art.get("title", "")) + len(art.get("category", "")) + len(art["url"]) + 60
            allowed_body = max(200, max_chars - fixed)
            trimmed = dict(art)
            trimmed["text"] = art["text"][:allowed_body]
            batches.append([trimmed])
            continue

        current.append(art)
        current_len += length

    if current:
        batches.append(current)
    return batches


def extract_keywords_from_articles(articles: list[dict], source_label: str = "한국경제신문(한경)") -> list[dict]:
    """articles: [{"url","title","category","published","text"}, ...]
    반환: 점수/등급이 계산된 키워드 dict 리스트. video_id/video_title/source_urls 등은
    각 키워드의 source_url을 기준으로 원본 기사와 매칭해서 채운다.
    """
    if not articles:
        return []

    model = config.GROQ_MODEL_ARTICLES
    url_lookup = {a["url"]: a for a in articles}

    shell = _build_articles_message([], config.ARTICLE_BODY_CHAR_LIMIT, source_label)
    batch_budget = max(500, _max_user_message_chars(model) - len(shell))
    body_char_limit = min(config.ARTICLE_BODY_CHAR_LIMIT, batch_budget)
    batches = _pack_articles(articles, batch_budget, body_char_limit)

    raw_keywords: list[dict] = []
    for i, batch in enumerate(batches):
        if i > 0:
            time.sleep(_INTER_CALL_DELAY_SEC)  # 연속 호출 사이 여유를 둬서 429 빈도를 줄인다
        raw_keywords.extend(_call_groq(_build_articles_message(batch, body_char_limit, source_label), model))

    results = _score_and_filter(_dedupe_raw_keywords(raw_keywords))

    for r in results:
        src_url = r.get("source_url", "")
        art = url_lookup.get(src_url)
        if art is None:
            # 모델이 URL을 정확히 못 베꼈으면 첫 기사로 폴백
            art = articles[0]
            src_url = art["url"]

        published_date = art.get("published_ymd", "")
        r["first_seen"] = published_date
        r["last_seen"] = published_date
        r["source_urls"] = [src_url]
        r["video_id"] = art.get("article_id", src_url)
        r["video_title"] = art.get("title", "")

    return results
