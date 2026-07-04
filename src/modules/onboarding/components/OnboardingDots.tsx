/**
 * OnboardingDots — module-local progress dots for the five-step first-launch
 * flow (DESIGN.md §10: "progress dots at top"). Static per screen — each
 * step is its own screen, so there is nothing to animate; the active dot is
 * the single saturated accent allowed by the density rules only when no
 * other primary-filled element is nearby (the CTA glow stays the hero).
 */
import { StyleSheet, View } from 'react-native';

import { alpha, colors, radii, spacing } from '../../../app/theme';

export const ONBOARDING_STEP_COUNT = 5;

export interface OnboardingDotsProps {
  /** 1-based step index within the five-step flow. */
  step: number;
}

export function OnboardingDots({ step }: OnboardingDotsProps): React.JSX.Element {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${step} of ${ONBOARDING_STEP_COUNT}`}
      accessibilityValue={{ min: 1, max: ONBOARDING_STEP_COUNT, now: step }}
      style={styles.row}
    >
      {Array.from({ length: ONBOARDING_STEP_COUNT }, (_, i) => {
        const index = i + 1;
        return (
          <View
            key={index}
            style={[
              styles.dot,
              index < step && styles.dotDone,
              index === step && styles.dotActive,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    // Upcoming steps: quiet glass, readable on the tier-0 background.
    backgroundColor: colors.overlay,
  },
  dotDone: {
    backgroundColor: alpha(colors.primary, 0.4),
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
});
