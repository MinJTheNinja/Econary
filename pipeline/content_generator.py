"""고정 단어 + 오늘의 시사 맥락 → 자체 문장으로 쓴 짧은 시사 설명과 4지선다 퀴즈 후보 생성 (PRD 2.1, 4).

저작권 원칙 (PRD 2): 기사 원문·장문 복사 금지. 기사 발췌는 모델이 맥락을 이해하는 재료로만 주고,
결과물은 copy_check() 로 원문과 겹치는지 검사해 걸리면 버린다. 생성물은 모두 review_status='pending'
으로 저장되어 관리자 검수 후에만 학습자에게 노출된다.
"""
from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass

import groq
from groq import Groq

import config
from keyword_extractor import ExtractionError, QuotaExceededError

log = logging.getLogger(__name__)

TOOL = {
    "type": "function",
    "function": {
        "name": "submit_word_contents",
        "description": "단어별 시사 설명과 퀴즈를 제출한다.",
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "word_id": {"type": "integer"},
                            "topic": {"type": "string", "description": "연결된 시사 이슈를 자기 말로 요약한 한 줄 (40자 이내)"},
                            "explanation": {
                                "type": "string",
                                "description": "단어 뜻을 바탕으로 이 단어가 지금 시사 이슈에서 왜 등장하는지 2~3문장, 250자 이내. "
                                               "기사 문장을 옮기지 말고 직접 쓴 문장으로.",
                            },
                            "question": {"type": "string", "description": "퀴즈 문항 (120자 이내)"},
                            "choices": {"type": "array", "items": {"type": "string"}, "description": "보기 정확히 4개, 각 50자 이내"},
                            "answer_index": {"type": "integer", "description": "정답 보기 번호 (0부터)"},
                            "answer_explanation": {"type": "string", "description": "정답 해설 (150자 이내)"},
                            "choice_notes": {
                                "type": "array", "items": {"type": "string"},
                                "description": "보기마다 한 줄 설명, choices 와 같은 순서·같은 개수(4). 각 80자 이내. "
                                               "정답 보기는 왜 맞는지, 오답 보기는 그 보기가 실제로 어떤 개념·상황인지와 왜 이 문제의 답이 아닌지.",
                            },
                        },
                        "required": ["word_id", "topic", "explanation", "question", "choices", "answer_index", "answer_explanation",
                                     "choice_notes"],
                    },
                }
            },
            "required": ["items"],
        },
    },
}

SYSTEM_PROMPT = """\
당신은 TESAT(경제이해력검증시험) 대비 어휘 앱의 콘텐츠 작가입니다.
각 단어에 대해 (1) 짧은 시사 설명 (2) 4지선다 퀴즈 하나를 만듭니다.

규칙
- 단어의 '고정 뜻'이 기준이다. 뜻을 바꾸거나 과장하지 말 것.
- 시사 설명: 이 단어가 오늘 이슈에서 왜 등장하는지 학습자가 이해하도록 2~3문장. 숫자·고유명사는 맥락상 꼭 필요할 때만.
- 기사 발췌는 이해용 참고자료다. 기사 문장이나 제목을 그대로 옮기지 말고 반드시 자기 문장으로 새로 쓴다.
- 퀴즈는 단어의 의미, 또는 시사 맥락에서의 쓰임을 묻는다. 기사 원문을 지문으로 제시하지 않는다.
- 오답 보기는 헷갈리기 쉬운 유사 개념(제공된 유사개념 목록 활용)으로 그럴듯하게. 정답은 하나만 명확해야 한다.
- 정답 위치(answer_index)는 0~3 사이에서 골고루 섞는다.
- choice_notes: 학습자가 그 보기를 골랐을 때 보여 줄 설명이다. 보기 문장을 되풀이하지 말고 새 정보를 준다.
  오답 보기는 "그건 ○○(다른 개념)의 설명이에요 — △△라서 이 문제와 달라요"처럼 그 보기의 정체와 차이를 짚는다.
- 모든 항목을 submit_word_contents 로 한 번에 제출한다.
"""

