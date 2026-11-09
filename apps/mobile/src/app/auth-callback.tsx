import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Body, Button, Loading, Screen, Title, colors } from '../components/ui';
import { completeAuthRedirect, type LinkOutcome } from '../lib/accountLink';

/**
 * Apple/Google 로그인 후 돌아오는 주소 (redirectUrl()). 웹은 페이지 전체가 여기로 돌아오고,
 * 네이티브는 보통 openAuthSessionAsync 가 처리하지만 딥링크로 열려도 같은 방식으로 마무리한다.
 */
export default function AuthCallback() {
  const url = Linking.useLinkingURL();
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    completeAuthRedirect(url).then((o) => {
      if (cancelled) return;
      if (o.status === 'linked') router.replace('/account');
      else setOutcome(o);
    });
    return () => { cancelled = true; };
  }, [url]);

  if (!outcome) return <Loading />;

  const message =
    outcome.status === 'already_linked'
      ? '이 계정은 이미 다른 학습 기록에 연결되어 있어요. 계정 화면에서 그 계정으로 로그인할 수 있어요.'
      : outcome.status === 'error'
        ? `연결하지 못했어요: ${outcome.message}`
        : '로그인을 마치지 못했어요.';

  return (
    <Screen>
      <Title>계정 연결</Title>
      <Body style={{ color: outcome.status === 'already_linked' ? colors.warn : colors.bad }}>{message}</Body>
      <Button label="계정 화면으로" onPress={() => router.replace('/account')} />
    </Screen>
  );
}
