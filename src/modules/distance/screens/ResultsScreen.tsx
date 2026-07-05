/**
 * Results screen: runs the distance estimator against the tracked shot and
 * calibration, and presents carry/total with an honest method badge and
 * confidence meter. The hero carry number counts up once on reveal — the
 * sanctioned celebration moment. A low-confidence club-prior fallback is
 * visually distinct — we never dress a guess up as a measurement.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { EstimationMethod, RootStackParamList } from '../../../types';
import { useSessionStore } from '../../../state/sessionStore';
import {
  clubAverages,
  MIN_SHOTS_FOR_DELTA,
  useHistoryStore,
} from '../../../state/historyStore';
import { useBallPointStore } from '../../tracking/screens/ballPointStore';
import {
  colors,
  motion,
  sharedStyles,
  spacing,
  typography,
} from '../../../app/theme';
import {
  Badge,
  Button,
  Card,
  Chevron,
  Chip,
  EmptyState,
  SectionLabel,
  SegmentedMeter,
  StatTile,
  TrendPill,
  useReducedMotion,
} from '../../../app/components';
import {
  estimateDistance,
  type DistanceEstimateResult,
} from '../estimate/estimateDistance';
import { summarizeEstimate } from '../estimate/diagnostics';
import { useDistanceStore } from '../distanceStore';

type ResultsNavigation = NativeStackNavigationProp<RootStackParamList, 'Results'>;

const METHOD_META: Record<
  EstimationMethod,
  {
    label: string;
    description: string;
    tone: 'success' | 'accent' | 'warning';
  }
> = {
  homography: {
    label: 'Measured',
    description: 'Landing point measured from your ground reference points.',
    tone: 'success',
  },
  'physics-fit': {
    label: 'Physics fit',
    description: 'Ball flight model fitted to the tracked trajectory.',
    tone: 'accent',
  },
  'club-prior': {
    label: 'Club average',
    description:
      'Not enough tracking data — this is a typical distance for your club, not a measurement of this shot.',
    tone: 'warning',
  },
};

/** Deltas render as whole yards — consistent decimals per session (§8). */
const formatYards = (n: number): string => String(Math.round(n));

/** 'pitching-wedge' → 'pitching wedge' for the delta caption. */
const clubLabelOf = (club: string): string => club.replace(/-/g, ' ');

/**
 * Hero carry number with a one-shot count-up on reveal (DESIGN.md §1/§5) —
 * an Animated.Value drives a JS listener into Text state; reduce-motion
 * renders the final value instantly.
 */
function HeroCarry({
  carryYards,
  approx,
}: {
  carryYards: number;
  approx: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const target = Math.round(carryYards);
  const [shown, setShown] = useState(reducedMotion ? target : 0);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      setShown(target);
      return;
    }
    const listener = anim.addListener(({ value }) =>
      setShown(Math.round(value)),
    );
    const timing = Animated.timing(anim, {
      toValue: target,
      duration: motion.duration.countUp,
      easing: motion.easing.enter,
      // JS listener drives a Text state update — cannot use the native driver.
      useNativeDriver: false,
    });
    timing.start();
    return () => {
      timing.stop();
      anim.removeListener(listener);
    };
    // One-shot: the celebration plays once per estimate, not on re-renders.
  }, [anim, target, reducedMotion]);

  return (
    <StatTile
      size="hero"
      label="Carry"
      value={String(shown)}
      unit="yd"
      approx={approx}
    />
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={typography.label}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

/**
 * Collapsible diagnostics for the DTL 3D fit (dtlFit estimates only) —
 * rendered from the same summarizeEstimate() record the offline validation
 * grid reports, so the app surfaces exactly what was validated. Expansion is
 * a 200ms opacity + translateY entrance (content conditionally rendered).
 */
function FitDetails({ estimate }: { estimate: DistanceEstimateResult }) {
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const entrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!expanded) return;
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    Animated.timing(entrance, {
      toValue: 1,
      duration: motion.duration.base,
      easing: motion.easing.enter,
      useNativeDriver: true,
    }).start();
  }, [expanded, reducedMotion, entrance]);

  if (!estimate.dtlFit) {
    return null;
  }
  const d = summarizeEstimate(estimate);
  return (
    <Card style={styles.fitDetails}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle fit details"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        hitSlop={{ top: spacing.xs, bottom: spacing.xs }}
        style={styles.fitDetailsHeader}
      >
        <Text style={typography.subtitle}>Fit details</Text>
        <Chevron rotateDeg={expanded ? 90 : 0} color={colors.textMuted} />
      </Pressable>
      {expanded ? (
        <Animated.View
          style={{
            opacity: entrance,
            transform: [
              {
                translateY: entrance.interpolate({
                  inputRange: [0, 1],
                  outputRange: [8, 0],
                }),
              },
            ],
          }}
        >
          {d.azimuthDeg !== undefined ? (
            <DetailRow label="Azimuth" value={`${d.azimuthDeg.toFixed(1)}°`} />
          ) : null}
          {d.cameraPitchDeg !== undefined ? (
            <DetailRow
              label="Camera pitch"
              value={`${d.cameraPitchDeg.toFixed(1)}°`}
            />
          ) : null}
          {d.cameraHeightM !== undefined ? (
            <DetailRow
              label="Camera height"
              value={`${d.cameraHeightM.toFixed(2)} m`}
            />
          ) : null}
          {d.hfovDeg !== undefined ? (
            <DetailRow label="Field of view" value={`${d.hfovDeg.toFixed(1)}°`} />
          ) : null}
          {d.pixelRms !== undefined ? (
            <DetailRow label="Fit RMS" value={`${d.pixelRms.toFixed(1)} px`} />
          ) : null}
          {d.carrySpreadYards !== undefined ? (
            <DetailRow
              label="Carry spread"
              value={`${d.carrySpreadYards.toFixed(0)} yd`}
            />
          ) : null}
          {d.usedPoints !== undefined ? (
            <DetailRow label="Points used" value={`${d.usedPoints}`} />
          ) : null}
          {d.teeSource !== undefined ? (
            <DetailRow
              label="Tee source"
              value={d.teeSource === 'tap' ? 'Ball tap' : 'Extrapolated'}
            />
          ) : null}
        </Animated.View>
      ) : null}
    </Card>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  return (
    <View style={styles.meter}>
      <SegmentedMeter
        progress={confidence}
        accessibilityLabel={`Confidence ${pct} percent`}
      />
      <Text style={[typography.caption, { marginTop: spacing.xs }]}>
        Confidence {pct}%
      </Text>
    </View>
  );
}

