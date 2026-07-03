/**
 * Analyze screen: consumes the session's FrameSource, runs the tracking
 * pipeline with live progress, publishes the result via the session store,
 * and auto-navigates to the tracer preview. When tracking fails, it shows
 * explicit retry tips plus a tap-to-mark-the-ball panel: one tap in an
 * aspect-correct video placeholder pins the ball in native pixels, and the
 * retry feeds it to the pipeline as the ballPoint option.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { runTracking, type RunTrackingOptions } from '../tracker/pipeline';
import { useBallPointStore } from './ballPointStore';
import { mapTapToVideoPoint } from './tapMapping';

type AnalyzeNavigation = NativeStackNavigationProp<RootStackParamList, 'Analyze'>;

/**
 * The tracking workstream pins `ballPoint` (NATIVE video px) on
 * RunTrackingOptions; typed as an intersection here so this screen compiles
 * identically before and after that field lands.
 */
type AnalyzeTrackingOptions = RunTrackingOptions & {
  ballPoint?: { x: number; y: number };
};

const RETRY_TIPS = [
  'Keep the camera steady — tripod or braced elbows.',
  'Film from behind the golfer so the ball flies away from the camera.',
  'Make sure the ball and tee are in the lower half of the frame.',
  'Avoid busy backgrounds (trees, crowds) directly behind the ball flight.',
  'Use the highest frame rate your phone supports (120/240fps).',
];

/** Aspect-correct placeholder box the user taps to mark the ball. */
const BALL_BOX_HEIGHT = 180;

export function AnalyzeScreen() {
  const navigation = useNavigation<AnalyzeNavigation>();
  const frameSource = useSessionStore((s) => s.frameSource);
  const setTrackingStatus = useSessionStore((s) => s.setTrackingStatus);
  const setTrackingResult = useSessionStore((s) => s.setTrackingResult);
  const ballPoint = useBallPointStore((s) => s.ballPoint);
  const setBallPoint = useBallPointStore((s) => s.setBallPoint);
  const clearBallPoint = useBallPointStore((s) => s.clear);

  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!frameSource) return;
    let cancelled = false;
    setProgress(0);
    setFailed(false);
    setError(null);
    setTrackingStatus('running');

    (async () => {
      try {
        const trackingOptions: AnalyzeTrackingOptions = {
          ballPoint: ballPoint ?? undefined,
          onProgress: (p) => {
            if (!cancelled) setProgress(p);
          },
        };
        const result = await runTracking(frameSource, trackingOptions);
        if (cancelled) return;
        setTrackingResult(result);
        if (result.track.quality === 'failed') {
          setFailed(true);
        } else {
          navigation.navigate('TracerPreview');
        }
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : String(e);
        setTrackingStatus('error', message);
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    frameSource,
    attempt,
    ballPoint,
    navigation,
    setTrackingResult,
    setTrackingStatus,
  ]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const videoWidth = frameSource?.asset.width ?? 1920;
  const videoHeight = frameSource?.asset.height ?? 1080;
  const boxWidth = BALL_BOX_HEIGHT * (videoWidth / videoHeight);
  const boxScale = BALL_BOX_HEIGHT / videoHeight;

  const handleBallTap = useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      setBallPoint(
        mapTapToVideoPoint(
          { x: locationX, y: locationY },
          { width: boxWidth, height: BALL_BOX_HEIGHT },
          { width: videoWidth, height: videoHeight },
        ),
      );
    },
    [setBallPoint, boxWidth, videoWidth, videoHeight],
  );

  if (!frameSource) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>No video loaded</Text>
        <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
          Record or import a golf shot first, then come back to analyze it.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>Analysis error</Text>
        <Text
          style={[typography.body, { marginVertical: spacing.md, color: colors.danger }]}
        >
          {error}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Retry analysis</Text>
        </Pressable>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={typography.title}>Couldn&apos;t track that shot</Text>
        <Text style={[typography.subtitle, { marginVertical: spacing.sm }]}>
          The ball was lost too soon after impact. Rather than show a wrong
          tracer, here is how to get a clean one:
        </Text>
        <View style={sharedStyles.card}>
          {RETRY_TIPS.map((tip) => (
            <Text
              key={tip}
              style={[typography.body, { marginBottom: spacing.xs }]}
            >
              {'•'} {tip}
            </Text>
          ))}
        </View>
        <View style={sharedStyles.card}>
          <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
            Mark the ball
          </Text>
          <Text style={[typography.label, { marginBottom: spacing.sm }]}>
            Tap where the ball sits before the swing so the retry knows
            exactly where to look.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tap to mark the ball position"
            testID="ball-point-box"
            onPress={handleBallTap}
            style={[styles.tapArea, { width: boxWidth }]}
          >
            <Text style={typography.label}>
              Video frame placeholder — tap the ball
            </Text>
            {ballPoint && (
              <View
                testID="ball-point-marker"
                pointerEvents="none"
                style={[
                  styles.marker,
                  {
                    left: ballPoint.x * boxScale - 5,
                    top: ballPoint.y * boxScale - 5,
                  },
                ]}
              />
            )}
          </Pressable>
          {ballPoint && (
            <Pressable
              accessibilityRole="button"
              onPress={clearBallPoint}
              style={styles.clearButton}
            >
              <Text style={styles.clearButtonText}>Clear ball point</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={retry}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Retry analysis</Text>
        </Pressable>
      </View>
    );
  }

  const pct = Math.round(progress * 100);
  return (
    <View style={sharedStyles.centered}>
      <Text style={typography.title}>Analyzing shot…</Text>
      <Text style={[typography.subtitle, { marginVertical: spacing.md }]}>
        {pct}%
      </Text>
      <View
        accessibilityRole="progressbar"
        style={{
          width: '80%',
          height: 8,
          borderRadius: radii.sm,
          backgroundColor: colors.surfaceRaised,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: colors.accent,
          }}
        />
      </View>
      <Text style={[typography.label, { marginTop: spacing.md }]}>
        Finding impact, tracking ball flight…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tapArea: {
    height: BALL_BOX_HEIGHT,
    maxWidth: '100%',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  clearButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  clearButtonText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
});
