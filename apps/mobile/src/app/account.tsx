import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { Body, Button, Card, Screen, Title, colors } from '../components/ui';
import { linkAccount, signInExisting, signOut, type LinkOutcome, type Provider } from '../lib/accountLink';
import { useAuth } from '../lib/auth';

const NAME: Record<Provider, string> = { apple: 'Apple', google: 'Google' };

/**
 * 계정 연결 (설계 결정: 익명 시작 + 선택적 Apple/Google 로그인).
 * 익명 상태에서 연결하면 지금까지의 학습 기록이 그 계정으로 이어지고, 다른 기기에서도 로그인해 계속할 수 있다.
 */
export default function AccountScreen() {
  const { session } = useAuth();
  const user = session?.user;
  const anonymous = user?.is_anonymous ?? true;
  const identities = (user?.identities ?? []).filter((i) => i.provider !== 'anonymous');
  const [busy, setBusy] = useState<Provider | 'signout' | null>(null);
  const [outcome, setOutcome] = useState<(LinkOutcome & { provider?: Provider }) | null>(null);

  // iOS 에서는 Apple 을 먼저 (App Store 가이드라인 4.8: 다른 소셜 로그인을 주면 Apple 로그인도 동등하게 제공)
  const providers: Provider[] = Platform.OS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];

  const run = async (provider: Provider, fn: typeof linkAccount) => {
    setBusy(provider);
    setOutcome(null);
    const result = await fn(provider);
    setBusy(null);
    if (result.status !== 'redirecting') setOutcome({ ...result, provider });
  };

  const doSignOut = async () => {
    setBusy('signout');
    await signOut();
    setBusy(null);
    router.dismissTo('/');
  };

  return (
    <Screen>
      <Title>계정</Title>

      {anonymous ? (
        <Card>
          <Body style={{ fontWeight: '600' }}>지금은 이 기기에만 저장된 익명 학습자예요</Body>
          <Body muted>
            Apple 또는 Google 계정을 연결하면 지금까지의 학습 기록이 그대로 이어지고, 휴대폰을 바꾸거나 앱을 다시 설치해도
            같은 계정으로 로그인해 계속할 수 있어요.
          </Body>
        </Card>
      ) : (
        <Card>
          <Body style={{ fontWeight: '600' }}>계정이 연결되어 있어요</Body>
          {identities.map((i) => (
            <Body key={i.identity_id} muted>
              {NAME[i.provider as Provider] ?? i.provider}{i.identity_data?.email ? ` · ${String(i.identity_data.email)}` : ''}
            </Body>
          ))}
          {!identities.length && user?.email && <Body muted>{user.email}</Body>}
        </Card>
      )}

      {outcome?.status === 'linked' && (
        <Card style={{ borderColor: colors.ok }}>
          <Body style={{ color: colors.ok, fontWeight: '600' }}>{NAME[outcome.provider!]} 계정을 연결했어요. 학습 기록이 이어집니다.</Body>
        </Card>
      )}
      {outcome?.status === 'signed_in' && (
        <Card style={{ borderColor: colors.ok }}>
          <Body style={{ color: colors.ok, fontWeight: '600' }}>{NAME[outcome.provider!]} 계정으로 로그인했어요.</Body>
        </Card>
      )}
      {outcome?.status === 'error' && (
        <Card style={{ borderColor: colors.bad }}>
          <Body style={{ color: colors.bad }}>연결하지 못했어요: {outcome.message}</Body>
        </Card>
      )}
      {outcome?.status === 'already_linked' && outcome.provider && (
        <Card style={{ borderColor: colors.warn, gap: 10 }}>
          <Body style={{ color: colors.warn, fontWeight: '600' }}>
            이 {NAME[outcome.provider]} 계정은 이미 다른 학습 기록에 연결되어 있어요
          </Body>
          <Body muted>
            그 계정으로 로그인하면 계정에 저장된 기록으로 이어서 학습해요. 대신 이 기기에서 익명으로 쌓은 기록은 함께 옮겨지지 않아요.
          </Body>
          <Button
            label={`${NAME[outcome.provider]} 계정으로 로그인`}
            kind="secondary"
            disabled={busy !== null}
            onPress={() => run(outcome.provider!, signInExisting)}
          />
        </Card>
      )}

      {anonymous && (
        <View style={{ gap: 10 }}>
          {providers.map((p) => (
            <Button
              key={p}
              label={busy === p ? '연결 중…' : `${NAME[p]}로 계속하기`}
              kind={p === providers[0] ? 'primary' : 'secondary'}
              disabled={busy !== null}
              onPress={() => run(p, linkAccount)}
            />
          ))}
        </View>
      )}

      {!anonymous && (
        <View style={{ gap: 6 }}>
          <Button label={busy === 'signout' ? '로그아웃 중…' : '로그아웃'} kind="secondary" disabled={busy !== null} onPress={doSignOut} />
          <Body muted style={{ fontSize: 13 }}>
            로그아웃해도 계정의 학습 기록은 남아 있고, 다시 로그인하면 이어서 할 수 있어요. 로그아웃하면 이 기기는 새 익명 학습자로 시작해요.
          </Body>
        </View>
      )}
    </Screen>
  );
}
