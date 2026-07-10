/**
 * Sessions tab tests: module registration (ShotDetail drill-in), the
 * day-grouped visual shot library, sport filter chips, PB marks, and
 * row-tap navigation into ShotDetail. Clear-history moved to Profile.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { sessionsModule } from '..';
import { SessionsScreen } from '../SessionsScreen';
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

const renderSessions = () =>
  render(
    <NavigationContainer>
      <SessionsScreen />
    </NavigationContainer>,
  );

const addShot = (shot: Omit<ShotRecord, 'id' | 'at'> & { at?: number }) =>
  useHistoryStore.getState().addShot(shot);

describe('sessionsModule registration', () => {
  it("registers exactly the 'ShotDetail' drill-in (Sessions is a tab)", () => {
    expect(sessionsModule.name).toBe('sessions');
    expect(
      sessionsModule.screens.map((s) => ({ route: s.route, title: s.title })),
    ).toEqual([{ route: 'ShotDetail', title: 'Shot' }]);
  });
});

describe('SessionsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useHistoryStore.getState().clear();
  });

  it('shows the empty state with a Record action when there is no history', () => {
    renderSessions();
    expect(screen.getByText('No sessions yet')).toBeTruthy();
    fireEvent.press(screen.getByText('Record'));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
  });

  it('lists shots grouped by day, titled by club, newest first', () => {
    const now = Date.now();
    addShot({
      sport: 'golf',
      quality: 'low',
      club: '7-iron',
      method: 'physics-fit',
      carryYards: 152.4,
      at: now - 24 * 3_600_000,
    });
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 250.2,
      at: now,
    });
    addShot({
      sport: 'soccer',
      quality: 'medium',
      shotSpeedKmh: 75.2,
      onTarget: true,
      at: now - 1,
    });

    renderSessions();

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    // Rows are titled by club (golf) / sport (soccer) with method meta.
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.getByText('7-iron')).toBeTruthy();
    expect(screen.getByText('Soccer shot')).toBeTruthy();
    expect(screen.getByText(/Measured/)).toBeTruthy();
    // Headline stats render as value + unit pairs; soccer wears "~" (§12).
    expect(screen.getByText('250')).toBeTruthy();
    expect(screen.getByText('~75')).toBeTruthy();
    expect(screen.getByText('152')).toBeTruthy();
  });

  it('opens ShotDetail when a row is tapped', () => {
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 240,
    });
    renderSessions();
    const id = useHistoryStore.getState().shots[0]!.id;
    fireEvent.press(screen.getByTestId(`session-shot-${id}`));
    expect(mockNavigate).toHaveBeenCalledWith('ShotDetail', { shotId: id });
  });

  it('filters by sport once more than one sport has shots', () => {
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 240,
    });
    addShot({ sport: 'soccer', quality: 'high', shotSpeedKmh: 88 });
    renderSessions();

    // Both sports visible under "All".
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.getByText('Soccer shot')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sessions-filter-golf'));
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.queryByText('Soccer shot')).toBeNull();

    fireEvent.press(screen.getByTestId('sessions-filter-soccer'));
    expect(screen.queryByText('Driver')).toBeNull();
    expect(screen.getByText('Soccer shot')).toBeTruthy();
  });

  it('hides filter chips while only one sport has shots', () => {
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 240,
    });
    renderSessions();
    expect(screen.queryByTestId('sessions-filter-all')).toBeNull();
  });

  it('marks the record-setting shot with a PB tick', () => {
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 231,
      at: Date.now() - 1000,
    });
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 247,
      at: Date.now(),
    });
    renderSessions();
    const shots = useHistoryStore.getState().shots;
    const pbShot = shots.find((s) => s.carryYards === 247)!;
    const other = shots.find((s) => s.carryYards === 231)!;
    expect(screen.getByTestId(`pb-${pbShot.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`pb-${other.id}`)).toBeNull();
  });
});
