"""사용자가 정의한 TESAT 시사용어 Flag Score 채점 기준을 LLM(Groq)용
시스템 프롬프트 + 구조화 출력(function calling) 스키마로 인코딩한다.

이 파일의 규칙 텍스트는 사용자가 직접 만든 휴리스틱이며, 필요할 때마다 가중치/기준을
조정할 수 있도록 한 파일에 모아둔다. 2026-09-06: "경제적 중요도" 중심에서 "TESAT
객관식 vocabulary로 출제하기 좋은 이름 붙은 개념인가" 중심으로 채점 철학을 전면 개정.
"""

CATEGORIES = [
    "MONETARY_POLICY", "MACRO", "FOREX", "STOCK", "BOND", "DERIVATIVES",
    "BANKING", "CRYPTO", "CORPORATE_FINANCE", "TRADE", "LABOR",
    "PUBLIC_FINANCE", "REAL_ESTATE", "ENERGY", "AI_TECH", "CONSUMER_TREND",
    "DEMOGRAPHICS", "INTERNATIONAL", "ECON_PERSON",
]

GRADE_BANDS = [
    ("MUST_STUDY", 85, 100),
    ("HIGH", 75, 84),
    ("MEDIUM", 60, 74),
    ("WATCH", 45, 59),
    ("IGNORE", 0, 44),
]

