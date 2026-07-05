import { Animated, Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { Card } from '../Card';

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <Text>Swing details</Text>
      </Card>,
    );
    expect(screen.getByText('Swing details')).toBeTruthy();
  });

  it('is not a button when no onPress is given', () => {
    render(
      <Card>
        <Text>Static card</Text>
      </Card>,
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('fires onPress and exposes the button role when pressable', () => {
    const onPress = jest.fn();
    render(
      <Card onPress={onPress} accessibilityLabel="Open swing">
        <Text>Pressable card</Text>
      </Card>,
    );
    const button = screen.getByRole('button');
    fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the raised variant and unpadded mode', () => {
    render(
      <Card variant="raised" padded={false} testID="raised-card">
        <Text>Raised</Text>
      </Card>,
    );
    expect(screen.getByTestId('raised-card')).toBeTruthy();
    expect(screen.getByText('Raised')).toBeTruthy();
  });

  it('has no reactive highlight overlay without scrollY', () => {
    render(
      <Card testID="card">
        <Text>Body</Text>
      </Card>,
    );
    const [highlight] = screen.getByTestId('card').props.children;
    expect(highlight).toBeNull();
  });

  it('adds a scroll-driven reactive highlight overlay when scrollY is given', () => {
    const scrollY = new Animated.Value(0);
    render(
      <Card testID="card" scrollY={scrollY}>
        <Text>Body</Text>
      </Card>,
    );
    const [highlight] = screen.getByTestId('card').props.children;
    expect(highlight).toBeTruthy();
    expect(highlight.props.pointerEvents).toBe('none');
  });
});
