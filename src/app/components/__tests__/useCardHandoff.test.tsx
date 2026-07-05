import { renderHook } from '@testing-library/react-native';

import * as reducedMotion from '../useReducedMotion';
import { useCardHandoff } from '../useCardHandoff';

describe('useCardHandoff', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('starts at full opacity and scale', () => {
    const { result } = renderHook(() => useCardHandoff(jest.fn()));
    expect(result.current.animatedStyle).toEqual({
      opacity: 1,
      transform: [{ scale: 1 }],
    });
  });

  it('calls onComplete once the handoff animation finishes', () => {
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCardHandoff(onComplete));
    result.current.trigger();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('skips the animation and completes instantly under reduce-motion', () => {
    jest.spyOn(reducedMotion, 'useReducedMotion').mockReturnValue(true);
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCardHandoff(onComplete));
    result.current.trigger();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('resets after completion so a later tap can re-trigger it', () => {
    // The mock's withTiming resolves synchronously, so this can't observe
    // the re-entry guard blocking a tap *during* the animation — only that
    // the guard/progress reset leaves the hook usable for a subsequent,
    // separate tap (e.g. after navigating back to the source screen).
    const onComplete = jest.fn();
    const { result } = renderHook(() => useCardHandoff(onComplete));
    result.current.trigger();
    result.current.trigger();
    expect(onComplete).toHaveBeenCalledTimes(2);
  });
});
