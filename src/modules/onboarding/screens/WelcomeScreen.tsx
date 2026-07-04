/**
 * Welcome — step 1 of onboarding (DESIGN.md §10): Tracr wordmark, one line
 * of value, a single CTA. No carousel, no marketing slides.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../../app/theme';
import { navigateOnboarding } from '../navOnboarding';
import { OnboardingDots } from '../components/OnboardingDots';

export function WelcomeScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={sharedStyles.screen}>
      <OnboardingDots step={1} />
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.wordmark}>
          Tracr
        </Text>
        <Text style={styles.valueLine}>Trace every shot.</Text>
      </View>
      <Button
        label="Get started"
        onPress={() => navigateOnboarding(navigation, 'SignIn')}
        style={{ marginBottom: insets.bottom + spacing.md }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    ...typography.title,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.8,
  },
  valueLine: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
});
