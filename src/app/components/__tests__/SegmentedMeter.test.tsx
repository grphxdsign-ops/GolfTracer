import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { colors } from '../../theme';
import { SegmentedMeter } from '../SegmentedMeter';

describe('SegmentedMeter', () => {
  it('exposes progressbar semantics', () => {
    render(
      <SegmentedMeter progress={0.5} accessibilityLabel="Confidence 50%" testID="m" />,
    );
    const el = screen.getByTestId('m');
    expect(el.props.accessibilityRole).toBe('progressbar');
    expect(el.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 50 });
    expect(el.props.accessibilityLabel).toBe('Confidence 50%');
  });

  it('lights exactly round(progress * segments) ticks, default 10 segments', () => {
    render(<SegmentedMeter progress={0.8} testID="m" />);
    const row = screen.getByTestId('m');
    const ticks: View[] = row.props.children;
    expect(ticks).toHaveLength(10);
    const active = ticks.filter(
      (t) => StyleSheet.flatten(t.props.style).backgroundColor === colors.primary,
    );
    expect(active).toHaveLength(8);
  });

  it('clamps out-of-range progress', () => {
    render(<SegmentedMeter progress={1.4} segments={5} testID="m" />);
    expect(screen.getByTestId('m').props.accessibilityValue.now).toBe(100);
    render(<SegmentedMeter progress={-0.2} segments={5} testID="m2" />);
    expect(screen.getByTestId('m2').props.accessibilityValue.now).toBe(0);
  });

  it('honors a custom segment count', () => {
    render(<SegmentedMeter progress={0.5} segments={4} testID="m" />);
    expect(screen.getByTestId('m').props.children).toHaveLength(4);
  });
});
