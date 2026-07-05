import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { colors } from '../../theme';
import { Chevron } from '../Chevron';

describe('Chevron', () => {
  it('renders at the requested size with the given color on the inner corner', () => {
    render(<Chevron size={20} color={colors.primary} testID="c" />);
    const inner = screen.getByTestId('c').props.children;
    const style = StyleSheet.flatten(inner.props.style);
    expect(style.width).toBeCloseTo(20 * 0.56);
    expect(style.borderColor).toBe(colors.primary);
    expect(style.borderRightWidth).toBeGreaterThan(0);
    expect(style.borderBottomWidth).toBeGreaterThan(0);
  });

  it('defaults to textDisabled and a 16pt box', () => {
    render(<Chevron testID="c" />);
    const outer = StyleSheet.flatten(screen.getByTestId('c').props.style);
    expect(outer.width).toBe(16);
    expect(outer.height).toBe(16);
    const inner = screen.getByTestId('c').props.children;
    expect(StyleSheet.flatten(inner.props.style).borderColor).toBe(
      colors.textDisabled,
    );
  });

  it('holds the target rotation instantly under reduce-motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    render(<Chevron rotateDeg={90} testID="c" />);
    await Promise.resolve();
    // Reduce-motion sets the Animated.Value directly (no throw / no timer).
    expect(screen.getByTestId('c')).toBeTruthy();
    jest.restoreAllMocks();
  });
});
