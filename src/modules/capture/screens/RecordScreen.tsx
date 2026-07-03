/**
 * Record screen — camera preview via the CameraAdapter, fps badge, record
 * button. On stop, the clip is staged in the capture store and the flow
 * moves to Review.
 *
 * On device the adapter wraps react-native-vision-camera; in tests a
 * FakeCameraAdapter is injected via the `adapter` prop, so no native code
 * ever runs here on Linux.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
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
  'Mount the phone on a tripod about 6 paces behind the golfer.',
  'Frame sky-heavy: the ball flight needs room above the horizon.',
  'Keep HDR off — it corrupts the tracer.',
  'Keep recording for at least 8 seconds after impact.',
] as const;

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSelected(null);
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
          setError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (usingNativeCamera && !hasPermission) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={[typography.title, { marginBottom: spacing.sm }]}>
          Camera access needed
        </Text>
        <Text style={[typography.body, { marginBottom: spacing.md }]}>
          GolfTracer records your swing to trace the ball flight.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            void requestPermission();
          }}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Grant camera access</Text>
        </Pressable>
      </View>
    );
  }

  const fpsBadge =
    selected !== null ? `${selected.fps} fps · ${selected.height}p` : 'No format';
  const canRecord = activeAdapter !== null && selected !== null;

  return (
    <View style={sharedStyles.screen}>
      <View style={styles.preview}>
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
          <Text style={typography.subtitle}>
            {canRecord ? 'Camera preview' : 'No camera available'}
          </Text>
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{fpsBadge}</Text>
        </View>
      </View>

      {error !== null && (
        <Text style={[typography.body, { color: colors.danger, marginBottom: spacing.sm }]}>
          {error}
        </Text>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !canRecord }}
        disabled={!canRecord}
        onPress={() => {
          void toggleRecording();
        }}
        style={[
          sharedStyles.button,
          recording && styles.recordingButton,
          !canRecord && sharedStyles.buttonDisabled,
        ]}
      >
        <Text
          style={[sharedStyles.buttonText, !canRecord && sharedStyles.buttonTextDisabled]}
        >
          {recording ? 'Stop recording' : 'Start recording'}
        </Text>
      </Pressable>

      <View style={sharedStyles.card}>
        <Text style={[typography.label, { marginBottom: spacing.xs }]}>
          Capture tips
        </Text>
        {CAPTURE_TIPS.map((tip) => (
          <Text key={tip} style={[typography.body, { marginBottom: spacing.xs }]}>
            • {tip}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  recordingButton: {
    backgroundColor: colors.danger,
  },
});
