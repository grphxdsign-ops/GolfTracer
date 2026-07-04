/**
 * Soccer results screen: the measure_plan-style readout — GOAL? verdict with
 * crossing coordinates, peak SHOT SPEED (count-up hero stat), ball distance
 * to the goal line at contact, the Pose-at-Contact freeze-frame (skeleton
 * over a letterboxed stage) with the joint-angle table, and the fast-vs-slow
 * take insights once two takes exist.
 *
 * Motion (DESIGN.md §5): a single count-up on the speed hero and a 200ms
 * fade + translateY entrance on the three result groups, 60ms stagger,
 * reduce-motion → instant.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../types/navigation';
import { colors, motion, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  StatTile,
  useReducedMotion,
} from '../../../app/components';
import { useSessionStore } from '../../../state/sessionStore';
import {
  useSportsSessionStore,
  type SoccerTakeResult,
} from '../../sports/sportsSessionStore';
import { navigateSport } from '../../sports/navSport';
import {
  type JointAngleTable,
  type SideJointAngles,
} from '../../sports/pose/jointAngles';
import { JOINT_LABELS, type JointKey } from '../analysis/takeCompare';
import { PoseOverlay } from './PoseOverlay';

const STAGE_HEIGHT = 220;
/** Entrance offset for the section reveal (translateY, px). */
const ENTRANCE_OFFSET = 8;
/** Stagger between the three result groups (DESIGN.md §5: ≤5 × 60ms). */
const ENTRANCE_STAGGER_MS = 60;

function goalHeadline(take: SoccerTakeResult): {
  label: string;
  color: string;
  detail: string;
} {
  const g = take.crossing;
  if (g?.isGoal) {
    return {
      label: 'GOAL!',
      color: colors.success,
      detail:
        g.xM !== undefined && g.yM !== undefined
          ? `Crossed the line ${g.xM.toFixed(2)} m from the left post at a height of ${g.yM.toFixed(2)} m`
          : 'Crossed the goal line inside the posts',
    };
  }
  if (g?.crossed) {
    return {
      label: 'NO GOAL',
      color: colors.danger,
      detail:
        g.xM !== undefined && g.yM !== undefined
          ? `Crossed the goal plane outside: ${g.xM.toFixed(2)} m from the left post, height ${g.yM.toFixed(2)} m`
          : 'Crossed the goal plane outside the frame',
    };
  }
  return {
    label: 'NO GOAL',
    color: colors.danger,
    detail: 'The ball never reached the goal line',
  };
}

const JOINT_KEYS: readonly JointKey[] = ['shoulderHip', 'hipKnee', 'kneeAnkle'];

