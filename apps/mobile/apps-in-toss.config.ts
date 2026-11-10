import { defineConfig } from '@apps-in-toss/web-framework/config';

/**
 * 토스 미니앱(앱인토스) 설정. `npm run build:toss` 가 dist-toss 를 만든 뒤 `ait build` 로 <appName>.ait 를 만든다.
 * appName 은 앱인토스 콘솔에 등록한 이름과 같아야 하고 등록 후에는 바꿀 수 없다 (docs/store/apps-in-toss.md).
 */
export default defineConfig({
  appName: 'econary',
  // 토스 공통 내비게이션 바: 뒤로 가기는 여기서만 (앱 헤더는 토스 빌드에서 숨김). 미니앱은 라이트 모드만 지원
  navigationBar: { withBackButton: true, withHomeButton: true, theme: 'light' },
  webView: { pullToRefreshEnabled: false, bounces: false, overScrollMode: 'never' },
  permissions: [],
  webBundleDir: 'dist-toss',
});
