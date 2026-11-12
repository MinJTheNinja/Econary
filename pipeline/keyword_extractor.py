"""기사 묶음(YTN/한경)을 Groq API(무료 티어)에 보내 TESAT 시사용어 후보를 추출/채점한다.
슈카월드 프로젝트의 keyword_extractor.py 에서 영상 처리 부분만 뺀 것 — 채점 로직은 그대로."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
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
# 분당 한도(TPM)는 아래 TokenWindow 가 직접 지킨다: 최근 60초 동안 실제로 쓴 토큰(prompt+completion)을
# 기억해 두고, 다음 요청의 (예상 prompt + max_tokens)가 들어갈 자리가 날 때까지 기다렸다가 보낸다.
# (실측: Groq 는 요청을 받을 때 prompt+max_tokens 만큼의 여유를 요구하고, 실제 사용량만 차감한다.)
# 예전처럼 요청을 한도 끝까지 채운 뒤 3초 만에 다음 요청을 보내면 거의 매번 429 → SDK 가 30초씩 재시도했다.
_TPM_LIMIT = int(os.environ.get("GROQ_TPM_LIMIT", "8000"))   # 이 계정 무료 티어 분당 토큰 한도 (모델별)
_REQUEST_TOKEN_BUDGET = 7500          # 요청 하나의 (prompt + max_tokens) 상한 — 413/요청당 한도 방지
_COMPLETION_TOKENS = 2400             # 응답(추출 결과 JSON)에 허용할 토큰. gpt-oss 계열은
                                       # 보이지 않는 "추론 토큰"도 이 예산을 함께 쓰고 길이
                                       # 편차가 커서(reasoning_effort="low"를 써도), 넉넉히
                                       # 잡아야 응답이 잘려 파싱이 깨지는 일이 줄어든다.
_RETRY_COMPLETION_TOKENS = 4000       # 400(도구 호출 실패/잘림)으로 반으로 쪼개 재시도할 때의 응답 예산
_CHARS_PER_TOKEN = 1.15               # 실측(~1.33)보다 보수적으로 잡은 토큰 추정 비율
_DESCRIPTION_CHAR_LIMIT = 300
_OVERHEAD_CACHE_FILE = config.DATA_DIR / "groq_overhead_tokens.json"


class TokenWindow:
    """프로세스 안의 모든 Groq 호출(용어 추출 + 콘텐츠 생성)이 함께 쓰는 60초 슬라이딩 윈도우."""

    def __init__(self, limit: int, window_sec: float = 60.0):
        self.limit = limit
        self.window = window_sec
        self._events: deque[tuple[float, int]] = deque()
        self._lock = threading.Lock()
        self.waited_sec = 0.0

    def _prune(self, now: float) -> None:
        while self._events and self._events[0][0] <= now - self.window:
            self._events.popleft()

    def used(self) -> int:
        with self._lock:
            self._prune(time.monotonic())
            return sum(t for _, t in self._events)

    def wait_for(self, tokens: int) -> float:
        """최근 60초 사용량 + tokens 가 한도 안에 들어갈 때까지 기다린다. 기다린 초를 반환."""
        tokens = min(tokens, self.limit)
        waited = 0.0
        while True:
            with self._lock:
                now = time.monotonic()
                self._prune(now)
                used = sum(t for _, t in self._events)
                if used + tokens <= self.limit:
                    break
                # 가장 오래된 기록부터 빠져나가면 자리가 나는 시점까지
                freed, until = 0, now
                for t0, n in self._events:
                    freed += n
                    until = t0 + self.window
                    if used - freed + tokens <= self.limit:
                        break
                delay = max(0.5, until - now + 0.5)
            time.sleep(delay)
            waited += delay
        if waited:
            self.waited_sec += waited
            log.info("분당 토큰 한도 대기 %.0f초 (최근 60초 %d + 이번 %d > %d)", waited, used, tokens, self.limit)
        return waited

    def add(self, tokens: int) -> None:
        with self._lock:
            self._events.append((time.monotonic(), max(0, int(tokens))))


limiter = TokenWindow(_TPM_LIMIT)


class ExtractionError(Exception):
    pass


class QuotaExceededError(ExtractionError):
    """일일/분당 토큰 한도 초과처럼 사용자 설정 문제가 아니라 시간이 지나면 저절로
    풀리는 상황. main.py에서 설정 오류 팝업을 띄우지 않고 조용히 다음 실행으로 넘긴다."""


class BatchFailed(ExtractionError):
    """이 배치/조각만 실패 (400 tool_use_failed, 응답 잘림 등). 쪼개서 재시도하거나 다음 실행으로 넘긴다."""


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
# 달라 같은 텍스트도 토큰 수가 다르다. 그래서 시스템 프롬프트+도구 스키마가 실제로 몇 토큰을
# 쓰는지 서버 응답(usage.prompt_tokens)으로 한 번 측정해 data/ 에 (모델, 프롬프트 해시)별로 저장해 두고
# 계속 재사용한다 — 프롬프트나 모델이 바뀔 때만 다시 잰다 (예전엔 매 실행마다 측정용 호출을 했다).
_PROMPT_HASH = hashlib.sha1((_SYSTEM_PROMPT + _TOOL_JSON).encode("utf-8")).hexdigest()[:12]
_fixed_overhead_tokens_cache: dict[str, int] = {}


def _fixed_overhead_tokens(model: str) -> int:
    if model in _fixed_overhead_tokens_cache:
        return _fixed_overhead_tokens_cache[model]
    key = f"{model}|{_PROMPT_HASH}"
    try:
        disk = json.loads(_OVERHEAD_CACHE_FILE.read_text(encoding="utf-8"))
    except Exception:
        disk = {}
    if isinstance(disk.get(key), int):
        _fixed_overhead_tokens_cache[model] = disk[key]
        return disk[key]
    estimate = _estimate_tokens(_SYSTEM_PROMPT) + _estimate_tokens(_TOOL_JSON)
    try:
        limiter.wait_for(estimate + 1)
        resp = _client().chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": _SYSTEM_PROMPT}, {"role": "user", "content": "ping"}],
            tools=[_tool_def()],
            max_tokens=1,
            reasoning_effort="low",
        )
        limiter.add(resp.usage.total_tokens)
        measured = int(resp.usage.prompt_tokens)
        disk[key] = measured
        _OVERHEAD_CACHE_FILE.write_text(json.dumps(disk, ensure_ascii=False, indent=2), encoding="utf-8")
        log.info("시스템 프롬프트 고정 토큰 측정·저장: %s = %d", key, measured)
    except Exception as e:
        log.warning("고정 토큰 측정 실패, 문자수 추정치 %d 사용: %s", estimate, e)
        measured = estimate
    _fixed_overhead_tokens_cache[model] = measured
    return measured


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


def _error_body(e: Exception) -> str:
    body = getattr(e, "body", None)
    try:
        text = json.dumps(body, ensure_ascii=False) if body is not None else str(e)
    except Exception:
        text = str(e)
    return text[:600]


def _salvage_failed_generation(e: Exception) -> list[dict] | None:
    """400 tool_use_failed 응답의 failed_generation 이 {"name": ..., "arguments": {"keywords": [...]}} 형태로
    완결된 JSON 이면 keywords 를 돌려준다. 잘렸거나 형태가 다르면 None."""
    body = getattr(e, "body", None)
    err = body.get("error", body) if isinstance(body, dict) else None
    gen = err.get("failed_generation") if isinstance(err, dict) else None
    if not isinstance(gen, str):
        return None
    try:
        obj = json.loads(gen)
    except json.JSONDecodeError:
        return None
    if isinstance(obj, list) and obj:
        obj = obj[0]
    if not isinstance(obj, dict):
        return None
    args = obj.get("arguments", obj.get("parameters", obj))
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except json.JSONDecodeError:
            return None
    kws = args.get("keywords") if isinstance(args, dict) else None
    if isinstance(kws, list) and all(isinstance(k, dict) for k in kws):
        return kws
    return None


def _call_groq(user_message: str, model: str, max_tokens: int = _COMPLETION_TOKENS) -> list[dict]:
    """Groq를 호출해서 raw keyword dict 리스트(채점 전)를 반환한다.
    분당 한도는 limiter 로 미리 기다린다. 도구 호출 실패/응답 잘림(400)은 BatchFailed 로 올려서
    호출자가 배치를 쪼개 재시도하게 한다 (예전엔 조용히 빈 결과로 삼켰다)."""
    client = _client()
    tool = _tool_def()
    est_prompt = _fixed_overhead_tokens(model) + _estimate_tokens(user_message)

    max_retries = len(_RETRY_DELAYS_SEC)
    transient_retry = 0

    while True:
        limiter.wait_for(est_prompt + max_tokens)
        try:
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_message},
                ],
                tools=[tool],
                tool_choice={"type": "function", "function": {"name": TOOL_SCHEMA["name"]}},
                max_tokens=max_tokens,
                reasoning_effort="low",
            )
            usage = getattr(response, "usage", None)
            limiter.add(usage.total_tokens if usage else est_prompt + max_tokens)
            break
        except groq.RateLimitError as e:
            # SDK 가 Retry-After 만큼 기다리며 max_retries 번 재시도한 뒤에도 429 → 일일 한도(TPD)이거나
            # 다른 프로젝트가 같은 키를 쓰는 중. 이 실행에서는 남은 배치를 포기하고 다음 실행에서 재시도한다.
            limiter.add(est_prompt)
            raise QuotaExceededError(f"Groq 토큰 한도 초과({model}): {_error_body(e)}") from e
        except Exception as e:
            msg = str(e)
            salvaged = _salvage_failed_generation(e)
            if salvaged is not None:
                # 모델이 도구 이름을 틀리게 쓰는 경우('submit_tesval_keywords' 등)가 400 의 주된 원인인데,
                # 이때도 failed_generation 에 온전한 인자 JSON 이 들어 있으므로 그대로 살려 쓴다.
                limiter.add(est_prompt + max_tokens)
                log.info("Groq 400(도구 이름 오류)이지만 failed_generation 에서 후보 %d개를 살림", len(salvaged))
                return salvaged
            if any(s in msg for s in ("Failed to parse tool call arguments", "did not call a tool", "tool_use_failed")):
                # 응답이 max_tokens 에 잘렸거나 모델이 도구 호출 형식을 못 지킨 경우. 예전엔 조용히 []를
                # 반환해서 그 배치의 기사가 통째로 사라졌다. 서버가 생성까지 하고 실패한 것이라 토큰도 쓴 것으로 친다.
                limiter.add(est_prompt + max_tokens)
                raise BatchFailed(f"Groq 400 (max_tokens={max_tokens}): {_error_body(e)}") from e
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
        raise BatchFailed(f"모델이 도구를 호출하지 않음 (finish_reason={response.choices[0].finish_reason})")

    try:
        args = json.loads(call.function.arguments)
    except json.JSONDecodeError as e:
        raise BatchFailed(f"모델 응답 JSON 파싱 실패 (응답이 잘렸을 수 있음): {e}") from e

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


@dataclass
class ExtractionOutcome:
    keywords: list[dict] = field(default_factory=list)           # 채점·필터 통과 키워드 (점수순)
    failed_article_ids: list[str] = field(default_factory=list)  # 이번에 결과를 못 얻은 기사 → 처리 완료로 표시하면 안 됨
    dropped_article_ids: list[str] = field(default_factory=list)  # 그중 재시도까지 400 으로 실패한 기사 (한도 초과로 건너뛴 건 제외)
    batches: int = 0
    calls: int = 0
    retried_batches: int = 0      # 400 으로 반 나눠 재시도한 배치 수
    dropped_parts: int = 0        # 재시도까지 실패한 조각 수
    raw_terms: int = 0            # 모델이 낸 후보 수 (중복 제거 전)
    quota_error: str = ""         # 한도 초과로 남은 배치를 건너뛰었으면 그 사유

    def summary(self) -> str:
        s = (f"용어 추출: 배치 {self.batches}개 · 호출 {self.calls}회 · 후보 {self.raw_terms}개 → 채점 통과 {len(self.keywords)}개 · "
             f"400 재시도 {self.retried_batches}건 · 실패 조각 {self.dropped_parts}개")
        if self.failed_article_ids:
            s += f" · 다음 실행에 다시 볼 기사 {len(self.failed_article_ids)}건"
        if self.quota_error:
            s += f"\n한도 초과로 중단: {self.quota_error[:200]}"
        return s


def _halves(batch: list[dict]) -> list[list[dict]]:
    """배치를 반으로. 기사가 하나뿐이면 본문을 앞/뒤 반으로 나눈 두 조각 (어느 쪽에 나온 용어든 건지도록)."""
    if len(batch) > 1:
        mid = len(batch) // 2
        return [batch[:mid], batch[mid:]]
    art = batch[0]
    text = art["text"]
    mid = len(text) // 2
    cut = text.rfind("\n", 0, mid)
    if cut < mid // 2:
        cut = mid
    return [[{**art, "text": text[:cut]}], [{**art, "text": text[cut:]}]]


def extract_articles(articles: list[dict], source_label: str = "한국경제신문(한경)") -> ExtractionOutcome:
    """articles: [{"url","title","category","published","text","article_id"}, ...]
    배치마다 호출하고, 400(도구 호출 실패/잘림)이면 반으로 나눠 더 큰 응답 예산으로 한 번 재시도한다.
    그래도 실패한 기사는 failed_article_ids 로 돌려줘서 호출자가 처리 완료로 표시하지 않게 한다.
    한도 초과(QuotaExceededError)면 남은 배치는 건너뛰고(실패 목록에 넣고) 그때까지의 결과를 반환한다.
    키워드의 video_id/video_title/source_urls 등은 각 키워드의 source_url 로 원본 기사와 매칭해서 채운다."""
    out = ExtractionOutcome()
    if not articles:
        return out

    model = config.GROQ_MODEL_ARTICLES
    url_lookup = {a["url"]: a for a in articles}

    shell = _build_articles_message([], config.ARTICLE_BODY_CHAR_LIMIT, source_label)
    batch_budget = max(500, _max_user_message_chars(model) - len(shell))
    body_char_limit = min(config.ARTICLE_BODY_CHAR_LIMIT, batch_budget)
    batches = _pack_articles(articles, batch_budget, body_char_limit)
    out.batches = len(batches)
    overhead = _fixed_overhead_tokens(model)

    def fail(batch: list[dict]) -> None:
        for a in batch:
            aid = a.get("article_id", a["url"])
            if aid not in out.failed_article_ids:
                out.failed_article_ids.append(aid)

    raw_keywords: list[dict] = []
    for i, batch in enumerate(batches, 1):
        if out.quota_error:
            fail(batch)
            continue
        try:
            out.calls += 1
            raw_keywords.extend(_call_groq(_build_articles_message(batch, body_char_limit, source_label), model))
            continue
        except QuotaExceededError as e:
            log.warning("용어 추출 한도 초과 — 남은 배치 %d개는 다음 실행으로: %s", len(batches) - i + 1, e)
            out.quota_error = str(e)
            fail(batch)
            continue
        except BatchFailed as e:
            log.warning("용어 추출 배치 %d/%d 실패(기사 %d건) → 반으로 나눠 재시도: %s", i, len(batches), len(batch), e)
            out.retried_batches += 1

        for part in _halves(batch):
            if out.quota_error:
                fail(part)
                continue
            msg = _build_articles_message(part, body_char_limit, source_label)
            prompt_est = overhead + _estimate_tokens(msg)
            max_tokens = max(_COMPLETION_TOKENS, min(_RETRY_COMPLETION_TOKENS, _REQUEST_TOKEN_BUDGET - prompt_est))
            try:
                out.calls += 1
                got = _call_groq(msg, model, max_tokens=max_tokens)
                raw_keywords.extend(got)
                log.info("  재시도 조각 성공: 후보 %d개 (max_tokens=%d)", len(got), max_tokens)
            except QuotaExceededError as e:
                out.quota_error = str(e)
                fail(part)
            except BatchFailed as e:
                log.warning("  재시도 조각도 실패 — 기사 %s 는 다음 실행에서 다시 시도: %s",
                            ", ".join(a.get("article_id", "") for a in part), e)
                out.dropped_parts += 1
                fail(part)
                out.dropped_article_ids += [a.get("article_id", a["url"]) for a in part
                                            if a.get("article_id", a["url"]) not in out.dropped_article_ids]

    out.raw_terms = len(raw_keywords)
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

    out.keywords = results
    return out


def extract_keywords_from_articles(articles: list[dict], source_label: str = "한국경제신문(한경)") -> list[dict]:
    """호환용: 키워드만 반환. 한도 초과로 하나도 못 얻었으면 QuotaExceededError 를 올린다."""
    out = extract_articles(articles, source_label)
    if out.quota_error and not out.keywords:
        raise QuotaExceededError(out.quota_error)
    return out.keywords
