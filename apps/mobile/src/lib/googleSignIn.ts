/** 네이티브 Google 로그인 모듈을 처음 쓸 때 불러온다. 웹 버전(googleSignIn.web.ts)은 모듈을 참조하지 않는다. */
export const loadGoogleSignIn = () => import('react-native-nitro-google-signin');
