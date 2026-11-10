// app.json 이 기본 설정. 토스 미니앱 빌드(EXPO_PUBLIC_TARGET=toss)만 화면 청크 분할(asyncRoutes)을 끈다 —
// 웹 청크 로더가 eval 을 쓰는데 앱인토스는 eval 을 금지한다. 네이티브·Play 빌드는 app.json 그대로.
module.exports = ({ config }) => {
  if (process.env.EXPO_PUBLIC_TARGET !== 'toss') return config;
  return {
    ...config,
    plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : p)),
  };
};
