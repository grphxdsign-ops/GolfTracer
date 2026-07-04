import { act, renderHook } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from '../useReducedMotion';

describe('useReducedMotion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns false by default', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(false);
  });

  it('returns true when the OS setting is enabled', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const { result } = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(true);
  });

  it('updates when reduceMotionChanged fires and cleans up on unmount', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(false);
    let listener: ((enabled: boolean) => void) | undefined;
    const remove = jest.fn();
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation(((event: string, handler: unknown) => {
        if (event === 'reduceMotionChanged') {
          listener = handler as (enabled: boolean) => void;
        }
        return { remove };
      }) as unknown as typeof AccessibilityInfo.addEventListener);

    const { result, unmount } = renderHook(() => useReducedMotion());
    await act(async () => {});
    expect(result.current).toBe(false);

    act(() => {
      listener?.(true);
    });
    expect(result.current).toBe(true);

    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
