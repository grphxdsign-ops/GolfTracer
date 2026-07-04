/**
 * Button — docs/DESIGN.md §7 (kit inventory) and §5 (press pop, the
 * Framer-grade sanctioned exception).
 *
 * Pill CTA with primary / secondary / ghost / danger variants, three sizes,
 * a two-beat asymmetric press (timing down, spring back up with one
 * overshoot), a brand glow on the primary fill that flattens while pressed,
 * and loading/disabled states. The visible label is the accessible name.
 * Reduce-motion: no scale, color swap only.
 */
import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, radii, spacing } from '../theme';
import { useReducedMotion } from './useReducedMotion';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'lg' | 'md' | 'sm';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const variantColors: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; label: string }
> = {
  primary: {
    bg: colors.primary,
    bgPressed: colors.primaryPressed,
    label: colors.textOnAccent,
  },
  secondary: {
    bg: colors.surfaceRaised,
    bgPressed: colors.overlay,
    label: colors.text,
  },
  ghost: {
    bg: 'transparent',
    // Pressed state gains the tier-1 warm glass fill.
    bgPressed: colors.surface,
    label: colors.accent,
  },
  danger: {
    bg: colors.danger,
    bgPressed: colors.dangerPressed,
    label: colors.text,
  },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  loadingLabel,
  testID,
  accessibilityLabel,
  style,
}: ButtonProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const palette = variantColors[variant];
  const inactive = disabled || loading;

  // Press pop (DESIGN.md §5): press-in is a quick ease-out timing — never a
  // spring on the way down; release is a spring with exactly one ~0.3%
  // overshoot. Reduce-motion skips the scale entirely (color swap only).
  const pressIn = () => {
    if (reducedMotion) {
      return;
    }
    Animated.timing(scale, {
      toValue: 0.97,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const pressOut = () => {
    if (reducedMotion) {
      return;
    }
    Animated.spring(scale, {
      toValue: 1,
      stiffness: 400,
      damping: 22,
      mass: 1,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={
          loading ? { busy: true, disabled: true } : { disabled }
        }
        disabled={inactive}
        // 36pt sm pill + hitSlop = >=44pt effective touch target (HIG minimum),
        // matching Chip's approach; lg/md already meet 44pt visually.
        hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [
          styles.base,
          sizeStyles[size],
          variant === 'secondary' && styles.secondaryBorder,
          // Primary CTA carries the brand glow; pressed = flatten (glow
          // collapses, fill darkens one step) — DESIGN.md §5.
          variant === 'primary' && !pressed && !inactive && styles.primaryGlow,
          { backgroundColor: pressed ? palette.bgPressed : palette.bg },
          inactive && styles.inactive,
        ]}
      >
        {loading ? (
          <>
            <ActivityIndicator size="small" color={palette.label} />
            {loadingLabel ? (
              <Text
                style={[
                  styles.label,
                  labelSizeStyles[size],
                  { color: palette.label },
                  styles.loadingLabel,
                ]}
              >
                {loadingLabel}
              </Text>
            ) : null}
          </>
        ) : (
          <Text
            style={[styles.label, labelSizeStyles[size], { color: palette.label }]}
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  secondaryBorder: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  primaryGlow: {
    shadowColor: colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  inactive: {
    opacity: 0.4,
  },
  label: {
    fontWeight: '600',
  },
  loadingLabel: {
    marginLeft: spacing.sm,
  },
});

const sizeStyles = StyleSheet.create({
  lg: { height: 52, paddingHorizontal: spacing.lg + 2 },
  md: { height: 44, paddingHorizontal: spacing.md },
  sm: { height: 36, paddingHorizontal: spacing.md },
});

const labelSizeStyles = StyleSheet.create({
  lg: { fontSize: 17 },
  md: { fontSize: 15 },
  sm: { fontSize: 13 },
});
