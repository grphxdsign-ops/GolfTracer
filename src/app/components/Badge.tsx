/**
 * Badge — docs/DESIGN.md §7 (kit inventory) and §2 (semantic tones), §4
 * (pill radius for badges).
 *
 * Pill status tag, tone-tinted (text color + 16% alpha background of the
 * tone color). No borders, no icons in v1.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../theme';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  testID?: string;
  accessibilityLabel?: string;
}

const toneColors: Record<BadgeTone, { text: string; bg: string }> = {
  neutral: { text: colors.textMuted, bg: 'rgba(255,255,255,0.08)' },
  success: { text: colors.success, bg: 'rgba(74,201,126,0.16)' },
  warning: { text: colors.warning, bg: 'rgba(224,168,62,0.16)' },
  danger: { text: colors.danger, bg: 'rgba(229,72,77,0.16)' },
  accent: { text: colors.accent, bg: 'rgba(143,227,168,0.16)' },
};

export function Badge({
  label,
  tone = 'neutral',
  testID,
  accessibilityLabel,
}: BadgeProps): React.JSX.Element {
  const palette = toneColors[tone];
  return (
    <View
      testID={testID}
      style={[styles.pill, { backgroundColor: palette.bg }]}
    >
      <Text
        accessibilityLabel={accessibilityLabel}
        style={[styles.label, { color: palette.text }]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
});
