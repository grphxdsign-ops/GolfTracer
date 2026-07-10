/**
 * Record screen — camera preview via the CameraAdapter, fps badge, circular
 * record control. On stop, the clip is staged in the capture store and the
 * flow moves to Review.
 *
 * On device the adapter wraps react-native-vision-camera; in tests a
 * FakeCameraAdapter is injected via the `adapter` prop, so no native code
 * ever runs here on Linux.
 *
 * The circular record control is deliberately screen-local: the kit Button
 * is a pill CTA and cannot express the 72pt circle → rounded-square morph
 * (DESIGN.md §5: recording state = shape/color swap, no pulsing loop).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from 'react-native-vision-camera';

import type { RootStackParamList } from '../../../types/navigation';
import type { FrameSource, VideoAsset } from '../../../types/media';
import type { CameraAdapter } from '../../../adapters/camera/CameraAdapter';
import { VisionCameraAdapter } from '../../../adapters/camera/VisionCameraAdapter';
import { NativeFrameSource } from '../../../adapters/frames/NativeFrameSource';
import { alpha, colors, motion, radii, spacing, typography } from '../../../app/theme';
import {
  Badge,
  Card,
  EmptyState,
  SectionLabel,
  useReducedMotion,
} from '../../../app/components';

/**
 * Framed, blame-free capture error (DESIGN.md §1: never a bare exception —
 * name the cause, give a next step). The raw adapter message is kept only as
 * secondary detail below the human copy.
 */
interface CaptureError {
  /** Short cause, shown as a danger badge. */
  title: string;
  /** Blame-free explanation ending in an explicit next step. */
  body: string;
  /** Raw adapter message, surfaced as muted secondary detail. */
  detail: string;
}

const errorDetail = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);
import {
  DEFAULT_CAPTURE_PREFERENCE,
  selectCaptureFormat,
  type SelectedCaptureFormat,
} from '../logic/formatSelection';
import { useCaptureStore } from '../logic/captureStore';

type RecordNavigation = NativeStackNavigationProp<RootStackParamList, 'Record'>;

export interface RecordScreenProps {
  /** Test/demo seam: bypasses the native vision-camera path. */
  adapter?: CameraAdapter;
  /** How to expose decoded frames for the recorded asset. */
  createFrameSource?: (asset: VideoAsset) => FrameSource;
}

const CAPTURE_TIPS = [
  'Tripod about 6 paces behind the golfer.',
  'Frame sky-heavy — ball flight needs room above the horizon.',
  'Keep HDR off — it corrupts the tracer.',
  'Keep recording for at least 8 seconds after impact.',
] as const;

/** Idle inner circle: 56pt. Recording: 28pt rounded-square (radius 8). */
const INNER_IDLE = 56;
const INNER_RECORDING = 28;
const RECORDING_SCALE = INNER_RECORDING / INNER_IDLE;
// The inner view is scaled down while recording, so the authored radius is
// divided by the scale to land on a visual 8pt corner.
const RECORDING_RADIUS = 8 / RECORDING_SCALE;

interface RecordControlProps {
  recording: boolean;
  disabled: boolean;
  onPress: () => void;
}

/**
 * Screen-local 72pt circular record control. Idle: white ring around a
 * primary-green 56pt circle. Recording: the inner shape morphs (150ms,
 * scale native-driven; radius/color JS-driven on a nested node) into a
 * 28pt danger rounded-square. Reduce-motion swaps instantly. No pulsing.
 */
function RecordControl({ recording, disabled, onPress }: RecordControlProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(recording ? 1 : 0)).current;
  const scale = useRef(new Animated.Value(recording ? RECORDING_SCALE : 1)).current;

  useEffect(() => {
    const shapeTarget = recording ? 1 : 0;
    const scaleTarget = recording ? RECORDING_SCALE : 1;
    if (reducedMotion) {
      progress.setValue(shapeTarget);
      scale.setValue(scaleTarget);
      return;
    }
    Animated.parallel([
      // Radius + fill color cannot ride the native driver.
      Animated.timing(progress, {
        toValue: shapeTarget,
        duration: motion.duration.fast,
        easing: motion.easing.standard,
        useNativeDriver: false,
      }),
      Animated.timing(scale, {
        toValue: scaleTarget,
        duration: motion.duration.fast,
        easing: motion.easing.standard,
        useNativeDriver: true,
      }),
    ]).start();
  }, [recording, reducedMotion, progress, scale]);

  const borderRadius = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [INNER_IDLE / 2, RECORDING_RADIUS],
  });
  const backgroundColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.primary, colors.danger],
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.recordRing, disabled && styles.recordRingDisabled]}
      testID="record-control"
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={[styles.recordInner, { borderRadius, backgroundColor }]}
        />
      </Animated.View>
    </Pressable>
  );
}

