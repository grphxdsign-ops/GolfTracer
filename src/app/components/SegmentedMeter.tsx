/**
 * SegmentedMeter — docs/DESIGN.md §7 (kit inventory). A discrete-tick meter
 * for science-grade metrics (confidence scores, staged progress) — the
 * continuous fluid-fill `ProgressBar` reads as a generic battery indicator
 * for these contexts (2026 design audit finding); ProgressBar itself stays
 * available for genuinely continuous determinate progress (e.g. byte
 * upload) where ticks would be arbitrary.
 *
 * Segments update instantly, not animated: this drives live-updating
 * contexts (tracking progress ticking many times/second) where a per-tick
 * crossfade would fight itself — the same "zero lag, 1:1" rule as the
 * scrubber (DESIGN.md §5).
 */
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../theme';

export interface SegmentedMeterProps {
  /** 0..1, clamped. */
  progress: number;
  /** Tick count. Default 10. */
  segments?: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedMeter({
  progress,
  segments = 10,
  accessibilityLabel,
  testID,
  style,
}: SegmentedMeterProps): React.JSX.Element {
  const clamped = Math.min(1, Math.max(0, progress));
  // Guards a bad caller-supplied count (0, negative, non-finite) from
  // rendering an empty/crashing meter.
  const safeSegments = Math.max(1, Math.round(segments));
  const activeCount = Math.round(clamped * safeSegments);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.row, style]}
    >
      {Array.from({ length: safeSegments }).map((_, i) => (
        <View
          key={i}
          style={[styles.segment, i < activeCount ? styles.active : styles.inactive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radii.pill,
  },
  active: {
    backgroundColor: colors.primary,
  },
  inactive: {
    backgroundColor: colors.surfaceRaised,
  },
});
