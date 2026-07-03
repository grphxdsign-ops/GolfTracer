/**
 * Results screen: runs the distance estimator against the tracked shot and
 * calibration, and presents carry/total with an honest method badge and
 * confidence meter. A low-confidence club-prior fallback is visually
 * distinct — we never dress a guess up as a measurement.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { EstimationMethod, RootStackParamList } from '../../../types';
import { useSessionStore } from '../../../state/sessionStore';
import { useBallPointStore } from '../../tracking/screens/ballPointStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import {
  estimateDistance,
  type DistanceEstimateResult,
} from '../estimate/estimateDistance';
import { summarizeEstimate } from '../estimate/diagnostics';
import { useDistanceStore } from '../distanceStore';

type ResultsNavigation = NativeStackNavigationProp<RootStackParamList, 'Results'>;

const METHOD_META: Record<
  EstimationMethod,
  { label: string; description: string; color: string }
> = {
  homography: {
    label: 'Measured',
    description: 'Landing point measured from your ground reference points.',
    color: colors.success,
  },
  'physics-fit': {
    label: 'Physics fit',
    description: 'Ball flight model fitted to the tracked trajectory.',
    color: colors.primary,
  },
  'club-prior': {
    label: 'Club average',
    description:
      'Not enough tracking data — this is a typical distance for your club, not a measurement of this shot.',
    color: colors.danger,
  },
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={typography.label}>{label}</Text>
    </View>
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
 * grid reports, so the app surfaces exactly what was validated.
 */
function FitDetails({ estimate }: { estimate: DistanceEstimateResult }) {
  const [expanded, setExpanded] = useState(false);
  if (!estimate.dtlFit) {
    return null;
  }
  const d = summarizeEstimate(estimate);
  return (
    <View style={styles.fitDetails}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Toggle fit details"
        onPress={() => setExpanded((v) => !v)}
        style={styles.fitDetailsHeader}
      >
        <Text style={styles.fitDetailsTitle}>Fit details</Text>
        <Text style={styles.fitDetailsTitle}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? (
        <View>
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
        </View>
      ) : null}
    </View>
  );
}

function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const barColor =
    confidence >= 0.6
      ? colors.success
      : confidence >= 0.35
        ? colors.accent
        : colors.danger;
  return (
    <View style={{ marginTop: spacing.sm }}>
      <View style={styles.meterTrack}>
        <View
          accessibilityLabel={`Confidence ${pct} percent`}
          style={[
            styles.meterFill,
            { width: `${pct}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <Text style={[typography.label, { marginTop: spacing.xs }]}>
        Confidence {pct}%
      </Text>
    </View>
  );
}

export function ResultsScreen() {
  const navigation = useNavigation<ResultsNavigation>();
  const trackingResult = useSessionStore((s) => s.trackingResult);
  const calibration = useSessionStore((s) => s.calibration);
  const video = useSessionStore((s) => s.video);
  const setDistance = useSessionStore((s) => s.setDistance);
  const reset = useSessionStore((s) => s.reset);
  const resetDraft = useDistanceStore((s) => s.resetDraft);
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

  useEffect(() => {
    if (estimate) {
      setDistance({
        carryYards: estimate.carryYards,
        totalYards: estimate.totalYards,
        apexFeet: estimate.apexFeet,
        ballSpeedMph: estimate.ballSpeedMph,
        launchAngleDeg: estimate.launchAngleDeg,
        confidence: estimate.confidence,
        method: estimate.method,
      });
    }
  }, [estimate, setDistance]);

  const handleNewShot = () => {
    reset();
    resetDraft();
    navigation.navigate('Home');
  };

  if (!estimate) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>No shot to analyze</Text>
        <Text style={[typography.subtitle, { marginBottom: spacing.lg }]}>
          {!trackingResult
            ? 'Track a shot first, then calibrate.'
            : 'Complete calibration first.'}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Home')}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Home</Text>
        </Pressable>
      </View>
    );
  }

  const meta = METHOD_META[estimate.method];
  const isFallback = estimate.method === 'club-prior';

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <View
        accessibilityLabel={`Estimation method: ${meta.label}`}
        style={[styles.badge, { borderColor: meta.color }]}
      >
        <Text style={[styles.badgeText, { color: meta.color }]}>
          {meta.label}
        </Text>
      </View>
      <Text style={[typography.label, { marginBottom: spacing.md }]}>
        {meta.description}
      </Text>

      <View style={[sharedStyles.card, isFallback && styles.fallbackCard]}>
        <Text style={styles.heroValue}>
          {Math.round(estimate.carryYards)}
          <Text style={styles.heroUnit}> yds carry</Text>
        </Text>
        <Text style={styles.totalValue}>
          {Math.round(estimate.totalYards)} yds total
        </Text>
        {isFallback ? (
          <Text style={[typography.label, { color: colors.danger }]}>
            Estimate only — based on club averages
          </Text>
        ) : null}
        <ConfidenceMeter confidence={estimate.confidence} />
      </View>

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
          <Chip
            label="Launch"
            value={`${estimate.launchAngleDeg.toFixed(1)}°`}
          />
        ) : null}
        {estimate.backspinRpm !== undefined ? (
          <Chip
            label="Spin"
            value={`${Math.round(estimate.backspinRpm)} rpm`}
          />
        ) : null}
        {estimate.flightTimeS !== undefined ? (
          <Chip label="Flight" value={`${estimate.flightTimeS.toFixed(1)} s`} />
        ) : null}
      </View>

      <FitDetails estimate={estimate} />

      <Pressable
        accessibilityRole="button"
        onPress={handleNewShot}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>New shot</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Home')}
        style={[sharedStyles.button, styles.secondaryButton]}
      >
        <Text style={sharedStyles.buttonText}>Home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  fallbackCard: {
    borderColor: colors.danger,
    borderStyle: 'dashed',
  },
  heroValue: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.text,
  },
  heroUnit: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textMuted,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 92,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
  },
  meterFill: {
    height: 8,
    borderRadius: 4,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceRaised,
  },
  fitDetails: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  fitDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fitDetailsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
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
  },
});
