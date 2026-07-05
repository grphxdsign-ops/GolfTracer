import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { alpha, colors } from '../../theme';
import { Chevron } from '../Chevron';
import { TrendPill } from '../TrendPill';

function pillStyle(testID: string): Record<string, unknown> {
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

/** The diagonal vector chevron standing in for the old ↑/↓/→ glyphs. */
function arrowRotateDeg(): number {
  return screen.UNSAFE_getByType(Chevron).props.rotateDeg;
}

describe('TrendPill', () => {
  it('renders an up-right chevron with magnitude and unit', () => {
    render(
      <TrendPill delta={12} unit="yd" goodDirection="up" testID="pill" />,
    );
    expect(arrowRotateDeg()).toBe(-45);
    expect(
      screen.getByText('12', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      screen.getByText('yd', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('tints an upward delta as improving when up is good', () => {
    render(
      <TrendPill delta={12} unit="yd" goodDirection="up" testID="pill" />,
    );
    expect(pillStyle('pill').backgroundColor).toBe(
      alpha(colors.success, 0.16),
    );
    const magnitude = StyleSheet.flatten(
      screen.getByText('12', { includeHiddenElements: true }).props.style,
    );
    expect(magnitude.color).toBe(colors.success);
    expect(magnitude.fontVariant).toEqual(['tabular-nums']);
  });

  it('tints the same upward delta as declining when down is good', () => {
    render(
      <TrendPill delta={12} unit="s" goodDirection="down" testID="pill" />,
    );
    expect(pillStyle('pill').backgroundColor).toBe(alpha(colors.danger, 0.16));
    expect(
      StyleSheet.flatten(
        screen.getByText('12', { includeHiddenElements: true }).props.style,
      ).color,
    ).toBe(colors.danger);
  });

  it('tints a downward delta as improving when down is good', () => {
    render(
      <TrendPill delta={-3} unit="s" goodDirection="down" testID="pill" />,
    );
    expect(arrowRotateDeg()).toBe(45);
    expect(pillStyle('pill').backgroundColor).toBe(
      alpha(colors.success, 0.16),
    );
  });

  it('renders even on the neutral overlay for a zero delta', () => {
    render(<TrendPill delta={0} goodDirection="up" testID="pill" />);
    expect(
      screen.getByText('even', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(arrowRotateDeg()).toBe(0);
    expect(pillStyle('pill').backgroundColor).toBe(colors.overlay);
  });

  it('treats a delta under 1% of base as even', () => {
    render(
      <TrendPill delta={0.5} base={200} goodDirection="up" testID="pill" />,
    );
    expect(
      screen.getByText('even', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(pillStyle('pill').backgroundColor).toBe(colors.overlay);
  });

  it('keeps a delta at or over 1% of base directional', () => {
    render(
      <TrendPill delta={2} base={200} goodDirection="up" testID="pill" />,
    );
    expect(arrowRotateDeg()).toBe(-45);
  });

  it('applies a custom format to the unsigned magnitude', () => {
    render(
      <TrendPill
        delta={-4.25}
        unit="mph"
        goodDirection="up"
        format={(n) => n.toFixed(2)}
        testID="pill"
      />,
    );
    expect(
      screen.getByText('4.25', { includeHiddenElements: true }),
    ).toBeTruthy();
  });

  it('speaks the trend versus the average', () => {
    render(
      <TrendPill delta={12} unit="yards" goodDirection="up" testID="pill" />,
    );
    expect(
      screen.getByLabelText('up 12 yards versus your average'),
    ).toBeTruthy();

    render(
      <TrendPill delta={-3} unit="yards" goodDirection="up" testID="down" />,
    );
    expect(
      screen.getByLabelText('down 3 yards versus your average'),
    ).toBeTruthy();
  });

  it('speaks even with your average for a flat trend', () => {
    render(<TrendPill delta={0} goodDirection="up" testID="pill" />);
    expect(screen.getByLabelText('even with your average')).toBeTruthy();
  });

  it('trims the default format to one decimal', () => {
    render(<TrendPill delta={4.26} goodDirection="up" testID="pill" />);
    expect(
      screen.getByText('4.3', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});
