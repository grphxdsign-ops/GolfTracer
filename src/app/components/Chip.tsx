/**
 * Chip — docs/DESIGN.md §7 (kit inventory) and §4 (pill radius for chips).
 *
 * Pill stat chip (label + optional tabular value) or selectable chip
 * (selected ring + primary tint). When pressable, the visible label stays
 * the accessible name so tests can press by text.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, colors, radii, spacing } from '../theme';

export interface ChipProps {
  label: string;
  value?: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

export function Chip({
  label,
  value,
  selected = false,
  onPress,
  disabled = false,
  testID,
  accessibilityLabel,
}: ChipProps): React.JSX.Element {
  const content = (
    <>
      <Text
        style={[
          styles.label,
          selected && styles.labelSelected,
          disabled && styles.labelDisabled,
        ]}
      >
        {label}
      </Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
    </>
  );

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={styles.pill}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      // 32pt visual pill + hitSlop = >=44pt effective touch target (HIG minimum).
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        pressed && styles.pillPressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill,
    height: 32,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  pillSelected: {
    backgroundColor: alpha(colors.primary, 0.16),
    borderWidth: 1,
    borderColor: colors.primary,
  },
  pillPressed: {
    opacity: 0.85,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.text,
    fontWeight: '600',
  },
  labelDisabled: {
    color: colors.textDisabled,
  },
  value: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    marginLeft: spacing.xs,
  },
});
