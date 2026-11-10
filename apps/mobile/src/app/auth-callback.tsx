import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { completeAuthRedirect, lastRedirectMode, lastRedirectProvider, signInExisting, type LinkOutcome } from '../lib/accountLink';
import { useTheme } from '../theme';
import { Banner, Button, InlineError, LargeTitle, PushScreen, Spinner } from '../ui/kit';

const NAME = { google: 'Google', apple: 'Apple' } as const;

/**
 * Apple/Google 로그인 후 돌아오는 주소 (redirectUrl()). 웹은 페이지 전체가 여기로 돌아오고,
 * 네이티브는 보통 openAuthSessionAsync 가 처리하지만 딥링크로 열려도 같은 방식으로 마무리한다.
 */
export default function AuthCallback() {
  const { c } = useTheme();
  const url = Linking.useLinkingURL();
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const provider = lastRedirectProvider();

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    completeAuthRedirect(url).then((o) => {
      if (cancelled) return;
      // 기존 계정 로그인이면 바로 오늘 탭, 계정 연결이면 계정 화면에서 결과를 보여 준다 (거기에 '홈으로' 버튼이 있다)
      if (o.status === 'linked') router.replace(lastRedirectMode() === 'signin' ? '/' : '/account');
      else setOutcome(o);
    });
    return () => { cancelled = true; };
  }, [url]);

  // 이미 다른 학습 기록에 연결된 계정 → 그 계정으로 로그인 (웹은 다시 리디렉트되어 이 화면으로 돌아와 마무리된다)
  const signIn = async () => {
    if (!provider) return;
    setSigningIn(true);
    setSignInError(null);
    const o = await signInExisting(provider);
    if (o.status === 'signed_in' || o.status === 'linked') router.replace('/');
    else if (o.status !== 'redirecting') {
      setSigningIn(false);
      setSignInError(o.status === 'error' ? o.message : '로그인을 마치지 못했어요.');
    }
  };

  if (!outcome) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Spinner color={c.text2} /></View>;
  }

  return (
    <PushScreen
      footer={
        <View style={{ gap: 8 }}>
          <Button label="홈으로" kind={outcome.status === 'already_linked' && provider ? 'tint' : undefined} onPress={() => router.replace('/')} />
          <Button label="계정 화면으로" kind="surface" onPress={() => router.replace('/account')} />
        </View>
      }
    >
      <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}><LargeTitle>계정 연결</LargeTitle></View>
      {outcome.status === 'already_linked' ? (
        <View style={{ gap: 12 }}>
          <Banner
            tone="warning"
            title="이 계정은 이미 다른 학습 기록에 연결되어 있어요"
            body="그 계정으로 로그인하면 계정에 저장된 기록으로 이어서 학습해요. 대신 이 기기에서 익명으로 쌓은 기록은 함께 옮겨지지 않아요."
          />
          {provider ? <Button label={`${NAME[provider]} 계정으로 로그인`} onPress={signIn} loading={signingIn} /> : null}
          {signInError ? <InlineError>{signInError}</InlineError> : null}
        </View>
      ) : (
        <Banner tone="danger" title={outcome.status === 'error' ? `연결하지 못했어요: ${outcome.message}` : '로그인을 마치지 못했어요.'} />
      )}
    </PushScreen>
  );
}
