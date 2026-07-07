/**
 * Insights tab — the aggregate/trends surface (docs/RESEARCH-APPS.md §3.2,
 * DESIGN.md §14): ONE hero aggregate for the user's primary club with a
 * baseline-relative sparkline, then the per-club bag breakdown with 1D
 * carry strips (no faked 2D dispersion — monocular data has no lateral
 * axis). Every number carries its window label; clubs below
 * MIN_SHOTS_FOR_DELTA render a "calibrating" row instead of a fake trend.
 * Soccer gets the same treatment in the sport's canon unit (km/h, "~").
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../types/navigation';
import { useHistoryStore } from '../../state/historyStore';
import {
  Card,
  EmptyState,
  ScreenHeader,
  SegmentedControl,
  SegmentedMeter,
  TrendPill,
} from '../../app/components';
import { colors, sharedStyles, spacing, typography } from '../../app/theme';
import { MIN_SHOTS_FOR_DELTA } from '../../state/historyStore';
import {
  carryTrend,
  golfBag,
  primaryClub,
  soccerInsights,
} from './insights';
import { Sparkline } from './Sparkline';

type InsightsNavigation = NativeStackNavigationProp<RootStackParamList>;

const SPORT_OPTIONS = [
  { label: 'Golf', value: 'golf' },
  { label: 'Soccer', value: 'soccer' },
] as const;

/** 'pitching-wedge' → 'Pitching wedge'. */
const clubName = (club: string): string => {
  const label = club.replace(/-/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
};

function GolfInsights(): React.JSX.Element {
  const shots = useHistoryStore((s) => s.shots);
  const bag = useMemo(() => golfBag(shots), [shots]);
  const hero = useMemo(() => {
    const club = primaryClub(shots);
    return club ? carryTrend(shots, club) : null;
  }, [shots]);

  return (
    <>
      {hero ? (
        <Card variant="raised" testID="insights-hero">
          <Text style={typography.label}>
            {`Avg ${clubName(hero.club).toLowerCase()} carry · last ${hero.series.length} shots`}
          </Text>
          <View style={styles.heroRow}>
            <Text style={[typography.display, styles.heroValue]}>
              {String(Math.round(hero.avg))}
            </Text>
            <Text style={styles.heroUnit}>yd</Text>
            {hero.delta !== undefined && hero.delta !== 0 ? (
              <View style={styles.heroTrend}>
                <TrendPill
                  testID="insights-hero-trend"
                  delta={hero.delta}
                  unit="yd"
                  format={(n) => String(Math.round(n))}
                  goodDirection="up"
                  base={hero.prevAvg}
                />
              </View>
            ) : null}
          </View>
          <Sparkline
            series={hero.series}
            baseline={hero.prevAvg}
            testID="insights-sparkline"
          />
          <Text style={[typography.caption, styles.heroCaption]}>
            {hero.prevAvg !== undefined
              ? `vs your previous ${hero.prevCount} · best ${Math.round(hero.best)} yd`
              : `best ${Math.round(hero.best)} yd`}
          </Text>
        </Card>
      ) : null}

      <Text style={styles.sectionLabel}>Your bag</Text>
      <Card padded={false} style={styles.bagCard}>
        {bag.map((club, index) => (
          <View
            key={club.club}
            style={[styles.clubRow, index > 0 && styles.clubRowDivider]}
          >
            <View style={styles.clubNameCol}>
              <Text style={styles.clubName}>{clubName(club.club)}</Text>
              <Text style={styles.clubMeta}>
                {club.calibrating
                  ? `${club.count} of ${MIN_SHOTS_FOR_DELTA} shots`
                  : `${club.count} shots`}
              </Text>
            </View>
            {club.calibrating ? (
              <>
                <View style={styles.calibratingMeter}>
                  <SegmentedMeter
                    progress={club.count / MIN_SHOTS_FOR_DELTA}
                    segments={MIN_SHOTS_FOR_DELTA}
                    accessibilityLabel={`${clubName(club.club)}: ${club.count} of ${MIN_SHOTS_FOR_DELTA} shots recorded`}
                  />
                </View>
                <Text style={styles.calibratingLabel}>Calibrating</Text>
              </>
            ) : (
              <>
                <View style={styles.strip}>
                  <View style={styles.stripTrack} />
                  {club.positions.map((pos, i) => {
                    const isPb =
                      club.windowHasPb && pos >= 0.999 && club.maxCarry !== undefined;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.stripDot,
                          { left: `${pos * 92}%` },
                          isPb && styles.stripDotPb,
                        ]}
                      />
                    );
                  })}
                  <Text style={[styles.stripRange, styles.stripRangeMin]}>
                    {Math.round(club.minCarry!)}
                  </Text>
                  <Text style={[styles.stripRange, styles.stripRangeMax]}>
                    {Math.round(club.maxCarry!)}
                  </Text>
                </View>
                <View style={styles.clubValue}>
                  <Text style={styles.clubAvg}>
                    {Math.round(club.avgCarry!)}
                  </Text>
                  <Text style={styles.clubUnit}>yd</Text>
                </View>
              </>
            )}
          </View>
        ))}
      </Card>
    </>
  );
}

