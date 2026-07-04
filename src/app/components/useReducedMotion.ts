/**
 * Shared reduce-motion hook — docs/DESIGN.md §5 (motion rules) and §7 (kit
 * inventory). Every custom animation in the kit consults this hook and
 * degrades to instant/crossfade when the OS setting is on.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Promise.resolve guards against test environments where the RN jest
    // preset mocks isReduceMotionEnabled to return undefined.
    Promise.resolve(AccessibilityInfo.isReduceMotionEnabled()).then(
      (enabled) => {
        if (mounted && typeof enabled === 'boolean') {
          setReduced(enabled);
        }
      },
    );
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        setReduced(enabled);
      },
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
