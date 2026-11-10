/**
 * 빌드 대상. `EXPO_PUBLIC_TARGET=toss` 로 웹 export 하면 토스 미니앱(앱인토스) 빌드가 된다 (`npm run build:toss`).
 * Metro 가 값을 인라인하므로 네이티브·Play 빌드에서는 토스 분기가 상수 false 로 접힌다.
 */
export const isToss = process.env.EXPO_PUBLIC_TARGET === 'toss';
