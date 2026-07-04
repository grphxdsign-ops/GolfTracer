/**
 * StatTile — docs/DESIGN.md §7 (kit inventory) and §3 (tabular numerals,
 * unit-demoted broadcast numbers; "~" for estimates, never fake precision).
 *
 * hero: label above a display-size value with a demoted unit.
 * standard: mid-size value + unit, caption label below.
 * compact: single status row — label left, value+unit right.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';

export interface StatTileProps {
  value: string;
  unit?: string;
  label: string;
  size?: 'hero' | 'standard' | 'compact';
  approx?: boolean;
  tone?: 'default' | 'muted';
  testID?: string;
}

export function StatTile({
  value,
  unit,
  label,
  size = 'standard',
  approx = false,
  tone = 'default',
  testID,
}: StatTileProps): React.JSX.Element {
  const a11yLabel = `${label}: ${approx ? 'about ' : ''}${value}${
    unit ? ` ${unit}` : ''
  }`;
  const displayValue = approx ? `~${value}` : value;
  const mutedValue = tone === 'muted' || approx;

  if (size === 'hero') {
    return (
      <View accessible accessibilityLabel={a11yLabel} testID={testID}>
        <Text style={typography.label}>{label}</Text>
        <View style={styles.heroRow}>
          <Text style={typography.display}>{displayValue}</Text>
          {unit ? <Text style={styles.heroUnit}>{unit}</Text> : null}
        </View>
      </View>
    );
  }

  if (size === 'compact') {
    return (
      <View
        accessible
        accessibilityLabel={a11yLabel}
        testID={testID}
        style={styles.compactRow}
      >
        <Text style={[typography.label, styles.compactLabel]}>{label}</Text>
        <Text style={[styles.compactValue, mutedValue && styles.valueMuted]}>
          {displayValue}
        </Text>
        {unit ? <Text style={styles.unitCaption}>{unit}</Text> : null}
      </View>
    );
  }

  return (
    <View accessible accessibilityLabel={a11yLabel} testID={testID}>
      <View style={styles.standardRow}>
        <Text style={[styles.standardValue, mutedValue && styles.valueMuted]}>
          {displayValue}
        </Text>
        {unit ? <Text style={styles.unitCaption}>{unit}</Text> : null}
      </View>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  heroUnit: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.textMuted,
    marginLeft: spacing.xs,
    paddingBottom: 6,
  },
  standardRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  standardValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactLabel: {
    flex: 1,
  },
  compactValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  valueMuted: {
    color: colors.textMuted,
  },
  unitCaption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginLeft: spacing.xs,
    paddingBottom: 2,
  },
});