export function RecordScreen({ adapter, createFrameSource }: RecordScreenProps) {
  const navigation = useNavigation<RecordNavigation>();
  const setPending = useCaptureStore((s) => s.setPending);

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<Camera>(null);

  const activeAdapter = useMemo<CameraAdapter | null>(() => {
    if (adapter !== undefined) {
      return adapter;
    }
    if (device !== undefined) {
      return new VisionCameraAdapter(device, () => cameraRef.current);
    }
    return null;
  }, [adapter, device]);

  const [selected, setSelected] = useState<SelectedCaptureFormat | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<CaptureError | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSelected(null);
    setError(null);
    if (activeAdapter === null) {
      return;
    }
    activeAdapter
      .getCapabilities()
      .then((caps) => {
        if (!cancelled) {
          setSelected(selectCaptureFormat(caps, DEFAULT_CAPTURE_PREFERENCE));
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError({
            title: 'Camera check failed',
            body: "Couldn't read this camera's recording formats. Close any other app using the camera, then reopen this screen.",
            detail: errorDetail(e),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeAdapter]);

  // Native format for the preview, derived from the same pure selection.
  const nativeFormat = useCameraFormat(
    device,
    selected !== null
      ? [
          { fps: selected.fps },
          { videoResolution: { width: selected.width, height: selected.height } },
        ]
      : [],
  );

  const usingNativeCamera = adapter === undefined;

  const toggleRecording = async () => {
    if (activeAdapter === null || selected === null) {
      return;
    }
    setError(null);
    try {
      if (!recording) {
        await activeAdapter.startRecording({
          fps: selected.fps,
          width: selected.width,
          height: selected.height,
          enableHdr: false,
          fileType: 'mp4',
        });
        setRecording(true);
      } else {
        const asset = await activeAdapter.stopRecording();
        setRecording(false);
        const frameSource =
          createFrameSource?.(asset) ?? new NativeFrameSource(asset);
        setPending(asset, frameSource);
        navigation.navigate('Review');
      }
    } catch (e: unknown) {
      setRecording(false);
      setError(
        recording
          ? {
              title: "Recording couldn't be saved",
              body: 'The clip may not have finished writing. Free up some storage, then record the swing again.',
              detail: errorDetail(e),
            }
          : {
              title: "Recording couldn't start",
              body: "Check that another app isn't using the camera, then tap record again.",
              detail: errorDetail(e),
            },
      );
    }
  };

  if (usingNativeCamera && !hasPermission) {
    return (
      <View style={styles.permissionScreen}>
        <EmptyState
          title="Camera access needed"
          body="GolfTracer records your swing to trace the ball flight. Grant camera access to record — nothing is uploaded without you."
          actionLabel="Grant camera access"
          onAction={() => {
            void requestPermission();
          }}
        />
      </View>
    );
  }

  const fpsBadge =
    selected !== null ? `${selected.fps} fps · ${selected.height}p` : 'No format';
  const canRecord = activeAdapter !== null && selected !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.stage}>
        {usingNativeCamera && device !== undefined ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            format={nativeFormat}
            fps={selected?.fps}
            video={true}
            videoHdr={false}
            isActive={true}
          />
        ) : (
          <Text style={styles.stageFallback}>
            {canRecord ? 'Camera preview' : 'No camera available'}
          </Text>
        )}
        <View style={styles.fpsBadge}>
          <Badge label={fpsBadge} tone="neutral" testID="record-fps-badge" />
        </View>
      </View>

      {error !== null && (
        <Card style={styles.errorCard} testID="record-error">
          <Badge label={error.title} tone="danger" />
          <Text style={styles.errorBody}>{error.body}</Text>
          <Text style={styles.errorDetail}>{error.detail}</Text>
        </Card>
      )}

      <View style={styles.controlBlock}>
        <RecordControl
          recording={recording}
          disabled={!canRecord}
          onPress={() => {
            void toggleRecording();
          }}
        />
        <Text style={styles.controlCaption}>
          {recording ? 'Stop recording' : 'Start recording'}
        </Text>
      </View>

      <SectionLabel>Before you record</SectionLabel>
      <Card padded={false}>
        {CAPTURE_TIPS.map((tip, index) => (
          <View
            key={tip}
            style={[styles.tipRow, index > 0 && styles.tipRowDivider]}
          >
            <Text style={typography.body}>{tip}</Text>
          </View>
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  permissionScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  stage: {
    flex: 1,
    backgroundColor: colors.stage,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  stageFallback: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textMuted,
  },
  fpsBadge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  errorCard: {
    marginTop: spacing.sm,
  },
  errorBody: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.text,
    marginTop: spacing.sm,
  },
  errorDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  controlBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  recordRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    // Warm near-white, not a border token: the ring must read at full
    // strength over the live camera preview on any background.
    borderColor: alpha('#FFFBF2', 0.9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRingDisabled: {
    opacity: 0.4,
  },
  recordInner: {
    width: INNER_IDLE,
    height: INNER_IDLE,
  },
  controlCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.sm,
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
