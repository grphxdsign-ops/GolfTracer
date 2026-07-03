/**
 * Pose adapter tests: FakePoseEstimator determinism and keyframe
 * interpolation, the createPoseEstimator switch point, the 33-landmark
 * schema, and the rejecting native stub.
 */
import type { VideoFrame } from '../../../../types/media';
import {
  POSE_LANDMARKS,
  POSE_LANDMARK_COUNT,
  createPoseEstimator,
} from '../PoseAdapter';
import {
  FakePoseEstimator,
  makeDefaultKickScript,
  skeletonKeypoints,
  type PoseKeyframe,
} from '../fakePoseEstimator';
import {
  NATIVE_POSE_ESTIMATOR_ERROR,
  NativePoseEstimator,
} from '../nativePoseEstimator';

const frameAt = (index: number, timestampMs: number): VideoFrame => ({
  index,
  timestampMs,
  width: 360,
  height: 640,
  luma: new Uint8Array(360 * 640),
});

const twoKeyframes: PoseKeyframe[] = [
  {
    timestampMs: 100,
    keypoints: skeletonKeypoints({
      leftHip: { x: 100, y: 200 },
      rightAnkle: { x: 300, y: 500 },
    }),
  },
  {
    timestampMs: 300,
    keypoints: skeletonKeypoints({
      leftHip: { x: 140, y: 220 },
      rightAnkle: { x: 200, y: 400 },
    }),
  },
];

describe('POSE_LANDMARKS schema', () => {
  it('is a complete, collision-free 33-index BlazePose map', () => {
    const indices = Object.values(POSE_LANDMARKS);
    expect(indices).toHaveLength(POSE_LANDMARK_COUNT);
    expect(new Set(indices).size).toBe(POSE_LANDMARK_COUNT);
    expect(Math.min(...indices)).toBe(0);
    expect(Math.max(...indices)).toBe(POSE_LANDMARK_COUNT - 1);
    expect(POSE_LANDMARKS.nose).toBe(0);
    expect(POSE_LANDMARKS.leftFootIndex).toBe(31);
  });
});

describe('FakePoseEstimator', () => {
  it('is deterministic: identical frames give identical skeletons', async () => {
    const estimator = new FakePoseEstimator();
    const a = await estimator.estimatePose(frameAt(3, 120));
    const b = await estimator.estimatePose(frameAt(3, 120));
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
    expect(a!.keypoints).toHaveLength(POSE_LANDMARK_COUNT);
  });

  it('interpolates linearly between keyframes', async () => {
    const estimator = new FakePoseEstimator(twoKeyframes);
    const mid = await estimator.estimatePose(frameAt(0, 200));
    const hip = mid!.keypoints[POSE_LANDMARKS.leftHip]!;
    const ankle = mid!.keypoints[POSE_LANDMARKS.rightAnkle]!;
    expect(hip.x).toBeCloseTo(120, 9);
    expect(hip.y).toBeCloseTo(210, 9);
    expect(ankle.x).toBeCloseTo(250, 9);
    expect(ankle.y).toBeCloseTo(450, 9);
    // Quarter of the way through the span.
    const quarter = await estimator.estimatePose(frameAt(0, 150));
    expect(quarter!.keypoints[POSE_LANDMARKS.leftHip]!.x).toBeCloseTo(110, 9);
  });

  it('clamps to the first/last keyframe outside the script', async () => {
    const estimator = new FakePoseEstimator(twoKeyframes);
    const before = await estimator.estimatePose(frameAt(0, 0));
    const after = await estimator.estimatePose(frameAt(0, 9999));
    expect(before!.keypoints[POSE_LANDMARKS.leftHip]!.x).toBe(100);
    expect(after!.keypoints[POSE_LANDMARKS.leftHip]!.x).toBe(140);
  });

  it('stamps the pose with the frame index and timestamp', async () => {
    const estimator = new FakePoseEstimator(twoKeyframes);
    const pose = await estimator.estimatePose(frameAt(7, 250));
    expect(pose!.frameIndex).toBe(7);
    expect(pose!.timestampMs).toBe(250);
  });

  it('validates the script', () => {
    expect(() => new FakePoseEstimator([])).toThrow(/at least one keyframe/);
    expect(
      () =>
        new FakePoseEstimator([
          { timestampMs: 0, keypoints: [{ x: 0, y: 0, visibility: 1 }] },
        ]),
    ).toThrow(/expected 33/);
  });

  it('ships a well-formed default kick script', () => {
    const script = makeDefaultKickScript();
    expect(script.length).toBeGreaterThanOrEqual(3);
    for (const kf of script) {
      expect(kf.keypoints).toHaveLength(POSE_LANDMARK_COUNT);
    }
    // The kicking ankle travels forward through the script.
    const ankleXs = script.map(
      (kf) => kf.keypoints[POSE_LANDMARKS.rightAnkle]!.x,
    );
    expect(ankleXs[ankleXs.length - 1]!).toBeGreaterThan(ankleXs[0]!);
  });
});

describe('createPoseEstimator', () => {
  it('defaults to the fake and accepts a script', async () => {
    const estimator = createPoseEstimator();
    expect(estimator).toBeInstanceOf(FakePoseEstimator);
    const scripted = createPoseEstimator('fake', twoKeyframes);
    const pose = await scripted.estimatePose(frameAt(0, 100));
    expect(pose!.keypoints[POSE_LANDMARKS.leftHip]!.x).toBe(100);
  });

  it('returns the rejecting native stub for kind "native"', async () => {
    const estimator = createPoseEstimator('native');
    expect(estimator).toBeInstanceOf(NativePoseEstimator);
    await expect(estimator.estimatePose(frameAt(0, 0))).rejects.toThrow(
      NATIVE_POSE_ESTIMATOR_ERROR,
    );
  });
});