function SoccerInsightsView(): React.JSX.Element {
  const shots = useHistoryStore((s) => s.shots);
  const soccer = useMemo(() => soccerInsights(shots), [shots]);

  if (soccer.calibrating) {
    return (
      <Card testID="insights-soccer-calibrating">
        <Text style={typography.subtitle}>Calibrating</Text>
        <Text style={[typography.label, styles.calibratingBody]}>
          {`${soccer.count} of ${MIN_SHOTS_FOR_DELTA} shots recorded — averages unlock at ${MIN_SHOTS_FOR_DELTA}.`}
        </Text>
        <View style={styles.calibratingBodyMeter}>
          <SegmentedMeter
            progress={soccer.count / MIN_SHOTS_FOR_DELTA}
            segments={MIN_SHOTS_FOR_DELTA}
            accessibilityLabel={`${soccer.count} of ${MIN_SHOTS_FOR_DELTA} shots recorded`}
          />
        </View>
      </Card>
    );
  }

  return (
    <>
      <Card variant="raised" testID="insights-soccer-hero">
        <Text style={typography.label}>
          {`Avg shot speed · last ${soccer.count} shots`}
        </Text>
        <View style={styles.heroRow}>
          <Text style={[typography.display, styles.heroValue]}>
            {`~${Math.round(soccer.avgKmh!)}`}
          </Text>
          <Text style={styles.heroUnit}>km/h</Text>
        </View>
        <Sparkline series={soccer.series} testID="insights-soccer-sparkline" />
        <Text style={[typography.caption, styles.heroCaption]}>
          {`fastest ~${Math.round(soccer.maxKmh!)} km/h`}
        </Text>
      </Card>
      {soccer.onTargetRate !== undefined ? (
        <Card style={styles.onTargetCard}>
          <View style={styles.onTargetRow}>
            <Text style={typography.body}>On target</Text>
            <Text style={styles.onTargetValue}>
              {`${Math.round(soccer.onTargetRate * 100)}%`}
            </Text>
          </View>
        </Card>
      ) : null}
    </>
  );
}

export function InsightsScreen(): React.JSX.Element {
  const navigation = useNavigation<InsightsNavigation>();
  const insets = useSafeAreaInsets();
  const shots = useHistoryStore((s) => s.shots);
  const hasGolf = shots.some((s) => s.sport === 'golf');
  const hasSoccer = shots.some((s) => s.sport === 'soccer');
  const [sport, setSport] = useState<'golf' | 'soccer'>(
    hasGolf || !hasSoccer ? 'golf' : 'soccer',
  );

  if (!hasGolf && !hasSoccer) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="Insights build as you trace"
          body="Averages, trends, and personal bests appear after your first few tracked shots."
          actionLabel="Record a shot"
          onAction={() => navigation.navigate('Record')}
        />
      </View>
    );
  }

  const activeSport = sport === 'soccer' && hasSoccer ? 'soccer' : 'golf';

  return (
    <ScrollView
      // Tab roots hide the native header — the top inset is ours to pad.
      style={[sharedStyles.screen, { paddingTop: insets.top + spacing.sm }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
    >
      <ScreenHeader title="Insights" />
      {hasGolf && hasSoccer ? (
        <View style={styles.sportSwitch}>
          <SegmentedControl
            options={[...SPORT_OPTIONS]}
            value={activeSport}
            onChange={(value) => setSport(value as 'golf' | 'soccer')}
            testID="insights-sport"
          />
        </View>
      ) : null}
      {activeSport === 'golf' && hasGolf ? <GolfInsights /> : null}
      {activeSport === 'soccer' && hasSoccer ? <SoccerInsightsView /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sportSwitch: {
    marginBottom: spacing.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  heroValue: {
    fontSize: 42,
    lineHeight: 44,
  },
  heroUnit: {
    ...typography.body,
    color: colors.textMuted,
    marginLeft: spacing.xs,
    paddingBottom: 5,
  },
  heroTrend: {
    marginLeft: spacing.sm,
    paddingBottom: spacing.sm,
  },
  heroCaption: {
    marginTop: spacing.sm,
  },
  sectionLabel: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  bagCard: {
    paddingHorizontal: spacing.md,
  },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
  },
  clubRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  clubNameCol: {
    width: 92,
  },
  clubName: {
    ...typography.body,
    fontWeight: '600',
  },
  clubMeta: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.textDisabled,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
  },
  strip: {
    flex: 1,
    height: 30,
  },
  stripTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,251,235,0.09)',
  },
  stripDot: {
    position: 'absolute',
    top: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(91,206,98,0.55)',
  },
  stripDotPb: {
    backgroundColor: '#FFE9C4',
  },
  stripRange: {
    position: 'absolute',
    top: 16,
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  stripRangeMin: {
    left: 0,
  },
  stripRangeMax: {
    right: 0,
  },
  clubValue: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: 52,
    justifyContent: 'flex-end',
  },
  clubAvg: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  clubUnit: {
    ...typography.caption,
    marginLeft: 2,
    paddingBottom: 1,
  },
  calibratingMeter: {
    flex: 1,
    justifyContent: 'center',
  },
  calibratingLabel: {
    ...typography.caption,
    width: 74,
    textAlign: 'right',
  },
  calibratingBody: {
    marginTop: spacing.xs,
  },
  calibratingBodyMeter: {
    marginTop: spacing.md,
  },
  onTargetCard: {
    marginTop: spacing.sm,
  },
  onTargetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onTargetValue: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
});
