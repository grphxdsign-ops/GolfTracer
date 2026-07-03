/**
 * Sports session store tests: result publication, clearing and reset,
 * without ever touching the frozen cross-module session store.
 */
import { simulateBallFlight } from '../engine/ballFlight';
import { getSportProfile } from '../engine/sportProfile';
import {
  useSportsSessionStore,
  type PerfectedResult,
  type SoccerAnalysisResult,
} from '../sportsSessionStore';

const soccerResult: SoccerAnalysisResult = {
  takes: [
    {
      label: 'fast take',
      samples: [
        {
          timestampMs: 0,
          positionM: { x: 0, y: 0.11, z: 11.9 },
          speedMps: 20.8,
          apparentDiameterPx: 57,
        },
      ],
      peakSpeedMps: 20.8,
      peakSpeedKmh: 75,
      distanceToGoalM: 11.9,
      crossing: {
        crossed: true,
        timestampMs: 620,
        xM: 5.2,
        yM: 1.1,
        isGoal: true,
      },
      contactTimestampMs: 40,
      poseAtContact: null,
      jointAnglesAtContact: null,
    },
  ],
  bestTakeIndex: 0,
  insights: ['Knee flexion at contact was 12 deg deeper on the fast take'],
};

const perfectedResult: PerfectedResult = {
  sport: 'soccer',
  morphedFrames: [{ timestampMs: 0, keypoints: [] }],
  flight: simulateBallFlight(
    { speedMps: 30, launchAngleDeg: 15 },
    getSportProfile('soccer').ball,
  ),
  targetAngles: {
    left: { shoulderHip: 165, hipKnee: 175, kneeAnkle: 110 },
    right: { shoulderHip: 140, hipKnee: 120, kneeAnkle: 125 },
  },
  notes: ['Plant foot closer to the ball'],
};

describe('useSportsSessionStore', () => {
  beforeEach(() => {
    useSportsSessionStore.getState().reset();
  });

  it('starts empty', () => {
    const state = useSportsSessionStore.getState();
    expect(state.soccerResult).toBeNull();
    expect(state.perfectedResult).toBeNull();
  });

  it('publishes and clears the soccer analysis result', () => {
    useSportsSessionStore.getState().setSoccerResult(soccerResult);
    expect(useSportsSessionStore.getState().soccerResult).toBe(soccerResult);
    expect(
      useSportsSessionStore.getState().soccerResult!.takes[0]!.crossing!.isGoal,
    ).toBe(true);

    useSportsSessionStore.getState().setSoccerResult(null);
    expect(useSportsSessionStore.getState().soccerResult).toBeNull();
  });

  it('publishes the perfected result and resets both', () => {
    useSportsSessionStore.getState().setSoccerResult(soccerResult);
    useSportsSessionStore.getState().setPerfectedResult(perfectedResult);
    expect(useSportsSessionStore.getState().perfectedResult).toBe(
      perfectedResult,
    );

    useSportsSessionStore.getState().reset();
    expect(useSportsSessionStore.getState().soccerResult).toBeNull();
    expect(useSportsSessionStore.getState().perfectedResult).toBeNull();
  });
});
