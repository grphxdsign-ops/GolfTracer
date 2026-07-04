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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import { useSessionStore } from '../../../state/sessionStore';
import {
  colors,
  radii,
  sharedStyles,
  spacing,
  typography,
} from '../../../app/theme';
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  ScreenHeader,
} from '../../../app/components';
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

/** Staged caption under the progress bar, keyed off pipeline progress. */
function stageCaption(progress: number): string {
  if (progress < 0.4) return 'Reading frames…';
  if (progress < 0.8) return 'Following the ball…';
  return 'Building the tracer…';
}

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
        <EmptyState
          title="No video loaded"
          body="Record or import a golf shot first, then come back to analyze it."
        />
        <Button
          label="Back to home"
          variant="ghost"
          size="md"
          onPress={() => navigation.navigate('Home')}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState title="Analysis stopped" body={error} />
        <Button
          label="Retry analysis"
          variant="primary"
          onPress={retry}
          style={styles.retryAction}
        />
      </View>
    );
  }

  if (failed) {
    return (
      <ScrollView
        style={sharedStyles.screen}
        contentContainerStyle={styles.failedContent}
      >
        <ScreenHeader
          title="Couldn't track that shot"
          subtitle="The ball was lost too soon after impact. Rather than show a wrong tracer, here is how to get a clean one:"
        />
        <Card>
          {RETRY_TIPS.map((tip, i) => (
            <View
              key={tip}
              style={[styles.tipRow, i > 0 && styles.tipRowHairline]}
            >
              <Text style={styles.tipBullet}>•</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </Card>
        <Card style={styles.markCard}>
          <Text style={[typography.subtitle, { marginBottom: spacing.xs }]}>
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
            <Text style={typography.caption}>
              Video frame placeholder — tap the ball
            </Text>
            {ballPoint && (
              <View
                testID="ball-point-marker"
                pointerEvents="none"
                style={[
                  styles.marker,
                  {
                    left: ballPoint.x * boxScale - 8,
                    top: ballPoint.y * boxScale - 8,
                  },
                ]}
              >
                <View style={styles.markerDot} />
              </View>
            )}
          </Pressable>
          {ballPoint && (
            <Button
              label="Clear ball point"
              variant="ghost"
              size="sm"
              onPress={clearBallPoint}
              style={styles.clearAction}
            />
          )}
        </Card>
        <Button label="Retry analysis" variant="primary" onPress={retry} />
      </ScrollView>
    );
  }

  return (
    <View style={sharedStyles.centered}>
      <View style={styles.runningColumn}>
        <Text style={[typography.heading, styles.runningTitle]}>
          Tracking ball flight
        </Text>
        <ProgressBar
          progress={progress}
          accessibilityLabel="Analysis progress"
          style={styles.runningBar}
        />
        <Text style={[typography.label, styles.runningCaption]}>
          {stageCaption(progress)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  retryAction: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  failedContent: {
    paddingBottom: spacing.xl,
  },
  tipRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  tipRowHairline: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  tipBullet: {
    ...typography.body,
    color: colors.textMuted,
    marginRight: spacing.sm,
  },
  tipText: {
    ...typography.body,
    flex: 1,
  },
  markCard: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  tapArea: {
    height: BALL_BOX_HEIGHT,
    maxWidth: '100%',
    borderRadius: radii.lg,
    backgroundColor: colors.stage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  /** 16pt ring in the UI accent with a center dot — the pinned ball mark. */
  marker: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  clearAction: {
    alignSelf: 'flex-start',
  },
  runningColumn: {
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  runningTitle: {
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  runningBar: {
    width: '80%',
  },
  runningCaption: {
    marginTop: spacing.md,
    fontVariant: ['tabular-nums'],
  },
});
