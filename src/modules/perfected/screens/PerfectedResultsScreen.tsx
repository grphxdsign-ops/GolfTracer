/**
 * Perfected Results screen: the saved PerfectedResult — target joint-angle
 * table, perfected flight numbers, coaching notes with citations, and a
 * video export (fake exporter in this environment; the native adapter
 * documents the on-device encode path).
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../types';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
import { useSportsSessionStore } from '../../sports/sportsSessionStore';
import { renderPerfectedFrames } from '../render/dummyRenderer';
import { FakeVideoExporter } from '../export/VideoExporter';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipValue}>{value}</Text>
      <Text style={typography.label}>{label}</Text>
    </View>
  );
}

export function PerfectedResultsScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const result = useSportsSessionStore((s) => s.perfectedResult);
  const setPerfectedResult = useSportsSessionStore((s) => s.setPerfectedResult);
  const exporter = useMemo(() => new FakeVideoExporter(), []);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  if (!result) {
    return (
      <View style={sharedStyles.centered}>
        <Text style={typography.title}>No perfected action yet</Text>
        <Text style={[typography.subtitle, { marginBottom: spacing.lg }]}>
          Build one from the Perfected Action screen first.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.navigate('Home')}
          style={sharedStyles.button}
        >
          <Text style={sharedStyles.buttonText}>Home</Text>
        </Pressable>
      </View>
    );
  }

  const handleExport = () => {
    const frames = renderPerfectedFrames(result.morphedFrames, result.flight);
    exporter
      .exportVideo({ frames, fps: 30, widthPx: 640, heightPx: 360 })
      .then((video) => {
        setExportStatus(
          `Exported ${video.frameCount} frames (${video.buffer.length} bytes)`,
        );
      })
      .catch((error: unknown) => {
        setExportStatus(
          error instanceof Error ? error.message : 'Export failed',
        );
      });
  };

  const handleReset = () => {
    setPerfectedResult(null);
    navigation.navigate('Home');
  };

  const angleRows: { label: string; left: number; right: number }[] = [
    {
      label: 'Shoulder-hip',
      left: result.targetAngles.left.shoulderHip,
      right: result.targetAngles.right.shoulderHip,
    },
    {
      label: 'Hip-knee',
      left: result.targetAngles.left.hipKnee,
      right: result.targetAngles.right.hipKnee,
    },
    {
      label: 'Knee-ankle',
      left: result.targetAngles.left.kneeAnkle,
      right: result.targetAngles.right.kneeAnkle,
    },
  ];

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <Text style={typography.title}>Perfected Results</Text>
      <Text style={[typography.label, { marginBottom: spacing.md }]}>
        {result.sport} · {result.morphedFrames.length} dummy frames
      </Text>

      <View style={styles.chipRow}>
        <Chip label="Range" value={`${result.flight.rangeM.toFixed(1)} m`} />
        <Chip label="Apex" value={`${result.flight.apexM.toFixed(1)} m`} />
        <Chip label="Flight" value={`${result.flight.flightTimeS.toFixed(2)} s`} />
        <Chip
          label="Landing"
          value={`${(result.flight.landingSpeedMps * 3.6).toFixed(0)} km/h`}
        />
      </View>

      <View style={sharedStyles.card}>
        <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
          Target joint angles at contact
        </Text>
        <View style={styles.tableHeader}>
          <Text style={[typography.label, styles.tableCell]}>Joint</Text>
          <Text style={[typography.label, styles.tableCell]}>Left</Text>
          <Text style={[typography.label, styles.tableCell]}>Right</Text>
        </View>
        {angleRows.map((row) => (
          <View key={row.label} style={styles.tableRow}>
            <Text style={[typography.body, styles.tableCell]}>{row.label}</Text>
            <Text style={[typography.body, styles.tableCell]}>
              {row.left.toFixed(0)}°
            </Text>
            <Text style={[typography.body, styles.tableCell]}>
              {row.right.toFixed(0)}°
            </Text>
          </View>
        ))}
      </View>

      <View style={sharedStyles.card}>
        <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
          What changed
        </Text>
        {result.notes.map((note, i) => (
          <Text key={i} style={[typography.label, { marginBottom: spacing.xs }]}>
            • {note}
          </Text>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleExport}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>Export video</Text>
      </Pressable>
      {exportStatus !== null ? (
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>
          {exportStatus}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={handleReset}
        style={[sharedStyles.button, styles.secondaryButton]}
      >
        <Text style={sharedStyles.buttonText}>Done</Text>
      </Pressable>
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
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minWidth: 78,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: spacing.xs,
    marginBottom: spacing.xs,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  tableCell: {
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: colors.surfaceRaised,
  },
});
