/**
 * SegmentedControl — docs/DESIGN.md §7 (kit inventory), §2 (stage track),
 * §4 (radius sm for track/thumb), §5 (150ms thumb slide).
 *
 * Sliding-thumb segment row. Each segment is an individual button with
 * accessibilityState.selected so screens/tests can query by role + name.
 * Thumb slide is Animated (native driver); reduce-motion jumps instantly.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import { colors, motion, radii } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface SegmentedControlOption {
  label: string;
  value: string;
  accessibilityLabel?: string;
}

export interface SegmentedControlProps {
  options: ReadonlyArray<SegmentedControlOption>;
  value: string;
  onChange: (value: string) => void;
  testID?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const [segmentWidth, setSegmentWidth] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;

  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  useEffect(() => {
    const target = selectedIndex * segmentWidth;
    if (reducedMotion || segmentWidth === 0) {
      translateX.setValue(target);
      return;
    }
    Animated.timing(translateX, {
      toValue: target,
      duration: motion.duration.fast,
      easing: motion.easing.enter,
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, segmentWidth, reducedMotion, translateX]);

  const onTrackLayout = (event: LayoutChangeEvent) => {
    const trackWidth = event.nativeEvent.layout.width;
    const innerWidth = trackWidth - 2 * styles.track.padding;
    setSegmentWidth(options.length > 0 ? innerWidth / options.length : 0);
  };

  return (
    <View testID={testID} style={styles.track} onLayout={onTrackLayout}>
      {segmentWidth > 0 ? (
        <Animated.View
          style={[
            styles.thumb,
            { width: segmentWidth, transform: [{ translateX }] },
          ]}
        />
      ) : null}
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityLabel={opt.accessibilityLabel}
            accessibilityState={{ selected }}
            onPress={() => onChange(opt.value)}
            style={styles.segment}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.stage,
    borderRadius: radii.sm + 2,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    height: 36,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  segment: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.textMuted,
  },
  labelSelected: {
    fontWeight: '600',
    color: colors.text,
  },
});
