/**
 * Import screen — picks a video from the library via the MediaPickerAdapter,
 * validates it (duration, fps, rotation), and stages it for Review.
 *
 * Rotation metadata is carried into the VideoAsset untouched: losing it is a
 * classic export-orientation bug, so rotationDeg flows through the whole
 * pipeline.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import type { FrameSource, VideoAsset } from '../../../types/media';
import type { MediaPickerAdapter } from '../../../adapters/media/MediaPickerAdapter';
import { ImagePickerAdapter } from '../../../adapters/media/ImagePickerAdapter';
import { NativeFrameSource } from '../../../adapters/frames/NativeFrameSource';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
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
    <View style={sharedStyles.screen}>
      <Text style={[typography.title, { marginBottom: spacing.xs }]}>
        Import a swing video
      </Text>
      <Text style={[typography.subtitle, { marginBottom: spacing.lg }]}>
        Slow-motion clips (120/240 fps) give the best tracer.
      </Text>

      <View style={[sharedStyles.card, { marginBottom: spacing.lg }]}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>
          How was the clip filmed?
        </Text>
        <View style={styles.segmentRow}>
          {SOURCE_RATES.map((rate) => {
            const selected = rate.recordedFps === sourceRate;
            return (
              <Pressable
                key={rate.label}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSourceRate(rate.recordedFps)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text
                  style={[styles.segmentText, selected && styles.segmentTextSelected]}
                >
                  {rate.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[typography.label, { marginTop: spacing.sm }]}>
          Photo libraries don&apos;t report slow-motion frame rates, so this
          keeps the ball tracking on the real time base.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={() => {
          void pick();
        }}
        style={[sharedStyles.button, busy && sharedStyles.buttonDisabled]}
      >
        <Text
          style={[sharedStyles.buttonText, busy && sharedStyles.buttonTextDisabled]}
        >
          {busy ? 'Opening library…' : 'Choose video'}
        </Text>
      </Pressable>

      {error !== null && (
        <View style={sharedStyles.card}>
          <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
        </View>
      )}

      {issues.length > 0 && (
        <View style={sharedStyles.card}>
          <Text style={[typography.label, { marginBottom: spacing.xs }]}>
            This video can&apos;t be analyzed
          </Text>
          {issues.map((issue) => (
            <Text
              key={issue.code}
              style={[typography.body, { color: colors.danger, marginBottom: spacing.xs }]}
            >
              • {issue.message}
            </Text>
          ))}
        </View>
      )}

      <View style={sharedStyles.card}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>
          What works best
        </Text>
        <Text style={[typography.body, { marginBottom: spacing.xs }]}>
          • Filmed from ~6 paces behind the golfer, sky-heavy framing.
        </Text>
        <Text style={[typography.body, { marginBottom: spacing.xs }]}>
          • 1.5–60 seconds long, 24 fps or higher, HDR off.
        </Text>
        <Text style={typography.body}>
          • Keeps rolling 8+ seconds after impact.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: colors.text,
  },
});
