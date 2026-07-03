import { FakePoseEstimator } from '../../../sports/pose/fakePoseEstimator';
import { FakeGoalDetector } from '../../goal/GoalDetector';
import { makeSoccerScene } from '../../testutils/soccerScene';
import { scriptedContactPose } from '../../testutils/soccerFixtures';
import { analyzeSoccerTake } from '../analyzeSoccerShot';

describe('analyzeSoccerTake', () => {
  it('produces the full measure_plan-style take result on a synthetic strong take', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const progress: number[] = [];
    const contact = scriptedContactPose(18, scene.truth.kickTimestampMs);

    const take = await analyzeSoccerTake(scene.frameSource, {
      label: 'Strong take',
      tracking: {
        detector: scene.detector,
        impactRoi: scene.impactRoi,
        seedRoi: scene.seedRoi,
      },
      goalDetector: scene.goalDetector,
      poseEstimator: new FakePoseEstimator([
        { timestampMs: scene.truth.kickTimestampMs, keypoints: contact.keypoints },
      ]),
      hFovDeg: scene.hFovDeg,
      onProgress: (f) => progress.push(f),
    });

    expect(take.label).toBe('Strong take');
    expect(progress[progress.length - 1]).toBe(1);

    // Shot speed within the asserted recovery bound.
    expect(Math.abs(take.peakSpeedKmh - 75) / 75).toBeLessThan(0.08);
    expect(take.peakSpeedMps).toBeCloseTo(take.peakSpeedKmh / 3.6, 6);
    expect(take.samples.length).toBeGreaterThan(10);
    // Per-frame samples carry world position, current speed and the ball-px
    // depth cue.
    const firstSample = take.samples[0]!;
    expect(firstSample.apparentDiameterPx).toBeGreaterThan(0);
    expect(firstSample.positionM.z).toBeGreaterThan(9.5);

    // Ball distance to the goal line at contact: ~11 m.
    expect(take.distanceToGoalM).not.toBeNull();
    expect(take.distanceToGoalM!).toBeGreaterThan(9.5);
    expect(take.distanceToGoalM!).toBeLessThan(12);

    // Goal-plane cross verdict with crossing coordinates.
    expect(take.crossing).not.toBeNull();
    expect(take.crossing!.crossed).toBe(true);
    expect(take.crossing!.isGoal).toBe(true);
    expect(take.crossing!.xM).toBeDefined();
    expect(take.crossing!.yM).toBeDefined();

    // Pose at contact + joint-angle table.
    expect(take.contactTimestampMs).not.toBeNull();
    expect(take.poseAtContact).not.toBeNull();
    expect(take.jointAnglesAtContact).not.toBeNull();
    expect(take.jointAnglesAtContact!.right.kneeAnkle).toBeCloseTo(90, 5);
  });

  it('throws a descriptive error when the goal is never detected', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    await expect(
      analyzeSoccerTake(scene.frameSource, {
        tracking: {
          detector: scene.detector,
          impactRoi: scene.impactRoi,
          seedRoi: scene.seedRoi,
        },
        goalDetector: new FakeGoalDetector(() => null),
      }),
    ).rejects.toThrow(/Could not find the goal/);
  });
});
