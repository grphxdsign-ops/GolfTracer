/**
 * Profile tab — account, preferences, sports, and data controls
 * (docs/RESEARCH-APPS.md §3.3, DESIGN.md §15). Preferences were previously
 * set once during onboarding and then unreachable — onboarding copy even
 * promised "change any of these later in settings." This screen keeps that
 * promise: same store, same controls (SegmentedControl + Chip), always one
 * tab away. Destructive actions use the two-tap arm pattern (DESIGN.md §8:
 * no modal for a simple action) with the framed danger treatment.
 */
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Badge,
  Card,
  Chip,
  ScreenHeader,
  SegmentedControl,
  SportIcon,
} from '../../app/components';
import {
  alpha,
  colors,
  sharedStyles,
  spacing,
  typography,
} from '../../app/theme';
import { useProfileStore } from '../../state/profileStore';
import type { Handedness, Units } from '../../state/profileStore';
import { useHistoryStore } from '../../state/historyStore';
import {
  availableSports,
  SPORT_CATALOG,
  type SportId,
} from '../sports/sportCatalog';
import { resetToOnboarding } from './navProfile';

const UNIT_OPTIONS = [
  { label: 'Yards', value: 'yards' },
  { label: 'Meters', value: 'meters' },
] as const;

const HANDEDNESS_OPTIONS = [
  { label: 'Right', value: 'right' },
  { label: 'Left', value: 'left' },
] as const;

/** Armed destructive actions disarm after this long, like Sessions' clear. */
const CONFIRM_TIMEOUT_MS = 4000;

/** Monogram initials from a display name ("Sam Sneed" → "SS"). */
const initialsOf = (name: string | null): string => {
  if (!name) {
    return '•';
  }
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
};

/**
 * Framed danger action (mock-locked treatment): hairline danger border +
 * faint wash + high-luminance label — outdoor-legible, unmistakably not a
 * navigation row. Screen-local per the kit rules; reported as a kit gap.
 */
function DangerAction({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.dangerAction,
        pressed && styles.dangerActionPressed,
      ]}
    >
      <Text style={styles.dangerActionLabel}>{label}</Text>
    </Pressable>
  );
}

