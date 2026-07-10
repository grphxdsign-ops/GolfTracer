/**
 * ShotDetail — the historical drill-in behind every session row
 * (docs/RESEARCH-APPS.md §3.4, DESIGN.md §11): the persisted trace redrawn
 * in ember as the hero (the one hot element — history keeps the tracer,
 * fixing Toptracer's most-complained gap), stats below in the broadcast
 * register, PB mark attached to the record shot, and a framed, two-tap
 * delete. Shots recorded before trace persistence render stats-first with
 * no empty stage box.
 */
import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../types/navigation';
import { useHistoryStore } from '../../state/historyStore';
import {
  Badge,
  Card,
  EmptyState,
  SegmentedMeter,
  StatTile,
} from '../../app/components';
import {
  alpha,
  colors,
  sharedStyles,
  spacing,
  typography,
} from '../../app/theme';
import {
  formatRelativeWhen,
  isPersonalBest,
  methodLabel,
  qualityLabel,
  qualityTone,
  shotTitle,
} from './shotDisplay';
import { TraceGlyph } from './components/TraceGlyph';

type ShotDetailRoute = RouteProp<RootStackParamList, 'ShotDetail'>;
type ShotDetailNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'ShotDetail'
>;

/** Armed delete disarms after a moment, same rhythm as Profile's clear. */
const CONFIRM_TIMEOUT_MS = 4000;

const METHOD_DESCRIPTION: Record<string, string> = {
  homography: 'measured from your ground reference points',
  'physics-fit': 'ball flight model fitted to the tracked trajectory',
  'club-prior': 'typical distance for your club — not a measurement',
};

