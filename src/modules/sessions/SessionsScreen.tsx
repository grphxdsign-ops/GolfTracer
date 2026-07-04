/**
 * Sessions screen — the full shot history drill-in behind Home's recent
 * session card (DESIGN.md §11). Reverse-chronological shot cards grouped by
 * day headers, plus a two-tap "Clear history" ghost action — no modal for a
 * simple action (DESIGN.md §8): the first tap arms the button ("Tap again to
 * clear"), the second clears; the armed state disarms itself after a moment.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../types/navigation';
import { useHistoryStore, type ShotRecord } from '../../state/historyStore';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionLabel,
} from '../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../app/theme';
import {
  dayLabel,
  formatClockTime,
  qualityLabel,
  qualityTone,
  shotHeadline,
  sportName,
} from './shotDisplay';

type SessionsNavigation = NativeStackNavigationProp<RootStackParamList>;

/** The armed "Tap again to clear" state disarms after this long. */
const CLEAR_CONFIRM_TIMEOUT_MS = 4000;

interface DayGroup {
  label: string;
  shots: ShotRecord[];
}

/** Newest-first shots bucketed by calendar-day label, preserving order. */
function groupByDay(shots: readonly ShotRecord[]): DayGroup[] {
  const ordered = [...shots].sort((a, b) => b.at - a.at);
  const groups: DayGroup[] = [];
  for (const shot of ordered) {
    const label = dayLabel(shot.at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.shots.push(shot);
    } else {
      groups.push({ label, shots: [shot] });
    }
  }
  return groups;
}

export function SessionsScreen() {
  const navigation = useNavigation<SessionsNavigation>();
  const insets = useSafeAreaInsets();
  const shots = useHistoryStore((s) => s.shots);
  const clear = useHistoryStore((s) => s.clear);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    if (!confirmingClear) {
      return;
    }
    const timer = setTimeout(
      () => setConfirmingClear(false),
      CLEAR_CONFIRM_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [confirmingClear]);

  if (shots.length === 0) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No sessions yet"
          body="Record a shot and it will land here."
          actionLabel="Record"
          onAction={() => navigation.navigate('Record')}
        />
      </View>
    );
  }

  const handleClearPress = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    clear();
    setConfirmingClear(false);
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
    >
      {groupByDay(shots).map((group, groupIndex) => (
        <View key={group.label}>
          <SectionLabel
            style={groupIndex === 0 ? styles.firstSectionLabel : undefined}
          >
            {group.label}
          </SectionLabel>
          {group.shots.map((shot) => {
            const headline = shotHeadline(shot);
            return (
              <Card
                key={shot.id}
                testID={`session-shot-${shot.id}`}
                style={styles.shotCard}
              >
                <View style={styles.topRow}>
                  <Text style={typography.subtitle}>
                    {sportName(shot.sport)}
                  </Text>
                  <Text style={styles.timeText}>
                    {formatClockTime(shot.at)}
                  </Text>
                </View>
                <View style={styles.statRow}>
                  {headline ? (
                    <Text style={styles.headline}>{headline}</Text>
                  ) : (
                    <Text style={typography.label}>No stats recorded</Text>
                  )}
                  <Badge
                    label={qualityLabel(shot.quality)}
                    tone={qualityTone(shot.quality)}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      ))}
      <Button
        label={confirmingClear ? 'Tap again to clear' : 'Clear history'}
        variant="ghost"
        size="sm"
        onPress={handleClearPress}
        style={styles.clearButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  firstSectionLabel: {
    marginTop: 0,
  },
  shotCard: {
    marginBottom: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  headline: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  clearButton: {
    alignSelf: 'center',
    marginTop: spacing.md,
  },
});
