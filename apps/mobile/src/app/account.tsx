import * as AppleAuthentication from 'expo-apple-authentication';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { deleteAccount, linkAccount, signInExisting, signOut, type LinkOutcome, type Provider } from '../lib/accountLink';
import { useAuth } from '../lib/auth';
import { PRIVACY_URL } from '../lib/links';
import { radius, useTheme } from '../theme';
import { Banner, Button, Card, IconBubble, LargeTitle, Pressy, PushScreen, Row, Spinner, Txt } from '../ui/kit';

const NAME: Record<Provider, string> = { apple: 'Apple', google: 'Google' };

/**
 * 계정 연결 (설계 결정: 익명 시작 + 선택적 Apple/Google 로그인) — 디자인 '계정' 보드.
 * 익명 상태에서 연결하면 지금까지의 학습 기록이 그 계정으로 이어진다.
 */
export default function AccountScreen() {
  const { c } = useTheme();
  const { session } = useAuth();
  // mode=signin: 첫 실행 소개의 '이미 계정이 있어요' — 연결이 아니라 기존 계정으로 로그인
  const signinMode = useLocalSearchParams<{ mode?: string }>().mode === 'signin';
  const user = session?.user;
  const anonymous = user?.is_anonymous ?? true;
  const identity = (user?.identities ?? []).find((i) => i.provider !== 'anonymous');
  const email = (identity?.identity_data?.email as string | undefined) ?? user?.email ?? '';
  const [busy, setBusy] = useState<Provider | 'signout' | 'delete' | null>(null);
  const [outcome, setOutcome] = useState<(LinkOutcome & { provider: Provider }) | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // iOS 는 Apple 을 먼저 (App Store 가이드라인 4.8)
  const providers: Provider[] = Platform.OS === 'ios' ? ['apple', 'google'] : ['google', 'apple'];

  const run = async (provider: Provider, fn: typeof linkAccount) => {
    setBusy(provider);
    setOutcome(null);
    const result = await fn(provider);
    setBusy(null);
    if (result.status !== 'redirecting' && result.status !== 'cancelled') setOutcome({ ...result, provider });
  };

  // 기존 계정으로 로그인하면 바로 앱으로 (온보딩 여부는 그 계정 프로필을 따른다 — 루트 레이아웃)
  useEffect(() => {
    if (signinMode && outcome?.status === 'signed_in') router.replace('/');
  }, [signinMode, outcome]);

  const doSignOut = async () => {
    setBusy('signout');
    await signOut();
    setBusy(null);
    router.dismissTo('/');
  };

  const doDelete = async () => {
    setBusy('delete');
    setDeleteError(null);
    const result = await deleteAccount();
    setBusy(null);
    if (result.ok) router.dismissTo('/');
    else setDeleteError(result.message);
  };

  // 되돌릴 수 없으므로 한 번 더 묻는다 (웹 미리보기는 Alert 버튼을 지원하지 않아 confirm)
  const confirmDelete = () => {
    const title = '계정을 삭제할까요?';
    const body = anonymous
      ? '이 기기의 학습 기록(오늘의 단어, 퀴즈, 복습 일정, 학습 계획)이 모두 삭제되고 되돌릴 수 없어요.'
      : '계정에 저장된 학습 기록과 연결된 계정 정보가 모두 삭제되고 되돌릴 수 없어요. 다른 기기에서도 이어서 할 수 없어요.';
    if (Platform.OS === 'web') {
      if (globalThis.confirm?.(`${title}\n\n${body}`)) void doDelete();
      return;
    }
    Alert.alert(title, body, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: () => void doDelete() },
    ]);
  };

  const deleteSection = (
    <View style={{ gap: 6, paddingTop: 18 }}>
      {deleteError ? <Banner tone="danger" title={deleteError} /> : null}
      <Pressy
        onPress={confirmDelete}
        disabled={busy !== null}
        accessibilityLabel="계정 삭제"
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {busy === 'delete' ? <Spinner color={c.text2} /> : <Txt variant="subhead" weight="500" color={c.danger}>계정 삭제</Txt>}
      </Pressy>
      <Txt variant="footnote" weight="400" color={c.text2} style={{ paddingHorizontal: 4, lineHeight: 21, textAlign: 'center' }}>
        학습 기록과 계정 정보를 서버에서 모두 지워요.
      </Txt>
    </View>
  );

  return (
    <PushScreen gap={14}>
      <View style={{ paddingHorizontal: 4, paddingBottom: 4 }}><LargeTitle>{signinMode && anonymous ? '로그인' : '계정'}</LargeTitle></View>

      {(outcome?.status === 'linked' || outcome?.status === 'signed_in') && (
        <Banner
          tone="success"
          title={outcome.status === 'linked' ? `${NAME[outcome.provider]} 계정을 연결했어요. 학습 기록이 이어집니다.` : `${NAME[outcome.provider]} 계정으로 로그인했어요.`}
        />
      )}
      {outcome?.status === 'error' && <Banner tone="danger" title={`연결하지 못했어요: ${outcome.message}`} />}
      {outcome?.status === 'already_linked' && (
        <Banner
          tone="warning"
          title={`이 ${NAME[outcome.provider]} 계정은 이미 다른 학습 기록에 연결되어 있어요`}
          body="그 계정으로 로그인하면 계정에 저장된 기록으로 이어서 학습해요. 대신 이 기기에서 익명으로 쌓은 기록은 함께 옮겨지지 않아요."
        >
          <Pressy
            onPress={() => run(outcome.provider, signInExisting)}
            disabled={busy !== null}
            accessibilityLabel={`${NAME[outcome.provider]} 계정으로 로그인`}
            style={{ alignSelf: 'flex-start', marginLeft: 30, height: 44, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: c.warning, justifyContent: 'center' }}
          >
            <Txt variant="subhead" weight="600" color={c.warning}>{NAME[outcome.provider]} 계정으로 로그인</Txt>
          </Pressy>
        </Banner>
      )}

      {anonymous && signinMode ? (
        <>
          <Card style={{ gap: 10 }}>
            <IconBubble name="user" tone="tint" size={40} />
            <Txt variant="headline">이전에 연결한 계정으로 로그인하세요</Txt>
            <Txt variant="subhead" color={c.text2}>
              Apple 또는 Google 계정에 저장된 학습 기록으로 이어서 학습해요.
            </Txt>
          </Card>
          <View style={{ gap: 12, paddingTop: 6, opacity: busy ? 0.7 : 1 }}>
            {providers.map((p) =>
              p === 'apple' ? (
                <AppleButton key={p} busy={busy === 'apple'} disabled={busy !== null} onPress={() => run('apple', signInExisting)} />
              ) : (
                <GoogleButton key={p} busy={busy === 'google'} disabled={busy !== null} onPress={() => run('google', signInExisting)} />
              ),
            )}
          </View>
        </>
      ) : anonymous ? (
        <>
          <Card style={{ gap: 10 }}>
            <IconBubble name="user" tone="fill" size={40} />
            <Txt variant="headline">지금은 이 기기에만 저장된 익명 학습자예요</Txt>
            <Txt variant="subhead" color={c.text2}>
              Apple 또는 Google 계정을 연결하면 지금까지의 학습 기록이 계정에 저장돼요. 기기를 바꾸거나 앱을 다시 설치해도 이어서 할 수 있어요.
            </Txt>
          </Card>
          <View style={{ gap: 12, paddingTop: 6, opacity: busy ? 0.7 : 1 }}>
            {providers.map((p) =>
              p === 'apple' ? (
                <AppleButton key={p} busy={busy === 'apple'} disabled={busy !== null} onPress={() => run('apple', linkAccount)} />
              ) : (
                <GoogleButton key={p} busy={busy === 'google'} disabled={busy !== null} onPress={() => run('google', linkAccount)} />
              ),
            )}
          </View>
          {deleteSection}
        </>
      ) : (
        <>
          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <IconBubble name="check" tone="success" size={40} />
              <Txt variant="headline">계정이 연결되어 있어요</Txt>
            </View>
            <View style={{ borderTopWidth: 0.5, borderTopColor: c.separator, marginHorizontal: -16 }}>
              <Row accessibilityLabel={`연결된 계정 ${identity ? NAME[identity.provider as Provider] ?? identity.provider : '-'}`} minHeight={44}>
                <Txt variant="subhead" color={c.text2} style={{ flex: 1 }}>연결된 계정</Txt>
                <Txt variant="subhead">{identity ? NAME[identity.provider as Provider] ?? identity.provider : '-'}</Txt>
              </Row>
              <Row last accessibilityLabel={`이메일 ${email || '없음'}`} minHeight={44}>
                <Txt variant="subhead" color={c.text2} style={{ flex: 1 }}>이메일</Txt>
                <Txt variant="subhead" numberOfLines={1} style={{ flexShrink: 1 }}>{email || '-'}</Txt>
              </Row>
            </View>
          </Card>
          <Button
            label={busy === 'signout' ? '로그아웃 중…' : '로그아웃'}
            kind="surface"
            color={busy === 'signout' ? c.text2 : c.danger}
            disabled={busy !== null}
            onPress={doSignOut}
            height={50}
          />
          <Txt variant="footnote" weight="400" color={c.text2} style={{ paddingHorizontal: 4, lineHeight: 21 }}>
            로그아웃해도 계정의 학습 기록은 남아 있고, 다시 로그인하면 이어서 할 수 있어요. 로그아웃하면 이 기기는 새 익명 학습자로 시작해요.
          </Txt>
          {deleteSection}
        </>
      )}

      {/* Play 정책: 개인정보처리방침은 앱 안에서도 열 수 있어야 한다 */}
      <Pressy
        onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_URL)}
        accessibilityRole="link"
        accessibilityLabel="개인정보처리방침 열기"
        style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: signinMode && anonymous ? 12 : 0 }}
      >
        <Txt variant="footnote" weight="500" color={c.text2} style={{ textDecorationLine: 'underline' }}>개인정보처리방침</Txt>
      </Pressy>
    </PushScreen>
  );
}

