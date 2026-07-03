/**
 * Soccer results screen: the measure_plan-style readout — GOAL? verdict with
 * crossing coordinates, peak SHOT SPEED, ball distance to the goal line at
 * contact, the Pose-at-Contact freeze-frame (skeleton over a letterboxed
 * stage) with the joint-angle table, and the fast-vs-slow take insights
 * once two takes exist.
 */
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types/navigation';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
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
        <Text style={[typography.label, styles.tableJoint]}>Joint angle</Text>
        <Text style={[typography.label, styles.tableCell]}>Left</Text>
        <Text style={[typography.label, styles.tableCell]}>Right</Text>
      </View>
      {JOINT_KEYS.map((key) => (
        <View key={key} style={styles.tableRow}>
          <Text style={[typography.body, styles.tableJoint]}>
            {JOINT_LABELS[key]}
          </Text>
          <Text style={[typography.body, styles.tableCell]}>
            {fmt(table.left, key)}
          </Text>
          <Text style={[typography.body, styles.tableCell]}>
            {fmt(table.right, key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

type ResultsNavigation = NativeStackNavigationProp<RootStackParamList>;

export function SoccerResultsScreen() {
  const navigation = useNavigation<ResultsNavigation>();
  const result = useSportsSessionStore((s) => s.soccerResult);
  const video = useSessionStore((s) => s.video);
  const [stageWidth, setStageWidth] = useState(0);

  const take = result?.takes[result.takes.length - 1] ?? null;
  if (!result || !take) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>No soccer analysis yet</Text>
        <Text style={[typography.subtitle, { marginTop: spacing.sm }]}>
          Analyze a shot first — the results land here.
        </Text>
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
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Text style={[typography.label, { marginBottom: spacing.xs }]}>
        {take.label}
        {isBest ? ' · fastest take' : ''}
      </Text>

      <View
        accessibilityLabel={`Goal verdict: ${headline.label}`}
        style={[styles.badge, { borderColor: headline.color }]}
      >
        <Text style={[styles.badgeText, { color: headline.color }]}>
          {headline.label}
        </Text>
      </View>
      <Text style={[typography.label, { marginBottom: spacing.md }]}>
        {headline.detail}
      </Text>

      <View style={sharedStyles.card}>
        <Text style={styles.heroValue}>
          {Math.round(take.peakSpeedKmh)}
          <Text style={styles.heroUnit}> km/h shot speed</Text>
        </Text>
        {take.distanceToGoalM !== null ? (
          <Text style={[typography.subtitle, { marginTop: spacing.xs }]}>
            Ball distance to goal line at contact:{' '}
            {take.distanceToGoalM.toFixed(1)} m
          </Text>
        ) : null}
      </View>

      <View style={sharedStyles.card}>
        <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
          Pose at contact
        </Text>
        <View
          testID="pose-stage"
          onLayout={(e) => setStageWidth(e.nativeEvent.layout.width)}
          style={styles.stage}
        >
          <Text style={typography.label}>Contact freeze-frame</Text>
          {pose && stageWidth > 0 ? (
            <PoseOverlay
              pose={pose}
              videoWidth={video?.width ?? 1920}
              videoHeight={video?.height ?? 1080}
              viewWidth={stageWidth}
              viewHeight={STAGE_HEIGHT}
            />
          ) : null}
        </View>
        {take.jointAnglesAtContact ? (
          <AngleTable table={take.jointAnglesAtContact} />
        ) : (
          <Text style={typography.label}>
            No pose detected at the contact frame — joint angles unavailable.
          </Text>
        )}
      </View>

      {result.insights.length > 0 ? (
        <View style={sharedStyles.card}>
          <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
            Take comparison
          </Text>
          {result.insights.map((insight) => (
            <Text
              key={insight}
              style={[typography.body, { marginBottom: spacing.xs }]}
            >
              {insight}
            </Text>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => navigateSport(navigation, 'SoccerAnalyze')}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>Analyze another take</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Home')}
        style={[sharedStyles.button, styles.secondaryButton]}
      >
        <Text style={sharedStyles.buttonText}>Home</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  badgeText: {
    fontSize: 15,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: '800',
    color: colors.text,
  },
  heroUnit: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textMuted,
  },
  stage: {
    height: STAGE_HEIGHT,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tableJoint: {
    flex: 2,
  },
  tableCell: {
    flex: 1,
    textAlign: 'right',
  },
  secondaryButton: {
    backgroundColor: colors.surfaceRaised,
  },
});
