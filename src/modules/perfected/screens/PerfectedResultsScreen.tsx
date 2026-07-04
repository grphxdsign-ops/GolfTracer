/**
 * Perfected Results screen: the saved PerfectedResult — target joint-angle
 * table, perfected flight numbers, coaching notes with citations, and a
 * video export (fake exporter in this environment; the native adapter
 * documents the on-device encode path).
 *
 * Motion (DESIGN.md §5): a 200ms fade + translateY entrance on the three
 * result groups, 60ms stagger, reduce-motion → instant.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../../../types';
import { colors, motion, sharedStyles, spacing, typography } from '../../../app/theme';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ScreenHeader,
  useReducedMotion,
} from '../../../app/components';
import { useSportsSessionStore } from '../../sports/sportsSessionStore';
import { renderPerfectedFrames } from '../render/dummyRenderer';
import { FakeVideoExporter } from '../export/VideoExporter';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

/** Entrance offset for the section reveal (translateY, px). */
const ENTRANCE_OFFSET = 8;
/** Stagger between the three result groups (DESIGN.md §5: ≤5 × 60ms). */
const ENTRANCE_STAGGER_MS = 60;

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

export function PerfectedResultsScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const result = useSportsSessionStore((s) => s.perfectedResult);
  const setPerfectedResult = useSportsSessionStore((s) => s.setPerfectedResult);
  const exporter = useMemo(() => new FakeVideoExporter(), []);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  if (!result) {
    return (
      <View style={sharedStyles.centered}>
        <EmptyState
          title="No perfected action yet"
          body="Build one from the Perfected Action screen first."
          actionLabel="Home"
          onAction={() => navigation.navigate('Home')}
        />
      </View>
    );
  }

  const handleExport = () => {
    const frames = renderPerfectedFrames(result.morphedFrames, result.flight);
    exporter
      .exportVideo({ frames, fps: 30, widthPx: 640, heightPx: 360 })
      .then(() => {
        setExportStatus('Video exported. Ready to share.');
      })
      .catch(() => {
        setExportStatus("Couldn't export the video. Try again.");
      });
  };

  const handleReset = () => {
    setPerfectedResult(null);
    navigation.navigate('Home');
  };

  // Labels match the soccer JOINT_LABELS casing (en-dash, Title case).
  const angleRows: { label: string; left: number; right: number }[] = [
    {
      label: 'Shoulder–Hip',
      left: result.targetAngles.left.shoulderHip,
      right: result.targetAngles.right.shoulderHip,
    },
    {
      label: 'Hip–Knee',
      left: result.targetAngles.left.hipKnee,
      right: result.targetAngles.right.hipKnee,
    },
    {
      label: 'Knee–Ankle',
      left: result.targetAngles.left.kneeAnkle,
      right: result.targetAngles.right.kneeAnkle,
    },
  ];

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
    >
      <ScreenHeader
        title="Perfected results"
        subtitle={`Perfected ${result.sport} action · target angles and flight`}
      />

      <Reveal order={0} reduced={reduced}>
        <View style={styles.chipRow}>
          <Chip label="Range" value={`${result.flight.rangeM.toFixed(1)} m`} />
          <Chip label="Apex" value={`${result.flight.apexM.toFixed(1)} m`} />
          <Chip
            label="Flight"
            value={`${result.flight.flightTimeS.toFixed(2)} s`}
          />
          <Chip
            label="Landing"
            value={`${(result.flight.landingSpeedMps * 3.6).toFixed(0)} km/h`}
          />
        </View>
      </Reveal>

      <Reveal order={1} reduced={reduced}>
        <Card style={styles.sectionCard}>
          <Text style={[typography.subtitle, styles.cardHeading]}>
            Target joint angles at contact
          </Text>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[typography.caption, styles.tableCell]}>Joint</Text>
            <Text style={[typography.caption, styles.tableCell]}>Left</Text>
            <Text style={[typography.caption, styles.tableCell]}>Right</Text>
          </View>
          {angleRows.map((row) => (
            <View key={row.label} style={styles.tableRow}>
              <Text style={[typography.body, styles.tableCell]}>
                {row.label}
              </Text>
              <Text style={[styles.tableValue, styles.tableCell]}>
                {row.left.toFixed(0)}°
              </Text>
              <Text style={[styles.tableValue, styles.tableCell]}>
                {row.right.toFixed(0)}°
              </Text>
            </View>
          ))}
        </Card>
      </Reveal>

      <Reveal order={2} reduced={reduced}>
        <Card style={styles.sectionCard}>
          <Text style={[typography.subtitle, styles.cardHeading]}>
            What changed
          </Text>
          {result.notes.map((note, i) => (
            <Text key={i} style={styles.note}>
              {note}
            </Text>
          ))}
        </Card>
      </Reveal>

      <Button
        label="Export video"
        variant="secondary"
        onPress={handleExport}
        style={styles.exportButton}
      />
      {exportStatus !== null ? (
        <Text style={styles.exportStatus}>{exportStatus}</Text>
      ) : null}

      <Button label="Done" onPress={handleReset} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionCard: {
    marginBottom: spacing.md,
  },
  cardHeading: {
    marginBottom: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  tableHeader: {
    paddingTop: 0,
  },
  tableCell: {
    flex: 1,
  },
  tableValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  note: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  exportButton: {
    marginBottom: spacing.sm,
  },
  exportStatus: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
});
