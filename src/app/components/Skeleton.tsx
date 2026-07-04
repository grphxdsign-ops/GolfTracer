/**
 * Skeleton — docs/DESIGN.md §7 (kit inventory) and §8 (no generic centered
 * spinners — layout-shaped loading blocks), §5 (reduce-motion degrades the
 * loop to a static block).
 *
 * Decorative loading block with a gentle opacity loop; hidden from
 * accessibility.
 */
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';

import { colors, motion, radii } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface SkeletonProps {
  width?: DimensionValue;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Skeleton({
  width,
  height,
  radius = radii.sm,
  style,
  testID,
}: SkeletonProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.6);
      return;
    }
    opacity.setValue(0.45);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 500,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 500,
          easing: motion.easing.standard,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [reducedMotion, opacity]);

  return (
    <Animated.View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.surfaceRaised,
          opacity,
        },
        style,
      ]}
    />
  );
}
