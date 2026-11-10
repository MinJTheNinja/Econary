// 기본 Expo Metro 설정. 토스 미니앱 빌드(EXPO_PUBLIC_TARGET=toss, 웹)에서만 eval 을 쓰는 의존성 모듈 두 개를
// toss/stubs 의 대체 파일로 바꾼다 — 앱인토스는 eval 금지. 네이티브·Play 빌드는 기본 설정 그대로.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (process.env.EXPO_PUBLIC_TARGET === 'toss') {
  const stubs = path.join(__dirname, 'toss', 'stubs');
  const uuidDir = path.join(path.dirname(require.resolve('expo-modules-core/package.json')), 'build', 'uuid');
  const norm = (p) => p.split(path.sep).join('/');
  const upstream = config.resolver.resolveRequest;
  const resolve = (context, moduleName, platform) =>
    upstream ? upstream(context, moduleName, platform) : context.resolveRequest(context, moduleName, platform);

  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const origin = norm(context.originModulePath);
    if (platform === 'web') {
      if (moduleName === './fetchThenEvalJs' && /\/expo\/(build|src)\/async-require\//.test(origin)) {
        return { type: 'sourceFile', filePath: path.join(stubs, 'fetchThenEvalJs.js') };
      }
      const fromCore = /\/expo-modules-core\/(build|src)\//.test(origin);
      if (fromCore && (moduleName === './uuid' || moduleName === '../uuid/index.web')) {
        return { type: 'sourceFile', filePath: path.join(stubs, 'uuid.web.js') };
      }
      // 대체 uuid 의 상대 import 는 원래 uuid 폴더 기준으로 해석
      if (origin === norm(path.join(stubs, 'uuid.web.js'))) {
        return resolve({ ...context, originModulePath: path.join(uuidDir, 'index.web.js') }, moduleName, platform);
      }
    }
    return resolve(context, moduleName, platform);
  };
}

module.exports = config;
