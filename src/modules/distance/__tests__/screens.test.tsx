/**
 * Screen tests: module registration, calibration draft flow, and the
 * results screen's method ladder presentation (incl. the visually distinct
 * low-confidence club-prior fallback).
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { BallTrack, TrackingResult } from '../../../types';
import { useSessionStore } from '../../../state/sessionStore';
import { useBallPointStore } from '../../tracking/screens/ballPointStore';
import { distanceModule } from '..';
import { CalibrationScreen } from '../screens/CalibrationScreen';
import { ResultsScreen } from '../screens/ResultsScreen';
import { useDistanceStore } from '../distanceStore';
import { makeSyntheticDtlTrack } from './helpers/syntheticDtl';

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

function makeTrackingResult(track: BallTrack): TrackingResult {
  return {
    track,
    tracer: {
      points: track.smoothedPath,
      apexIndex: track.apexPointIndex,
      style: { color: '#fff', glowColor: '#fff', strokeWidth: 2, glowWidth: 6 },
    },
  };
}

const SPARSE_TRACK: BallTrack = {
  observations: [],
  smoothedPath: [
    { timestampMs: 1000, x: 200, y: 900, interpolated: false },
    { timestampMs: 1008, x: 210, y: 890, interpolated: true },
    { timestampMs: 1016, x: 220, y: 880, interpolated: true },
  ],
  impactFrameIndex: 0,
  impactTimestampMs: 1000,
  apexPointIndex: 2,
  frameWidth: 1920,
  frameHeight: 1080,
  quality: 'low',
};

describe('distanceModule registration', () => {
  it('registers exactly the fixed Calibration and Results routes', () => {
    expect(distanceModule.name).toBe('distance');
    expect(distanceModule.screens.map((s) => s.route)).toEqual([
      'Calibration',
      'Results',
    ]);
  });
});

describe('CalibrationScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSessionStore.getState().reset();
    useDistanceStore.getState().resetDraft();
  });

  it('renders the club grid and camera-angle control with guidance', () => {
    renderWithNav(<CalibrationScreen />);
    expect(screen.getByText('Driver')).toBeTruthy();
    expect(screen.getByText('PW')).toBeTruthy();
    expect(screen.getByText('Down the line')).toBeTruthy();
    expect(screen.getByText(/cleanest downrange view/)).toBeTruthy();
  });

  it('publishes the calibration and navigates to Results on continue', () => {
    renderWithNav(<CalibrationScreen />);
    fireEvent.press(screen.getByText('PW'));
    fireEvent.press(screen.getByText('Face on'));
    fireEvent.changeText(
      screen.getByLabelText('Horizontal field of view in degrees'),
      '75',
    );
    fireEvent.press(screen.getByText('Estimate distance'));

    const calibration = useSessionStore.getState().calibration;
    expect(calibration).toEqual({
      club: 'pitching-wedge',
      cameraAngle: 'face-on',
      horizontalFovDeg: 75,
    });
    expect(mockNavigate).toHaveBeenCalledWith('Results');
  });

  it('adds and removes tapped reference points', () => {
    renderWithNav(<CalibrationScreen />);
    fireEvent.press(
      screen.getByLabelText('Tap to add a reference point'),
      { nativeEvent: { locationX: 80, locationY: 45 } },
    );
    expect(useDistanceStore.getState().referencePoints).toHaveLength(1);
    fireEvent.press(screen.getByLabelText('Remove Point 1'));
    expect(useDistanceStore.getState().referencePoints).toHaveLength(0);
  });
});

describe('ResultsScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSessionStore.getState().reset();
    useDistanceStore.getState().resetDraft();
    useBallPointStore.getState().clear();
  });

  it('prompts for a tracked shot when the session is empty', () => {
    renderWithNav(<ResultsScreen />);
    expect(screen.getByText('No shot to analyze')).toBeTruthy();
  });

  it('shows a visually distinct club-prior fallback with capped confidence', async () => {
    useSessionStore.getState().setTrackingResult(makeTrackingResult(SPARSE_TRACK));
    useSessionStore.getState().setCalibration({
      club: 'pitching-wedge',
      cameraAngle: 'face-on',
    });

    renderWithNav(<ResultsScreen />);
    expect(screen.getByText('Club average')).toBeTruthy();
    expect(
      screen.getByText('Estimate only — based on club averages'),
    ).toBeTruthy();

    await waitFor(() => {
      const distance = useSessionStore.getState().distance;
      expect(distance).not.toBeNull();
      expect(distance?.method).toBe('club-prior');
      expect(distance?.confidence).toBeLessThanOrEqual(0.3);
    });
  });

  it(
    'renders a collapsible Fit details section for DTL fits, fed by the ' +
      'ball tap',
    async () => {
      // A clean synthetic down-the-line shot the DTL rung can measure; the
      // tap-to-place-ball point supplies the tee ray.
      const scene = makeSyntheticDtlTrack({
        club: 'driver',
        launch: { ballSpeedMph: 150, launchAngleDeg: 12, backspinRpm: 2500 },
        azimuthDeg: 0,
        cameraPitchDeg: 2,
        cameraHeightM: 1.6,
        teeDistanceM: 4,
        hfovDeg: 44,
        frameWidth: 1080,
        frameHeight: 1920,
        fps: 30,
        nObs: 12,
        noisePx: 1,
        seed: 7,
      });
      useBallPointStore.getState().setBallPoint(scene.teePointPx);
      useSessionStore
        .getState()
        .setTrackingResult(makeTrackingResult(scene.track));
      useSessionStore.getState().setCalibration({
        club: 'driver',
        cameraAngle: 'down-the-line',
        horizontalFovDeg: 44,
        ballRadiusAtAddressPx: scene.ballRadiusAtAddressPx,
      });

      renderWithNav(<ResultsScreen />);
      expect(screen.getByText('Physics fit')).toBeTruthy();

      // Collapsed by default; expanding reveals the summarizeEstimate rows.
      expect(screen.queryByText('Tee source')).toBeNull();
      fireEvent.press(screen.getByLabelText('Toggle fit details'));
      expect(screen.getByText('Tee source')).toBeTruthy();
      expect(screen.getByText('Ball tap')).toBeTruthy();
      expect(screen.getByText('Azimuth')).toBeTruthy();
      expect(screen.getByText('Camera pitch')).toBeTruthy();
      expect(screen.getByText('Camera height')).toBeTruthy();
      expect(screen.getByText('Field of view')).toBeTruthy();
      expect(screen.getByText('Fit RMS')).toBeTruthy();
      expect(screen.getByText('Carry spread')).toBeTruthy();
      expect(screen.getByText('Points used')).toBeTruthy();

      await waitFor(() => {
        const distance = useSessionStore.getState().distance;
        expect(distance?.method).toBe('physics-fit');
        expect(distance?.confidence).toBeGreaterThan(0.3);
        expect(distance?.confidence).toBeLessThanOrEqual(0.75);
      });
    },
    60000,
  );

  it('shows no Fit details section for non-DTL estimates', () => {
    useSessionStore.getState().setTrackingResult(makeTrackingResult(SPARSE_TRACK));
    useSessionStore.getState().setCalibration({
      club: 'pitching-wedge',
      cameraAngle: 'face-on',
    });
    renderWithNav(<ResultsScreen />);
    expect(screen.queryByLabelText('Toggle fit details')).toBeNull();
  });

  it('resets the session on New shot and navigates Home', () => {
    useSessionStore.getState().setTrackingResult(makeTrackingResult(SPARSE_TRACK));
    useSessionStore.getState().setCalibration({
      club: 'pitching-wedge',
      cameraAngle: 'face-on',
    });

    renderWithNav(<ResultsScreen />);
    fireEvent.press(screen.getByText('New shot'));
    expect(useSessionStore.getState().trackingResult).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Home');
  });
});
