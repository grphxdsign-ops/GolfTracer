/**
 * Home tab — your story, not a menu (docs/RESEARCH-APPS.md §3.5, DESIGN.md
 * §11): greeting → latest-session hero card → ONE promoted insight →
 * "Your sports" shortcuts → Tools. Record's permanent affordance is the
 * tab bar's center action, so the hero slot goes to the user's progress
 * (Oura's "one big thing"); a Record hero button appears only in the
 * no-history empty state. Pipeline detail only appears while a session is
 * actually in flight.
 *
 * Single mount entrance: groups fade + translateY(8→0) with a 60ms stagger,
 * reduce-motion aware.
 */
import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../types/navigation';
import { navigateSport } from '../../modules/sports/navSport';
import { navigateTab } from '../navigation/navTabs';
import {
  availableSports,
  SPORT_CATALOG,
  type SportEntry,
} from '../../modules/sports/sportCatalog';
import {
  formatRelativeWhen,
  qualityLabel,
  qualityTone,
  shotHeadlineParts,
  shotTitle,
  sportName,
} from '../../modules/sessions/shotDisplay';
import { promotedInsight } from '../../modules/insights/insights';
import { useSessionStore } from '../../state/sessionStore';
import { useProfileStore } from '../../state/profileStore';
import {
  clubAverages,
  MIN_SHOTS_FOR_DELTA,
  useHistoryStore,
} from '../../state/historyStore';
import {
  Badge,
  Button,
  Card,
  Chevron,
  ProgressSteps,
  SportIcon,
  StatTile,
  TrendPill,
  useCardHandoff,
  useReducedMotion,
} from '../components';
import type { ProgressStep } from '../components';
import { colors, motion, spacing, typography } from '../theme';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList>;

const ENTRANCE_GROUPS = 6;
const ENTRANCE_STAGGER_MS = 60;

/** Time-of-day greeting title: "Morning, Sam." / nameless "Morning." */
export function homeGreeting(hour: number, firstName: string | null): string {
  const word = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  return firstName ? `${word}, ${firstName}.` : `${word}.`;
}

/** Subtitle: trailing-7-day session count, or the standing invitation. */
export function weekLine(count: number): string {
  if (count === 0) {
    return 'Ready to trace your next shot.';
  }
  return count === 1 ? '1 session this week.' : `${count} sessions this week.`;
}

