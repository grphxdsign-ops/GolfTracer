/**
 * Review screen — scrubber and trim handles over the staged clip. All
 * review/trim state lives in the capture store (never component-local, so
 * edits are never lost on remount). 'Use this video' publishes the asset and
 * a trim-clamped FrameSource to the session store and moves to Analyze.
 *
 * The scrub track and nudges carry ZERO animation on purpose: scrubbing
 * must feel 1:1 (DESIGN.md §5).
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../types/navigation';
import type { FrameSource } from '../../../types/media';
import { TrimmedFrameSource } from '../../../adapters/frames/TrimmedFrameSource';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, spacing, typography } from '../../../app/theme';
import {
  Button,
  Card,
  EmptyState,
  SectionLabel,
  StatTile,
} from '../../../app/components';
import { effectiveSamplingRate } from '../logic/slowmo';
import { useCaptureStore } from '../logic/captureStore';

type ReviewNavigation = NativeStackNavigationProp<RootStackParamList, 'Review'>;

const NUDGE_MS = 500;

const fmtSeconds = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

export function ReviewScreen() {
  const navigation = useNavigation<ReviewNavigation>();
  const insets = useSafeAreaInsets();
  const asset = useCaptureStore((s) => s.pendingVideo);
  const frameSource = useCaptureStore((s) => s.pendingFrameSource);
  const trim = useCaptureStore((s) => s.trim);
  const playheadMs = useCaptureStore((s) => s.playheadMs);
  const setTrim = useCaptureStore((s) => s.setTrim);
  const setPlayhead = useCaptureStore((s) => s.setPlayhead);
  const setVideo = useSessionStore((s) => s.setVideo);

  if (asset === null || frameSource === null || trim === null) {
    return (
      <View style={styles.emptyScreen}>
        <EmptyState
          title="No clip to review"
          body="Record a swing or import a video to review and trim it here."
          actionLabel="Record a swing"
          onAction={() => navigation.navigate('Record')}
        />
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

  const samplingFps = effectiveSamplingRate(asset);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        <Card>
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <StatTile
                value={(asset.durationMs / 1000).toFixed(1)}
                unit="s"
                label="Duration"
                testID="review-duration"
              />
            </View>
            <View style={styles.statCell}>
              <StatTile
                value={String(samplingFps)}
                unit="fps"
                label="Effective rate"
                testID="review-fps"
              />
            </View>
          </View>
          <Text style={styles.clipCaption}>
            {asset.width}×{asset.height}
            {asset.rotationDeg !== 0 ? ` · rotated ${asset.rotationDeg}°` : ''}
            {` · sampled at ${samplingFps} fps`}
            {asset.isSlowMotion ? ' (slow-motion)' : ''}
          </Text>
        </Card>

        <SectionLabel>Playhead</SectionLabel>
        <Card>
          <Text style={styles.playheadReadout}>
            {fmtSeconds(playheadMs)} / {fmtSeconds(asset.durationMs)}
          </Text>
          <View style={styles.trackWrap}>
            <View style={styles.track}>
              <View
                style={[
                  styles.trimRegion,
                  {
                    left: `${trimFraction(trim.startMs) * 100}%`,
                    width: `${
                      (trimFraction(trim.endMs) - trimFraction(trim.startMs)) * 100
                    }%`,
                  },
                ]}
              >
                <View style={[styles.trimHandle, styles.trimHandleStart]} />
                <View style={[styles.trimHandle, styles.trimHandleEnd]} />
              </View>
            </View>
            <View
              style={[
                styles.playhead,
                { left: `${trimFraction(playheadMs) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.nudgeRow}>
            <Button
              label="◀ 0.5s"
              variant="ghost"
              size="md"
              onPress={() => setPlayhead(playheadMs - NUDGE_MS)}
            />
            <Button
              label="0.5s ▶"
              variant="ghost"
              size="md"
              onPress={() => setPlayhead(playheadMs + NUDGE_MS)}
            />
          </View>
        </Card>

        <SectionLabel>Trim</SectionLabel>
        <Card>
          <Text style={styles.trimReadout}>
            Trim {fmtSeconds(trim.startMs)} – {fmtSeconds(trim.endMs)}
          </Text>
          <View style={styles.trimButtonRow}>
            <Button
              label="Start −0.5s"
              variant="secondary"
              size="md"
              onPress={() => setTrim({ ...trim, startMs: trim.startMs - NUDGE_MS })}
              style={styles.trimButton}
            />
            <Button
              label="Start +0.5s"
              variant="secondary"
              size="md"
              onPress={() => setTrim({ ...trim, startMs: trim.startMs + NUDGE_MS })}
              style={styles.trimButton}
            />
          </View>
          <View style={styles.trimButtonRow}>
            <Button
              label="End −0.5s"
              variant="secondary"
              size="md"
              onPress={() => setTrim({ ...trim, endMs: trim.endMs - NUDGE_MS })}
              style={styles.trimButton}
            />
            <Button
              label="End +0.5s"
              variant="secondary"
              size="md"
              onPress={() => setTrim({ ...trim, endMs: trim.endMs + NUDGE_MS })}
              style={styles.trimButton}
            />
          </View>
          <Text style={typography.caption}>
            Keep at least 8 seconds after impact so the full flight is visible.
          </Text>
        </Card>
      </ScrollView>

      <View
        style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}
      >
        <Button label="Use this video" onPress={confirm} />
      </View>
    </View>
  );
}

const TRACK_HEIGHT = 8;
const PLAYHEAD_OVERHANG = 4;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  emptyScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  statRow: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
  },
  clipCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  playheadReadout: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.sm,
  },
  trackWrap: {
    height: TRACK_HEIGHT + PLAYHEAD_OVERHANG * 2,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  track: {
    height: TRACK_HEIGHT,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  trimRegion: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(74,201,126,0.28)',
  },
  trimHandle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.primary,
  },
  trimHandleStart: {
    left: 0,
  },
  trimHandleEnd: {
    right: 0,
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.text,
  },
  nudgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trimReadout: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.sm,
  },
  trimButtonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  trimButton: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
});
