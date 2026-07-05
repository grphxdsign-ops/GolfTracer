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
});
