/**
 * ProgressBar — docs/DESIGN.md §7 (kit inventory) and §5 (transform-only
 * animation, native driver), §4 (pill radius for progress bars).
 *
 * Determinate bar with a scaleX-animated fill (translateX + scaleX pair to
 * anchor the scale at the left edge). Reduce-motion sets the value
 * instantly.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

import { colors, motion, radii } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface ProgressBarProps {
  /** 0..1, clamped. */
  progress: number;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ProgressBar({
  progress,
  accessibilityLabel,
  testID,
  style,
}: ProgressBarProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const clamped = Math.min(1, Math.max(0, progress));
  const anim = useRef(new Animated.Value(clamped)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    if (reducedMotion) {
      anim.setValue(clamped);
      return;
    }
    Animated.timing(anim, {
      toValue: clamped,
      duration: motion.duration.base,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [clamped, reducedMotion, anim]);

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  // scaleX scales about the center, so shift left by half the collapsed
  // width to keep the fill anchored at the left edge.
  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth / 2, 0],
  });

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[styles.track, style]}
      onLayout={onLayout}
    >
      <Animated.View
        style={[
          styles.fill,
          { transform: [{ translateX }, { scaleX: anim }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    width: '100%',
    backgroundColor: colors.primary,
  },
});
