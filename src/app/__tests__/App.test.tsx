import { render, screen } from '@testing-library/react-native';

import { App } from '../App';
import { modules } from '../registry';

describe('App shell', () => {
  it('renders the navigator with the Home screen', () => {
    render(<App />);
    expect(screen.getByText('GolfTracer AI')).toBeTruthy();
    expect(screen.getByText('Record')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
  });

  it('registers all fixed routes exactly once across modules', () => {
    const routes = modules.flatMap((m) => m.screens.map((s) => s.route));
    expect([...routes].sort()).toEqual(
      [
        'Analyze',
        'Calibration',
        'Import',
        'Record',
        'Results',
        'Review',
        'TracerPreview',
      ].sort(),
    );
    expect(new Set(routes).size).toBe(routes.length);
  });
});
