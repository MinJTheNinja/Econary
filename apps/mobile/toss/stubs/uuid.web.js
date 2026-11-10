// 토스 미니앱 빌드 전용: expo-modules-core/src/uuid/index.web.ts 와 같되, 브라우저에선 실행되지 않는
// Node 전용 분기(eval('require')('node:crypto'))를 뺐다 — 앱인토스는 번들에 eval 이 있으면 안 된다.
// 아래 상대 경로는 metro.config.js 가 원래 uuid 폴더 기준으로 해석한다.
import sha1 from './lib/sha1';
import v35 from './lib/v35';
import { Uuidv5Namespace } from './uuid.types';

const uuid = {
  v4: () => crypto.randomUUID(),
  v5: v35('v5', 0x50, sha1),
  namespace: Uuidv5Namespace,
};
export default uuid;
