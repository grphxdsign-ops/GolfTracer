/**
 * SectionLabel — docs/DESIGN.md §7 (kit inventory) and §3 (13/600 muted
 * section marker).
 *
 * Sentence case is a copy convention (DESIGN.md §3: "sentence case
 * everywhere") — no textTransform is applied; callers pass sentence-case
 * strings.
 */
import { StyleSheet, Text } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

import { colors, spacing } from '../theme';

export interface SectionLabelProps {
  children: string;
  style?: StyleProp<TextStyle>;
}

export function SectionLabel({
  children,
  style,
}: SectionLabelProps): React.JSX.Element {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: 0,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    marginTop: spacing.lg,
  },
});