/** iOS 는 시스템 Apple 버튼(ASAuthorizationAppleIDButton), 그 외는 Apple 가이드에 맞춘 검정/흰 버튼 */
function AppleButton({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled: boolean }) {
  const { c, isDark } = useTheme();
  if (Platform.OS === 'ios') {
    return (
      <View pointerEvents={disabled ? 'none' : 'auto'}>
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ height: 50, width: '100%' }}
          onPress={onPress}
        />
      </View>
    );
  }
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Apple로 계속하기"
      accessibilityState={{ busy }}
      style={{ height: 50, borderRadius: 12, backgroundColor: c.appleBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}
    >
      {busy ? <Spinner color={c.appleFg} /> : (
        <Svg width={16} height={19} viewBox="0 0 814 1000">
          <Path
            fill={c.appleFg}
            d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"
          />
        </Svg>
      )}
      <Txt variant="headline" color={c.appleFg}>{busy ? '연결 중…' : 'Apple로 계속하기'}</Txt>
    </Pressy>
  );
}

/** Google 브랜딩 가이드: 흰(다크는 #131314) 바탕 + 회색 테두리 + 4색 G 로고 */
function GoogleButton({ onPress, busy, disabled }: { onPress: () => void; busy: boolean; disabled: boolean }) {
  const { c } = useTheme();
  return (
    <Pressy
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Google로 계속하기"
      accessibilityState={{ busy }}
      style={{ height: 50, borderRadius: 12, borderWidth: 1, borderColor: c.googleBorder, backgroundColor: c.googleBg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
    >
      {busy ? <Spinner color={c.googleFg} /> : (
        <Svg width={18} height={18} viewBox="0 0 48 48">
          <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </Svg>
      )}
      <Txt variant="callout" weight="500" color={c.googleFg}>{busy ? '연결 중…' : 'Google로 계속하기'}</Txt>
    </Pressy>
  );
}
