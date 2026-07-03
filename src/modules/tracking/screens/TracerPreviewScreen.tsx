/**
 * Tracer preview: frame backdrop placeholder + the Skia tracer overlay, with
 * broadcast-style color/glow pickers, a timestamp-anchored replay animation,
 * and the handoff into distance estimation ('Calibration').
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import type { TracerPath } from '../../../types/tracking';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { TracerOverlay } from '../../../adapters/overlay/TracerOverlay';

type PreviewNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'TracerPreview'
>;

const COLOR_PRESETS = [
  { name: 'Red', color: '#FF3B1F', glowColor: 'rgba(255, 122, 41, 0.55)' },
  { name: 'Orange', color: '#FF8A00', glowColor: 'rgba(255, 170, 60, 0.55)' },
  { name: 'Yellow', color: '#FFD60A', glowColor: 'rgba(255, 220, 90, 0.5)' },
  { name: 'Cyan', color: '#3FD8FF', glowColor: 'rgba(110, 220, 255, 0.5)' },
  { name: 'White', color: '#FFFFFF', glowColor: 'rgba(255, 255, 255, 0.45)' },
] as const;

const GLOW_PRESETS = [
  { name: 'Subtle', glowWidth: 10 },
  { name: 'Bold', glowWidth: 18 },
  { name: 'Off', glowWidth: 0 },
] as const;

export function TracerPreviewScreen() {
  const navigation = useNavigation<PreviewNavigation>();
  const result = useSessionStore((s) => s.trackingResult);
  const video = useSessionStore((s) => s.video);

  const [colorIndex, setColorIndex] = useState(0);
  const [glowIndex, setGlowIndex] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [revealFraction, setRevealFraction] = useState(1);
  const rafRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafRef.current);
      }
    },
    [],
  );

  const tracer: TracerPath | null = useMemo(() => {
    if (!result) return null;
    const preset = COLOR_PRESETS[colorIndex] ?? COLOR_PRESETS[0];
    const glow = GLOW_PRESETS[glowIndex] ?? GLOW_PRESETS[0];
    return {
      ...result.tracer,
      style: {
        ...result.tracer.style,
        color: preset.color,
        glowColor: preset.glowColor,
        glowWidth: glow.glowWidth,
      },
    };
  }, [result, colorIndex, glowIndex]);

  const replay = useCallback(() => {
    if (!result || typeof requestAnimationFrame !== 'function') return;
    const points = result.tracer.points;
    if (points.length < 2) return;
    const flightMs =
      points[points.length - 1]!.timestampMs - points[0]!.timestampMs;
    // Slow-motion clips replay in real flight time; floor at 1.2s so short
    // paths are still readable.
    const durationMs = Math.max(1200, flightMs);
    const start = Date.now();
    if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
    }
    const tick = () => {
      const f = Math.min(1, (Date.now() - start) / durationMs);
      setRevealFraction(f);
      if (f < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    setRevealFraction(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [result]);

  if (!result || !tracer) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>No tracer yet</Text>
        <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
          Run the analysis first to see your ball flight.
        </Text>
      </View>
    );
  }

  const videoWidth = video?.width ?? result.track.frameWidth;
  const videoHeight = video?.height ?? result.track.frameHeight;
  const rotationDeg = video?.rotationDeg ?? 0;

  return (
    <View style={sharedStyles.screen}>
      <View
        testID="tracer-stage"
        onLayout={(e) =>
          setStageSize({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }
        style={{
          flex: 1,
          backgroundColor: '#08130C',
          borderRadius: radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={typography.label}>Video frame preview</Text>
        <Text style={[typography.label, { color: colors.textDisabled }]}>
          quality: {result.track.quality}
        </Text>
        {stageSize.width > 0 && stageSize.height > 0 ? (
          <TracerOverlay
            tracer={tracer}
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            rotationDeg={rotationDeg}
            viewWidth={stageSize.width}
            viewHeight={stageSize.height}
            revealFraction={revealFraction}
          />
        ) : null}
      </View>

      <Text style={[typography.label, { marginBottom: spacing.xs }]}>
        Tracer color
      </Text>
      <View style={{ flexDirection: 'row', marginBottom: spacing.sm }}>
        {COLOR_PRESETS.map((preset, i) => (
          <Pressable
            key={preset.name}
            accessibilityRole="button"
            accessibilityLabel={`Tracer color ${preset.name}`}
            accessibilityState={{ selected: i === colorIndex }}
            onPress={() => setColorIndex(i)}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              marginRight: spacing.sm,
              backgroundColor: preset.color,
              borderWidth: i === colorIndex ? 3 : 1,
              borderColor: i === colorIndex ? colors.accent : colors.border,
            }}
          />
        ))}
      </View>

      <Text style={[typography.label, { marginBottom: spacing.xs }]}>Glow</Text>
      <View style={{ flexDirection: 'row', marginBottom: spacing.md }}>
        {GLOW_PRESETS.map((preset, i) => (
          <Pressable
            key={preset.name}
            accessibilityRole="button"
            accessibilityState={{ selected: i === glowIndex }}
            onPress={() => setGlowIndex(i)}
            style={{
              paddingVertical: spacing.xs,
              paddingHorizontal: spacing.md,
              marginRight: spacing.sm,
              borderRadius: radii.sm,
              backgroundColor:
                i === glowIndex ? colors.primary : colors.surfaceRaised,
            }}
          >
            <Text style={sharedStyles.buttonText}>{preset.name}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={replay}
        style={[sharedStyles.button, { backgroundColor: colors.surfaceRaised }]}
      >
        <Text style={sharedStyles.buttonText}>Replay tracer</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Calibration')}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>Estimate distance</Text>
      </Pressable>
    </View>
  );
}
