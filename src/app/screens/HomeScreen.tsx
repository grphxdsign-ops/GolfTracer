/**
 * Home screen — part of the scaffold-owned app shell. Drives the pipeline:
 * Record/Import → Review → Analyze → TracerPreview → Calibration → Results.
 */
import { Pressable, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../types/navigation';
import { useSessionStore } from '../../state/sessionStore';
import { colors, sharedStyles, spacing, typography } from '../theme';

type HomeNavigation = NativeStackNavigationProp<RootStackParamList, 'Home'>;

interface ActionButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}

function ActionButton({ label, onPress, disabled = false }: ActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[sharedStyles.button, disabled && sharedStyles.buttonDisabled]}
    >
      <Text
        style={[
          sharedStyles.buttonText,
          disabled && sharedStyles.buttonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface StatusRowProps {
  label: string;
  value: string;
  done: boolean;
}

function StatusRow({ label, value, done }: StatusRowProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: spacing.xs,
      }}
    >
      <Text style={typography.label}>{label}</Text>
      <Text
        style={[typography.body, { color: done ? colors.accent : colors.textMuted }]}
      >
        {value}
      </Text>
    </View>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigation>();
  const video = useSessionStore((s) => s.video);
  const trackingStatus = useSessionStore((s) => s.trackingStatus);
  const trackingResult = useSessionStore((s) => s.trackingResult);
  const distance = useSessionStore((s) => s.distance);

  const videoLabel = video
    ? `${video.source} · ${video.fps} fps · ${(video.durationMs / 1000).toFixed(1)}s`
    : 'No video';
  const trackingLabel = trackingResult
    ? `Done (${trackingResult.track.quality})`
    : trackingStatus === 'idle'
      ? 'Not started'
      : trackingStatus;
  const distanceLabel = distance
    ? `${Math.round(distance.carryYards)} yds carry`
    : 'Not estimated';

  return (
    <View style={sharedStyles.screen}>
      <Text style={[typography.title, { marginBottom: spacing.xs }]}>
        GolfTracer AI
      </Text>
      <Text style={[typography.subtitle, { marginBottom: spacing.lg }]}>
        Trace your ball flight. Know your distance.
      </Text>

      <View style={sharedStyles.card}>
        <StatusRow label="Video" value={videoLabel} done={video !== null} />
        <StatusRow
          label="Tracking"
          value={trackingLabel}
          done={trackingResult !== null}
        />
        <StatusRow
          label="Distance"
          value={distanceLabel}
          done={distance !== null}
        />
      </View>

      <ActionButton label="Record" onPress={() => navigation.navigate('Record')} />
      <ActionButton label="Import" onPress={() => navigation.navigate('Import')} />
      <ActionButton
        label="Analyze"
        disabled={video === null}
        onPress={() => navigation.navigate('Analyze')}
      />
      <ActionButton
        label="Distance"
        disabled={trackingResult === null}
        onPress={() => navigation.navigate('Calibration')}
      />
    </View>
  );
}
