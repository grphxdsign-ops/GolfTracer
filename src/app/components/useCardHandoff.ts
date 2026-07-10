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
  // Blocks a rapid double-tap from firing onComplete (navigate) twice while
  // the ~150ms handoff is still in flight.
  const triggered = useSharedValue(false);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value * 0.14,
    transform: [{ scale: 1 - progress.value * 0.04 }],
  }));

  const trigger = useCallback(() => {
    if (triggered.value) {
      return;
    }
    if (reducedMotion) {
      onComplete();
      return;
    }
    triggered.value = true;
    progress.value = withTiming(
      1,
      { duration: motion.duration.fast, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(onComplete)();
          // Reset immediately: the source screen commonly stays mounted
          // underneath the destination (stack navigators don't unmount the
          // screen below), so without this the card would stay visually
          // shrunk/faded if the user navigates back. The reset lands as the
          // incoming screen's own transition covers it.
          progress.value = 0;
          triggered.value = false;
        }
      },
    );
  }, [reducedMotion, onComplete, progress, triggered]);

  return { animatedStyle, trigger };
}
