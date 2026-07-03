import { Text } from 'react-native';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SoccerAnalyzeScreen } from '../SoccerAnalyzeScreen';
import { useSessionStore } from '../../../../state/sessionStore';
import { useSportsSessionStore } from '../../../sports/sportsSessionStore';
import { analyzeSoccerTake } from '../../analysis/analyzeSoccerShot';
import { cannedFrameSource } from '../../../tracking/testutils/screenFixtures';
import { cannedTake } from '../../testutils/soccerFixtures';

jest.mock('../../analysis/analyzeSoccerShot', () => ({
  analyzeSoccerTake: jest.fn(),
}));

const analyzeMock = analyzeSoccerTake as jest.MockedFunction<typeof analyzeSoccerTake>;

function ResultsStub() {
  return <Text>SoccerResultsRouteStub</Text>;
}

function renderAnalyze() {
  const Stack = createNativeStackNavigator();
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="SoccerAnalyze" component={SoccerAnalyzeScreen} />
        <Stack.Screen name="SoccerResults" component={ResultsStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSportsSessionStore.getState().reset();
  analyzeMock.mockReset();
});

describe('SoccerAnalyzeScreen', () => {
  it('prompts for a video when no frameSource is loaded', () => {
    renderAnalyze();
    expect(screen.getByText('No video loaded')).toBeTruthy();
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it('runs the analysis, publishes the take, and navigates to results', async () => {
    const take = cannedTake();
    analyzeMock.mockImplementation(async (_src, opts) => {
      opts?.onProgress?.(0.5);
      opts?.onProgress?.(1);
      return take;
    });
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() =>
      expect(screen.getByText('SoccerResultsRouteStub')).toBeTruthy(),
    );

    const result = useSportsSessionStore.getState().soccerResult;
    expect(result).not.toBeNull();
    expect(result!.takes).toEqual([take]);
    expect(result!.bestTakeIndex).toBe(0);
    expect(analyzeMock).toHaveBeenCalledTimes(1);
    expect(analyzeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ label: 'Take 1' }),
    );
  });

  it('appends to the existing takes and labels the next take', async () => {
    const previous = cannedTake();
    useSportsSessionStore.setState({
      soccerResult: { takes: [previous], bestTakeIndex: 0, insights: [] },
    });
    const second = cannedTake({ label: 'Take 2', peakSpeedKmh: 45 });
    analyzeMock.mockResolvedValue(second);
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() =>
      expect(screen.getByText('SoccerResultsRouteStub')).toBeTruthy(),
    );

    expect(analyzeMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ label: 'Take 2' }),
    );
    const result = useSportsSessionStore.getState().soccerResult!;
    expect(result.takes).toHaveLength(2);
    expect(result.bestTakeIndex).toBe(0); // 75 km/h beats 45 km/h
    expect(result.insights.length).toBeGreaterThan(0);
  });

  it('surfaces analysis errors with retry tips and retries on demand', async () => {
    analyzeMock.mockRejectedValue(
      new Error('Could not find the goal in the video'),
    );
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t analyze that shot/)).toBeTruthy(),
    );
    expect(screen.getByText(/Could not find the goal/)).toBeTruthy();
    expect(screen.getByText(/goal corners visible/)).toBeTruthy();
    expect(useSportsSessionStore.getState().soccerResult).toBeNull();

    analyzeMock.mockResolvedValue(cannedTake());
    fireEvent.press(screen.getByText('Retry analysis'));
    await waitFor(() =>
      expect(screen.getByText('SoccerResultsRouteStub')).toBeTruthy(),
    );
    expect(analyzeMock).toHaveBeenCalledTimes(2);
  });
});
