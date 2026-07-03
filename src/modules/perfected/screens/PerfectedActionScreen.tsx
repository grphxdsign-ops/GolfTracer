/**
 * Perfected Action screen: plays the morphed dummy performing the
 * biomechanically-perfected action beside the simulated perfected ball
 * flight, with a 0-100% correction-strength control. Publishes the
 * PerfectedResult to the sports session store and hands off to the
 * results screen.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { navigateSport } from '../../sports/navSport';
import { useSportsSessionStore } from '../../sports/sportsSessionStore';
import { buildPerfectedResult, demoMeasuredFrames } from '../perfectedPipeline';
import {
  renderPerfectedFrames,
  type RenderedFrame,
  type RenderShape,
} from '../render/dummyRenderer';

const CANVAS_WIDTH = 328;
const CANVAS_HEIGHT = 200;
const PLAYBACK_FPS = 15;

const STRENGTH_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

function Shape({ shape }: { shape: RenderShape }) {
  if (shape.kind === 'circle') {
    const isBall = shape.role === 'ball';
    return (
      <View
        style={[
          styles.circle,
          {
            left: shape.cx - shape.r,
            top: shape.cy - shape.r,
            width: shape.r * 2,
            height: shape.r * 2,
            borderRadius: shape.r,
            backgroundColor: isBall ? colors.accent : colors.text,
          },
        ]}
      />
    );
  }
  const dx = shape.x2 - shape.x1;
  const dy = shape.y2 - shape.y1;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) {
    return null;
  }
  const angleRad = Math.atan2(dy, dx);
  return (
    <View
      style={[
        styles.line,
        {
          left: (shape.x1 + shape.x2) / 2 - length / 2,
          top: (shape.y1 + shape.y2) / 2 - 1,
          width: length,
          backgroundColor:
            shape.role === 'flight' ? colors.primary : colors.textMuted,
          transform: [{ rotate: `${angleRad}rad` }],
        },
      ]}
    />
  );
}

function DummyCanvas({ frame }: { frame: RenderedFrame }) {
  return (
    <View
      accessibilityLabel="Perfected action playback"
      style={styles.canvas}
    >
      {frame.shapes.map((shape, i) => (
        <Shape key={i} shape={shape} />
      ))}
    </View>
  );
}

export function PerfectedActionScreen() {
  const navigation = useNavigation();
  const soccerResult = useSportsSessionStore((s) => s.soccerResult);
  const setPerfectedResult = useSportsSessionStore((s) => s.setPerfectedResult);

  const [strength, setStrength] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);

  const measuredFrames = useMemo(() => demoMeasuredFrames(), []);
  const measuredSpeedMps = soccerResult
    ? soccerResult.takes[soccerResult.bestTakeIndex]?.peakSpeedMps
    : undefined;

  const result = useMemo(
    () =>
      buildPerfectedResult({
        sport: 'soccer',
        measuredFrames,
        strength,
        ...(measuredSpeedMps !== undefined ? { measuredSpeedMps } : {}),
      }),
    [measuredFrames, strength, measuredSpeedMps],
  );

  const rendered = useMemo(
    () =>
      renderPerfectedFrames(result.morphedFrames, result.flight, {
        widthPx: CANVAS_WIDTH,
        heightPx: CANVAS_HEIGHT,
      }),
    [result],
  );

  useEffect(() => {
    if (!playing) {
      return;
    }
    const id = setInterval(() => {
      setFrameIndex((i) => (i + 1) % rendered.length);
    }, 1000 / PLAYBACK_FPS);
    return () => clearInterval(id);
  }, [playing, rendered.length]);

  const frame = rendered[Math.min(frameIndex, rendered.length - 1)]!;

  const handleSave = () => {
    setPerfectedResult(result);
    navigateSport(navigation, 'PerfectedResults');
  };

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Text style={typography.title}>Perfected Action</Text>
      <Text style={[typography.label, { marginBottom: spacing.md }]}>
        Your motion morphed toward the cited biomechanical targets, beside
        the simulated perfected ball flight.
      </Text>

      <DummyCanvas frame={frame} />

      <Pressable
        accessibilityRole="button"
        onPress={() => setPlaying((p) => !p)}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>{playing ? 'Pause' : 'Play'}</Text>
      </Pressable>

      <Text style={[typography.subtitle, { marginBottom: spacing.xs }]}>
        Correction strength
      </Text>
      <View style={styles.strengthRow}>
        {STRENGTH_STEPS.map((value) => {
          const selected = value === strength;
          return (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`Correction strength ${Math.round(value * 100)} percent`}
              onPress={() => setStrength(value)}
              style={[styles.strengthChip, selected && styles.strengthChipSelected]}
            >
              <Text
                style={[
                  styles.strengthText,
                  selected && styles.strengthTextSelected,
                ]}
              >
                {Math.round(value * 100)}%
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={sharedStyles.card}>
        <Text style={typography.subtitle}>Perfected flight</Text>
        <Text style={typography.body}>
          {result.flight.rangeM.toFixed(1)} m range ·{' '}
          {result.flight.apexM.toFixed(1)} m apex ·{' '}
          {result.flight.flightTimeS.toFixed(2)} s
        </Text>
        {measuredSpeedMps !== undefined ? (
          <Text style={typography.label}>
            Seeded from your measured {(measuredSpeedMps * 3.6).toFixed(0)} km/h take
          </Text>
        ) : (
          <Text style={typography.label}>
            Demo motion — analyze a take to seed with your own speed
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleSave}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>Save perfected result</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  circle: {
    position: 'absolute',
  },
  line: {
    position: 'absolute',
    height: 2,
  },
  strengthRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  strengthChip: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  strengthChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  strengthText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  strengthTextSelected: {
    color: colors.text,
  },
});
