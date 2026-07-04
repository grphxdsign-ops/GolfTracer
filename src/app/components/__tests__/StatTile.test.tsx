import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { StatTile } from '../StatTile';

describe('StatTile', () => {
  it('renders value, unit, and label', () => {
    render(<StatTile value="212" unit="yd" label="Carry" />);
    expect(screen.getByText('212')).toBeTruthy();
    expect(screen.getByText('yd')).toBeTruthy();
    expect(screen.getByText('Carry')).toBeTruthy();
  });

  it('prefixes the value with ~ when approx', () => {
    render(<StatTile value="212" unit="yd" label="Carry" approx />);
    expect(screen.getByText('~212')).toBeTruthy();
  });

  it.each(['hero', 'standard', 'compact'] as const)(
    'renders the %s size',
    (size) => {
      render(<StatTile value="98" unit="mph" label="Ball speed" size={size} />);
      expect(screen.getByText('98')).toBeTruthy();
      expect(screen.getByText('Ball speed')).toBeTruthy();
    },
  );

  it('composes the accessibility label', () => {
    render(<StatTile value="212" unit="yd" label="Carry" approx />);
    expect(screen.getByLabelText('Carry: about 212 yd')).toBeTruthy();
  });

  it('composes the accessibility label without a unit', () => {
    render(<StatTile value="3" label="Shots" />);
    expect(screen.getByLabelText('Shots: 3')).toBeTruthy();
  });

  it('uses tabular-nums on the value', () => {
    render(<StatTile value="212" label="Carry" size="hero" />);
    const value = screen.getByText('212');
    const flat = StyleSheet.flatten(value.props.style);
    expect(flat.fontVariant).toContain('tabular-nums');
  });
});
