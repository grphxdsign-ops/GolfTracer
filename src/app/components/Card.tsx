/**
 * Card — docs/DESIGN.md §7 (kit inventory) and §2/§4 (surface tiers, radius
 * rule: cards use radii.md).
 *
 * Tier-1 surface container with a `raised` (tier-2) variant and optional
 * pressable behaviour. Spacing between cards is the parent's job — Card sets
 * no external margin. Do NOT nest a Card inside another Card (one container
 * level per element, DESIGN.md §4).
 */
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, motion, radii, spacing } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'raised';
  padded?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Card({
  children,
  variant = 'default',
  padded = true,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: CardProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const raised = variant === 'raised';
  const baseBg = raised ? colors.surfaceRaised : colors.surface;
  // Pressed state lightens one surface tier.
  const pressedBg = raised ? colors.overlay : colors.surfaceRaised;

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

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.base,
          { backgroundColor: baseBg },
          padded && styles.padded,
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={() => animateScale(0.99)}
        onPressOut={() => animateScale(1)}
        style={({ pressed }) => [
          styles.base,
          { backgroundColor: pressed ? pressedBg : baseBg },
          padded && styles.padded,
          style,
        ]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  padded: {
    padding: spacing.md,
  },
});