function AngleTable({ table }: { table: JointAngleTable }) {
  const fmt = (side: SideJointAngles, key: JointKey) =>
    `${Math.round(side[key])}°`;
  return (
    <View>
      <View style={styles.tableRow}>
        <Text style={[typography.caption, styles.tableJoint]}>Joint angle</Text>
        <Text style={[typography.caption, styles.tableCell]}>Left</Text>
        <Text style={[typography.caption, styles.tableCell]}>Right</Text>
      </View>
      {JOINT_KEYS.map((key) => (
        <View key={key} style={styles.tableRow}>
          <Text style={[typography.body, styles.tableJoint]}>
            {JOINT_LABELS[key]}
          </Text>
          <Text style={[styles.tableValue, styles.tableCell]}>
            {fmt(table.left, key)}
          </Text>
          <Text style={[styles.tableValue, styles.tableCell]}>
            {fmt(table.right, key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One-shot count-up for the hero speed (motion.duration.countUp). */
function useCountUp(target: number, reduced: boolean): string {
  const [display, setDisplay] = useState(0);
  const animRef = useRef<Animated.Value | null>(null);

  useEffect(() => {
    if (reduced) {
      setDisplay(target);
      return;
    }
    const anim = new Animated.Value(0);
    animRef.current = anim;
    const id = anim.addListener(({ value }) => setDisplay(value));
    Animated.timing(anim, {
      toValue: target,
      duration: motion.duration.countUp,
      easing: motion.easing.standard,
      // Listener-driven value → JS driver by necessity.
      useNativeDriver: false,
    }).start();
    return () => {
      anim.removeListener(id);
      anim.stopAnimation();
    };
  }, [target, reduced]);

  return String(Math.round(display));
}

/** Section entrance: fade + translateY 8→0, 200ms, staggered by order. */
function Reveal({
  order,
  reduced,
  children,
}: {
  order: number;
  reduced: boolean;
  children: ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(ENTRANCE_OFFSET)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      translateY.setValue(0);
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.duration.base,
        delay: order * ENTRANCE_STAGGER_MS,
        easing: motion.easing.enter,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.duration.base,
        delay: order * ENTRANCE_STAGGER_MS,
        easing: motion.easing.enter,
        useNativeDriver: true,
      }),
    ]).start();
  }, [order, reduced, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

type ResultsNavigation = NativeStackNavigationProp<RootStackParamList>;

export function SoccerResultsScreen() {
  const navigation = useNavigation<ResultsNavigation>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const result = useSportsSessionStore((s) => s.soccerResult);
  const video = useSessionStore((s) => s.video);
  const [stageWidth, setStageWidth] = useState(0);

  const take = result?.takes[result.takes.length - 1] ?? null;
  const speedValue = useCountUp(Math.round(take?.peakSpeedKmh ?? 0), reduced);

  if (!result || !take) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No soccer analysis yet"
          body="Analyze a shot first — the results land here."
        />
      </View>
    );
  }

  const headline = goalHeadline(take);
  const pose = take.poseAtContact;
  const isBest =
    result.takes.length > 1 &&
    result.takes[result.bestTakeIndex] === take;

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <Reveal order={0} reduced={reduced}>
        <Text style={styles.takeLabel}>
          {take.label}
          {isBest ? ' · fastest take' : ''}
        </Text>
        <Text
          accessibilityRole="header"
          accessibilityLabel={`Goal verdict: ${headline.label}`}
          style={[styles.verdict, { color: headline.color }]}
        >
          {headline.label}
        </Text>
        <Text style={styles.verdictDetail}>{headline.detail}</Text>
      </Reveal>

      <Reveal order={1} reduced={reduced}>
        <Card style={styles.sectionCard}>
          <StatTile
            size="hero"
            label="Peak shot speed"
            value={speedValue}
            unit="km/h"
          />
          {take.distanceToGoalM !== null ? (
            <Text style={styles.distanceCaption}>
              Ball distance to goal line at contact:{' '}
              {take.distanceToGoalM.toFixed(1)} m
            </Text>
          ) : null}
        </Card>
      </Reveal>

      <Reveal order={2} reduced={reduced}>
        <Card style={styles.sectionCard}>
          <Text style={[typography.subtitle, styles.cardHeading]}>
            Pose at contact
          </Text>
          <View
            testID="pose-stage"
            onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}
            style={styles.stage}
          >
            {pose && stageWidth > 0 ? (
              <PoseOverlay
                pose={pose}
                videoWidth={video?.width ?? 1920}
                videoHeight={video?.height ?? 1080}
                viewWidth={stageWidth}
                viewHeight={STAGE_HEIGHT}
              />
            ) : null}
            {/* Broadcast-style status chip: rides IN the stage (DESIGN.md §8). */}
            <View pointerEvents="none" style={styles.stageChip}>
              <Badge label="Contact freeze-frame" />
            </View>
          </View>
          {take.jointAnglesAtContact ? (
            <AngleTable table={take.jointAnglesAtContact} />
          ) : (
            <Text style={typography.label}>
              No pose detected at the contact frame — joint angles unavailable.
            </Text>
          )}
        </Card>
      </Reveal>

      {result.insights.length > 0 ? (
        <Card style={styles.sectionCard}>
          <Text style={[typography.subtitle, styles.cardHeading]}>
            Take comparison
          </Text>
          {result.insights.map((insight) => (
            <Text
              key={insight}
              style={[typography.body, styles.insight]}
            >
              {insight}
            </Text>
          ))}
        </Card>
      ) : null}

      <Button
        label="Analyze another take"
        onPress={() => navigateSport(navigation, 'SoccerAnalyze')}
        style={styles.cta}
      />
      <Button
        label="Home"
        variant="ghost"
        onPress={() => navigation.navigate('Home')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  takeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  verdict: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.56,
    marginBottom: spacing.xs,
  },
  verdictDetail: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  distanceCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  cardHeading: {
    marginBottom: spacing.sm,
  },
  stage: {
    height: STAGE_HEIGHT,
    borderRadius: radii.lg,
    backgroundColor: colors.stage,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  stageChip: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  tableJoint: {
    flex: 2,
  },
  tableCell: {
    flex: 1,
    textAlign: 'right',
  },
  tableValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  insight: {
    marginBottom: spacing.xs,
  },
  cta: {
    marginBottom: spacing.sm,
  },
});
