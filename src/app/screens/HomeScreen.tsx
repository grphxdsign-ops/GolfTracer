/**
 * Home screen — hub, not dashboard (docs/DESIGN.md §11): greeting header →
 * Record (the one primary CTA) + Import → "Your sports" shortcut row →
 * recent session card. Pipeline detail only appears while a session is
 * actually in flight; full history lives one tap away on Sessions.
 *
 * Single mount entrance: groups fade + translateY(8→0) with a 60ms stagger,
 * reduce-motion aware.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../types/navigation';
import { navigateSport } from '../../modules/sports/navSport';
import {
  availableSports,
  SPORT_CATALOG,
  type SportEntry,
} from '../../modules/sports/sportCatalog';
import {
  formatRelativeWhen,
  qualityLabel,
  qualityTone,
  shotHeadline,
  sportName,
} from '../../modules/sessions/shotDisplay';
import { useSessionStore } from '../../state/sessionStore';
import { useProfileStore } from '../../state/profileStore';
import { useHistoryStore } from '../../state/historyStore';
import {
  Badge,
  Button,
  Card,
  ProgressSteps,
  ScreenHeader,
  SectionLabel,
  SportIcon,
  useReducedMotion,
} from '../components';
import type { ProgressStep } from '../components';
import { colors, motion, spacing, typography } from '../theme';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const ENTRANCE_GROUPS = 5;
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
  const accountName = useProfileStore((s) => s.account?.name ?? null);
  const chosenSports = useProfileStore((s) => s.sports);
  const latestShot = useHistoryStore((s) => s.shots[0] ?? null);

  const [headerStyle, actionsStyle, pipelineStyle, sportsStyle, recentStyle] =
    useEntrance(reducedMotion);

  const firstName = accountName?.trim().split(/\s+/)[0] || null;
  const subtitle = firstName
    ? `Trace every shot, ${firstName}.`
    : 'Ready to trace your next shot.';

  // The user's chosen available sports; all available sports until they pick.
  const sportEntries = useMemo(() => {
    const chosen = chosenSports
      .map((id) => SPORT_CATALOG.find((entry) => entry.id === id))
      .filter(
        (entry): entry is SportEntry => entry !== undefined && entry.available,
      );
    return chosen.length > 0 ? chosen : [...availableSports()];
  }, [chosenSports]);

  const openSport = (entry: SportEntry) => {
    if (entry.route === 'Record') {
      navigation.navigate('Record');
    } else if (entry.route) {
      navigateSport(navigation, entry.route);
    }
  };

  // 'Sessions' is mounted through App.tsx's route cast (like navSport).
  const openSessions = () =>
    (navigation as { navigate(route: string): void }).navigate('Sessions');

  // Pipeline detail only earns screen space while a session is in flight
  // (§4 density lock) — a loaded video or a tracking pass underway.
  const sessionInFlight = video !== null || trackingStatus === 'running';

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

  const recentHeadline = latestShot ? shotHeadline(latestShot) : null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <Animated.View style={headerStyle}>
        <ScreenHeader title="Tracr" subtitle={subtitle} />
      </Animated.View>

      <Animated.View style={actionsStyle}>
        <Button
          label="Record"
          variant="primary"
          size="lg"
          onPress={() => navigation.navigate('Record')}
        />
        <Button
          label="Import"
          variant="secondary"
          size="lg"
          style={styles.stackedButton}
          onPress={() => navigation.navigate('Import')}
        />
      </Animated.View>

      {sessionInFlight ? (
        <Animated.View style={pipelineStyle}>
          <SectionLabel>Session in progress</SectionLabel>
          <Card testID="home-pipeline-card">
            <ProgressSteps steps={steps} testID="home-pipeline-steps" />
          </Card>
          <Button
            label="Analyze"
            variant="secondary"
            size="md"
            disabled={video === null}
            style={styles.continueButton}
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
        </Animated.View>
      ) : null}

      <Animated.View style={sportsStyle}>
        <SectionLabel>Your sports</SectionLabel>
        <View style={styles.sportsRow}>
          {sportEntries.map((entry) => (
            <Card
              key={entry.id}
              onPress={() => openSport(entry)}
              testID={`home-sport-${entry.id}`}
              accessibilityLabel={entry.name}
              padded={false}
              style={styles.sportCard}
            >
              <View style={styles.sportCardInner}>
                <SportIcon sport={entry.id} size={28} />
                <Text style={styles.sportCardLabel}>{entry.name}</Text>
              </View>
            </Card>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={recentStyle}>
        <SectionLabel>Recent session</SectionLabel>
        {latestShot ? (
          <Card
            onPress={openSessions}
            testID="home-recent-card"
            accessibilityLabel={`${sportName(latestShot.sport)} session, ${formatRelativeWhen(latestShot.at)}`}
          >
            <View style={styles.recentTopRow}>
              <Text style={typography.subtitle}>
                {sportName(latestShot.sport)}
              </Text>
              <Text style={styles.recentWhen}>
                {formatRelativeWhen(latestShot.at)}
              </Text>
            </View>
            <View style={styles.recentStatsRow}>
              {recentHeadline ? (
                <Text style={styles.recentStat}>{recentHeadline}</Text>
              ) : null}
              <Badge
                label={qualityLabel(latestShot.quality)}
                tone={qualityTone(latestShot.quality)}
              />
            </View>
          </Card>
        ) : (
          <Text style={styles.noSessions}>
            No sessions yet — record your first shot.
          </Text>
        )}
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
  stackedButton: {
    marginTop: spacing.sm,
  },
  continueButton: {
    marginTop: spacing.xs,
  },
  sportsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sportCard: {
    minWidth: 100,
  },
  sportCardInner: {
    alignItems: 'center',
    paddingVertical: spacing.sm + spacing.xs,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  sportCardLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.text,
  },
  recentTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recentWhen: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  recentStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  recentStat: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  noSessions: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textMuted,
  },
});
