/**
 * SportTile — hero selection tile for the sport picker, docs/DESIGN.md §10
 * (onboarding tiles) and §5 (press pop; tiles scale 0.98 — big surfaces read
 * absolute pixel travel).
 *
 * Glossy glass tile (radii.xl per the §4 shape lock): Skia brand icon left,
 * name + tagline stacked right, check badge top-right when selected.
 * Selected = primary hairline ring + alpha(primary, 0.14) wash; the check
 * pops in with a spring from scale 0.5 (never from 0) + a 120ms fade.
 * Unavailable sports render dimmed with a "Coming soon" badge and stay
 * unselectable. Reduce-motion: color swaps only, no scale.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SportEntry } from '../../modules/sports/sportCatalog';
import { alpha, colors, motion, radii, spacing, typography } from '../theme';
import { Badge } from './Badge';
import { SportIcon } from './SportIcon';
import { useReducedMotion } from './useReducedMotion';

export interface SportTileProps {
  sport: SportEntry;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

const ICON_SIZE = 44;
const CHECK_SIZE = 20;

export function SportTile({
  sport,
  selected,
  onPress,
  testID,
}: SportTileProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const checkScale = useRef(new Animated.Value(selected ? 1 : 0.5)).current;
  const checkOpacity = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const unavailable = sport.available === false;

  useEffect(() => {
    if (!selected) {
      // Badge unmounts when deselected — just re-arm the entrance values.
      checkScale.setValue(0.5);
      checkOpacity.setValue(0);
      return;
    }
    if (reducedMotion) {
      checkScale.setValue(1);
      checkOpacity.setValue(1);
      return;
    }
    // Check entrance (DESIGN.md §10): spring from 0.5 — never from 0 — with
    // a quick opacity ramp so the pop reads as arrival, not inflation.
    Animated.parallel([
      Animated.spring(checkScale, {
        toValue: 1,
        stiffness: 600,
        damping: 18,
        mass: 0.8,
        useNativeDriver: true,
      }),
      Animated.timing(checkOpacity, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  }, [selected, reducedMotion, checkScale, checkOpacity]);

  // Tile pop (DESIGN.md §5): ease-out timing down, one-overshoot spring back.
  const pressIn = () => {
    if (reducedMotion) {
      return;
    }
    Animated.timing(scale, {
      toValue: 0.98,
      duration: motion.duration.press,
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
      ...motion.spring.press,
      useNativeDriver: true,
    }).start();
  };

  const accessibilityLabel = unavailable
    ? `${sport.name}, ${sport.tagline}, coming soon`
    : `${sport.name}, ${sport.tagline}`;

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ selected, disabled: unavailable }}
        disabled={unavailable}
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={({ pressed }) => [
          styles.tile,
          selected && styles.tileSelected,
          !selected && pressed && styles.tilePressed,
          unavailable && styles.tileUnavailable,
        ]}
      >
        <View style={unavailable && styles.contentDim}>
          <SportIcon sport={sport.icon} size={ICON_SIZE} />
        </View>
        <View style={[styles.copy, unavailable && styles.contentDim]}>
          <Text style={typography.subtitle}>{sport.name}</Text>
          <Text style={[typography.label, styles.tagline]}>{sport.tagline}</Text>
        </View>
        {unavailable ? (
          <View style={styles.corner}>
            <Badge label="Coming soon" outline />
          </View>
        ) : null}
        {selected ? (
          <Animated.View
            testID={testID ? `${testID}-check` : undefined}
            style={[
              styles.corner,
              styles.check,
              { opacity: checkOpacity, transform: [{ scale: checkScale }] },
            ]}
          >
            <Text style={styles.checkGlyph}>✓</Text>
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 104,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    // Glass catchlight: top edge only (DESIGN.md §2/§8).
    borderTopColor: colors.glassHighlight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  tileSelected: {
    backgroundColor: alpha(colors.primary, 0.14),
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderTopColor: colors.primary,
  },
  // Glass presses by lightening one tier — never opacity-dimming
  // (DESIGN.md §5); doubles as the reduce-motion press feedback.
  tilePressed: {
    backgroundColor: colors.surfaceRaised,
  },
  // Recedes further than the resting glass fill instead of dimming the
  // whole tile (2026 audit: a uniformly-dimmed dark badge over dark glass
  // read muddy/half-broken) — same warm-cream hue as colors.surface, at a
  // fainter opacity so the tile visibly sits behind selectable ones.
  tileUnavailable: {
    backgroundColor: 'rgba(255,251,235,0.02)',
  },
  contentDim: {
    opacity: 0.55,
  },
  copy: {
    flex: 1,
    marginLeft: spacing.md,
    // Keep name/tagline clear of the top-right badge.
    paddingRight: spacing.lg,
  },
  tagline: {
    marginTop: spacing.xs,
  },
  corner: {
    position: 'absolute',
    top: spacing.sm + spacing.xs,
    right: spacing.sm + spacing.xs,
  },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: {
    color: colors.textOnAccent,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
});
