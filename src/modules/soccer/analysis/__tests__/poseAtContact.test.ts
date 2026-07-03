import { FakePoseEstimator } from '../../../sports/pose/fakePoseEstimator';
import {
  createPoseEstimator,
  type PoseEstimator,
} from '../../../sports/pose/PoseAdapter';
import { makeSoccerScene } from '../../testutils/soccerScene';
import { scriptedContactPose } from '../../testutils/soccerFixtures';
import { poseAtContact } from '../poseAtContact';

describe('poseAtContact', () => {
  it('selects the impact frame and derives the joint-angle table from the scripted skeleton', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    // The kick happens at 150 ms → frame 18 at 120 fps.
    const contactFrameIndex = 18;
    const contactTimestampMs = scene.truth.kickTimestampMs;
    const scripted = scriptedContactPose(contactFrameIndex, contactTimestampMs);
    // One keyframe: the fake estimator holds this exact skeleton at contact.
    const estimator = new FakePoseEstimator([
      { timestampMs: contactTimestampMs, keypoints: scripted.keypoints },
    ]);

    const result = await poseAtContact(
      scene.frameSource,
      {
        impactFrameIndex: contactFrameIndex,
        impactTimestampMs: contactTimestampMs,
      },
      estimator,
    );

    expect(result.frameIndex).toBe(contactFrameIndex);
    expect(result.timestampMs).toBe(contactTimestampMs);
    expect(result.pose).not.toBeNull();
    expect(result.pose!.frameIndex).toBe(contactFrameIndex);
    expect(result.pose!.keypoints).toEqual(scripted.keypoints);
    expect(result.jointAngles).not.toBeNull();

    // The scripted skeleton's hand-checkable angles (see soccerFixtures).
    const table = result.jointAngles!;
    expect(table.right.shoulderHip).toBeCloseTo(180, 5);
    expect(table.right.hipKnee).toBeCloseTo(180, 5);
    expect(table.right.kneeAnkle).toBeCloseTo(90, 5);
    expect(table.left.shoulderHip).toBeCloseTo(135, 5);
    expect(table.left.hipKnee).toBeCloseTo(180, 5);
    expect(table.left.kneeAnkle).toBeCloseTo(135, 5);
  });

  it('returns a null pose when the estimator finds nobody at the impact frame', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const nobody: PoseEstimator = {
      estimatePose: () => Promise.resolve(null),
    };
    const result = await poseAtContact(
      scene.frameSource,
      { impactFrameIndex: 18, impactTimestampMs: 150 },
      nobody,
    );
    expect(result.pose).toBeNull();
    expect(result.jointAngles).toBeNull();
  });

  it('degrades to a null pose when the native estimator is unavailable', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const result = await poseAtContact(
      scene.frameSource,
      { impactFrameIndex: 18, impactTimestampMs: 150 },
      createPoseEstimator('native'),
    );
    expect(result.pose).toBeNull();
    expect(result.jointAngles).toBeNull();
  });
});
