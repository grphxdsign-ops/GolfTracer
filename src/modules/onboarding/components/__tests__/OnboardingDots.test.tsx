import { render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';

import { alpha, colors } from '../../../../app/theme';
import { OnboardingDots, ONBOARDING_STEP_COUNT } from '../OnboardingDots';

describe('OnboardingDots', () => {
  it('exposes progressbar semantics for the current step', () => {
    render(<OnboardingDots step={3} />);
    const el = screen.getByRole('progressbar');
    expect(el.props.accessibilityValue).toEqual({
      min: 1,
      max: ONBOARDING_STEP_COUNT,
      now: 3,
    });
    expect(el.props.accessibilityLabel).toBe('Step 3 of 5');
  });

  it('colors done solid, the active step muted, and future steps quiet', () => {
    render(<OnboardingDots step={3} />);
    const segments: View[] = screen.getByRole('progressbar').props.children;
    const colorsOf = segments.map(
      (s) => StyleSheet.flatten(s.props.style).backgroundColor,
    );
    expect(colorsOf).toEqual([
      colors.primary,
      colors.primary,
      alpha(colors.primary, 0.4),
      colors.overlay,
      colors.overlay,
    ]);
  });
});