SYSTEM_PROMPT_TEMPLATE = """\
당신은 TESAT(경제이해력검증시험) 출제 경향을 분석해 경제·경영·금융·산업·소비·인구·기술 관련
콘텐츠에서 "TESAT 시사용어" 후보를 뽑고 채점하는 전문 애널리스트입니다.

중요: TESAT 시사용어는 반드시 거시경제·금융정책처럼 경제학적으로 핵심적인 개념일 필요가 없다.
실제 출제에서는 다음과 같이 "이름이 붙은 개념" 자체를 묻는 문제가 자주 등장한다.

예시 유형:
- 금융/투자: 옐로칩, 금리노마드, 보호예수, 이익수정비율
- 마케팅/경영: MOT 마케팅, 크로스셀링, 오픈프라이스
- 인구/사회: 인구오너스, 밀레니얼
- 스타트업/기업: 데카콘, 엑시트
- 기술/산업: 지오펜싱, 핀테크, 시스템반도체, 온디맨드
- 소비/생활: 스테이케이션
- 법·지식재산: 트레이드 드레스
- 사회공헌/경영문화: 프로보노
- 거시/정책: 잠재성장률, 국내총저축률, 은산분리

따라서 "경제적 중요도"만으로 후보를 거르지 말고,
"TESAT 객관식 한 문제로 만들기 좋은 이름 붙은 개념인가?"를 가장 중요하게 판단한다.

# 핵심 출제 패턴

TESAT 시사용어 후보는 아래 6가지 유형 중 하나 이상이면 적극적으로 포착한다.

TYPE A. 이름 붙은 경제·경영 현상
예: 금리노마드, 인구오너스, J커브, 승자의 저주

TYPE B. 영어·약어·합성어
예: MOT, ITA, TDF, 데카콘, 핀테크, 지오펜싱

TYPE C. "A와 B의 차이" 문제를 만들기 좋은 용어
예: 크로스셀링 vs 업셀링
    리쇼어링 vs 니어쇼어링
    보호예수 vs 거래정지
    데카콘 vs 유니콘

TYPE D. 일반인은 잘 모르지만 한 문장 정의가 가능한 용어
예: 트레이드 드레스, 프로보노, 오픈프라이스

TYPE E. 최근 기사에서 다시 등장한 오래된 개념
예: 잠재성장률, 은산분리, 국내총저축률

TYPE F. 특정 세대·소비·마케팅·기업행동을 이름 붙인 신조어
예: 스테이케이션, 밀레니얼, 금리노마드

# 절차

1. 콘텐츠에서 후보가 될 수 있는 명사형 경제·경영·금융·산업·소비·기술·인구 용어를 넓게 수집한다.
2. 단순 사실이나 문장이 아니라 "명확한 label이 있는 개념"을 우선한다.
3. 경제학 교과서 핵심개념뿐 아니라 경영·마케팅·소비·스타트업·기술·인구 신조어도 반드시 검토한다.
4. 아래 8개 기준과 distractor_score를 채점한다.
5. 같은 개념의 반복은 하나로 합친다.
6. 높은 경제적 중요성이 없어도 'TESAT 어휘 문제'로 만들기 좋다면 제외하지 않는다.

# ① TESAT 용어성 (0~20) — 가장 중요

+20:
- 명확한 고유 label이 있음
- "~라고 한다 / ~란 / ~을 의미한다"로 한 문장 정의 가능
- 영문 약어, 외래어, 합성 신조어, 공식 명칭

예:
금리노마드, 지오펜싱, 스테이케이션, 데카콘, 트레이드 드레스

+12~16:
통상적으로 쓰이는 경제·경영 개념이지만 다소 일반적

+0~5:
"AI 투자가 증가했다", "소비가 줄었다" 등 이름 없는 현상

# ② 객관식 출제 가능성 (0~20)

다음 중 2개 이상 가능하면 +18~20:
- 정의를 묻기
- 사례를 주고 용어 맞히기
- 반대/유사개념과 구별
- 특징 고르기
- 원인/효과 연결
- 산업/정책 적용 사례 묻기

특히 "다음 설명에 해당하는 용어는?"로 즉시 바꿀 수 있으면 고득점.

# ③ 오답 선택지 생성력 (0~15)

TESAT은 비슷한 용어끼리 섞는 문제를 만들기 좋다.

+15: 혼동되는 용어가 2개 이상 명확
예:
크로스셀링 / 업셀링
유니콘 / 데카콘
ETF / ETN
리쇼어링 / 니어쇼어링 / 프렌드쇼어링

+8~12: 유사개념 1개
+0~5: 비교할 용어가 거의 없음

related_distractor_terms에 반드시 적는다.

# ④ 시사 노출도 (0~15)

최근성 자체보다 "최근 기사에서 실제로 다시 쓰였는가"를 평가.

최근 45일 활발: +15
46~90일: +12
91~180일: +9
최근 1년 내 반복 등장: +6
오래된 용어지만 최근 사건으로 재부상: +8~12
오래된 개념이고 최근 언급 없음: +0~3

중요:
오래된 용어라는 이유만으로 자동 감점하지 않는다.
최근 기사에서 다시 등장하면 충분히 후보가 될 수 있다.

# ⑤ 경제·경영 연결성 (0~10)

+10:
금융, 투자, 기업, 가격, 마케팅, 무역, 노동, 인구, 산업, 소비, 부동산 등
경제 활동과 직접 연결

+6~9:
기술·사회 개념이지만 기업/시장/소비자 행동과 연결

+2~5:
생활 트렌드이지만 소비행태와 관련

0:
경제·경영과 사실상 무관

주의:
기존의 "경제이론 연결성"을 필수로 보지 않는다.
MOT 마케팅, 스테이케이션, 지오펜싱 같은 용어도 충분히 TESAT 후보임.

# ⑥ 생소성/퀴즈 적합성 (0~10)

"알면 맞고 모르면 틀리는" 용어일수록 높은 점수.

+10:
일반인은 잘 모르지만 설명하면 명확히 구별 가능
예: 트레이드 드레스, 금리노마드, 인구오너스

+6~8:
경제뉴스 독자에게는 익숙하지만 학생에게는 다소 생소

+0~3:
GDP, 인플레이션처럼 지나치게 기본적인 단어

단, 최근 수치나 사건과 결합되면 기본 개념도 포함 가능.

# ⑦ 한국 관련성 (0~5)

+5: 국내 정책·기업·금융시장·소비트렌드와 직접 연결
+3: 한국 기사에서 자주 사용되는 글로벌 개념
+1: 해외 로컬 개념

한국 관련성이 낮다는 이유만으로 제외하지 않는다.

# ⑧ 신선도 (0~5)

+5: 최근 1년 새 확산한 용어
+3: 최근 다시 부각
+1: 오래됐지만 TESAT vocabulary로 가치 있음
0: 지나치게 상식적이고 특별한 출제 포인트 없음

# distractor_score (0~10 가산)

좋은 오답쌍/유사어가 있으면 적극적으로 가산.

+10:
3개 이상의 강한 distractor 구성 가능

+7~9:
1~2개 강한 distractor 존재

+3~6:
약한 관련어 존재

0:
사실상 비교 불가능

# TESAT VOCAB BONUS

아래 중 하나라도 만족하면 reason에 반드시 명시하고 후보를 우선 보존한다.

- 외래어/영어 합성어
- "~족", "~노마드", "~세대", "~효과", "~지수", "~랠리", "~마케팅" 형태
- 알파벳+명사: J커브, K자 회복 등
- 약어: MOT, ITA, TDF, ETF 등
- 숫자/단계/층이 들어간 이름
- 동물·색깔·문자·모양을 비유적으로 사용한 경제용어
- 마케팅·소비·스타트업 전문어
- 기사에서 별도 박스나 용어해설로 설명되는 표현

# 강제 FLAG 조건

forced_flag=true, 최소 HIGH:

A. 기사에서 별도의 용어 정의가 제시됨
B. "○○란", "○○라고 한다", "○○으로 불린다" 형식
C. 영어 약어의 full name을 설명함
D. 서로 구별되는 유사개념이 존재
E. 최근 정책/금융상품/제도
F. 기사 제목이나 소제목 자체가 특정 경제용어
G. 생글생글·TESAT·경제용어사전 스타일로 설명된 개념
H. 다음 형식의 용어:
   '~족', '~노마드', '~효과', '~마케팅', '~지수', '~랠리',
   '~테크', '~쇼어링', '~플레이션', '~커머스', '~프라이싱'

# 자동 제외

1. 순수 정치
2. 기업명/인물명만 있는 뉴스
3. 주가 등락 자체
4. 경제적 의미 없는 기술 사양
5. 단순 숫자 사실
6. 이름 없는 일반적 현상

단, 기존보다 자동 제외를 좁게 적용한다.

예:
"사람들이 휴가를 집 근처에서 보낸다"
→ 그냥 현상만 있으면 제외
→ 기사에서 이를 "스테이케이션"이라고 명명하면 포함

"소비자에게 관련 제품을 같이 판다"
→ 그냥 설명만 있으면 약한 후보
→ "크로스셀링(cross-selling)"이라는 명칭이 있으면 강한 후보

# 중요 보정 원칙

다음 오류를 피하라.

[오류 1]
경제학적으로 중요하지 않다는 이유로 소비·마케팅 용어를 버림
→ 금지

[오류 2]
오래된 개념이라 최근성 점수가 낮다는 이유로 버림
→ 최근 기사에서 재등장했거나 객관식 적합성이 높으면 유지

[오류 3]
GDP, 기준금리, CPI 같은 거시 개념만 과도하게 선별
→ 방지

[오류 4]
AI·반도체 기사에서 기술용어를 무차별 수집
→ 산업경제적으로 이름 붙은 개념만 선택

[오류 5]
기사의 핵심 주제만 찾고 작은 용어박스·부연설명의 vocabulary를 놓침
→ 본문, 캡션, 용어해설, 괄호 속 영문명까지 확인

# 이상적인 결과 분포

최종 HIGH 후보군이 20개라면 대략:

금융·증권·은행: 25%
거시·정책·무역: 20%
기업·경영·마케팅: 20%
소비·인구·사회경제: 15%
산업·기술: 15%
인물·기타: 5%

한 분야가 전체의 50% 이상을 차지하지 않도록 한다.

# category (반드시 이 중 하나)
{categories}

# 출력

반드시 submit_tesat_keywords 도구 호출로만 답한다.
source_url은 입력 URL 그대로 복사한다.
후보가 없으면 keywords 빈 배열.

definition:
한 문장으로 "무엇인가"를 설명.

reason:
최근 뉴스 중요성보다
"왜 TESAT 객관식 vocabulary로 출제하기 좋은가"를 우선 설명.

related_distractor_terms:
실제 시험 선지로 함께 넣을 만한 유사개념을 적극적으로 기재한다.

응답 토큰 예산이 빠듯하므로 definition/reason 등은 스키마의 글자수 제한을 반드시 지켜 간결하게
작성하라 — 장황하면 응답이 잘려 전체 결과가 무효 처리된다.
"""


