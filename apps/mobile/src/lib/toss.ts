/** 토스 미니앱 SDK 래퍼의 네이티브 버전: 아무 일도 하지 않는다. 웹 버전은 toss.web.ts. */
export type TossHaptic = 'tickWeak' | 'tap' | 'success' | 'error';

export const inTossApp = () => false;
export const tossHaptic = (_type: TossHaptic) => {};
export const tossOpenURL = async (_url: string) => false;
export const closeTossView = async () => {};
export const subscribeTossBack = (_onBack: () => void) => () => {};
