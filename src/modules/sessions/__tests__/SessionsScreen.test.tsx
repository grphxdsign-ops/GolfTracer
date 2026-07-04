/**
 * Sessions screen tests: module registration, day-grouped reverse-chron shot
 * list, empty state, and the two-tap clear-history confirm (no modal).
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
  it("registers exactly the 'Sessions' route titled 'Sessions'", () => {
    expect(sessionsModule.name).toBe('sessions');
    expect(
      sessionsModule.screens.map((s) => ({ route: s.route, title: s.title })),
    ).toEqual([{ route: 'Sessions', title: 'Sessions' }]);
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

  it('lists shots grouped by day, newest first', () => {
    const now = Date.now();
    // Seeded oldest-first; the store prepends, the screen re-sorts anyway.
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
      method: 'physics-fit',
      carryYards: 250.2,
      at: now,
    });
    addShot({
      sport: 'soccer',
      quality: 'medium',
      shotSpeedMph: 46.6,
      onTarget: true,
      at: now - 1,
    });

    renderSessions();

    expect(screen.getByText('Today')).toBeTruthy();
    expect(screen.getByText('Yesterday')).toBeTruthy();
    expect(screen.getAllByText('Golf')).toHaveLength(2);
    expect(screen.getByText('Soccer')).toBeTruthy();
    expect(screen.getByText('250 yd carry')).toBeTruthy();
    expect(screen.getByText('47 mph')).toBeTruthy();
    expect(screen.getByText('152 yd carry')).toBeTruthy();
    // Quality badges wear their tones' labels.
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
  });

  it('clears history only after a second confirming tap', () => {
    addShot({ sport: 'golf', quality: 'high', carryYards: 240 });
    renderSessions();

    fireEvent.press(screen.getByText('Clear history'));
    // First tap arms the button — nothing is deleted yet.
    expect(useHistoryStore.getState().shots).toHaveLength(1);
    expect(screen.getByText('Tap again to clear')).toBeTruthy();

    fireEvent.press(screen.getByText('Tap again to clear'));
    expect(useHistoryStore.getState().shots).toHaveLength(0);
    expect(screen.getByText('No sessions yet')).toBeTruthy();
  });
});
