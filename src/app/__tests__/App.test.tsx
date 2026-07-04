import { render, screen } from '@testing-library/react-native';

import { App } from '../App';
import { modules } from '../registry';

// App mounts a SafeAreaProvider; the package's jest mock provides inert
// metrics so rendering never waits on native inset measurement.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

describe('App shell', () => {
  it('renders the navigator with the Home screen', () => {
    render(<App />);
    expect(screen.getByText('GolfTracer AI')).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
  });

  it('registers all fixed and sport routes exactly once across modules', () => {
    const routes = modules.flatMap((m) => m.screens.map((s) => s.route));
    expect([...routes].sort()).toEqual(
      [
        'Analyze',
        'Calibration',
        'Import',
        'PerfectedAction',
        'PerfectedResults',
        'Record',
        'Results',
        'Review',
        'SoccerAnalyze',
        'SoccerResults',
        'TracerPreview',
      ].sort(),
    );
    expect(new Set(routes).size).toBe(routes.length);
  });
});
