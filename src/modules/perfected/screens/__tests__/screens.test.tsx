/**
 * Screen smoke tests: module registration, the perfected-action playback
 * screen (strength control + result publish + hand-off), and the results
 * screen (empty state, angle table, video export, reset).
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useSportsSessionStore } from '../../../sports/sportsSessionStore';
import { perfectedModule } from '../..';
import { PerfectedActionScreen } from '../PerfectedActionScreen';
import { PerfectedResultsScreen } from '../PerfectedResultsScreen';
import { buildPerfectedResult, demoMeasuredFrames } from '../../perfectedPipeline';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

const renderWithNav = (ui: React.ReactElement) =>
  render(<NavigationContainer>{ui}</NavigationContainer>);

describe('perfectedModule registration', () => {
  it('registers exactly the pinned PerfectedAction and PerfectedResults routes', () => {
    expect(perfectedModule.name).toBe('perfected');
    expect(perfectedModule.screens.map((s) => s.route)).toEqual([
      'PerfectedAction',
      'PerfectedResults',
    ]);
  });
});

describe('PerfectedActionScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSportsSessionStore.getState().reset();
  });

  it('renders the playback canvas and strength control', () => {
    renderWithNav(<PerfectedActionScreen />);
    expect(screen.getByText('Perfected Action')).toBeTruthy();
    expect(screen.getByLabelText('Perfected action playback')).toBeTruthy();
    expect(screen.getByText('Correction strength')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('Play')).toBeTruthy();
    expect(screen.getByText(/Demo motion/)).toBeTruthy();
  });

  it('recomputes the perfected flight when the strength changes', () => {
    renderWithNav(<PerfectedActionScreen />);
    const before = screen.getByText(/m range/).props.children.join('');
    fireEvent.press(
      screen.getByLabelText('Correction strength 0 percent'),
    );
    const after = screen.getByText(/m range/).props.children.join('');
    expect(after).not.toEqual(before);
  });

  it('publishes the PerfectedResult and navigates to the results screen', () => {
    renderWithNav(<PerfectedActionScreen />);
    fireEvent.press(screen.getByText('Save perfected result'));

    const result = useSportsSessionStore.getState().perfectedResult;
    expect(result).not.toBeNull();
    expect(result?.sport).toBe('soccer');
    expect(result?.morphedFrames.length).toBeGreaterThan(10);
    expect(mockNavigate).toHaveBeenCalledWith('PerfectedResults');
  });
});

describe('PerfectedResultsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSportsSessionStore.getState().reset();
  });

  it('prompts for a perfected action when the store is empty', () => {
    renderWithNav(<PerfectedResultsScreen />);
    expect(screen.getByText('No perfected action yet')).toBeTruthy();
  });

  it('shows the target angle table and exports a video', async () => {
    useSportsSessionStore.getState().setPerfectedResult(
      buildPerfectedResult({
        sport: 'soccer',
        measuredFrames: demoMeasuredFrames(),
        strength: 1,
      }),
    );

    renderWithNav(<PerfectedResultsScreen />);
    expect(screen.getByText('Target joint angles at contact')).toBeTruthy();
    expect(screen.getByText('Shoulder–Hip')).toBeTruthy();
    expect(screen.getByText('Hip–Knee')).toBeTruthy();
    expect(screen.getByText('Knee–Ankle')).toBeTruthy();
    expect(screen.getAllByText(/Nunome/).length).toBeGreaterThan(0);

    fireEvent.press(screen.getByText('Export video'));
    await waitFor(() => {
      expect(screen.getByText('Video exported. Ready to share.')).toBeTruthy();
    });
  });

  it('clears the result and navigates home on Done', () => {
    useSportsSessionStore.getState().setPerfectedResult(
      buildPerfectedResult({
        sport: 'soccer',
        measuredFrames: demoMeasuredFrames(),
        strength: 0.5,
      }),
    );

    renderWithNav(<PerfectedResultsScreen />);
    fireEvent.press(screen.getByText('Done'));
    expect(useSportsSessionStore.getState().perfectedResult).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });
});