export function ResultsScreen() {
  const navigation = useNavigation<ResultsNavigation>();
  const insets = useSafeAreaInsets();
  // Drives the hero card's reactive catchlight (DESIGN.md §5/§7) — never an
  // autonomous loop, only moves while the user scrolls.
  const scrollY = useRef(new Animated.Value(0)).current;
  const trackingResult = useSessionStore((s) => s.trackingResult);
  const calibration = useSessionStore((s) => s.calibration);
  const video = useSessionStore((s) => s.video);
  const setDistance = useSessionStore((s) => s.setDistance);
  const reset = useSessionStore((s) => s.reset);
  const resetDraft = useDistanceStore((s) => s.resetDraft);
  // The club lives in the distance draft (published unchanged into the
  // calibration by CalibrationScreen) — it keys the session-history record
  // and the "vs your club average" comparison.
  const club = useDistanceStore((s) => s.club);
  const addShot = useHistoryStore((s) => s.addShot);
  const historyShots = useHistoryStore((s) => s.shots);
  // The user's tap-to-place-ball point (native px) anchors the DTL fit's
  // tee ray when present.
  const ballPoint = useBallPointStore((s) => s.ballPoint);

  const estimate: DistanceEstimateResult | null = useMemo(() => {
    if (!trackingResult || !calibration) {
      return null;
    }
    const track = trackingResult.track;
    return estimateDistance(
      track,
      calibration,
      {
        width: video?.width ?? track.frameWidth,
        height: video?.height ?? track.frameHeight,
        fps: video?.fps ?? 30,
        // Slow-motion clips store media time dilated by fps/recordedFps; the
        // estimator needs recordedFps to fit physics against real time.
        recordedFps: video?.recordedFps,
      },
      { teePointPx: ballPoint ?? undefined },
    );
  }, [trackingResult, calibration, video, ballPoint]);

  // Identity of the estimate already recorded to history — guards against
  // double-adds when the effect re-runs for the same resolved estimate.
  const recordedEstimate = useRef<DistanceEstimateResult | null>(null);
  // The history id of THIS shot, so the club average excludes it.
  const [recordedShotId, setRecordedShotId] = useState<string | null>(null);

  useEffect(() => {
    if (!estimate) {
      return;
    }
    setDistance({
      carryYards: estimate.carryYards,
      totalYards: estimate.totalYards,
      apexFeet: estimate.apexFeet,
      ballSpeedMph: estimate.ballSpeedMph,
      launchAngleDeg: estimate.launchAngleDeg,
      confidence: estimate.confidence,
      method: estimate.method,
    });
    if (recordedEstimate.current === estimate) {
      return;
    }
    recordedEstimate.current = estimate;
    addShot({
      sport: 'golf',
      quality: trackingResult?.track.quality ?? 'failed',
      club,
      method: estimate.method,
      carryYards: estimate.carryYards,
      totalYards: estimate.totalYards,
      apexFeet: estimate.apexFeet,
      ballSpeedMph: estimate.ballSpeedMph,
      launchAngleDeg: estimate.launchAngleDeg,
      confidence: estimate.confidence,
    });
    setRecordedShotId(useHistoryStore.getState().shots[0]?.id ?? null);
  }, [estimate, setDistance, addShot, club, trackingResult]);

  // Averages across PRIOR shots with this club (the current shot and
  // club-prior guesses are excluded by clubAverages itself).
  const averages = useMemo(
    () => clubAverages(historyShots, club, recordedShotId ?? undefined),
    [historyShots, club, recordedShotId],
  );

  const handleNewShot = () => {
    reset();
    resetDraft();
    navigation.navigate('Home');
  };

  if (!estimate) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No shot to analyze"
          body={
            !trackingResult
              ? 'Track a shot first, then calibrate.'
              : 'Complete calibration first.'
          }
          actionLabel="Home"
          onAction={() => navigation.navigate('Home')}
        />
      </View>
    );
  }

  const meta = METHOD_META[estimate.method];
  const isFallback = estimate.method === 'club-prior';
  // Honest deltas only: enough prior history AND a real measurement — a
  // club-prior guess never wears a trend against its own prior (§8).
  const showDeltas = !isFallback && averages.count >= MIN_SHOTS_FOR_DELTA;

  return (
    <Animated.ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: spacing.md + insets.bottom }}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      )}
      scrollEventThrottle={16}
    >
      <View style={styles.badgeRow}>
        <Badge
          label={meta.label}
          tone={meta.tone}
          accessibilityLabel={`Estimation method: ${meta.label}`}
        />
      </View>
      {isFallback ? (
        <Text style={[typography.caption, styles.fallbackCaption]}>
          Estimate only — based on club averages
        </Text>
      ) : null}
      <Text style={[typography.label, styles.methodDescription]}>
        {meta.description}
      </Text>

      <Card variant="raised" scrollY={scrollY}>
        <View style={styles.statRow}>
          <HeroCarry carryYards={estimate.carryYards} approx={isFallback} />
          {showDeltas && averages.carryYards !== undefined ? (
            <View style={styles.trendSlot}>
              <TrendPill
                testID="results-carry-trend"
                delta={estimate.carryYards - averages.carryYards}
                unit="yd"
                format={formatYards}
                goodDirection="up"
                base={averages.carryYards}
              />
            </View>
          ) : null}
        </View>
        <View style={[styles.totalTile, styles.statRow]}>
          <StatTile
            size="standard"
            label="Total"
            value={String(Math.round(estimate.totalYards))}
            unit="yd"
            approx={isFallback}
          />
          {showDeltas && averages.totalYards !== undefined ? (
            <View style={styles.trendSlot}>
              <TrendPill
                testID="results-total-trend"
                delta={estimate.totalYards - averages.totalYards}
                unit="yd"
                format={formatYards}
                goodDirection="up"
                base={averages.totalYards}
              />
            </View>
          ) : null}
        </View>
        {showDeltas ? (
          <Text style={styles.deltaCaption}>
            vs your {clubLabelOf(club)} average ({averages.count} shots)
          </Text>
        ) : null}
        <ConfidenceMeter confidence={estimate.confidence} />
      </Card>

      <SectionLabel>Flight</SectionLabel>
      <View style={styles.chipRow}>
        {estimate.apexFeet !== undefined ? (
          <Chip label="Apex" value={`${Math.round(estimate.apexFeet)} ft`} />
        ) : null}
        {estimate.ballSpeedMph !== undefined ? (
          <Chip
            label="Ball speed"
            value={`${Math.round(estimate.ballSpeedMph)} mph`}
          />
        ) : null}
        {estimate.launchAngleDeg !== undefined ? (
          <Chip label="Launch" value={`${estimate.launchAngleDeg.toFixed(1)}°`} />
        ) : null}
        {estimate.backspinRpm !== undefined ? (
          <Chip label="Spin" value={`${Math.round(estimate.backspinRpm)} rpm`} />
        ) : null}
        {estimate.flightTimeS !== undefined ? (
          <Chip label="Flight" value={`${estimate.flightTimeS.toFixed(1)} s`} />
        ) : null}
      </View>

      <FitDetails estimate={estimate} />

      <Button
        label="New shot"
        variant="primary"
        onPress={handleNewShot}
        style={styles.cta}
      />
      <Button
        label="Home"
        variant="ghost"
        size="md"
        onPress={() => navigation.navigate('Home')}
        style={styles.homeAction}
      />
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  fallbackCaption: {
    color: colors.warning,
    marginBottom: spacing.xs,
  },
  methodDescription: {
    marginBottom: spacing.md,
  },
  totalTile: {
    marginTop: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  trendSlot: {
    marginLeft: spacing.sm,
    paddingBottom: spacing.xs,
  },
  deltaCaption: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  meter: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  fitDetails: {
    marginBottom: spacing.md,
  },
  fitDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  cta: {
    marginTop: spacing.sm,
  },
  homeAction: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
});