export function ProfileScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const account = useProfileStore((s) => s.account);
  const preferences = useProfileStore((s) => s.preferences);
  const chosenSports = useProfileStore((s) => s.sports);
  const setPreferences = useProfileStore((s) => s.setPreferences);
  const toggleSport = useProfileStore((s) => s.toggleSport);
  const resetProfile = useProfileStore((s) => s.reset);
  const shotCount = useHistoryStore((s) => s.shots.length);
  const clearHistory = useHistoryStore((s) => s.clear);

  const [confirmingClear, setConfirmingClear] = useState(false);
  useEffect(() => {
    if (!confirmingClear) {
      return;
    }
    const timer = setTimeout(
      () => setConfirmingClear(false),
      CONFIRM_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    clearHistory();
    setConfirmingClear(false);
  };

  /**
   * Sport toggling with two guardrails:
   * - chosenSports=[] means "no explicit pick → all available active"
   *   (Home's rule). A tap there means "turn THIS one off", so the
   *   complement materializes instead of selecting the tapped sport.
   * - The last active sport can never be zeroed out — onboarding requires
   *   at least one, and an all-off state has no meaning.
   */
  const handleToggleSport = (id: SportId) => {
    const available = availableSports().map((s) => s.id);
    if (chosenSports.length === 0) {
      const complement = available.filter((s) => s !== id);
      if (complement.length === 0) {
        return;
      }
      complement.forEach((s) => toggleSport(s));
      return;
    }
    if (chosenSports.includes(id) && chosenSports.length === 1) {
      return;
    }
    toggleSport(id);
  };

  const handleSignOut = () => {
    // Clears the account and re-arms onboarding; the navigator must follow,
    // otherwise the user is left on a tab shell owned by no profile.
    resetProfile();
    resetToOnboarding(navigation);
  };

  const name = account?.name ?? null;
  const providerLine =
    account === null || account.provider === 'guest'
      ? 'Guest — history stays on this device'
      : 'Signed in with Apple';

  return (
    <ScrollView
      // Tab roots hide the native header — the top inset is ours to pad.
      style={[sharedStyles.screen, { paddingTop: insets.top + spacing.sm }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <ScreenHeader title="Profile" />

      <Card testID="profile-account">
        <View style={styles.accountRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(name)}</Text>
          </View>
          <View style={styles.accountCopy}>
            <Text style={typography.subtitle}>{name ?? 'Guest'}</Text>
            <Text style={[typography.caption, styles.providerLine]}>
              {providerLine}
            </Text>
          </View>
        </View>
      </Card>

      <Text style={styles.sectionLabel}>Preferences</Text>
      <Card>
        <Text style={[typography.caption, styles.prefLabel]}>Units</Text>
        <SegmentedControl
          options={[...UNIT_OPTIONS]}
          value={preferences.units}
          onChange={(value) => setPreferences({ units: value as Units })}
          testID="profile-units"
        />
        <Text style={[typography.caption, styles.prefLabelSpaced]}>
          Handedness
        </Text>
        <SegmentedControl
          options={[...HANDEDNESS_OPTIONS]}
          value={preferences.handedness}
          onChange={(value) =>
            setPreferences({ handedness: value as Handedness })
          }
          testID="profile-handedness"
        />
        <View style={styles.analyticsRow}>
          <Chip
            label="Share anonymous analytics"
            selected={preferences.shareAnalytics}
            onPress={() =>
              setPreferences({ shareAnalytics: !preferences.shareAnalytics })
            }
            testID="profile-analytics"
          />
        </View>
      </Card>

      <Text style={styles.sectionLabel}>Your sports</Text>
      <Card padded={false} style={styles.sportsCard}>
        {SPORT_CATALOG.map((entry, index) => {
          const active =
            entry.available &&
            (chosenSports.length === 0
              ? availableSports().some((s) => s.id === entry.id)
              : chosenSports.includes(entry.id));
          return (
            <Pressable
              key={entry.id}
              disabled={!entry.available}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${entry.name}${entry.available ? '' : ', coming soon'}`}
              testID={`profile-sport-${entry.id}`}
              onPress={() => handleToggleSport(entry.id)}
              style={[styles.sportRow, index > 0 && styles.sportRowDivider]}
            >
              <View
                style={!entry.available ? styles.sportDim : undefined}
              >
                <SportIcon sport={entry.id} size={22} />
              </View>
              <Text
                style={[
                  typography.body,
                  styles.sportName,
                  !entry.available && styles.sportNameDim,
                ]}
              >
                {entry.name}
              </Text>
              {entry.available ? (
                active ? (
                  <Text style={styles.sportActive}>Active</Text>
                ) : (
                  <Text style={styles.sportInactive}>Off</Text>
                )
              ) : (
                <Badge label="Coming soon" outline />
              )}
            </Pressable>
          );
        })}
      </Card>

      <Text style={styles.sectionLabel}>Data</Text>
      <DangerAction
        label={
          confirmingClear
            ? 'Tap again to clear'
            : `Clear shot history (${shotCount})`
        }
        onPress={handleClear}
        testID="profile-clear-history"
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        testID="profile-sign-out"
        onPress={handleSignOut}
        style={styles.signOut}
      >
        <Text style={styles.signOutLabel}>Sign out</Text>
      </Pressable>
      <Text style={styles.version}>Tracr 0.1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: alpha(colors.primary, 0.14),
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.35),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.accent,
  },
  accountCopy: {
    flex: 1,
  },
  providerLine: {
    marginTop: 2,
  },
  sectionLabel: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  prefLabel: {
    marginBottom: spacing.xs + 2,
  },
  prefLabelSpaced: {
    marginTop: spacing.md,
    marginBottom: spacing.xs + 2,
  },
  analyticsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
  },
  sportsCard: {
    paddingHorizontal: spacing.md,
  },
  sportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
  },
  sportRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  sportDim: {
    opacity: 0.45,
  },
  sportName: {
    flex: 1,
    fontWeight: '500',
  },
  sportNameDim: {
    color: colors.textMuted,
  },
  sportActive: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '600',
  },
  sportInactive: {
    ...typography.label,
    color: colors.textDisabled,
  },
  dangerAction: {
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.28),
    backgroundColor: alpha(colors.danger, 0.07),
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  dangerActionPressed: {
    backgroundColor: alpha(colors.danger, 0.14),
  },
  dangerActionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#F0796F',
    fontVariant: ['tabular-nums'],
  },
  signOut: {
    alignSelf: 'center',
    marginTop: spacing.xl,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  signOutLabel: {
    ...typography.label,
    fontWeight: '500',
  },
  version: {
    ...typography.caption,
    color: colors.textDisabled,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
