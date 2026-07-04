/**
 * Button — docs/DESIGN.md §7 (kit inventory) and §5 (press motion).
 *
 * Pill CTA with primary / secondary / ghost / danger variants, three sizes,
 * Animated press scale (0.97, reduce-motion aware), and loading/disabled
 * states. The visible label is the accessible name.
 */
import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, motion, radii, spacing } from '../theme';
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
    bgPressed: 'rgba(255,255,255,0.06)',
    label: colors.accent,
  },
  danger: {
    bg: colors.danger,
    bgPressed: '#C93A3F',
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

  const animateScale = (toValue: number) => {
    if (reducedMotion) {
      return;
    }
    Animated.timing(scale, {
      toValue,
      duration: motion.duration.press,
      easing: motion.easing.standard,
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
        onPressIn={() => animateScale(0.97)}
        onPressOut={() => animateScale(1)}
        style={({ pressed }) => [
          styles.base,
          sizeStyles[size],
          variant === 'secondary' && styles.secondaryBorder,
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
  lg: { height: 52, paddingHorizontal: spacing.lg },
  md: { height: 44, paddingHorizontal: spacing.md },
  sm: { height: 36, paddingHorizontal: spacing.md },
});

const labelSizeStyles = StyleSheet.create({
  lg: { fontSize: 16 },
  md: { fontSize: 15 },
  sm: { fontSize: 13 },
});
