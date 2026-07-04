/**
 * Permissions — step 5 of onboarding (DESIGN.md §10): camera and photo
 * library primer cards, each with a one-line why, shown BEFORE any OS
 * dialog. Only the camera prompts here; the photo library is requested by
 * iOS itself on first import, so that card explains instead of faking a
 * prompt. Denying anything still completes onboarding — affected features
 * re-prompt contextually.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera } from 'react-native-vision-camera';

import { Badge, Button, Card, ScreenHeader } from '../../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../../app/theme';
import { useProfileStore } from '../../../state/profileStore';
import { resetToHome } from '../navOnboarding';
import { OnboardingDots } from '../components/OnboardingDots';

type CameraPermission = 'idle' | 'granted' | 'denied';

export function OnboardingPermissionsScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const completeOnboarding = useProfileStore((s) => s.completeOnboarding);
  const [camera, setCamera] = useState<CameraPermission>('idle');

  const onAllowCamera = async () => {
    try {
      const result = await Camera.requestCameraPermission();
      setCamera(result === 'granted' ? 'granted' : 'denied');
    } catch {
      // Treat a failed native call like a denial: never block onboarding.
      setCamera('denied');
    }
  };

  const onFinish = () => {
    completeOnboarding();
    resetToHome(navigation);
  };

  return (
    <View style={sharedStyles.screen}>
      <OnboardingDots step={5} />
      <ScreenHeader
        title="Two quick permissions"
        subtitle="Tracr only asks when a feature needs it. Skipping is fine."
      />

      <Card style={styles.card} testID="permission-card-camera">
        <View style={styles.cardHeader}>
          <Text style={typography.subtitle}>Camera</Text>
          {camera === 'granted' ? (
            <Badge label="Allowed" tone="success" />
          ) : null}
        </View>
        <Text style={styles.why}>
          Tracr records your swing to trace the ball.
        </Text>
        {camera === 'idle' ? (
          <Button
            label="Allow camera"
            variant="secondary"
            size="md"
            onPress={onAllowCamera}
            style={styles.cardButton}
          />
        ) : null}
        {camera === 'denied' ? (
          <Text style={styles.deniedLine}>
            That&apos;s fine — recording asks again when you use it.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card} testID="permission-card-photos">
        <View style={styles.cardHeader}>
          <Text style={typography.subtitle}>Photo library</Text>
        </View>
        <Text style={styles.why}>
          Import shots you&apos;ve already filmed to trace them.
        </Text>
        <Text style={styles.deniedLine}>
          iOS asks for access the first time you import a video.
        </Text>
      </Card>

      <View style={styles.spacer} />
      <Button
        label="Finish"
        onPress={onFinish}
        style={{ marginBottom: insets.bottom + spacing.md }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  why: {
    ...typography.body,
    color: colors.textMuted,
  },
  cardButton: {
    marginTop: spacing.md,
    alignSelf: 'flex-start',
  },
  deniedLine: {
    ...typography.caption,
    marginTop: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
});
