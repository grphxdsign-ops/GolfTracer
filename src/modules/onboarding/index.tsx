/**
 * Onboarding module — first-launch flow (DESIGN.md §10):
 * Welcome → SignIn → SportSelect → Preferences → Permissions → Home.
 *
 * Routes are mounted through App.tsx's existing
 * `route as keyof RootStackParamList` cast (like the sport modules); the
 * matching navigation-side cast lives in navOnboarding.ts.
 */
import type { ScreenRegistration } from '../../types/modules';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { SignInScreen } from './screens/SignInScreen';
import { SportSelectScreen } from './screens/SportSelectScreen';
import { OnboardingPreferencesScreen } from './screens/OnboardingPreferencesScreen';
import { OnboardingPermissionsScreen } from './screens/OnboardingPermissionsScreen';

export const onboardingModule: {
  name: string;
  screens: ScreenRegistration[];
} = {
  name: 'onboarding',
  screens: [
    { route: 'Welcome', component: WelcomeScreen, title: 'Welcome' },
    { route: 'SignIn', component: SignInScreen, title: 'Sign in' },
    { route: 'SportSelect', component: SportSelectScreen, title: 'Sports' },
    {
      route: 'OnboardingPreferences',
      component: OnboardingPreferencesScreen,
      title: 'Preferences',
    },
    {
      route: 'OnboardingPermissions',
      component: OnboardingPermissionsScreen,
      title: 'Permissions',
    },
  ],
};
