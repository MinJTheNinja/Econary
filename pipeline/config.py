"""전역 설정값. 민감정보(API 키)는 pipeline/.env 에서만 읽는다.
슈카월드 프로젝트(C:\\Users\\minjo\\Downloads\\슈카월드)의 config.py 를 기반으로, 출처를 YTN + 한경으로 바꿨다."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(BASE_DIR / ".env")

# ---- Supabase (service_role: 서버/로컬 스크립트 전용) ----
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ---- LLM: Groq 무료 티어 ----
# 슈카월드와 같은 키를 쓰므로 일일 토큰 한도(모델별)도 공유한다. 겹치면 .env 에서 모델을 바꿔 분산.
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_MODEL_ARTICLES = os.environ.get("GROQ_MODEL_ARTICLES", "openai/gpt-oss-120b")   # 용어 추출·채점
GROQ_MODEL_CONTENT = os.environ.get("GROQ_MODEL_CONTENT", GROQ_MODEL_ARTICLES)       # 설명·퀴즈 생성
GROQ_MODEL_VIDEO = GROQ_MODEL_ARTICLES  # keyword_extractor 호환용 (영상 처리는 사용하지 않음)

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) econary-bot/0.1"

# ---- 한국경제신문 RSS ----
HANKYUNG_RSS_FEEDS = {
    "경제": "https://www.hankyung.com/feed/economy",
    "금융": "https://www.hankyung.com/feed/finance",
    "부동산": "https://www.hankyung.com/feed/realestate",
}
HANKYUNG_USER_AGENT = USER_AGENT

# ---- YTN (공식 RSS가 없어 경제 섹션 목록 페이지를 읽는다. robots.txt 상 /news, /_ln 허용) ----
YTN_LIST_URLS = {
    "경제": "https://www.ytn.co.kr/news/list.php?mcd=0102",
}

# 출처별 1회 실행당 처리할 기사 상한 (Groq 분당 한도 때문에 많으면 429 대기 누적; 초과분은 다음 실행으로)
MAX_ARTICLES_PER_SOURCE = int(os.environ.get("MAX_ARTICLES_PER_SOURCE", "15"))
HANKYUNG_MAX_ARTICLES_PER_RUN = MAX_ARTICLES_PER_SOURCE
ARTICLE_BODY_CHAR_LIMIT = 3500       # 기사 1건당 추출 프롬프트에 넣을 본문 최대 길이
HANKYUNG_BODY_CHAR_LIMIT = ARTICLE_BODY_CHAR_LIMIT

# ---- 채점 등급 (슈카월드와 동일) ----
GRADE_THRESHOLDS = [("MUST_STUDY", 85), ("HIGH", 75), ("MEDIUM", 60), ("WATCH", 45)]
MIN_SCORE_TO_COLLECT = 45

# ---- 콘텐츠 생성 ----
MAX_WORDS_TO_GENERATE_PER_RUN = int(os.environ.get("MAX_WORDS_TO_GENERATE_PER_RUN", "20"))
WORDS_PER_GENERATION_CALL = 5
CONTENT_COOLDOWN_DAYS = 14           # 최근 이 기간 안에 콘텐츠를 만든 단어는 다시 만들지 않음
EXPLANATION_MAX_CHARS = 300
CONTEXT_EXCERPT_CHARS = 700          # 생성 프롬프트에 넣을 기사 발췌 길이 (요약 재료, 복사 금지)
COPY_CHECK_MIN_RUN = 25              # 기사와 이 길이 이상 연속으로 같은 문자열이 있으면 복사로 간주
COPY_CHECK_MAX_OVERLAP = 0.35        # 8글자 조각 중복 비율 상한

# ---- 파일 경로 ----
DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"
HISTORY_FILE = DATA_DIR / "keyword_history.json"
RESULTS_DIR = DATA_DIR / "results"
HANKYUNG_STATE_FILE = DATA_DIR / "state_hankyung.json"
YTN_STATE_FILE = DATA_DIR / "state_ytn.json"

for d in (DATA_DIR, LOG_DIR, RESULTS_DIR):
    d.mkdir(parents=True, exist_ok=True)
