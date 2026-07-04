/**
 * Preferences — step 4 of onboarding (DESIGN.md §10): units, handedness,
 * analytics opt-in. Three rows max; everything editable later. Writes
 * straight to profileStore.setPreferences so there is no local draft state
 * to lose.
 */
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  Chip,
  ScreenHeader,
  SectionLabel,
  SegmentedControl,
} from '../../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../../app/theme';
import { useProfileStore } from '../../../state/profileStore';
import type { Handedness, Units } from '../../../state/profileStore';
import { navigateOnboarding } from '../navOnboarding';
import { OnboardingDots } from '../components/OnboardingDots';

const UNIT_OPTIONS = [
  { label: 'Yards', value: 'yards' },
  { label: 'Meters', value: 'meters' },
] as const;

const HANDEDNESS_OPTIONS = [
  { label: 'Right-handed', value: 'right' },
  { label: 'Left-handed', value: 'left' },
] as const;

export function OnboardingPreferencesScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const preferences = useProfileStore((s) => s.preferences);
  const setPreferences = useProfileStore((s) => s.setPreferences);

  return (
    <View style={sharedStyles.screen}>
      <OnboardingDots step={4} />
      <ScreenHeader
        title="Set your preferences"
        subtitle="You can change any of these later in settings."
      />

      <SectionLabel style={styles.firstLabel}>Units</SectionLabel>
      <SegmentedControl
        options={UNIT_OPTIONS}
        value={preferences.units}
        onChange={(value) => setPreferences({ units: value as Units })}
        testID="pref-units"
      />

      <SectionLabel>Handedness</SectionLabel>
      <SegmentedControl
        options={HANDEDNESS_OPTIONS}
        value={preferences.handedness}
        onChange={(value) =>
          setPreferences({ handedness: value as Handedness })
        }
        testID="pref-handedness"
      />

      <SectionLabel>Analytics</SectionLabel>
      <View style={styles.analyticsRow}>
        <Chip
          label="Share anonymous analytics"
          selected={preferences.shareAnalytics}
          onPress={() =>
            setPreferences({ shareAnalytics: !preferences.shareAnalytics })
          }
          testID="pref-analytics"
        />
      </View>
      <Text style={styles.analyticsHint}>
        Helps improve tracking. Never your videos, never your name.
      </Text>

      <View style={styles.spacer} />
      <Button
        label="Continue"
        onPress={() => navigateOnboarding(navigation, 'OnboardingPermissions')}
        style={{ marginBottom: insets.bottom + spacing.md }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  firstLabel: {
    marginTop: 0,
  },
  analyticsRow: {
    flexDirection: 'row',
  },
  analyticsHint: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  spacer: {
    flex: 1,
  },
});