const WEEK_MS = 7 * 86_400_000;

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
  const shots = useHistoryStore((s) => s.shots);
  const latestShot = shots[0] ?? null;
  // Drives the hero card's reactive catchlight (DESIGN.md §5/§7) — never an
  // autonomous loop, only moves while the user scrolls.
  const scrollY = useRef(new Animated.Value(0)).current;

  const [
    headerStyle,
    heroStyle,
    insightStyle,
    pipelineStyle,
    sportsStyle,
    toolsStyle,
  ] = useEntrance(reducedMotion);

  const firstName = accountName?.trim().split(/\s+/)[0] || null;
  const title = homeGreeting(new Date().getHours(), firstName);
  // Recomputed every render (≤500 shots, trivial) — a useMemo keyed on
  // shots would hold a stale Date.now() cutoff across long foregrounds.
  const weekCutoff = Date.now() - WEEK_MS;
  const weekCount = shots.filter((s) => s.at >= weekCutoff).length;

  const insight = useMemo(() => promotedInsight(shots), [shots]);

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

  // The one card→detail handoff on this screen (DESIGN.md §11.1) — the hero
  // card scales down into its shot's detail rather than cutting away.
  const openLatest = () => {
    if (latestShot) {
      navigation.navigate('ShotDetail', { shotId: latestShot.id });
    }
  };
  const heroHandoff = useCardHandoff(openLatest);

  // Honest hero delta: this shot's carry vs the club average of PRIOR
  // measured shots (clubAverages excludes the shot itself + guesses).
  const heroDelta = useMemo(() => {
    if (
      !latestShot ||
      latestShot.sport !== 'golf' ||
      latestShot.club === undefined ||
      latestShot.carryYards === undefined ||
      latestShot.method === 'club-prior'
    ) {
      return null;
    }
    const averages = clubAverages(shots, latestShot.club, latestShot.id);
    if (
      averages.count < MIN_SHOTS_FOR_DELTA ||
      averages.carryYards === undefined
    ) {
      return null;
    }
    return {
      delta: latestShot.carryYards - averages.carryYards,
      base: averages.carryYards,
      clubLabel: latestShot.club.replace(/-/g, ' '),
    };
  }, [latestShot, shots]);

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

  const latestParts = latestShot ? shotHeadlineParts(latestShot) : null;

  return (
    <Animated.ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        // Tab roots hide the native header — the top inset is ours to pad.
        {
          paddingTop: insets.top + spacing.sm,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
      onScroll={Animated.event(
        [{ nativeEvent: { contentOffset: { y: scrollY } } }],
        { useNativeDriver: true },
      )}
      scrollEventThrottle={16}
    >
      <Animated.View style={headerStyle}>
        <Text accessibilityRole="header" style={typography.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{weekLine(weekCount)}</Text>
      </Animated.View>

      <Animated.View style={heroStyle}>
        {latestShot ? (
          <>
            <Text style={styles.sectionLabel}>Latest session</Text>
            <Reanimated.View style={heroHandoff.animatedStyle}>
              <Card
                variant="raised"
                onPress={heroHandoff.trigger}
                testID="home-recent-card"
                accessibilityLabel={`${sportName(latestShot.sport)} session, ${formatRelativeWhen(latestShot.at)}`}
                scrollY={scrollY}
              >
                <View style={styles.heroTopRow}>
                  <Text style={typography.subtitle}>
                    {latestShot.sport === 'golf'
                      ? `Golf · ${shotTitle(latestShot)}`
                      : sportName(latestShot.sport)}
                  </Text>
                  <Badge
                    label={qualityLabel(latestShot.quality)}
                    tone={qualityTone(latestShot.quality)}
                  />
                </View>
                {latestParts ? (
                  <View style={styles.heroStatRow}>
                    <StatTile
                      size="standard"
                      label=""
                      value={
                        latestShot.sport === 'soccer'
                          ? `~${latestParts.value}`
                          : latestParts.value
                      }
                      unit={latestParts.unit}
                    />
                    {heroDelta ? (
                      <View style={styles.heroTrend}>
                        <TrendPill
                          testID="home-hero-trend"
                          delta={heroDelta.delta}
                          unit="yd"
                          format={(n) => String(Math.round(n))}
                          goodDirection="up"
                          base={heroDelta.base}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
                <Text style={styles.heroCaption}>
                  {[
                    latestParts?.label,
                    heroDelta ? `vs your ${heroDelta.clubLabel} avg` : null,
                    formatRelativeWhen(latestShot.at),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Card>
            </Reanimated.View>
          </>
        ) : (
          <View style={styles.emptyHero}>
            <Text style={styles.sectionLabel}>Get started</Text>
            <Button
              label="Record"
              variant="primary"
              size="lg"
              onPress={() => navigation.navigate('Record')}
            />
            <Button
              label="Import a clip"
              variant="secondary"
              size="lg"
              style={styles.stackedButton}
              onPress={() => navigation.navigate('Import')}
            />
          </View>
        )}
      </Animated.View>

      <Animated.View style={insightStyle}>
        {insight ? (
          <Card
            onPress={() => navigateTab(navigation, 'Insights')}
            testID="home-insight-card"
            accessibilityLabel={`${insight.title}. ${insight.caption}. Opens Insights.`}
            style={styles.insightCard}
          >
            <View style={styles.insightRow}>
              <View style={styles.insightArrow}>
                <Chevron rotateDeg={-45} size={13} color={colors.accent} />
              </View>
              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightCaption}>{insight.caption}</Text>
              </View>
              <Chevron />
            </View>
          </Card>
        ) : null}
      </Animated.View>

      {sessionInFlight ? (
        <Animated.View style={pipelineStyle}>
          <Text style={styles.sectionLabel}>Session in progress</Text>
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
        <Text style={styles.sectionLabel}>Your sports</Text>
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

      <Animated.View style={toolsStyle}>
        <Text style={styles.sectionLabel}>Tools</Text>
        <Card
          onPress={() => navigateSport(navigation, 'PerfectedAction')}
          testID="home-tool-perfected"
          accessibilityLabel="Perfected action"
        >
          <View style={styles.toolRow}>
            <SportIcon sport="perfected" size={28} />
            <View style={styles.toolCopy}>
              <Text style={typography.subtitle}>Perfected action</Text>
              <Text style={styles.toolTagline}>
                Your swing, morphed toward its ideal
              </Text>
            </View>
            <Chevron color={colors.textDisabled} />
          </View>
        </Card>
        {latestShot ? (
          <Card
            onPress={() => navigation.navigate('Import')}
            testID="home-tool-import"
            accessibilityLabel="Import video"
            style={styles.stackedButton}
          >
            <View style={styles.toolRow}>
              <View style={styles.importGlyph}>
                <Chevron rotateDeg={135} size={15} color={colors.accent} />
              </View>
              <View style={styles.toolCopy}>
                <Text style={typography.subtitle}>Import a clip</Text>
                <Text style={styles.toolTagline}>
                  Trace a shot you already filmed
                </Text>
              </View>
              <Chevron color={colors.textDisabled} />
            </View>
          </Card>
        ) : null}
      </Animated.View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  sectionLabel: {
    ...typography.label,
    fontWeight: '600',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroStatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  heroTrend: {
    marginLeft: spacing.sm,
    paddingBottom: spacing.xs,
  },
  heroCaption: {
    ...typography.caption,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  emptyHero: {
    marginBottom: -spacing.xs,
  },
  insightCard: {
    marginTop: spacing.sm,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  insightArrow: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(91,206,98,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightCopy: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  insightCaption: {
    ...typography.caption,
    marginTop: 1,
    fontVariant: ['tabular-nums'],
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
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toolCopy: {
    flex: 1,
  },
  toolTagline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
  importGlyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