_RETRY_DELAYS_SEC = [1, 2, 4, 8]
_COMPLETION_TOKENS = 4000  # 선지별 설명(choice_notes)까지


@dataclass
class WordTask:
    word_id: int
    term: str
    meaning: str
    article_title: str
    article_url: str
    article_text: str
    source: str            # 'ytn' | 'hankyung'
    source_date: str       # YYYY-MM-DD
    keyword: dict          # keyword_extractor 결과 (definition, reason, related_distractor_terms ...)


def excerpt(text: str, names: list[str], size: int = config.CONTEXT_EXCERPT_CHARS) -> str:
    """기사에서 단어가 처음 나오는 곳 주변만 잘라 맥락 재료로 쓴다."""
    pos = next((p for n in names if n and (p := text.find(n)) >= 0), -1)
    if pos < 0:
        return text[:size]
    start = max(0, pos - size // 2)
    return text[start:start + size]


def _squash(s: str) -> str:
    return re.sub(r"[\s\"'“”‘’.,·…()\[\]]+", "", s or "")


def copy_check(generated: str, source: str) -> str | None:
    """생성문이 원문을 베꼈으면 이유 문자열, 아니면 None.
    공백·문장부호를 뺀 상태에서 COPY_CHECK_MIN_RUN 글자 이상 연속 일치하거나,
    8글자 조각 중복 비율이 COPY_CHECK_MAX_OVERLAP 을 넘으면 복사로 본다."""
    g, s = _squash(generated), _squash(source)
    n = config.COPY_CHECK_MIN_RUN
    if len(g) >= n and s:
        for i in range(len(g) - n + 1):
            if g[i:i + n] in s:
                return f"원문과 {n}자 이상 연속 일치: '{g[i:i + n]}'"
    k = 8
    shingles = {g[i:i + k] for i in range(len(g) - k + 1)}
    if shingles and s:
        overlap = sum(1 for x in shingles if x in s) / len(shingles)
        if overlap > config.COPY_CHECK_MAX_OVERLAP:
            return f"원문 조각 중복 비율 {overlap:.0%}"
    return None


def validate_item(item: dict) -> str | None:
    """구조·길이 검사. 문제가 있으면 이유, 없으면 None."""
    choices = item.get("choices") or []
    if len(choices) != 4 or any(not str(c).strip() for c in choices):
        return "보기가 4개가 아님"
    if len({_squash(str(c)) for c in choices}) != 4:
        return "중복 보기"
    if not isinstance(item.get("answer_index"), int) or not 0 <= item["answer_index"] < 4:
        return "정답 번호 범위 오류"
    if not (item.get("explanation") or "").strip() or len(item["explanation"]) > config.EXPLANATION_MAX_CHARS:
        return "설명 길이 오류"
    if not (item.get("question") or "").strip() or not (item.get("answer_explanation") or "").strip():
        return "문항/해설 누락"
    return None


def clean_notes(item: dict) -> list[str] | None:
    """선지별 설명: 보기와 개수가 맞고 비어 있지 않을 때만 쓴다 (아니면 없이 저장 — 앱이 해설로 대체)."""
    notes = item.get("choice_notes")
    if not isinstance(notes, list) or len(notes) != len(item.get("choices") or []):
        return None
    out = [str(n).strip()[:120] for n in notes]
    return out if all(out) else None


def _build_message(tasks: list[WordTask]) -> str:
    blocks = []
    for t in tasks:
        kw = t.keyword
        blocks.append(
            f"--- word_id {t.word_id} ---\n"
            f"단어: {t.term}\n"
            f"고정 뜻: {t.meaning}\n"
            f"오늘 이슈 기사 제목(참고용, 옮기지 말 것): {t.article_title}\n"
            f"분석 메모: {kw.get('reason', '')}\n"
            f"헷갈리는 유사개념: {', '.join(kw.get('related_distractor_terms') or []) or '(없음)'}\n"
            f"기사 발췌(이해용, 옮기지 말 것):\n{excerpt(t.article_text, [t.term, kw.get('korean_name', ''), kw.get('term', '')])}"
        )
    return "\n\n".join(blocks) + f"\n\n위 {len(tasks)}개 단어 각각에 대해 시사 설명과 퀴즈를 만들어 제출하라."


def _call(message: str) -> list[dict]:
    if not config.GROQ_API_KEY:
        raise ExtractionError("GROQ_API_KEY 가 설정되지 않았습니다 (pipeline/.env).")
    client = Groq(api_key=config.GROQ_API_KEY, max_retries=5)
    for attempt in range(len(_RETRY_DELAYS_SEC) + 1):
        try:
            resp = client.chat.completions.create(
                model=config.GROQ_MODEL_CONTENT,
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": message}],
                tools=[TOOL],
                tool_choice={"type": "function", "function": {"name": "submit_word_contents"}},
                max_tokens=_COMPLETION_TOKENS,
                reasoning_effort="low",
            )
            calls = resp.choices[0].message.tool_calls or []
            if not calls:
                raise ExtractionError("모델이 구조화된 결과를 반환하지 않았습니다.")
            return list(json.loads(calls[0].function.arguments).get("items", []))
        except groq.RateLimitError as e:
            raise QuotaExceededError(f"Groq 토큰 한도 초과({config.GROQ_MODEL_CONTENT}): {e}") from e
        except (json.JSONDecodeError, groq.APIConnectionError, groq.APITimeoutError, groq.InternalServerError) as e:
            if attempt == len(_RETRY_DELAYS_SEC):
                raise ExtractionError(f"콘텐츠 생성 실패: {e}") from e
            log.warning("콘텐츠 생성 재시도 %d: %s", attempt + 1, e)
            time.sleep(_RETRY_DELAYS_SEC[attempt])
        except groq.BadRequestError as e:
            if "Failed to parse tool call" in str(e) and attempt < len(_RETRY_DELAYS_SEC):
                log.warning("응답이 잘려 재시도 %d", attempt + 1)
                time.sleep(_RETRY_DELAYS_SEC[attempt])
                continue
            raise ExtractionError(f"콘텐츠 생성 실패: {e}") from e
    return []


def to_rows(task: WordTask, item: dict) -> list[dict]:
    common = {
        "word_id": task.word_id, "source": task.source, "topic": (item.get("topic") or "")[:80],
        "source_date": task.source_date or None, "source_url": task.article_url, "source_title": task.article_title,
        "review_status": "pending",
    }
    return [
        # PostgREST 일괄 insert 는 모든 행의 키가 같아야 해서 퀴즈 전용 칸도 null 로 채운다
        {**common, "kind": "explanation", "body": item["explanation"].strip(),
         "choices": None, "answer_index": None, "answer_explanation": None, "choice_notes": None},
        {**common, "kind": "quiz", "body": item["question"].strip(), "choices": [str(c).strip() for c in item["choices"]],
         "answer_index": item["answer_index"], "answer_explanation": item["answer_explanation"].strip(),
         "choice_notes": clean_notes(item)},
    ]


def generate(tasks: list[WordTask]) -> tuple[list[dict], list[str]]:
    """반환: (word_contents 행 목록, 버린 항목 사유 목록). QuotaExceededError/ExtractionError 는 호출자가 처리."""
    by_id = {t.word_id: t for t in tasks}
    rows: list[dict] = []
    rejected: list[str] = []
    step = config.WORDS_PER_GENERATION_CALL
    for i in range(0, len(tasks), step):
        if i:
            time.sleep(3)
        for item in _call(_build_message(tasks[i:i + step])):
            task = by_id.get(item.get("word_id"))
            if task is None:
                continue
            reason = validate_item(item)
            if reason is None:
                text = " ".join([item["explanation"], item["question"], *map(str, item["choices"]), item["answer_explanation"]])
                reason = copy_check(text, task.article_text + " " + task.article_title)
            if reason:
                rejected.append(f"{task.term}: {reason}")
                continue
            rows += to_rows(task, item)
    return rows, rejected
