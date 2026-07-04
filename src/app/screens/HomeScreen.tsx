/**
 * Home screen — part of the scaffold-owned app shell. Drives the pipeline:
 * Record/Import → Review → Analyze → TracerPreview → Calibration → Results.
 *
 * Redesigned per docs/DESIGN.md: ScreenHeader + pipeline card (ProgressSteps)
 * + one primary CTA (Record) with quieter secondary/ghost actions. Single
 * mount entrance: header, pipeline, and action zone fade + translateY(8→0)
 * with a 60ms stagger, reduce-motion aware.
 */
import { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../types/navigation';
import { navigateSport } from '../../modules/sports/navSport';
import { useSessionStore } from '../../state/sessionStore';
import {
  Button,
  Card,
  ProgressSteps,
  ScreenHeader,
  SectionLabel,
  useReducedMotion,
} from '../components';
import type { ProgressStep } from '../components';
import { colors, motion, spacing } from '../theme';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const ENTRANCE_GROUPS = 3;
const ENTRANCE_STAGGER_MS = 60;

/**
 * Mount-only entrance: one opacity/translateY pair per group, staggered.
 * Returns final (visible) values immediately when reduce-motion is on.
 */
function useEntrance(reducedMotion: boolean) {
  const progress = useRef(
    Array.from({ length: ENTRANCE_GROUPS }, () => new Animated.Value(0)),
  ).current;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    if (reducedMotion) {
      progress.forEach((value) => value.setValue(1));
      return;
    }
    Animated.stagger(
      ENTRANCE_STAGGER_MS,
      progress.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: motion.duration.base,
          easing: motion.easing.enter,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [progress, reducedMotion]);

  return progress.map((value) => ({
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [8, 0],
        }),
      },
    ],
  }));
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const video = useSessionStore((s) => s.video);
  const trackingStatus = useSessionStore((s) => s.trackingStatus);
  const trackingResult = useSessionStore((s) => s.trackingResult);
  const distance = useSessionStore((s) => s.distance);

  const [headerStyle, pipelineStyle, actionsStyle] =
    useEntrance(reducedMotion);

  // Detail strings are pinned by tests — keep derivations identical.
  const videoDetail = video
    ? `${video.source} · ${video.fps} fps · ${(video.durationMs / 1000).toFixed(1)}s`
    : 'No video';
  const trackingDetail = trackingResult
    ? `Done (${trackingResult.track.quality})`
    : trackingStatus === 'idle'
      ? 'Not started'
      : trackingStatus;
  const distanceDetail = distance
    ? `${Math.round(distance.carryYards)} yds carry`
    : 'Not estimated';

  const steps: ProgressStep[] = [
    {
      key: 'video',
      label: 'Video',
      detail: videoDetail,
      state: video ? 'done' : 'todo',
    },
    {
      key: 'tracking',
      label: 'Tracking',
      detail: trackingDetail,
      state: trackingResult
        ? 'done'
        : trackingStatus === 'running'
          ? 'active'
          : 'todo',
    },
    {
      key: 'distance',
      label: 'Distance',
      detail: distanceDetail,
      state: distance
        ? 'done'
        : trackingResult
          ? 'active'
          : 'todo',
    },
  ];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <Animated.View style={headerStyle}>
        <ScreenHeader
          title="GolfTracer AI"
          subtitle="Trace your ball flight and estimate carry."
        />
      </Animated.View>

      <Animated.View style={pipelineStyle}>
        <SectionLabel style={styles.firstSectionLabel}>Pipeline</SectionLabel>
        <Card testID="home-pipeline-card">
          <ProgressSteps steps={steps} testID="home-pipeline-steps" />
        </Card>
      </Animated.View>

      <Animated.View style={actionsStyle}>
        <Button
          label="Record"
          variant="primary"
          size="lg"
          style={styles.primaryCta}
          onPress={() => navigation.navigate('Record')}
        />
        <Button
          label="Import"
          variant="secondary"
          size="lg"
          style={styles.stackedButton}
          onPress={() => navigation.navigate('Import')}
        />

        <SectionLabel>Continue</SectionLabel>
        <Button
          label="Analyze"
          variant="secondary"
          size="md"
          disabled={video === null}
          onPress={() => navigation.navigate('Analyze')}
        />
        <Button
          label="Distance"
          variant="secondary"
          size="md"
          disabled={trackingResult === null}
          style={styles.stackedButton}
          onPress={() => navigation.navigate('Calibration')}
        />

        <SectionLabel>Other sports</SectionLabel>
        <Button
          label="Soccer Analysis"
          variant="ghost"
          size="md"
          onPress={() => navigateSport(navigation, 'SoccerAnalyze')}
        />
        <Button
          label="Perfected Action"
          variant="ghost"
          size="md"
          style={styles.stackedButton}
          onPress={() => navigateSport(navigation, 'PerfectedAction')}
        />
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  firstSectionLabel: {
    marginTop: 0,
  },
  primaryCta: {
    marginTop: spacing.xl,
  },
  stackedButton: {
    marginTop: spacing.sm,
  },
});
