/**
 * Insights tab tests: empty state, golf hero + bag with calibrating rows,
 * the sport switcher appearing only with two sports of data, and soccer's
 * "~" canon.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { InsightsScreen } from '../InsightsScreen';
import { useHistoryStore, type ShotRecord } from '../../../state/historyStore';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

const renderInsights = () =>
  render(
    <NavigationContainer>
      <InsightsScreen />
    </NavigationContainer>,
  );

const addShot = (shot: Omit<ShotRecord, 'id' | 'at'> & { at?: number }) =>
  useHistoryStore.getState().addShot(shot);

const addGolf = (carryYards: number, club: ShotRecord['club'] = 'driver') =>
  addShot({
    sport: 'golf',
    quality: 'high',
    club,
    method: 'physics-fit',
    carryYards,
  });

describe('InsightsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useHistoryStore.getState().clear();
  });

  it('shows the build-as-you-trace empty state with a Record action', () => {
    renderInsights();
    expect(screen.getByText('Insights build as you trace')).toBeTruthy();
    fireEvent.press(screen.getByText('Record a shot'));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
  });

  it('renders the golf hero with the labeled window and the bag rows', () => {
    [238, 242, 246].forEach((c) => addGolf(c));
    [150, 152].forEach((c) => addGolf(c, '7-iron'));
    renderInsights();

    const hero = screen.getByTestId('insights-hero');
    expect(
      within(hero).getByText('Avg driver carry · last 3 shots'),
    ).toBeTruthy();
    expect(within(hero).getByText('242')).toBeTruthy();
    expect(within(hero).getByText(/best 246 yd/)).toBeTruthy();

    // Driver row carries stats; 7-iron (2 shots) still calibrates.
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.getByText('3 shots')).toBeTruthy();
    expect(screen.getByText('2 of 3 shots')).toBeTruthy();
    expect(screen.getByText('Calibrating')).toBeTruthy();
  });

  it('keeps the sport switcher hidden until both sports have shots', () => {
    [238, 242, 246].forEach((c) => addGolf(c));
    renderInsights();
    expect(screen.queryByTestId('insights-sport')).toBeNull();
  });

  it('switches to soccer, whose numbers wear the honest "~"', () => {
    [238, 242, 246].forEach((c) => addGolf(c));
    [82, 88, 94].forEach((kmh) =>
      addShot({
        sport: 'soccer',
        quality: 'high',
        shotSpeedKmh: kmh,
        onTarget: kmh > 85,
      }),
    );
    renderInsights();

    fireEvent.press(screen.getByText('Soccer'));
    const hero = screen.getByTestId('insights-soccer-hero');
    expect(within(hero).getByText('~88')).toBeTruthy();
    expect(within(hero).getByText(/fastest ~94 km\/h/)).toBeTruthy();
    expect(screen.getByText('On target')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
  });

  it('shows soccer calibrating below the gate', () => {
    addShot({ sport: 'soccer', quality: 'high', shotSpeedKmh: 90 });
    renderInsights();
    expect(screen.getByTestId('insights-soccer-calibrating')).toBeTruthy();
    expect(
      screen.getByText('1 of 3 shots recorded — averages unlock at 3.'),
    ).toBeTruthy();
  });
});
