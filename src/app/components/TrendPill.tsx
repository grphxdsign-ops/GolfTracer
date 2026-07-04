/**
 * TrendPill — delta chip for stats, docs/DESIGN.md §2 (semantic tints via
 * alpha()), §3 (tabular numerals), §4 (pill radius).
 *
 * Arrow + magnitude in a tinted glass pill. Which direction counts as
 * improving is the CALLER's job via `goodDirection`: improving rides
 * alpha(success, 0.16) with success text, declining alpha(danger, 0.16)
 * with danger text. A zero delta — or one under 1% of `base` when a base is
 * supplied — reads "even" on the neutral tier-3 overlay tint.
 */
import { StyleSheet, Text, View } from 'react-native';

import { alpha, colors, radii, spacing } from '../theme';

export interface TrendPillProps {
  /** Signed change versus the comparison value (e.g. +12, -3.5). */
  delta: number;
  /** Unit rendered after the magnitude and spoken in the a11y label. */
  unit?: string;
  /** Formats the unsigned magnitude; default trims to one decimal. */
  format?: (n: number) => string;
  /**
   * Which way is improving — the caller's semantics ("up" for carry
   * distance, "down" for dispersion).
   */
  goodDirection: 'up' | 'down';
  /**
   * Comparison base: deltas under 1% of it render neutral ("even") instead
   * of implying a real trend. Omit to treat only exact 0 as even.
   */
  base?: number;
  testID?: string;
}

const defaultFormat = (n: number): string =>
  String(Number.isInteger(n) ? n : Number(n.toFixed(1)));

export function TrendPill({
  delta,
  unit,
  format = defaultFormat,
  goodDirection,
  base,
  testID,
}: TrendPillProps): React.JSX.Element {
  const even =
    delta === 0 ||
    (base !== undefined && Math.abs(delta) < Math.abs(base) * 0.01);
  const up = delta > 0;
  const improving = up === (goodDirection === 'up');

  const tint = even
    ? { text: colors.textMuted, bg: colors.overlay }
    : improving
      ? { text: colors.success, bg: alpha(colors.success, 0.16) }
      : { text: colors.danger, bg: alpha(colors.danger, 0.16) };

  const arrow = even ? '→' : up ? '↑' : '↓';
  const magnitude = even ? 'even' : format(Math.abs(delta));
  const spokenUnit = unit ? ` ${unit}` : '';
  const accessibilityLabel = even
    ? 'even with your average'
    : `${up ? 'up' : 'down'} ${magnitude}${spokenUnit} versus your average`;

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.pill, { backgroundColor: tint.bg }]}
    >
      <Text style={[styles.arrow, { color: tint.text }]}>{arrow}</Text>
      <Text style={[styles.magnitude, { color: tint.text }]}>{magnitude}</Text>
      {!even && unit ? (
        <Text style={[styles.unit, { color: tint.text }]}>{unit}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  arrow: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  magnitude: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    marginLeft: 3,
    opacity: 0.8,
  },
});
