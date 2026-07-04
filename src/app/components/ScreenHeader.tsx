/**
 * ScreenHeader — docs/DESIGN.md §7 (kit inventory) and §3 (`title` role:
 * 28/700, one per screen).
 *
 * In-content title + optional muted subtitle, with an optional trailing
 * node right-aligned. No back button — the native header handles that.
 */
import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, spacing, typography } from '../theme';

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  trailing,
  style,
}: ScreenHeaderProps): React.JSX.Element {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={typography.title}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.lg,
  },
  titleBlock: {
    flex: 1,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
