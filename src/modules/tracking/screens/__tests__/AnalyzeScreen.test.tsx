import { Text } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AnalyzeScreen } from '../AnalyzeScreen';
import { useSessionStore } from '../../../../state/sessionStore';
import { runTracking } from '../../tracker/pipeline';
import { useBallPointStore } from '../ballPointStore';
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
  useBallPointStore.getState().clear();
  runTrackingMock.mockReset();
});

describe('AnalyzeScreen', () => {
  it('prompts for a video when no frameSource is loaded', () => {
    renderAnalyze();
    expect(screen.getByText('No video loaded')).toBeTruthy();
    // Ghost escape hatch back out of the dead-end.
    expect(screen.getByText('Back to home')).toBeTruthy();
    expect(runTrackingMock).not.toHaveBeenCalled();
  });

  it('shows the staged progress captions while the pipeline runs', async () => {
    let reportProgress: ((p: number) => void) | undefined;
    runTrackingMock.mockImplementation(
      (_src, opts) =>
        new Promise(() => {
          reportProgress = opts?.onProgress;
        }),
    );
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() => expect(screen.getByText('Tracking ball flight')).toBeTruthy());
    expect(screen.getByText('Reading frames…')).toBeTruthy();

    await waitFor(() => expect(reportProgress).toBeDefined());
    act(() => reportProgress!(0.5));
    expect(screen.getByText('Following the ball…')).toBeTruthy();
    act(() => reportProgress!(0.9));
    expect(screen.getByText('Building the tracer…')).toBeTruthy();
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

  it('shows the mark-the-ball panel on failure and stores a tapped native-px point', async () => {
    runTrackingMock.mockResolvedValue(cannedResult('failed'));
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() => expect(screen.getByText('Mark the ball')).toBeTruthy());
    expect(screen.getByTestId('ball-point-box')).toBeTruthy();
    expect(screen.queryByTestId('ball-point-marker')).toBeNull();
    expect(screen.queryByText('Clear ball point')).toBeNull();

    // cannedAsset is 1920x1080; the 180pt-tall box is 320pt wide (1/6 scale),
    // so a tap at its center is native (960, 540).
    fireEvent.press(screen.getByTestId('ball-point-box'), {
      nativeEvent: { locationX: 160, locationY: 90 },
    });
    expect(useBallPointStore.getState().ballPoint).toEqual({ x: 960, y: 540 });

    // The new point re-runs tracking (still failed) — the panel returns with
    // the marker dot and the clear affordance.
    await waitFor(() =>
      expect(screen.getByTestId('ball-point-marker')).toBeTruthy(),
    );
    expect(screen.getByText('Clear ball point')).toBeTruthy();
  });

  it('retries with the stored ballPoint in the tracking options', async () => {
    runTrackingMock.mockResolvedValue(cannedResult('failed'));
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() => expect(screen.getByTestId('ball-point-box')).toBeTruthy());
    expect(runTrackingMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ ballPoint: undefined }),
    );

    fireEvent.press(screen.getByTestId('ball-point-box'), {
      nativeEvent: { locationX: 80, locationY: 135 },
    });
    await waitFor(() =>
      expect(screen.getByTestId('ball-point-marker')).toBeTruthy(),
    );

    const callsBeforeRetry = runTrackingMock.mock.calls.length;
    fireEvent.press(screen.getByText('Retry analysis'));
    await waitFor(() =>
      expect(runTrackingMock.mock.calls.length).toBe(callsBeforeRetry + 1),
    );
    expect(runTrackingMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ ballPoint: { x: 480, y: 810 } }),
    );
  });

  it('clears the stored ball point via the clear control', async () => {
    runTrackingMock.mockResolvedValue(cannedResult('failed'));
    useSessionStore.setState({ frameSource: cannedFrameSource() });

    renderAnalyze();
    await waitFor(() => expect(screen.getByTestId('ball-point-box')).toBeTruthy());
    fireEvent.press(screen.getByTestId('ball-point-box'), {
      nativeEvent: { locationX: 160, locationY: 90 },
    });
    await waitFor(() => expect(screen.getByText('Clear ball point')).toBeTruthy());

    fireEvent.press(screen.getByText('Clear ball point'));
    expect(useBallPointStore.getState().ballPoint).toBeNull();
    await waitFor(() =>
      expect(screen.queryByTestId('ball-point-marker')).toBeNull(),
    );
  });
});
