/**
 * Card — docs/DESIGN.md §7 (kit inventory) and §2/§4 (surface tiers, radius
 * rule: cards use radii.md).
 *
 * Tier-1 surface container with a `raised` (tier-2) variant and optional
 * pressable behaviour. Spacing between cards is the parent's job — Card sets
 * no external margin. Do NOT nest a Card inside another Card (one container
 * level per element, DESIGN.md §4).
 *
 * Optional `scrollY` wires the top-edge catchlight to the parent
 * ScrollView's position so it subtly brightens/dims as the screen scrolls
 * instead of sitting static (2026 audit: static glass reads flat; Linear's
 * reactive-highlight technique). Interaction-driven, not an autonomous
 * loop — it only moves while the user scrolls, so it does not trip the
 * "no looping pulses on static elements" rule (§5). Reserve this for a
 * screen's ONE hero card, not every card, to keep the effect a signature
 * rather than visual noise.
 */
import { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { colors, motion, radii, spacing } from '../theme';
import { useReducedMotion } from './useReducedMotion';

/** Brighter than colors.glassHighlight (same warm-white hue) so the
 * animated sweep reads clearly against the static hairline underneath. */
const REACTIVE_HIGHLIGHT_COLOR = 'rgba(255,253,245,0.22)';
/** Scroll distance (px) for one full brighten/dim cycle. */
const REACTIVE_PERIOD_PX = 480;

export interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'raised';
  padded?: boolean;
  onPress?: () => void;
  /** Parent ScrollView's native-driven scroll position — see class doc. */
  scrollY?: Animated.Value;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function Card({
  children,
  variant = 'default',
  padded = true,
  onPress,
  scrollY,
  style,
  testID,
  accessibilityLabel,
}: CardProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const reactiveHighlightOpacity = useMemo(() => {
    if (!scrollY || reducedMotion) {
      return null;
    }
    const wave = Animated.modulo(scrollY, REACTIVE_PERIOD_PX);
    return wave.interpolate({
      inputRange: [0, REACTIVE_PERIOD_PX / 2, REACTIVE_PERIOD_PX],
      outputRange: [0.3, 1, 0.3],
    });
  }, [scrollY, reducedMotion]);

  const reactiveHighlight = reactiveHighlightOpacity ? (
    <Animated.View
      pointerEvents="none"
      style={[styles.reactiveHighlight, { opacity: reactiveHighlightOpacity }]}
    />
  ) : null;

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
        {reactiveHighlight}
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
        {reactiveHighlight}
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
    // Glass catchlight: the top edge is the only brightened border
    // (DESIGN.md §2/§8).
    borderTopColor: colors.glassHighlight,
    // Clips the reactive highlight overlay to the card's rounded corners.
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.md,
  },
  reactiveHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: REACTIVE_HIGHLIGHT_COLOR,
  },
});
