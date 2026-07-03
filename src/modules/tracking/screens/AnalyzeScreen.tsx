/**
 * Analyze screen: consumes the session's FrameSource, runs the tracking
 * pipeline with live progress, publishes the result via the session store,
 * and auto-navigates to the tracer preview. When tracking fails, it shows
 * explicit retry tips instead of a silently-wrong arc.
 */
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { runTracking } from '../tracker/pipeline';

type AnalyzeNavigation = NativeStackNavigationProp<RootStackParamList, 'Analyze'>;

const RETRY_TIPS = [
  'Keep the camera steady — tripod or braced elbows.',
  'Film from behind the golfer so the ball flies away from the camera.',
  'Make sure the ball and tee are in the lower half of the frame.',
  'Avoid busy backgrounds (trees, crowds) directly behind the ball flight.',
  'Use the highest frame rate your phone supports (120/240fps).',
];

export function AnalyzeScreen() {
  const navigation = useNavigation<AnalyzeNavigation>();
  const frameSource = useSessionStore((s) => s.frameSource);
  const setTrackingStatus = useSessionStore((s) => s.setTrackingStatus);
  const setTrackingResult = useSessionStore((s) => s.setTrackingResult);

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
        const result = await runTracking(frameSource, {
          onProgress: (p) => {
            if (!cancelled) setProgress(p);
          },
        });
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
  }, [frameSource, attempt, navigation, setTrackingResult, setTrackingStatus]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

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
