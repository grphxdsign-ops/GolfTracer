/**
 * Import screen — picks a video from the library via the MediaPickerAdapter,
 * validates it (duration, fps, rotation), and stages it for Review.
 *
 * Rotation metadata is carried into the VideoAsset untouched: losing it is a
 * classic export-orientation bug, so rotationDeg flows through the whole
 * pipeline.
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import type { FrameSource, VideoAsset } from '../../../types/media';
import type { MediaPickerAdapter } from '../../../adapters/media/MediaPickerAdapter';
import { ImagePickerAdapter } from '../../../adapters/media/ImagePickerAdapter';
import { NativeFrameSource } from '../../../adapters/frames/NativeFrameSource';
import { colors, spacing, typography } from '../../../app/theme';
import {
  Badge,
  Button,
  Card,
  ScreenHeader,
  SectionLabel,
  SegmentedControl,
} from '../../../app/components';
import { validateImportedVideo, type ValidationIssue } from '../logic/validation';
import { useCaptureStore } from '../logic/captureStore';

type ImportNavigation = NativeStackNavigationProp<RootStackParamList, 'Import'>;

export interface ImportScreenProps {
  /** Test/demo seam: replaces the native image-picker. */
  picker?: MediaPickerAdapter;
  /** How to expose decoded frames for the imported asset. */
  createFrameSource?: (asset: VideoAsset) => FrameSource;
}

/** Container fps assumed when the picker cannot report one. */
export const DEFAULT_IMPORT_FPS = 30;

/**
 * Photo-library pickers report container fps at best and never the sensor
 * rate of a slow-motion clip, so the user declares how the clip was filmed.
 * Picker-reported metadata, when present, still wins over this choice.
 */
export const SOURCE_RATES = [
  { label: 'Standard', recordedFps: undefined },
  { label: '120 fps slo-mo', recordedFps: 120 },
  { label: '240 fps slo-mo', recordedFps: 240 },
] as const;

const IMPORT_TIPS = [
  'Filmed from ~6 paces behind the golfer, sky-heavy framing.',
  '1.5–60 seconds long, 24 fps or higher, HDR off.',
  'Keeps rolling 8+ seconds after impact.',
] as const;

let importCounter = 0;

export function ImportScreen({ picker, createFrameSource }: ImportScreenProps) {
  const navigation = useNavigation<ImportNavigation>();
  const setPending = useCaptureStore((s) => s.setPending);

  const activePicker = useMemo<MediaPickerAdapter>(
    () => picker ?? new ImagePickerAdapter(),
    [picker],
  );

  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sourceRate, setSourceRate] = useState<number | undefined>(undefined);

  const selectedRateLabel = (
    SOURCE_RATES.find((rate) => rate.recordedFps === sourceRate) ?? SOURCE_RATES[0]
  ).label;

  const pick = async () => {
    setBusy(true);
    setIssues([]);
    setError(null);
    try {
      const result = await activePicker.pickVideo();
      if (result.status === 'cancelled') {
        return;
      }
      if (result.status === 'error') {
        setError(result.message);
        return;
      }
      const video = result.video;
      const fps = video.fps ?? DEFAULT_IMPORT_FPS;
      const recordedFps = video.recordedFps ?? sourceRate;
      const rotationDeg = video.rotationDeg ?? 0;
      const validation = validateImportedVideo({
        durationMs: video.durationMs,
        fps,
        rotationDeg,
        width: video.width,
        height: video.height,
      });
      if (!validation.ok) {
        setIssues(validation.issues);
        return;
      }
      importCounter += 1;
      const asset: VideoAsset = {
        id: `import-${importCounter}`,
        uri: video.uri,
        width: video.width,
        height: video.height,
        fps,
        recordedFps,
        durationMs: video.durationMs,
        rotationDeg: rotationDeg as VideoAsset['rotationDeg'],
        isSlowMotion: recordedFps !== undefined && recordedFps > fps,
        source: 'imported',
        createdAt: Date.now(),
      };
      const frameSource = createFrameSource?.(asset) ?? new NativeFrameSource(asset);
      setPending(asset, frameSource);
      navigation.navigate('Review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Import a swing video"
        subtitle="Slow-motion clips (120/240 fps) give the best tracer."
      />

      <SectionLabel style={styles.firstSection}>Recorded frame rate</SectionLabel>
      <SegmentedControl
        options={SOURCE_RATES.map((rate) => ({
          label: rate.label,
          value: rate.label,
        }))}
        value={selectedRateLabel}
        onChange={(value) =>
          setSourceRate(
            SOURCE_RATES.find((rate) => rate.label === value)?.recordedFps,
          )
        }
        testID="import-source-rate"
      />
      <Text style={styles.rateHint}>
        Photo libraries don&apos;t report slow-motion frame rates, so this keeps
        the ball tracking on the real time base.
      </Text>

      <Button
        label="Choose video"
        onPress={() => {
          void pick();
        }}
        loading={busy}
        loadingLabel="Opening library…"
        testID="import-choose-video"
        style={styles.chooseButton}
      />

      {error !== null && (
        <Card style={styles.feedbackCard} testID="import-error">
          <Badge label="Import failed" tone="danger" />
          <Text style={styles.errorMessage}>{error}</Text>
        </Card>
      )}

      {issues.length > 0 && (
        <Card padded={false} style={styles.feedbackCard} testID="import-issues">
          <Text style={styles.issuesTitle}>
            Why this video won&apos;t work
          </Text>
          {issues.map((issue) => (
            <View key={issue.code} style={styles.issueRow}>
              <Text style={styles.issueMessage}>{issue.message}</Text>
            </View>
          ))}
        </Card>
      )}

      <SectionLabel>What works best</SectionLabel>
      <Card padded={false}>
        {IMPORT_TIPS.map((tip, index) => (
          <View
            key={tip}
            style={[styles.tipRow, index > 0 && styles.tipRowDivider]}
          >
            <Text style={typography.body}>{tip}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  firstSection: {
    marginTop: 0,
  },
  rateHint: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  chooseButton: {
    marginTop: spacing.lg,
  },
  feedbackCard: {
    marginTop: spacing.md,
  },
  errorMessage: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.text,
    marginTop: spacing.sm,
  },
  issuesTitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  issueRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  issueMessage: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.text,
  },
  tipRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  tipRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
