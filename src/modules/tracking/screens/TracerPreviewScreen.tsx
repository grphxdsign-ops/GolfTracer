/**
 * Tracer preview: the broadcast-comet stage. Frame backdrop placeholder + the
 * Skia tracer overlay with color/glow pickers, a timestamp-anchored reveal
 * that auto-plays on mount (and on replay), a one-shot landing ring when the
 * reveal completes, and the handoff into distance estimation ('Calibration').
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../types/navigation';
import type { TracerPath } from '../../../types/tracking';
import { useSessionStore } from '../../../state/sessionStore';
import {
  colors,
  motion,
  radii,
  sharedStyles,
  spacing,
  typography,
} from '../../../app/theme';
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  SectionLabel,
  useReducedMotion,
} from '../../../app/components';
import { TracerOverlay } from '../../../adapters/overlay/TracerOverlay';
import {
  computeLetterbox,
  videoToView,
  type RotationDeg,
} from '../../../adapters/overlay/overlayMath';

type PreviewNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'TracerPreview'
>;

/**
 * Tracer color presets — refreshed to sit alongside the theme's `tracer`
 * ember tokens (docs/DESIGN.md §6). Names are pinned by tests; Orange is the
 * default and lands on the ember palette in DESIGN.md §2.
 */
const COLOR_PRESETS = [
  { name: 'Red', color: '#FF4D00', glowColor: 'rgba(255, 77, 0, 0.35)' },
  { name: 'Orange', color: '#FF9E2C', glowColor: 'rgba(255, 122, 26, 0.35)' },
  { name: 'Yellow', color: '#FFD60A', glowColor: 'rgba(255, 214, 10, 0.32)' },
  { name: 'Cyan', color: '#3FD8FF', glowColor: 'rgba(63, 216, 255, 0.32)' },
  { name: 'White', color: '#F2F7F3', glowColor: 'rgba(242, 247, 243, 0.30)' },
] as const;

/** Orange is the default preset (DESIGN.md §6). */
const DEFAULT_COLOR_INDEX = 1;

const GLOW_PRESETS = [
  { name: 'Subtle', glowWidth: 10 },
  { name: 'Bold', glowWidth: 18 },
  { name: 'Off', glowWidth: 0 },
] as const;

const QUALITY_META: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'neutral' }
> = {
  high: { label: 'High quality', tone: 'success' },
  medium: { label: 'Medium quality', tone: 'warning' },
  low: { label: 'Low quality', tone: 'neutral' },
};

/** Reveal duration: motion token clamped to the §5 baseline window. */
const REVEAL_MS = Math.min(900, Math.max(600, motion.duration.reveal));

const SWATCH_SIZE = 36;
const LANDING_RING_SIZE = 44;

