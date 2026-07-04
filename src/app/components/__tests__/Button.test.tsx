import { ActivityIndicator, StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { colors } from '../../theme';
import { Button } from '../Button';
import * as reducedMotion from '../useReducedMotion';

describe('Button', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the label and is queryable by role + name', () => {
    render(<Button label="Track this swing" onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', { name: 'Track this swing' }),
    ).toBeTruthy();
  });

  it('fires onPress', () => {
    const onPress = jest.fn();
    render(<Button label="Analyze" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: 'Analyze' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress and sets accessibilityState when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Analyze" onPress={onPress} disabled />);
    const button = screen.getByRole('button', { name: 'Analyze' });
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows an ActivityIndicator and blocks onPress when loading', () => {
    const onPress = jest.fn();
    render(
      <Button
        label="Estimate distance"
        loadingLabel="Estimating"
        onPress={onPress}
        loading
      />,
    );
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    expect(screen.getByText('Estimating')).toBeTruthy();
    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.busy).toBe(true);
    expect(button.props.accessibilityState.disabled).toBe(true);
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)(
    'renders the %s variant',
    (variant) => {
      render(<Button label="Go" onPress={jest.fn()} variant={variant} />);
      expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
    },
  );

  it.each(['lg', 'md', 'sm'] as const)('renders the %s size', (size) => {
    render(<Button label="Go" onPress={jest.fn()} size={size} />);
    expect(screen.getByRole('button', { name: 'Go' })).toBeTruthy();
  });

  it.each([
    ['lg', 52, 17],
    ['md', 44, 15],
    ['sm', 36, 13],
  ] as const)('sizes %s at %spt with a %spt label', (size, height, fontSize) => {
    render(<Button label="Go" onPress={jest.fn()} size={size} />);
    const button = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Go' }).props.style,
    );
    expect(button.height).toBe(height);
    const label = StyleSheet.flatten(screen.getByText('Go').props.style);
    expect(label.fontSize).toBe(fontSize);
    expect(label.fontWeight).toBe('600');
  });

  it('carries the brand glow on the resting primary variant', () => {
    render(<Button label="Go" onPress={jest.fn()} variant="primary" />);
    const style = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Go' }).props.style,
    );
    expect(style.shadowColor).toBe(colors.primary);
    expect(style.shadowOpacity).toBe(0.35);
    expect(style.shadowRadius).toBe(16);
    expect(style.shadowOffset).toEqual({ width: 0, height: 6 });
    expect(style.elevation).toBe(8);
  });

  it('drops the glow while disabled', () => {
    render(<Button label="Go" onPress={jest.fn()} variant="primary" disabled />);
    const style = StyleSheet.flatten(
      screen.getByRole('button', { name: 'Go' }).props.style,
    );
    expect(style.shadowColor).toBeUndefined();
  });

  it.each(['secondary', 'ghost', 'danger'] as const)(
    'gives no glow to the %s variant',
    (variant) => {
      render(<Button label="Go" onPress={jest.fn()} variant={variant} />);
      const style = StyleSheet.flatten(
        screen.getByRole('button', { name: 'Go' }).props.style,
      );
      expect(style.shadowColor).toBeUndefined();
    },
  );

  it('glass variants keep an opaque press treatment (never opacity-dim)', () => {
    for (const variant of ['secondary', 'ghost'] as const) {
      const view = render(
        <Button label="Go" onPress={jest.fn()} variant={variant} />,
      );
      const style = StyleSheet.flatten(
        screen.getByRole('button', { name: 'Go' }).props.style,
      );
      expect(style.opacity).toBeUndefined();
      view.unmount();
    }
  });

  it('survives the press-in/press-out beat', () => {
    render(<Button label="Go" onPress={jest.fn()} />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(() => {
      fireEvent(button, 'pressIn');
      fireEvent(button, 'pressOut');
    }).not.toThrow();
  });

  it('skips the press scale under reduce-motion but still fires onPress', () => {
    jest.spyOn(reducedMotion, 'useReducedMotion').mockReturnValue(true);
    const onPress = jest.fn();
    render(<Button label="Go" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Go' });
    expect(() => {
      fireEvent(button, 'pressIn');
      fireEvent(button, 'pressOut');
    }).not.toThrow();
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
