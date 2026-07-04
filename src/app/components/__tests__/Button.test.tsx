import { ActivityIndicator } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '../Button';

describe('Button', () => {
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
});
