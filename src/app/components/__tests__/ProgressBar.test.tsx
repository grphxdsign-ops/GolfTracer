import { render, screen } from '@testing-library/react-native';

import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('exposes the progressbar role and value', () => {
    render(<ProgressBar progress={0.42} accessibilityLabel="Analyzing" />);
    const bar = screen.getByRole('progressbar', { name: 'Analyzing' });
    expect(bar.props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 42,
    });
  });

  it('clamps progress below 0', () => {
    render(<ProgressBar progress={-1} />);
    expect(
      screen.getByRole('progressbar').props.accessibilityValue.now,
    ).toBe(0);
  });

  it('clamps progress above 1', () => {
    render(<ProgressBar progress={3.5} />);
    expect(
      screen.getByRole('progressbar').props.accessibilityValue.now,
    ).toBe(100);
  });
});
