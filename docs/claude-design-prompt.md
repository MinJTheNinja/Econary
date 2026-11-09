# Claude Design prompt — TESAT 시사 어휘 앱 UI

Copy everything below the line into Claude Design. Screen list, states and copy match the app as built
(`apps/mobile/src/app`), so the result can be ported screen by screen without changing app logic.

---

Design the full mobile UI for **TESAT 시사 어휘**, an iOS + Android app that helps Korean learners build vocabulary for TESAT (테셋, 한국경제신문's economics literacy exam). Every day the learner studies a few fixed economics/current-affairs terms, sees why each term is in today's news, takes a short quiz, and reviews older words on a spaced-repetition schedule.

## Who uses it
University students and job seekers in Korea studying for TESAT, 5–15 minutes a day, mostly on the subway or between classes, one-handed on a phone. They want to feel steady daily progress, not pressure.

## Mood and visual direction
- Calm, focused, trustworthy — closer to a well-made Apple first-party study app than a gamified language app. No mascots, confetti, or cartoon rewards.
- Apple Human Interface feel: system font (SF Pro / Apple SD Gothic Neo; Pretendard as the Android/web fallback), generous spacing, clear hierarchy, large tappable cards, a single accent color.
- Korean text is the primary content: comfortable line height for Hangul (≈1.5–1.6 for body), no letter-spacing on Korean body text, slightly tightened tracking only on large titles.
- Light and dark mode, both first-class.
- Motion (describe it, it will be built with spring animations): respond on press-down, critically damped springs, interruptible transitions, cards that scale slightly when pressed, answer feedback that settles rather than bounces. Pair correct/wrong answers with light haptics (note where). Respect Reduce Motion.

## Hard constraints (the design will be rebuilt in React Native / Expo)
- Mobile only, portrait, design at 390 × 844 (iPhone 15) and check 360-wide Android.
- Use only layouts that map to flexbox: rows, columns, stacks, cards, lists. No CSS grid tricks, no hover-only states, no web-only effects.
- Translucent "material" surfaces are fine for the tab bar and sheets (they become blur views).
- Minimum touch target 44 × 44. Text must meet WCAG AA contrast in both themes. Every icon-only control needs a visible or accessible label.
- Deliver **design tokens** (colors for light/dark, type scale, spacing, radii, shadows/elevation) and a small **component set** (card, primary/secondary button, list row with status, choice option, stat row, badge, text field, empty state, error state, toast/banner) that every screen is built from.
- Keep all user-facing copy in Korean exactly as given below (you may improve wording but keep the meaning and keep it short).

## Navigation
Bottom tab bar with 3 tabs: **오늘** · **복습** · **진도**. Other screens push on top (학습, 퀴즈, 계정) or open as sheets/modals (학습 수준, 오류 신고).

## Screens and states (design every state listed)

### 1. 오늘 (Today) — tab
Shows today's assigned new words.
- Header: date (e.g. 2026-11-10), title **오늘의 단어 2/10**, a tappable line **수준: 기본 · 하루 10개 (변경)** → opens 학습 수준.
- If reviews are due: a highlighted card **오늘 복습할 단어 3개 → 복습 탭**.
- Primary call-to-action card: **오늘 학습 시작 → 가격 차별** (or **이어서 학습 → 가격고정** once started).
- List of today's words, each row = term + status: **시작 전** (neutral) / **퀴즈 남음** (amber, meaning viewed but quiz not done) / **완료** (green).
- States: loading; all done (**오늘 신규 학습을 모두 마쳤어요. 복습 탭에서 예정된 단어를 확인하세요.**); nothing left to assign (**오늘 배정할 새 단어가 없습니다. 모든 단어를 학습했어요!**); load error with **다시 시도**.

### 2. 단어 학습 (Study) — pushed
- Large term (e.g. **반대매매**), English name below in secondary text (e.g. *Liquidation*).
- Card **뜻**: fixed meaning, e.g. "증거금이 부족하거나 대금을 못 갚을 때 증권사가 고객 주식을 강제로 처분하는 것." Small text link **뜻 오류 신고** at the card's bottom-right.
- Optional card **요즘 뉴스에서 · 증시 급락 시 반대매매 억제 조치**: a 2–3 sentence current-affairs explanation (up to ~250 characters), footnote **YTN 보도 참고 · 자체 요약**, small link **설명 오류 신고**. Many words have no explanation — design the screen to look complete without it.
- Primary button at the bottom: **퀴즈 풀기**.
- Never show article text or article links to learners.

### 3. 퀴즈 (Quiz) — pushed
Two quiz kinds share one layout:
- **시사 퀴즈** (current-affairs question), e.g. "정부가 반대매매를 일시적으로 면제한 주된 목적은 무엇인가?" with 4 choices.
- **뜻 고르기** (meaning choice), e.g. "'가격 차별'의 뜻으로 알맞은 것은?" with 4 meanings (choices can be 1–2 lines long).
- In the review flow the small label reads **복습 · 뜻 고르기**.

States to design:
1. Answering — nothing selected, **제출** disabled.
2. One choice selected — **제출** enabled.
3. Submitting — **채점 중…**, choices locked.
4. **Unconfirmed** (network failed during submit) — amber banner **제출 결과가 확정되지 않았어요** / "네트워크 연결을 확인한 뒤 다시 제출해 주세요. 같은 답으로 다시 보내도 한 번만 기록됩니다." and button **다시 제출**.
5. Correct — selected choice turns green, result card **정답이에요** (+ optional explanation text), button **다음 단어** (or **다음 복습** in review). Light success haptic.
6. Wrong — selected choice red, correct choice green, result card **아쉬워요, 오답이에요** / **정답: …** (+ optional explanation), same button. Light warning haptic.
- Result card has a small link **퀴즈 오류 신고**.

### 4. 복습 (Review) — tab
- Title **오늘의 복습 1/3**, helper text **정답이면 다음 복습까지 간격이 늘고, 틀리면 내일 다시 나와요.**
- Primary button **복습 시작 → 가격 차별** (or **이어서 복습 → …**).
- Section **남은 복습 2**: rows with status **복습 전**.
- Section **완료 1**: rows with status **완료 · 다음 11/12** (green).
- All done: **오늘 복습을 모두 마쳤어요.**
- Empty state: **오늘 복습할 단어가 없어요.** / "퀴즈를 푼 단어는 기억이 흐려질 때쯤 여기에 다시 나타납니다." + button **오늘의 신규 학습으로**.

### 5. 진도 (Progress) — tab
- Account card at the top (see 계정): anonymous → accent-bordered **학습 기록을 Apple/Google 계정에 연결하기 →** with "지금은 이 기기에만 저장돼요. 연결하면 기기를 바꿔도 이어서 할 수 있어요."; linked → quiet **계정 연결됨 · name@example.com →**.
- Streak card: big number + **일 연속 학습**, helper "그날 배정된 새 단어를 모두 마친 날이 이어진 수예요." (0 should look neutral, not like a failure).
- **오늘**: 신규 학습 2 / 10 · 복습 1 / 1 · 남은 학습 8 (amber when > 0).
- **누적**: 학습한 단어 152개 (4.8%) · 아직 안 배운 단어 3,024개 · 퀴즈 정답률 78% (212회). The word list has ~3,200 words, so progress grows slowly — make small percentages still feel encouraging (e.g. a slim progress bar).
- **오답 단어 5**: helper "가장 최근 시도에서 틀린 단어예요. 복습 일정에 따라 다시 나옵니다." + tappable term chips/rows; empty: **최근에 틀린 단어가 없어요.**
- No-history state: **아직 학습 기록이 없어요.** / "오늘의 단어를 학습하고 퀴즈를 풀면 여기에 진도가 쌓입니다." + **오늘의 학습 시작하기 →**.

### 6. 학습 수준 (Level) — sheet
Helper "하루에 새로 배울 단어 수를 정합니다. 오늘 이미 배정된 단어는 그대로이고, 내일부터 적용돼요." Three selectable options: **입문** 하루 새 단어 5개 · **기본** 10개 · **심화** 20개 (current one checked). Save error line.

### 7. 오류 신고 (Report) — sheet
- Context line **'가격고정' · 단어 뜻** (target is one of 단어 뜻 / 시사 설명 / 시사 퀴즈 / 뜻 고르기 퀴즈).
- Title **무엇이 잘못됐나요?**, single-choice reasons: 뜻·설명이 틀렸어요 / 정답이 틀렸어요 (quizzes only) / 오래된 정보예요 / 오타가 있어요 / 기타.
- Multiline field "자세한 내용 (선택, 500자 이내)", button **신고하기** (disabled until a reason is picked; **보내는 중…** while sending).
- Sent state: **신고가 접수되었어요** / "알려 주셔서 고마워요. 확인 후 콘텐츠를 고치거나 내릴게요." + **닫기**. Error line on failure.

### 8. 계정 (Account) — pushed
- Anonymous: card **지금은 이 기기에만 저장된 익명 학습자예요** + explanation of what linking does; buttons **Apple로 계속하기** and **Google로 계속하기** (follow Apple's and Google's official sign-in button guidelines; on iOS Apple comes first and must be at least as prominent).
- Linked: card **계정이 연결되어 있어요** with provider + email; **로그아웃** button and note "로그아웃해도 계정의 학습 기록은 남아 있고, 다시 로그인하면 이어서 할 수 있어요. 로그아웃하면 이 기기는 새 익명 학습자로 시작해요."
- Result banners: success **Google 계정을 연결했어요. 학습 기록이 이어집니다.**; error **연결하지 못했어요: …**; already-linked warning **이 Google 계정은 이미 다른 학습 기록에 연결되어 있어요** + "그 계정으로 로그인하면 계정에 저장된 기록으로 이어서 학습해요. 대신 이 기기에서 익명으로 쌓은 기록은 함께 옮겨지지 않아요." + secondary button **Google 계정으로 로그인**.
- Busy states: **연결 중…**, **로그아웃 중…**.

### 9. App-level states
- Launch/loading (the app signs in anonymously before showing anything).
- Full-screen error with **다시 시도** (e.g. "로그인하지 못했습니다.").
- App icon and splash concept (simple, typographic or abstract — e.g. a stylized 경/₩/chart mark), plus the Android adaptive icon foreground.

## Deliverables
1. Design tokens (light + dark) and the component set.
2. Every screen and state above, light mode; plus dark mode for 오늘, 학습, 퀴즈 (correct + wrong), 진도.
3. A short motion/haptics spec per interaction (press, select choice, submit, result reveal, sheet open/close, tab switch).
4. Annotate spacing, type styles and colors with token names so they can be implemented 1:1.
