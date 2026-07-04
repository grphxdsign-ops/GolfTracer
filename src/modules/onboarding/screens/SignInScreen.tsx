/**
 * Sign in — step 2 of onboarding (DESIGN.md §10): Sign in with Apple is the
 * only account CTA (label per Apple HIG), with a quieter guest path. Guest
 * is a full profile — the flow never blocks on an account. Cancelling the
 * Apple sheet stays here with an inline, blame-free line (no Alert).
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader } from '../../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../../app/theme';
import { useProfileStore } from '../../../state/profileStore';
import {
  AuthCancelledError,
  isAppleSignInAvailable,
  signInWithApple,
} from '../../../adapters/auth/AppleAuthAdapter';
import { navigateOnboarding } from '../navOnboarding';
import { OnboardingDots } from '../components/OnboardingDots';

const CANCELLED_NOTICE = 'No problem — sign in any time, or continue as guest.';
const FAILED_NOTICE =
  "Couldn't finish signing in. Try again, or continue as guest.";

export function SignInScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const setAccount = useProfileStore((s) => s.setAccount);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const appleAvailable = isAppleSignInAvailable();

  const continueToSports = () => navigateOnboarding(navigation, 'SportSelect');

  const onAppleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const account = await signInWithApple();
      setAccount(account);
      continueToSports();
    } catch (error) {
      setNotice(
        error instanceof AuthCancelledError ? CANCELLED_NOTICE : FAILED_NOTICE,
      );
    } finally {
      setBusy(false);
    }
  };

  const onGuest = () => {
    setAccount({ provider: 'guest', userId: 'guest', name: null, email: null });
    continueToSports();
  };

  return (
    <View style={sharedStyles.screen}>
      <OnboardingDots step={2} />
      <ScreenHeader
        title="Sign in"
        subtitle="Keep your shots and settings if you switch phones. Guest works fully too."
      />
      <View style={styles.spacer} />
      {notice ? (
        <Text testID="signin-notice" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      <View style={{ marginBottom: insets.bottom + spacing.md }}>
        {appleAvailable ? (
          <>
            <Button
              label="Sign in with Apple"
              onPress={onAppleSignIn}
              loading={busy}
              loadingLabel="Waiting for Apple"
            />
            <Button
              label="Continue as guest"
              variant="ghost"
              onPress={onGuest}
              disabled={busy}
              style={styles.guestButton}
            />
          </>
        ) : (
          // No Apple sign-in on this device — guest becomes the one primary.
          <Button label="Continue as guest" onPress={onGuest} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: {
    flex: 1,
  },
  notice: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  guestButton: {
    marginTop: spacing.sm,
  },
});
