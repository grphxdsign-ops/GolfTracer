/**
 * Soccer analyze screen: consumes the session's FrameSource, runs the soccer
 * shot analysis (tracking → goal anchor → 3D ball world → speed → goal
 * cross → pose at contact) with live progress, publishes the result to the
 * sports session store, and auto-navigates to the soccer results.
 *
 * Mirrors the golf AnalyzeScreen structure for family consistency:
 * empty → EmptyState, running → staged ProgressBar, error → specific tips
 * with a single retry CTA (DESIGN.md §1: blame-free copy with a next step).
 */
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useSessionStore } from '../../../state/sessionStore';
import { colors, sharedStyles, spacing, typography } from '../../../app/theme';
import {
  Button,
  Card,
  EmptyState,
  ProgressBar,
  ScreenHeader,
} from '../../../app/components';
import { useSportsSessionStore } from '../../sports/sportsSessionStore';
import { navigateSport } from '../../sports/navSport';
import { analyzeSoccerTake } from '../analysis/analyzeSoccerShot';
import { appendTakeToResult } from '../analysis/takeCompare';

const RETRY_TIPS = [
  'Keep the camera steady — tripod or braced elbows.',
  'Film from behind the kicker so the ball flies toward the goal.',
  'Keep all four goal corners visible in the frame.',
  'Use the highest frame rate your phone supports (120/240fps).',
];

/** Staged progress captions, in pipeline order (DESIGN.md §5: state, not spin). */
const PROGRESS_STAGES = [
  { until: 0.35, caption: 'Tracking the ball flight' },
  { until: 0.7, caption: 'Anchoring the goal frame' },
  { until: Number.POSITIVE_INFINITY, caption: 'Measuring speed and pose at contact' },
] as const;

function stageCaption(progress: number): string {
  const stage = PROGRESS_STAGES.find((s) => progress < s.until);
  return (stage ?? PROGRESS_STAGES[PROGRESS_STAGES.length - 1]!).caption;
}

export function SoccerAnalyzeScreen() {
  const navigation = useNavigation();
  const frameSource = useSessionStore((s) => s.frameSource);
  const setSoccerResult = useSportsSessionStore((s) => s.setSoccerResult);

  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!frameSource) return;
    let cancelled = false;
    setProgress(0);
    setError(null);

    (async () => {
      try {
        // Read the previous result imperatively: subscribing to it would
        // re-run the analysis every time this run publishes a new take.
        const previous = useSportsSessionStore.getState().soccerResult;
        const take = await analyzeSoccerTake(frameSource, {
          label: `Take ${(previous?.takes.length ?? 0) + 1}`,
          onProgress: (p) => {
            if (!cancelled) setProgress(p);
          },
        });
        if (cancelled) return;
        setSoccerResult(appendTakeToResult(previous, take));
        navigateSport(navigation, 'SoccerResults');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [frameSource, attempt, navigation, setSoccerResult]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  if (!frameSource) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No video loaded"
          body="Record or import a soccer shot first, then come back to analyze it."
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={sharedStyles.screen}>
        <ScreenHeader title="Couldn't analyze that shot" subtitle={error} />
        <Card padded={false} style={styles.tipsCard}>
          {RETRY_TIPS.map((tip, index) => (
            <View
              key={tip}
              style={[styles.tipRow, index > 0 && styles.tipRowDivider]}
            >
              <Text style={typography.body}>{tip}</Text>
            </View>
          ))}
        </Card>
        <Button label="Retry analysis" onPress={retry} />
      </View>
    );
  }

  const pct = Math.round(progress * 100);
  return (
    <View style={sharedStyles.centered}>
      <Text style={typography.heading}>Analyzing the shot</Text>
      <Text style={styles.pct}>{pct}%</Text>
      <ProgressBar
        progress={progress}
        accessibilityLabel="Soccer shot analysis progress"
        style={styles.bar}
      />
      <Text style={styles.stageCaption}>{stageCaption(progress)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tipsCard: {
    marginBottom: spacing.lg,
  },
  tipRow: {
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
  },
  tipRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  pct: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  bar: {
    alignSelf: 'stretch',
  },
  stageCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
