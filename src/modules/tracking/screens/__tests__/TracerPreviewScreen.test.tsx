import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TracerPreviewScreen } from '../TracerPreviewScreen';
import { useSessionStore } from '../../../../state/sessionStore';
import {
  cannedAsset,
  cannedFrameSource,
  cannedResult,
} from '../../testutils/screenFixtures';

function CalibrationStub() {
  return <Text>CalibrationRouteStub</Text>;
}

function renderPreview() {
  const Stack = createNativeStackNavigator();
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="TracerPreview" component={TracerPreviewScreen} />
        <Stack.Screen name="Calibration" component={CalibrationStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
});

describe('TracerPreviewScreen', () => {
  it('asks for an analysis when there is no tracking result', () => {
    renderPreview();
    expect(screen.getByText('No tracer yet')).toBeTruthy();
  });

  it('renders the preview stage, quality, and style pickers', () => {
    useSessionStore.getState().setVideo(cannedAsset(), cannedFrameSource());
    useSessionStore.getState().setTrackingResult(cannedResult('high'));
    renderPreview();

    expect(screen.getByTestId('tracer-stage')).toBeTruthy();
    expect(screen.getByText('quality: high')).toBeTruthy();
    expect(screen.getByLabelText('Tracer color Red')).toBeTruthy();
    expect(screen.getByLabelText('Tracer color White')).toBeTruthy();
    expect(screen.getByText('Subtle')).toBeTruthy();
    expect(screen.getByText('Bold')).toBeTruthy();
    expect(screen.getByText('Replay tracer')).toBeTruthy();
  });

  it('changes the selected color and glow presets', () => {
    useSessionStore.getState().setVideo(cannedAsset(), cannedFrameSource());
    useSessionStore.getState().setTrackingResult(cannedResult('high'));
    renderPreview();

    const cyan = screen.getByLabelText('Tracer color Cyan');
    expect(cyan.props.accessibilityState.selected).toBe(false);
    fireEvent.press(cyan);
    expect(
      screen.getByLabelText('Tracer color Cyan').props.accessibilityState.selected,
    ).toBe(true);
    expect(
      screen.getByLabelText('Tracer color Red').props.accessibilityState.selected,
    ).toBe(false);

    fireEvent.press(screen.getByText('Bold'));
    // No crash and the option is now selected.
    const bold = screen.getByText('Bold').parent;
    expect(bold).toBeTruthy();
  });

  it("navigates to Calibration via 'Estimate distance'", () => {
    useSessionStore.getState().setVideo(cannedAsset(), cannedFrameSource());
    useSessionStore.getState().setTrackingResult(cannedResult('medium'));
    renderPreview();

    fireEvent.press(screen.getByText('Estimate distance'));
    expect(screen.getByText('CalibrationRouteStub')).toBeTruthy();
  });

  it('replay does not crash and can unmount mid-animation', () => {
    useSessionStore.getState().setVideo(cannedAsset(), cannedFrameSource());
    useSessionStore.getState().setTrackingResult(cannedResult('high'));
    const view = renderPreview();
    fireEvent.press(screen.getByText('Replay tracer'));
    view.unmount();
  });
});