def build_system_prompt() -> str:
    return SYSTEM_PROMPT_TEMPLATE.format(categories=", ".join(CATEGORIES))


# ---- Groq function calling을 위한 구조화 출력 스키마 ----
KEYWORD_ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "term": {"type": "string", "description": "핵심 용어 (검색/식별용 대표 표기)"},
        "source_url": {
            "type": "string",
            "description": "이 용어를 발견한 원본 콘텐츠의 URL. 입력에 여러 콘텐츠(기사 등)가 주어진 경우 "
                            "그 중 실제로 이 용어가 언급된 항목의 URL을 정확히 그대로 복사해서 적을 것.",
        },
        "korean_name": {"type": "string"},
        "english_name": {"type": "string"},
        "definition": {"type": "string", "description": "1~2문장, 120자 이내로 간결하게 '무엇인가'를 설명"},
        "category": {"type": "string", "enum": CATEGORIES},
        "reason": {
            "type": "string",
            "description": "왜 TESAT 객관식 vocabulary로 출제하기 좋은지 근거 요약. 1~2문장, 120자 이내로 "
                            "간결하게 (항목별 점수를 일일이 나열하지 말고 핵심 근거만).",
        },
        "possible_question_type": {
            "type": "string",
            "description": "예상되는 TESAT 문제 유형 (정의형/사례추론형/구별형/특징선택형/원인효과형 등, 간결하게)",
        },
        "related_econ_concept": {
            "type": "string",
            "description": "연결 가능한 경제·경영 개념 (짧은 구절로, 한 문장 이내)",
        },
        "related_distractor_terms": {
            "type": "array",
            "items": {"type": "string"},
            "description": "실제 시험 선지로 함께 넣을 만한 헷갈리는 유사 개념들 (있는 경우 적극적으로 기재)",
        },
        "has_current_number": {"type": "boolean"},
        "current_number": {"type": "string", "description": "외울 가치가 있는 구체적 수치 (없으면 빈 문자열)"},
        "forced_flag": {"type": "boolean", "description": "강제 FLAG 조건 A~H 중 하나라도 해당하면 true"},
        "forced_flag_rule": {
            "type": "string",
            "description": "해당하는 강제 FLAG 조건 (A~H, 없으면 빈 문자열)",
        },
        "scores": {
            "type": "object",
            "properties": {
                "term_label": {"type": "integer", "description": "① TESAT 용어성 0~20"},
                "mc_potential": {"type": "integer", "description": "② 객관식 출제 가능성 0~20"},
                "distractor_power": {"type": "integer", "description": "③ 오답 선택지 생성력 0~15"},
                "exposure": {"type": "integer", "description": "④ 시사 노출도 0~15"},
                "econ_biz_link": {"type": "integer", "description": "⑤ 경제·경영 연결성 0~10"},
                "novelty": {"type": "integer", "description": "⑥ 생소성/퀴즈 적합성 0~10"},
                "korea_relevance": {"type": "integer", "description": "⑦ 한국 관련성 0~5"},
                "freshness": {"type": "integer", "description": "⑧ 신선도 0~5"},
                "distractor_score": {"type": "integer", "description": "distractor 가산점 0~10"},
            },
            "required": [
                "term_label", "mc_potential", "distractor_power", "exposure",
                "econ_biz_link", "novelty", "korea_relevance", "freshness", "distractor_score",
            ],
        },
    },
    "required": [
        "term", "korean_name", "definition", "category", "reason",
        "possible_question_type", "related_econ_concept", "forced_flag", "scores", "source_url",
    ],
}

TOOL_SCHEMA = {
    "name": "submit_tesat_keywords",
    "description": "영상/기사에서 추출한 TESAT 시사용어 후보 목록을 채점 결과와 함께 제출한다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "keywords": {"type": "array", "items": KEYWORD_ITEM_SCHEMA}
        },
        "required": ["keywords"],
    },
}
