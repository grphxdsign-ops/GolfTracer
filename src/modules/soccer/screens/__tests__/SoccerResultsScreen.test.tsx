import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { SoccerResultsScreen } from '../SoccerResultsScreen';
import { useSportsSessionStore } from '../../../sports/sportsSessionStore';
import { computeJointAngleTable } from '../../../sports/pose/jointAngles';
import { appendTakeToResult } from '../../analysis/takeCompare';
import {
  cannedSoccerResult,
  cannedTake,
  scriptedContactPose,
} from '../../testutils/soccerFixtures';

function AnalyzeStub() {
  return <Text>SoccerAnalyzeRouteStub</Text>;
}

function renderResults() {
  const Stack = createNativeStackNavigator();
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="SoccerResults" component={SoccerResultsScreen} />
        <Stack.Screen name="SoccerAnalyze" component={AnalyzeStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  useSportsSessionStore.getState().reset();
});

describe('SoccerResultsScreen', () => {
  it('asks for an analysis when there is no soccer result', () => {
    renderResults();
    expect(screen.getByText('No soccer analysis yet')).toBeTruthy();
  });

  it('renders the GOAL verdict, shot speed, contact distance, and angle table', () => {
    useSportsSessionStore.getState().setSoccerResult(cannedSoccerResult());
    renderResults();

    expect(screen.getByText('GOAL!')).toBeTruthy();
    expect(screen.getByText(/Crossed the line 3\.97 m from the left post/)).toBeTruthy();
    expect(screen.getByText(/km\/h shot speed/)).toBeTruthy();
    expect(
      screen.getByText(/Ball distance to goal line at contact: 11\.9 m/),
    ).toBeTruthy();

    // Pose-at-contact stage + joint-angle table rows.
    expect(screen.getByTestId('pose-stage')).toBeTruthy();
    expect(screen.getByText('Pose at contact')).toBeTruthy();
    expect(screen.getByText('Shoulder–Hip')).toBeTruthy();
    expect(screen.getByText('Hip–Knee')).toBeTruthy();
    expect(screen.getByText('Knee–Ankle')).toBeTruthy();
    // Right knee-ankle is the scripted 90°.
    expect(screen.getAllByText('90°').length).toBeGreaterThan(0);
  });

  it('renders the skeleton overlay once the stage is laid out', () => {
    useSportsSessionStore.getState().setSoccerResult(cannedSoccerResult());
    renderResults();
    fireEvent(screen.getByTestId('pose-stage'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 220 } },
    });
    // Smoke: no crash re-rendering with the Skia canvas mounted.
    expect(screen.getByTestId('pose-stage')).toBeTruthy();
  });

  it('shows NO GOAL with the miss detail for a wide crossing', () => {
    useSportsSessionStore.getState().setSoccerResult(
      cannedSoccerResult({
        takes: [
          cannedTake({
            crossing: {
              crossed: true,
              isGoal: false,
              xM: 8.3,
              yM: 1.1,
              timestampMs: 700,
            },
          }),
        ],
      }),
    );
    renderResults();
    expect(screen.getByText('NO GOAL')).toBeTruthy();
    expect(screen.getByText(/Crossed the goal plane outside/)).toBeTruthy();
  });

  it('reports joint angles unavailable when no pose was detected', () => {
    useSportsSessionStore.getState().setSoccerResult(
      cannedSoccerResult({
        takes: [cannedTake({ poseAtContact: null, jointAnglesAtContact: null })],
      }),
    );
    renderResults();
    expect(screen.getByText(/joint angles unavailable/)).toBeTruthy();
  });

  it('shows the fast-vs-slow take insights once two takes exist', () => {
    const slowPose = scriptedContactPose(20, 170, true);
    const slow = cannedTake({
      label: 'Take 2',
      peakSpeedKmh: 45,
      poseAtContact: slowPose,
      jointAnglesAtContact: computeJointAngleTable(slowPose),
    });
    const result = appendTakeToResult(appendTakeToResult(null, cannedTake()), slow);
    useSportsSessionStore.getState().setSoccerResult(result);
    renderResults();

    expect(screen.getByText('Take comparison')).toBeTruthy();
    expect(
      screen.getByText('Take 1 was 30 km/h faster than Take 2 (75 vs 45 km/h).'),
    ).toBeTruthy();
    // The coaching insight: the scripted right hip-knee 90° delta.
    expect(
      screen.getByText(/Biggest difference at contact: right Hip–Knee angle was 90°/),
    ).toBeTruthy();
  });

  it("navigates back to analysis via 'Analyze another take'", () => {
    useSportsSessionStore.getState().setSoccerResult(cannedSoccerResult());
    renderResults();
    fireEvent.press(screen.getByText('Analyze another take'));
    expect(screen.getByText('SoccerAnalyzeRouteStub')).toBeTruthy();
  });
});
