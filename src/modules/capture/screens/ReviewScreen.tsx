/**
 * Review screen — scrubber and trim handles over the staged clip. All
 * review/trim state lives in the capture store (never component-local, so
 * edits are never lost on remount). 'Use this video' publishes the asset and
 * a trim-clamped FrameSource to the session store and moves to Analyze.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import type { FrameSource } from '../../../types/media';
import { TrimmedFrameSource } from '../../../adapters/frames/TrimmedFrameSource';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { effectiveSamplingRate } from '../logic/slowmo';
import { useCaptureStore } from '../logic/captureStore';

type ReviewNavigation = NativeStackNavigationProp<RootStackParamList, 'Review'>;

const NUDGE_MS = 500;

const fmtSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

interface NudgeButtonProps {
  label: string;
  onPress: () => void;
}

function NudgeButton({ label, onPress }: NudgeButtonProps) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.nudge}>
      <Text style={styles.nudgeText}>{label}</Text>
    </Pressable>
  );
}

export function ReviewScreen() {
  const navigation = useNavigation<ReviewNavigation>();
  const asset = useCaptureStore((s) => s.pendingVideo);
  const frameSource = useCaptureStore((s) => s.pendingFrameSource);
  const trim = useCaptureStore((s) => s.trim);
  const playheadMs = useCaptureStore((s) => s.playheadMs);
  const setTrim = useCaptureStore((s) => s.setTrim);
  const setPlayhead = useCaptureStore((s) => s.setPlayhead);
  const setVideo = useSessionStore((s) => s.setVideo);

  if (asset === null || frameSource === null || trim === null) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={[typography.title, { marginBottom: spacing.sm }]}>
          No clip to review
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Record')}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Record a swing</Text>
        </Pressable>
      </View>
    );
  }

  const confirm = () => {
    const coversWholeClip = trim.startMs <= 0 && trim.endMs >= asset.durationMs;
    const published: FrameSource = coversWholeClip
      ? frameSource
      : new TrimmedFrameSource(frameSource, trim);
    setVideo(asset, published);
    navigation.navigate('Analyze');
  };

  const trimFraction = (ms: number): number =>
    asset.durationMs > 0 ? ms / asset.durationMs : 0;

  return (
    <View style={sharedStyles.screen}>
      <View style={sharedStyles.card}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>Clip</Text>
        <Text style={typography.body}>
          {asset.width}×{asset.height} · {asset.fps} fps · {fmtSeconds(asset.durationMs)}
          {asset.rotationDeg !== 0 ? ` · rotated ${asset.rotationDeg}°` : ''}
        </Text>
        <Text style={typography.body}>
          Effective sampling: {effectiveSamplingRate(asset)} fps
          {asset.isSlowMotion ? ' (slow-motion)' : ''}
        </Text>
      </View>

      <View style={sharedStyles.card}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>
          Playhead {fmtSeconds(playheadMs)} / {fmtSeconds(asset.durationMs)}
        </Text>
        <View style={styles.track}>
          <View
            style={[
              styles.trimRegion,
              {
                left: `${trimFraction(trim.startMs) * 100}%`,
                width: `${(trimFraction(trim.endMs) - trimFraction(trim.startMs)) * 100}%`,
              },
            ]}
          />
          <View
            style={[styles.playhead, { left: `${trimFraction(playheadMs) * 100}%` }]}
          />
        </View>
        <View style={styles.nudgeRow}>
          <NudgeButton
            label="◀ 0.5s"
            onPress={() => setPlayhead(playheadMs - NUDGE_MS)}
          />
          <NudgeButton
            label="0.5s ▶"
            onPress={() => setPlayhead(playheadMs + NUDGE_MS)}
          />
        </View>
      </View>

      <View style={sharedStyles.card}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>
          Trim {fmtSeconds(trim.startMs)} – {fmtSeconds(trim.endMs)}
        </Text>
        <View style={styles.nudgeRow}>
          <NudgeButton
            label="Start −0.5s"
            onPress={() => setTrim({ ...trim, startMs: trim.startMs - NUDGE_MS })}
          />
          <NudgeButton
            label="Start +0.5s"
            onPress={() => setTrim({ ...trim, startMs: trim.startMs + NUDGE_MS })}
          />
          <NudgeButton
            label="End −0.5s"
            onPress={() => setTrim({ ...trim, endMs: trim.endMs - NUDGE_MS })}
          />
          <NudgeButton
            label="End +0.5s"
            onPress={() => setTrim({ ...trim, endMs: trim.endMs + NUDGE_MS })}
          />
        </View>
        <Text style={typography.label}>
          Keep at least 8 seconds after impact so the full flight is visible.
        </Text>
      </View>

      <Pressable accessibilityRole="button" onPress={confirm} style={sharedStyles.button}>
        <Text style={sharedStyles.buttonText}>Use this video</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 24,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  trimRegion: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.accent,
  },
  nudgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  nudge: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  nudgeText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
});
