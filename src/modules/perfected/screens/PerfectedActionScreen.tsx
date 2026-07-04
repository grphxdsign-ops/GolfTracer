/**
 * Perfected Action screen: plays the morphed dummy performing the
 * biomechanically-perfected action beside the simulated perfected ball
 * flight, with a 0-100% correction-strength control. Publishes the
 * PerfectedResult to the sports session store and hands off to the
 * results screen.
 *
 * The playback control carries zero custom animation on purpose (DESIGN.md
 * §5: high-frequency interactions get kit press feedback only); the stage
 * uses the darkest tier so the dummy reads like broadcast graphics.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import {
  Button,
  Card,
  Chip,
  ScreenHeader,
  SectionLabel,
} from '../../../app/components';
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
/** Rendered line thickness for bones and the flight arc. */
const LINE_THICKNESS = 2;

const STRENGTH_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

function Shape({ shape }: { shape: RenderShape }) {
  if (shape.kind === 'circle') {
    // The ball is the single accent on the stage; joints stay neutral.
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
          top: (shape.y1 + shape.y2) / 2 - LINE_THICKNESS / 2,
          width: length,
          backgroundColor:
            shape.role === 'flight' ? colors.accent : colors.textMuted,
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
  const insets = useSafeAreaInsets();
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
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <ScreenHeader
        title="Perfected Action"
        subtitle="Your motion morphed toward the cited biomechanical targets, beside the simulated perfected ball flight."
      />

      <DummyCanvas frame={frame} />

      <Button
        label={playing ? 'Pause' : 'Play'}
        variant="secondary"
        onPress={() => setPlaying((p) => !p)}
        style={styles.playButton}
      />

      <SectionLabel>Correction strength</SectionLabel>
      <View style={styles.strengthRow}>
        {STRENGTH_STEPS.map((value) => {
          const pct = Math.round(value * 100);
          return (
            <Chip
              key={value}
              label={`${pct}%`}
              selected={value === strength}
              onPress={() => setStrength(value)}
              accessibilityLabel={`Correction strength ${pct} percent`}
            />
          );
        })}
      </View>

      <Card style={styles.flightCard}>
        <Text style={[typography.subtitle, styles.flightHeading]}>
          Perfected flight
        </Text>
        <Text style={styles.flightNumbers}>
          {result.flight.rangeM.toFixed(1)} m range ·{' '}
          {result.flight.apexM.toFixed(1)} m apex ·{' '}
          {result.flight.flightTimeS.toFixed(2)} s
        </Text>
        {measuredSpeedMps !== undefined ? (
          <Text style={styles.flightCaption}>
            Seeded from your measured {(measuredSpeedMps * 3.6).toFixed(0)} km/h take
          </Text>
        ) : (
          <Text style={styles.flightCaption}>
            Demo motion — analyze a take to seed with your own speed
          </Text>
        )}
      </Card>

      <Button label="Save perfected result" onPress={handleSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  canvas: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    maxWidth: '100%',
    alignSelf: 'center',
    backgroundColor: colors.stage,
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  circle: {
    position: 'absolute',
  },
  line: {
    position: 'absolute',
    height: LINE_THICKNESS,
  },
  playButton: {
    marginBottom: spacing.sm,
  },
  strengthRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  flightCard: {
    marginBottom: spacing.lg,
  },
  flightHeading: {
    marginBottom: spacing.xs,
  },
  flightNumbers: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.xs,
  },
  flightCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
  },
});
