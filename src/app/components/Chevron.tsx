/**
 * Chevron — docs/DESIGN.md §7 (kit inventory) and §8 (anti-slop: no raw
 * keyboard-glyph indicators like `›`/`▸`/`▾` — they scale and align
 * inconsistently across platforms/fonts).
 *
 * A single geometric corner ("border-corner" technique: two adjacent
 * borders of a rotated square) doubling as every angled indicator in the
 * kit — disclosure chevrons (right/down for collapsed/expanded, list-row
 * affordances) AND TrendPill's diagonal trend arrow (rotateDeg -45/45).
 * Self-contained: animates smoothly between angles on prop change.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { colors, motion } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface ChevronProps {
  /** Rotation in degrees; 0 = pointing right. Common: 90 down, -90 up,
   * 180 left, -45/45 diagonal (TrendPill up/down). */
  rotateDeg?: number;
  /** Overall box size in pt. Default 16. */
  size?: number;
  strokeWidth?: number;
  color?: string;
  testID?: string;
}

export function Chevron({
  rotateDeg = 0,
  size = 16,
  strokeWidth = 1.5,
  color = colors.textDisabled,
  testID,
}: ChevronProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const angle = useRef(new Animated.Value(rotateDeg)).current;

  useEffect(() => {
    if (reducedMotion) {
      angle.setValue(rotateDeg);
      return;
    }
    Animated.timing(angle, {
      toValue: rotateDeg,
      duration: motion.duration.fast,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  }, [rotateDeg, reducedMotion, angle]);

  const cornerSize = size * 0.56;
  // Identity map: `angle` already holds the target degrees; interpolate
  // just converts the number to the 'Ndeg' string transform requires. Range
  // is wide enough to cover every angle this kit passes (-90..180).
  const rotate = angle.interpolate({
    inputRange: [-360, 360],
    outputRange: ['-360deg', '360deg'],
  });

  return (
    <Animated.View
      testID={testID}
      style={[styles.box, { width: size, height: size, transform: [{ rotate }] }]}
    >
      {/* Border-corner technique: right+bottom borders on a square rotated
          -45deg render a ">" — the outer Animated rotation reorients it. */}
      <View
        style={{
          width: cornerSize,
          height: cornerSize,
          borderRightWidth: strokeWidth,
          borderBottomWidth: strokeWidth,
          borderColor: color,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
