import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { SportEntry } from '../../../modules/sports/sportCatalog';
import { alpha, colors, radii } from '../../theme';
import { SportTile } from '../SportTile';
import * as reducedMotion from '../useReducedMotion';

const golf: SportEntry = {
  id: 'golf',
  name: 'Golf',
  tagline: 'Ball tracer, carry and apex',
  icon: 'golf',
  available: true,
  route: 'Record',
};

const tennis: SportEntry = {
  id: 'tennis',
  name: 'Tennis',
  tagline: 'Serve speed and placement',
  icon: 'tennis',
  available: false,
};

describe('SportTile', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders name and tagline and is queryable by role', () => {
    render(<SportTile sport={golf} selected={false} onPress={jest.fn()} />);
    expect(screen.getByText('Golf')).toBeTruthy();
    expect(screen.getByText('Ball tracer, carry and apex')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Golf/ }),
    ).toBeTruthy();
  });

  it('fires onPress when available', () => {
    const onPress = jest.fn();
    render(<SportTile sport={golf} selected={false} onPress={onPress} />);
    fireEvent.press(screen.getByRole('button', { name: /Golf/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('reflects selection in accessibilityState and shows the check badge', () => {
    const { rerender } = render(
      <SportTile
        sport={golf}
        selected={false}
        onPress={jest.fn()}
        testID="tile-golf"
      />,
    );
    const tile = screen.getByRole('button', { name: /Golf/ });
    expect(tile.props.accessibilityState.selected).toBe(false);
    expect(screen.queryByTestId('tile-golf-check')).toBeNull();

    rerender(
      <SportTile
        sport={golf}
        selected
        onPress={jest.fn()}
        testID="tile-golf"
      />,
    );
    expect(
      screen.getByRole('button', { name: /Golf/ }).props.accessibilityState
        .selected,
    ).toBe(true);
    expect(screen.getByTestId('tile-golf-check')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('wears the primary ring and wash when selected', () => {
    render(
      <SportTile
        sport={golf}
        selected
        onPress={jest.fn()}
        testID="tile-golf"
      />,
    );
    const style = StyleSheet.flatten(
      screen.getByTestId('tile-golf').props.style,
    );
    expect(style.borderColor).toBe(colors.primary);
    expect(style.borderWidth).toBe(1.5);
    expect(style.backgroundColor).toBe(alpha(colors.primary, 0.14));
    expect(style.borderRadius).toBe(radii.xl);
  });

  it('uses the hero tile radius and glass fill at rest', () => {
    render(
      <SportTile
        sport={golf}
        selected={false}
        onPress={jest.fn()}
        testID="tile-golf"
      />,
    );
    const style = StyleSheet.flatten(
      screen.getByTestId('tile-golf').props.style,
    );
    expect(style.borderRadius).toBe(radii.xl);
    expect(style.backgroundColor).toBe(colors.surface);
    expect(style.borderTopColor).toBe(colors.glassHighlight);
    expect(style.minHeight).toBe(104);
  });

  it('dims, disables, and badges unavailable sports', () => {
    const onPress = jest.fn();
    render(
      <SportTile
        sport={tennis}
        selected={false}
        onPress={onPress}
        testID="tile-tennis"
      />,
    );
    const tile = screen.getByRole('button', { name: /Tennis/ });
    expect(tile.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Coming soon')).toBeTruthy();
    const style = StyleSheet.flatten(tile.props.style);
    expect(style.opacity).toBe(0.45);
    fireEvent.press(tile);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('names unavailable sports as coming soon for screen readers', () => {
    render(<SportTile sport={tennis} selected={false} onPress={jest.fn()} />);
    expect(
      screen.getByRole('button', {
        name: 'Tennis, Serve speed and placement, coming soon',
      }),
    ).toBeTruthy();
  });

  it('survives the press pop beat', () => {
    render(<SportTile sport={golf} selected={false} onPress={jest.fn()} />);
    const tile = screen.getByRole('button', { name: /Golf/ });
    expect(() => {
      fireEvent(tile, 'pressIn');
      fireEvent(tile, 'pressOut');
    }).not.toThrow();
  });

  it('renders the reduce-motion path, selected included', () => {
    jest.spyOn(reducedMotion, 'useReducedMotion').mockReturnValue(true);
    const onPress = jest.fn();
    const { rerender } = render(
      <SportTile
        sport={golf}
        selected={false}
        onPress={onPress}
        testID="tile-golf"
      />,
    );
    const tile = screen.getByRole('button', { name: /Golf/ });
    expect(() => {
      fireEvent(tile, 'pressIn');
      fireEvent(tile, 'pressOut');
    }).not.toThrow();
    fireEvent.press(tile);
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(
      <SportTile sport={golf} selected onPress={onPress} testID="tile-golf" />,
    );
    expect(screen.getByTestId('tile-golf-check')).toBeTruthy();
  });
});
