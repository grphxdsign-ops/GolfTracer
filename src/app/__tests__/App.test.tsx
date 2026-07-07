import { render, screen, waitFor } from '@testing-library/react-native';

import { App } from '../App';
import { modules } from '../registry';
import { useProfileStore } from '../../state/profileStore';
import { useHistoryStore } from '../../state/historyStore';

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
    useHistoryStore.getState().clear();
  });

  it('opens on Welcome when onboarding has not been completed', async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText('Trace every shot.')).toBeTruthy(),
    );
    expect(screen.getByText('Get started')).toBeTruthy();
    // No tab bar during onboarding.
    expect(screen.queryByTestId('tab-record')).toBeNull();
  });

  it('opens on the tab shell when the store says onboarding is complete', async () => {
    useProfileStore.setState({ onboardingComplete: true });
    render(<App />);
    // The glass tab bar is the shell's signature: four tabs + center Record.
    await waitFor(() => expect(screen.getByTestId('tab-record')).toBeTruthy());
    expect(screen.getByTestId('tab-Home')).toBeTruthy();
    expect(screen.getByTestId('tab-Sessions')).toBeTruthy();
    expect(screen.getByTestId('tab-Insights')).toBeTruthy();
    expect(screen.getByTestId('tab-Profile')).toBeTruthy();
    // Home renders its greeting title.
    expect(
      screen.getByText(/^(Morning|Afternoon|Evening)\.$/),
    ).toBeTruthy();
    // Welcome never flashes for onboarded users.
    expect(screen.queryByText('Trace every shot.')).toBeNull();
  });

  it('registers all flow, sport, and onboarding routes exactly once', () => {
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
        'ShotDetail',
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