export function TracerPreviewScreen() {
  const navigation = useNavigation<PreviewNavigation>();
  const insets = useSafeAreaInsets();
  const result = useSessionStore((s) => s.trackingResult);
  const video = useSessionStore((s) => s.video);
  const reducedMotion = useReducedMotion();

  const [colorIndex, setColorIndex] = useState(DEFAULT_COLOR_INDEX);
  const [glowIndex, setGlowIndex] = useState(0);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [revealFraction, setRevealFraction] = useState(1);
  const [landing, setLanding] = useState(false);
  const rafRef = useRef<number | null>(null);
  const ringAnim = useRef(new Animated.Value(0)).current;

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
    const preset = COLOR_PRESETS[colorIndex] ?? COLOR_PRESETS[DEFAULT_COLOR_INDEX];
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

  /** One expanding ring at the landing point when the reveal completes. */
  const playLandingMoment = useCallback(() => {
    if (reducedMotion) return;
    setLanding(true);
    ringAnim.setValue(0);
    Animated.timing(ringAnim, {
      toValue: 1,
      duration: 500,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setLanding(false);
    });
  }, [reducedMotion, ringAnim]);

  const replay = useCallback(() => {
    if (!result) return;
    const points = result.tracer.points;
    if (points.length < 2) return;
    if (reducedMotion || typeof requestAnimationFrame !== 'function') {
      // Reduce-motion: jump straight to the fully drawn tracer.
      setRevealFraction(1);
      return;
    }
    const start = Date.now();
    if (rafRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafRef.current);
    }
    const tick = () => {
      const f = Math.min(1, (Date.now() - start) / REVEAL_MS);
      setRevealFraction(f);
      if (f < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        playLandingMoment();
      }
    };
    setRevealFraction(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [result, reducedMotion, playLandingMoment]);

  // Auto-play the reveal once on mount (and again whenever a new result
  // arrives) — the tracer is the star; it should never sit pre-drawn.
  useEffect(() => {
    replay();
  }, [replay]);

  if (!result || !tracer) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No tracer yet"
          body="Run the analysis first to see your ball flight."
        />
      </View>
    );
  }

  const videoWidth = video?.width ?? result.track.frameWidth;
  const videoHeight = video?.height ?? result.track.frameHeight;
  const rotationDeg: RotationDeg = video?.rotationDeg ?? 0;
  const quality = QUALITY_META[result.track.quality] ?? {
    label: 'Low quality',
    tone: 'neutral' as const,
  };

  const lastPoint = result.tracer.points[result.tracer.points.length - 1];
  const landingPoint =
    landing && lastPoint && stageSize.width > 0 && stageSize.height > 0
      ? videoToView(
          lastPoint,
          computeLetterbox(
            videoWidth,
            videoHeight,
            rotationDeg,
            stageSize.width,
            stageSize.height,
          ),
        )
      : null;

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
        style={styles.stage}
      >
        <Text style={typography.caption}>Video frame preview</Text>
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
        {landingPoint ? (
          <Animated.View
            pointerEvents="none"
            testID="landing-ring"
            style={[
              styles.landingRing,
              {
                left: landingPoint.x - LANDING_RING_SIZE / 2,
                top: landingPoint.y - LANDING_RING_SIZE / 2,
                borderColor: tracer.style.color,
                opacity: ringAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.8, 0],
                }),
                transform: [{ scale: ringAnim }],
              },
            ]}
          />
        ) : null}
        {/* Broadcast-style status chip: rides IN the stage (DESIGN.md §8). */}
        <View pointerEvents="none" style={styles.qualityChip}>
          <Badge label={quality.label} tone={quality.tone} />
        </View>
      </View>

      <SectionLabel>Tracer color</SectionLabel>
      <View style={styles.swatchRow}>
        {COLOR_PRESETS.map((preset, i) => {
          const selected = i === colorIndex;
          return (
            <Pressable
              key={preset.name}
              accessibilityRole="button"
              accessibilityLabel={`Tracer color ${preset.name}`}
              accessibilityState={{ selected }}
              onPress={() => setColorIndex(i)}
              style={[styles.swatchRing, selected && styles.swatchRingSelected]}
            >
              <View
                style={[styles.swatch, { backgroundColor: preset.color }]}
              />
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>Glow</SectionLabel>
      <View style={styles.glowRow}>
        {GLOW_PRESETS.map((preset, i) => (
          <Chip
            key={preset.name}
            label={preset.name}
            selected={i === glowIndex}
            onPress={() => setGlowIndex(i)}
          />
        ))}
      </View>

      <Button
        label="Replay tracer"
        variant="ghost"
        size="md"
        onPress={replay}
        style={styles.replayAction}
      />
      <Button
        label="Estimate distance"
        variant="primary"
        onPress={() => navigation.navigate('Calibration')}
        style={[styles.cta, { marginBottom: spacing.md + insets.bottom }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: colors.stage,
    borderRadius: radii.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landingRing: {
    position: 'absolute',
    width: LANDING_RING_SIZE,
    height: LANDING_RING_SIZE,
    borderRadius: LANDING_RING_SIZE / 2,
    borderWidth: 2,
  },
  qualityChip: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  /** 2px selection ring in colors.text, offset 2 from the swatch fill. */
  swatchRing: {
    width: SWATCH_SIZE + 8,
    height: SWATCH_SIZE + 8,
    borderRadius: (SWATCH_SIZE + 8) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchRingSelected: {
    borderColor: colors.text,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
  },
  glowRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  replayAction: {
    alignSelf: 'center',
    marginTop: spacing.lg,
  },
  cta: {
    marginTop: spacing.sm,
  },
});
