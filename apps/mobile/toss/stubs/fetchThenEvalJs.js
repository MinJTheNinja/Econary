// 토스 미니앱 빌드 전용: expo/src/async-require/fetchThenEvalJs.ts 대체. 원본은 개발 모드 청크 로딩에 eval 을 쓴다.
// 토스 빌드는 청크 분할 없이 한 번들(app.config.js 의 asyncRoutes: false)이라 이 경로는 쓰이지 않는다.
export function fetchThenEvalAsync(url) {
  return Promise.reject(new Error(`Split bundles are disabled in the Toss build: ${url}`));
}
