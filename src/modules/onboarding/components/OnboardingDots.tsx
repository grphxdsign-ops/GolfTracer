/**
 * OnboardingDots — module-local segmented progress line for the five-step
 * first-launch flow (DESIGN.md §10). Static per screen — each step is its
 * own screen, so there is nothing to animate. Despite the name (kept for
 * import stability across the five onboarding screens), this renders a
 * continuous line of five equal segments, not circular dots — round
 * pagination dots read as a generic template (2026 design audit finding);
 * a segmented line communicates step progress, not just position.
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
      accessible
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
              styles.segment,
              index < step && styles.segmentDone,
              index === step && styles.segmentActive,
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
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    height: 2,
    borderRadius: radii.pill,
    // Upcoming steps: quiet glass, readable on the tier-0 background.
    backgroundColor: colors.overlay,
  },
  // Intentionally the reverse of a tab bar's "active is brightest": this is
  // a progress/completion line (DESIGN.md §10 audit spec), where the solid
  // color reads as "done" and the current step is the dimmer marker —
  // matching a video-scrub convention, not a state-selector one.
  segmentDone: {
    backgroundColor: colors.primary,
  },
  segmentActive: {
    backgroundColor: alpha(colors.primary, 0.4),
  },
});
