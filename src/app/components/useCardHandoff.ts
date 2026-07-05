/**
 * useCardHandoff — docs/DESIGN.md §5/§7. A coordinated handoff for
 * card-to-detail navigation: the source card scales down and fades slightly
 * on confirm-press, then the destination screen takes over. This is
 * deliberately NOT a shared-element transition — native-stack is frozen
 * (DESIGN.md, App.tsx) and cannot host a custom cross-screen interpolator —
 * it is a same-screen exit cue that reads as continuous with the
 * destination's own mount entrance.
 *
 * Built on react-native-reanimated rather than the core Animated API
 * because the animation must finish (or be visibly underway) before
 * `onComplete` fires navigation, and Reanimated drives it on the UI thread —
 * immune to the JS-thread congestion a navigation transition itself causes,
 * which is exactly when a bridge-driven Animated callback tends to fire late.
 *
 * Reserve for a screen's single primary card-to-detail tap, same scoping
 * discipline as Card's reactive catchlight — not a blanket replacement for
 * onPress.
 */
import { useCallback } from 'react';
import {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../theme';
import { useReducedMotion } from './useReducedMotion';

export interface CardHandoff {
  animatedStyle: { opacity: number; transform: { scale: number }[] };
  /** Pass as the card's onPress. */
  trigger: () => void;
}

export function useCardHandoff(onComplete: () => void): CardHandoff {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.14,
    transform: [{ scale: 1 - progress.value * 0.04 }],
  }));

  const trigger = useCallback(() => {
    if (reducedMotion) {
      onComplete();
      return;
    }
    progress.value = withTiming(
      1,
      { duration: motion.duration.fast, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      },
    );
  }, [reducedMotion, onComplete, progress]);

  return { animatedStyle, trigger };
}
