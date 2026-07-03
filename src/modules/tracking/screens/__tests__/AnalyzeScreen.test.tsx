import { Text } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AnalyzeScreen } from '../AnalyzeScreen';
import { useSessionStore } from '../../../../state/sessionStore';
import { runTracking } from '../../tracker/pipeline';
import { cannedFrameSource, cannedResult } from '../../testutils/screenFixtures';

jest.mock('../../tracker/pipeline', () => ({
  runTracking: jest.fn(),
}));

const runTrackingMock = runTracking as jest.MockedFunction<typeof runTracking>;

function PreviewStub() {
  return <Text>PreviewRouteStub</Text>;
}

function renderAnalyze() {
  const Stack = createNativeStackNavigator();
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Analyze" component={AnalyzeScreen} />
        <Stack.Screen name="TracerPreview" component={PreviewStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  runTrackingMock.mockReset();
});

describe('AnalyzeScreen', () => {
  it('prompts for a video when no frameSource is loaded', () => {
    renderAnalyze();
    expect(screen.getByText('No video loaded')).toBeTruthy();
    expect(runTrackingMock).not.toHaveBeenCalled();
  });

  it('runs the pipeline, stores the result, and navigates to the preview', async () => {
    const result = cannedResult('high');
    runTrackingMock.mockImplementation(async (_src, opts) => {
      opts?.onProgress?.(0.5);
      opts?.onProgress?.(1);
      return result;
    });
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() => expect(screen.getByText('PreviewRouteStub')).toBeTruthy());

    const state = useSessionStore.getState();
    expect(state.trackingResult).toBe(result);
    expect(state.trackingStatus).toBe('done');
    expect(runTrackingMock).toHaveBeenCalledTimes(1);
  });

  it('shows retry tips on a failed-quality track and retries on demand', async () => {
    runTrackingMock.mockResolvedValue(cannedResult('failed'));
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() =>
      expect(screen.getByText(/Couldn.t track that shot/)).toBeTruthy(),
    );
    // Result is still published (with its failed grade) — never hidden.
    expect(useSessionStore.getState().trackingResult?.track.quality).toBe('failed');
    expect(screen.queryByText('PreviewRouteStub')).toBeNull();
    expect(screen.getByText(/tripod/)).toBeTruthy();

    // Retry runs the pipeline again; a good result now navigates.
    runTrackingMock.mockResolvedValue(cannedResult('high'));
    fireEvent.press(screen.getByText('Retry analysis'));
    await waitFor(() => expect(screen.getByText('PreviewRouteStub')).toBeTruthy());
    expect(runTrackingMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces pipeline errors and sets the error status', async () => {
    runTrackingMock.mockRejectedValue(new Error('Video too short to analyze'));
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() =>
      expect(screen.getByText('Video too short to analyze')).toBeTruthy(),
    );
    const state = useSessionStore.getState();
    expect(state.trackingStatus).toBe('error');
    expect(state.trackingError).toBe('Video too short to analyze');
  });
});