export function ShotDetailScreen(): React.JSX.Element {
  const navigation = useNavigation<ShotDetailNavigation>();
  const route = useRoute<ShotDetailRoute>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const shots = useHistoryStore((s) => s.shots);
  const removeShot = useHistoryStore((s) => s.removeShot);
  const shot = shots.find((s) => s.id === route.params.shotId) ?? null;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  useEffect(() => {
    if (!confirmingDelete) {
      return;
    }
    const timer = setTimeout(
      () => setConfirmingDelete(false),
      CONFIRM_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [confirmingDelete]);

  useEffect(() => {
    if (shot) {
      navigation.setOptions({
        title: `${shotTitle(shot)} · ${formatRelativeWhen(shot.at)}`,
      });
    }
  }, [navigation, shot]);

  if (!shot) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="Shot not found"
          body="This shot is no longer in your history."
        />
      </View>
    );
  }

  const pb = isPersonalBest(shots, shot);
  const isGolf = shot.sport === 'golf';
  const approx = shot.method === 'club-prior' || shot.sport === 'soccer';
  const traceWidth = width - spacing.md * 2;
  const traceHeight = Math.round(traceWidth * 0.56);

  const handleDelete = () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    removeShot(shot.id);
    navigation.goBack();
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.md }}
    >
      {shot.tracePoints && shot.tracePoints.length >= 2 ? (
        <View style={[styles.stage, { height: traceHeight }]}>
          <TraceGlyph
            points={shot.tracePoints}
            width={traceWidth}
            height={traceHeight}
            variant="ember"
            testID="shot-detail-trace"
          />
          <View style={styles.stageTopLeft}>
            {shot.method ? (
              <Badge
                label={methodLabel(shot.method)}
                tone={shot.method === 'club-prior' ? 'warning' : 'success'}
              />
            ) : (
              <Badge
                label={qualityLabel(shot.quality)}
                tone={qualityTone(shot.quality)}
              />
            )}
          </View>
          {pb ? (
            <View style={styles.stageTopRight}>
              <Text style={styles.pbMark} testID="shot-detail-pb">
                {isGolf ? `PB · ${shotTitle(shot)}` : 'PB'}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.badgeRow}>
          {shot.method ? (
            <Badge
              label={methodLabel(shot.method)}
              tone={shot.method === 'club-prior' ? 'warning' : 'success'}
            />
          ) : (
            <Badge
              label={qualityLabel(shot.quality)}
              tone={qualityTone(shot.quality)}
            />
          )}
          {pb ? (
            <Text style={styles.pbMark} testID="shot-detail-pb">
              PB
            </Text>
          ) : null}
        </View>
      )}

      {isGolf ? (
        <>
          <View style={styles.statRow}>
            {shot.carryYards !== undefined ? (
              <Card style={styles.statCard}>
                <StatTile
                  size="standard"
                  label="Carry"
                  value={String(Math.round(shot.carryYards))}
                  unit="yd"
                  approx={approx}
                />
              </Card>
            ) : null}
            {shot.totalYards !== undefined ? (
              <Card style={styles.statCard}>
                <StatTile
                  size="standard"
                  label="Total"
                  value={String(Math.round(shot.totalYards))}
                  unit="yd"
                  approx={approx}
                />
              </Card>
            ) : null}
          </View>

          {shot.apexFeet !== undefined ||
          shot.ballSpeedMph !== undefined ||
          shot.launchAngleDeg !== undefined ? (
            <>
              <Text style={styles.sectionLabel}>Flight</Text>
              <View style={styles.flightGrid}>
                {shot.apexFeet !== undefined ? (
                  <View style={styles.flightCell}>
                    <Text style={typography.caption}>Apex</Text>
                    <View style={styles.flightValueRow}>
                      <Text style={styles.flightValue}>
                        {Math.round(shot.apexFeet)}
                      </Text>
                      <Text style={styles.flightUnit}>ft</Text>
                    </View>
                  </View>
                ) : null}
                {shot.ballSpeedMph !== undefined ? (
                  <View style={styles.flightCell}>
                    <Text style={typography.caption}>Ball speed</Text>
                    <View style={styles.flightValueRow}>
                      <Text style={styles.flightValue}>
                        {Math.round(shot.ballSpeedMph)}
                      </Text>
                      <Text style={styles.flightUnit}>mph</Text>
                    </View>
                  </View>
                ) : null}
                {shot.launchAngleDeg !== undefined ? (
                  <View style={styles.flightCell}>
                    <Text style={typography.caption}>Launch</Text>
                    <View style={styles.flightValueRow}>
                      <Text style={styles.flightValue}>
                        {`${shot.launchAngleDeg.toFixed(1)}°`}
                      </Text>
                    </View>
                  </View>
                ) : null}
              </View>
            </>
          ) : null}
        </>
      ) : (
        <View style={styles.statRow}>
          {shot.shotSpeedKmh !== undefined ? (
            <Card style={styles.statCard}>
              <StatTile
                size="standard"
                label="Shot speed"
                value={String(Math.round(shot.shotSpeedKmh))}
                unit="km/h"
                approx
              />
            </Card>
          ) : null}
          {shot.onTarget !== undefined ? (
            <Card style={styles.statCard}>
              <StatTile
                size="standard"
                label="Verdict"
                value={shot.onTarget ? 'Goal' : 'No goal'}
              />
            </Card>
          ) : null}
        </View>
      )}

      {shot.confidence !== undefined ? (
        <>
          <Text style={styles.sectionLabel}>Confidence</Text>
          <SegmentedMeter
            progress={shot.confidence}
            accessibilityLabel={`Confidence ${Math.round(shot.confidence * 100)} percent`}
          />
          <Text style={[typography.caption, styles.confidenceCaption]}>
            {`Confidence ${Math.round(shot.confidence * 100)}%`}
            {shot.method && METHOD_DESCRIPTION[shot.method]
              ? ` · ${METHOD_DESCRIPTION[shot.method]}`
              : ''}
          </Text>
        </>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete shot"
        testID="shot-detail-delete"
        onPress={handleDelete}
        style={({ pressed }) => [
          styles.deleteAction,
          pressed && styles.deleteActionPressed,
        ]}
      >
        <Text style={styles.deleteLabel}>
          {confirmingDelete ? 'Tap again to delete' : 'Delete shot'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: colors.stage,
    borderRadius: 20,
    overflow: 'hidden',
  },
  stageTopLeft: {
    position: 'absolute',
    top: spacing.sm + 2,
    left: spacing.sm + 2,
  },
  stageTopRight: {
    position: 'absolute',
    top: spacing.sm + 2,
    right: spacing.sm + 2,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  /**
   * PB — the one sanctioned ember-tinted chrome accent (DESIGN.md §2):
   * it marks a record flight, the tracer's own voice, never decoration.
   */
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
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statCard: {
    flex: 1,
  },
  sectionLabel: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  flightGrid: {
    flexDirection: 'row',
  },
  flightCell: {
    flex: 1,
  },
  flightValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  flightValue: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  flightUnit: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '500',
    color: colors.textMuted,
    marginLeft: 3,
    paddingBottom: 1,
  },
  confidenceCaption: {
    marginTop: spacing.xs + 1,
  },
  deleteAction: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: alpha(colors.danger, 0.28),
    backgroundColor: alpha(colors.danger, 0.07),
    borderRadius: 999,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  deleteActionPressed: {
    backgroundColor: alpha(colors.danger, 0.14),
  },
  deleteLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: '#F0796F',
  },
});
