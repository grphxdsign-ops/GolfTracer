/**
 * Soccer analyze screen: consumes the session's FrameSource, runs the soccer
 * shot analysis (tracking → goal anchor → 3D ball world → speed → goal
 * cross → pose at contact) with live progress, publishes the result to the
 * sports session store, and auto-navigates to the soccer results.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
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
        <Text style={typography.title}>No video loaded</Text>
        <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
          Record or import a soccer shot first, then come back to analyze it.
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={sharedStyles.screen}>
        <Text style={typography.title}>Couldn&apos;t analyze that shot</Text>
        <Text
          style={[typography.body, { marginVertical: spacing.md, color: colors.danger }]}
        >
          {error}
        </Text>
        <View style={sharedStyles.card}>
          {RETRY_TIPS.map((tip) => (
            <Text key={tip} style={[typography.body, { marginBottom: spacing.xs }]}>
              {'•'} {tip}
            </Text>
          ))}
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
      <Text style={[typography.subtitle, { marginVertical: spacing.md }]}>{pct}%</Text>
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
        Tracking ball, anchoring goal, measuring speed…
      </Text>
    </View>
  );
}
