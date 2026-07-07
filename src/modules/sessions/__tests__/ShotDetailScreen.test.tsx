/**
 * ShotDetail tests: the ember trace hero (only when a trace persisted),
 * per-sport stat layouts, honest confidence caption, PB mark, the two-tap
 * delete, and the missing-shot fallback.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ShotDetailScreen } from '../ShotDetailScreen';
import { useHistoryStore, type ShotRecord } from '../../../state/historyStore';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();
// jest.mock factories may only close over `mock`-prefixed variables.
const mockRoute = { shotId: 'missing' };
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({
      goBack: mockGoBack,
      setOptions: mockSetOptions,
    }),
    useRoute: () => ({ params: { shotId: mockRoute.shotId } }),
  };
});

const addShot = (shot: Omit<ShotRecord, 'id' | 'at'> & { at?: number }) => {
  useHistoryStore.getState().addShot(shot);
  return useHistoryStore.getState().shots[0]!;
};

const renderDetail = (shotId: string) => {
  mockRoute.shotId = shotId;
  return render(
    <NavigationContainer>
      <ShotDetailScreen />
    </NavigationContainer>,
  );
};

describe('ShotDetailScreen', () => {
  beforeEach(() => {
    mockGoBack.mockClear();
    mockSetOptions.mockClear();
    useHistoryStore.getState().clear();
  });

  it('renders the golf layout with method badge, flight grid, and confidence', () => {
    const shot = addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 247.2,
      totalYards: 271.4,
      apexFeet: 102,
      ballSpeedMph: 148,
      launchAngleDeg: 14.23,
      confidence: 0.85,
    });
    renderDetail(shot.id);

    expect(screen.getByText('Measured')).toBeTruthy();
    expect(screen.getByText('247')).toBeTruthy();
    expect(screen.getByText('271')).toBeTruthy();
    expect(screen.getByText('102')).toBeTruthy();
    expect(screen.getByText('148')).toBeTruthy();
    expect(screen.getByText('14.2°')).toBeTruthy();
    expect(
      screen.getByText(/Confidence 85% · measured from your ground/),
    ).toBeTruthy();
    // Native header title carries club + when.
    expect(mockSetOptions).toHaveBeenCalledWith({
      title: expect.stringContaining('Driver'),
    });
  });

  it('shows the ember trace hero only when a trace was persisted', () => {
    const withTrace = addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'physics-fit',
      carryYards: 240,
      tracePoints: [
        { x: 0.1, y: 0.85 },
        { x: 0.45, y: 0.3 },
        { x: 0.9, y: 0.42 },
      ],
    });
    renderDetail(withTrace.id);
    expect(screen.getByTestId('shot-detail-trace')).toBeTruthy();
  });

  it('omits the stage box for pre-trace history', () => {
    const shot = addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'physics-fit',
      carryYards: 240,
    });
    renderDetail(shot.id);
    expect(screen.queryByTestId('shot-detail-trace')).toBeNull();
  });

  it('marks the record shot with the PB tick', () => {
    addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 231,
    });
    const pb = addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'homography',
      carryYards: 247,
    });
    renderDetail(pb.id);
    expect(screen.getByTestId('shot-detail-pb')).toBeTruthy();
  });

  it('renders the soccer layout in the sport canon', () => {
    const shot = addShot({
      sport: 'soccer',
      quality: 'medium',
      shotSpeedKmh: 87.4,
      onTarget: true,
    });
    renderDetail(shot.id);
    // Soccer speed wears "~" (StatTile approx tell) and the verdict is plain.
    expect(screen.getByText('~87')).toBeTruthy();
    expect(screen.getByText('Goal')).toBeTruthy();
  });

  it('deletes only after the second confirming tap, then goes back', () => {
    const shot = addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'physics-fit',
      carryYards: 240,
    });
    renderDetail(shot.id);

    fireEvent.press(screen.getByTestId('shot-detail-delete'));
    expect(useHistoryStore.getState().shots).toHaveLength(1);
    expect(screen.getByText('Tap again to delete')).toBeTruthy();

    fireEvent.press(screen.getByTestId('shot-detail-delete'));
    expect(useHistoryStore.getState().shots).toHaveLength(0);
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('falls back gracefully when the shot id is unknown', () => {
    renderDetail('nope');
    expect(screen.getByText('Shot not found')).toBeTruthy();
  });
});
