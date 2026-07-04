import { render, screen, waitFor } from '@testing-library/react-native';

import { App } from '../App';
import { modules } from '../registry';
import { useProfileStore } from '../../state/profileStore';

// App mounts a SafeAreaProvider; the package's jest mock provides inert
// metrics so rendering never waits on native inset measurement.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

describe('App shell', () => {
  beforeEach(() => {
    useProfileStore.getState().reset();
  });

  it('opens on Welcome when onboarding has not been completed', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText('Trace every shot.')).toBeTruthy(),
    );
    expect(screen.getByText('Get started')).toBeTruthy();
  });

  it('opens on Home (titled Tracr) when the store says onboarding is complete', async () => {
    useProfileStore.setState({ onboardingComplete: true });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Record')).toBeTruthy());
    expect(screen.getByText('Import')).toBeTruthy();
    // Welcome never flashes for onboarded users.
    expect(screen.queryByText('Trace every shot.')).toBeNull();
    // The native-stack header renders its title as a config prop, not a
    // Text node — assert the brand title on the header config directly.
    // Home's in-content ScreenHeader also carries title="Tracr" (DESIGN.md
    // §11), so at least one — and possibly two — nodes match.
    expect(
      screen.UNSAFE_getAllByProps({ title: 'Tracr' }).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('registers all fixed, sport, and onboarding routes exactly once', () => {
    const routes = modules.flatMap((m) => m.screens.map((s) => s.route));
    expect([...routes].sort()).toEqual(
      [
        'Analyze',
        'Calibration',
        'Import',
        'OnboardingPermissions',
        'OnboardingPreferences',
        'PerfectedAction',
        'PerfectedResults',
        'Record',
        'Results',
        'Review',
        'Sessions',
        'SignIn',
        'SoccerAnalyze',
        'SoccerResults',
        'SportSelect',
        'TracerPreview',
        'Welcome',
      ].sort(),
    );
    expect(new Set(routes).size).toBe(routes.length);
  });
});
