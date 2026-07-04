/**
 * navigateOnboarding — the single cast point for onboarding routes,
 * mirroring src/modules/sports/navSport.ts. Onboarding screens are mounted
 * through App.tsx's existing `route as keyof RootStackParamList` cast
 * without touching the frozen RootStackParamList; this helper performs the
 * matching cast on the navigation side so callers stay typed to the
 * OnboardingRoute union.
 */

/** Routes registered by the onboarding module (DESIGN.md §10 flow order). */
export type OnboardingRoute =
  | 'Welcome'
  | 'SignIn'
  | 'SportSelect'
  | 'OnboardingPreferences'
  | 'OnboardingPermissions';

interface OnboardingNavigator {
  navigate(route: string): void;
  reset(state: { index: number; routes: { name: string }[] }): void;
}

/**
 * Navigate to an onboarding route with any react-navigation navigation prop
 * (whose `navigate` is typed against the frozen RootStackParamList).
 */
export function navigateOnboarding(
  navigation: object,
  route: OnboardingRoute,
): void {
  (navigation as OnboardingNavigator).navigate(route);
}

/**
 * Replace the whole onboarding stack with Home — the flow never stays on
 * the back stack once completed (DESIGN.md §10: first launch only).
 */
export function resetToHome(navigation: object): void {
  (navigation as OnboardingNavigator).reset({
    index: 0,
    routes: [{ name: 'Home' }],
  });
}
