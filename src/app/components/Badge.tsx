/**
 * Badge — docs/DESIGN.md §7 (kit inventory) and §2 (semantic tones), §4
 * (pill radius for badges).
 *
 * Pill status tag, tone-tinted (text color + alpha(tone, 0.16) background;
 * neutral rides the tier-3 overlay glass). `outline` swaps this for a
 * crisp hairline-bordered, no-fill treatment for locked/unavailable states
 * (2026 audit: a dark tinted fill over dark glass reads muddy/half-broken;
 * a thin border reads as a deliberate locked state, not a bug — Linear's
 * convention). Outline text matches the `overline` role's proportions
 * (11/14, 600, +0.66 tracked, uppercase) without spending the screen's
 * one-`overline` budget (DESIGN.md §8) — this is a locked-pill treatment,
 * not a section eyebrow.
 */
import { StyleSheet, Text, View } from 'react-native';

import { alpha, colors, radii, spacing } from '../theme';

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Hairline-border, no-fill treatment for locked/unavailable states. Ignores `tone`. */
  outline?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

const toneColors: Record<BadgeTone, { text: string; bg: string }> = {
  neutral: { text: colors.textMuted, bg: colors.overlay },
  success: { text: colors.success, bg: alpha(colors.success, 0.16) },
  warning: { text: colors.warning, bg: alpha(colors.warning, 0.16) },
  danger: { text: colors.danger, bg: alpha(colors.danger, 0.16) },
  accent: { text: colors.accent, bg: alpha(colors.accent, 0.16) },
};

export function Badge({
  label,
  tone = 'neutral',
  outline = false,
  testID,
  accessibilityLabel,
}: BadgeProps): React.JSX.Element {
  const palette = toneColors[tone];
  return (
    <View
      testID={testID}
      style={[
        styles.pill,
        outline
          ? styles.outlinePill
          : { backgroundColor: palette.bg },
      ]}
    >
      <Text
        accessibilityLabel={accessibilityLabel}
        style={[
          outline ? styles.outlineLabel : styles.label,
          !outline && { color: palette.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  outlinePill: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  outlineLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.66,
    textTransform: 'uppercase',
    color: colors.textDisabled,
  },
});
