/**
 * Sessions tab — the visual shot library (docs/RESEARCH-APPS.md §3.4,
 * DESIGN.md §11). Reverse-chronological rows grouped by day headers, each
 * carrying its redrawn trace glyph (monochrome cream — ember is reserved
 * for ShotDetail's hero), method meta, PB mark, and headline stat; tap
 * opens ShotDetail. Sport filter chips appear once more than one sport has
 * shots. Clear-history lives on Profile with the other data controls.
 *
 * SectionList (not ScrollView): each row mounts a Skia canvas for its
 * trace glyph, and history holds up to 500 shots — virtualization keeps
 * only the visible canvases alive.
 */
import { useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../types/navigation';
import { useHistoryStore, type ShotRecord } from '../../state/historyStore';
import {
  Card,
  Chevron,
  Chip,
  EmptyState,
  ScreenHeader,
  SportIcon,
} from '../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../app/theme';
import type { SportId } from '../sports/sportCatalog';
import {
  dayLabel,
  formatClockTime,
  methodLabel,
  personalBestIds,
  shotHeadlineParts,
  shotTitle,
} from './shotDisplay';
import { TraceGlyph } from './components/TraceGlyph';

type SessionsNavigation = NativeStackNavigationProp<RootStackParamList>;

type SportFilter = 'all' | SportId;

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

const GLYPH_SIZE = 44;

export function SessionsScreen(): React.JSX.Element {
  const navigation = useNavigation<SessionsNavigation>();
  const insets = useSafeAreaInsets();
  const shots = useHistoryStore((s) => s.shots);
  const [filter, setFilter] = useState<SportFilter>('all');

  const sportsWithShots = useMemo(
    () => [...new Set(shots.map((s) => s.sport))],
    [shots],
  );
  const filtered = useMemo(
    () => (filter === 'all' ? shots : shots.filter((s) => s.sport === filter)),
    [shots, filter],
  );
  // O(N) once per history change — never O(N) per row (review finding).
  const pbIds = useMemo(() => personalBestIds(shots), [shots]);

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

  const sections = groupByDay(filtered).map((group) => ({
    title: group.label,
    data: group.shots,
  }));

  return (
    <SectionList
      // Tab roots hide the native header — the top inset is ours to pad.
      style={[sharedStyles.screen, { paddingTop: insets.top + spacing.sm }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
      sections={sections}
      keyExtractor={(shot) => shot.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <>
          <ScreenHeader title="Sessions" />
          {sportsWithShots.length > 1 ? (
            <View style={styles.filterRow}>
              <Chip
                label="All"
                selected={filter === 'all'}
                onPress={() => setFilter('all')}
                testID="sessions-filter-all"
              />
              {sportsWithShots.map((sport) => (
                <Chip
                  key={sport}
                  label={sport.charAt(0).toUpperCase() + sport.slice(1)}
                  selected={filter === sport}
                  onPress={() => setFilter(sport)}
                  testID={`sessions-filter-${sport}`}
                />
              ))}
            </View>
          ) : null}
        </>
      }
      renderSectionHeader={({ section }) => (
        <Text style={styles.dayLabel}>{section.title}</Text>
      )}
      renderItem={({ item: shot }) => {
            const parts = shotHeadlineParts(shot);
            const pb = pbIds.has(shot.id);
            const meta = [
              formatClockTime(shot.at),
              shot.method
                ? methodLabel(shot.method)
                : shot.sport === 'soccer'
                  ? shot.onTarget
                    ? 'On target'
                    : 'Off target'
                  : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Card
                key={shot.id}
                onPress={() =>
                  navigation.navigate('ShotDetail', { shotId: shot.id })
                }
                testID={`session-shot-${shot.id}`}
                accessibilityLabel={`${shotTitle(shot)}, ${meta}`}
                style={styles.shotCard}
              >
                <View style={styles.row}>
                  <View style={styles.glyph}>
                    {shot.tracePoints && shot.tracePoints.length >= 2 ? (
                      <TraceGlyph
                        points={shot.tracePoints}
                        width={GLYPH_SIZE - 8}
                        height={GLYPH_SIZE - 8}
                      />
                    ) : (
                      <SportIcon sport={shot.sport} size={24} />
                    )}
                  </View>
                  <View style={styles.copy}>
                    <Text style={typography.body} numberOfLines={1}>
                      <Text style={styles.title}>{shotTitle(shot)}</Text>
                    </Text>
                    <Text style={styles.meta}>{meta}</Text>
                  </View>
                  {pb ? (
                    <Text style={styles.pbMark} testID={`pb-${shot.id}`}>
                      PB
                    </Text>
                  ) : null}
                  {parts ? (
                    <View style={styles.stat}>
                      {/* Soccer speeds wear "~" — monocular estimate (§12). */}
                      <Text style={styles.statValue}>
                        {shot.sport === 'soccer' ? `~${parts.value}` : parts.value}
                      </Text>
                      <Text style={styles.statUnit}>
                        {parts.label === 'Carry' || parts.label === 'Total'
                          ? `${parts.unit} ${parts.label.toLowerCase()}`
                          : parts.unit}
                      </Text>
                    </View>
                  ) : (
                    <Text style={typography.label}>No stats</Text>
                  )}
                  <Chevron />
                </View>
              </Card>
            );
          }}
    />
  );
}

const styles = StyleSheet.create({
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  dayLabel: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  shotCard: {
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 3,
  },
  glyph: {
    width: GLYPH_SIZE,
    height: GLYPH_SIZE,
    borderRadius: 11,
    backgroundColor: colors.stage,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.text,
  },
  meta: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  /** PB — the sanctioned ember chrome accent (see ShotDetail). */
  pbMark: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.7,
    color: '#FFE9C4',
    backgroundColor: 'rgba(255,158,44,0.07)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,233,196,0.3)',
    borderRadius: 999,
    paddingHorizontal: spacing.sm - 1,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  stat: {
    alignItems: 'flex-end',
    marginRight: 2,
  },
  statValue: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 1,
  },
});
