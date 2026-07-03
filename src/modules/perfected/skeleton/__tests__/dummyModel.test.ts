/**
 * DummySkeleton tests: virtual-joint extension, one-shot bone-length
 * calibration from a real PoseFrame, and bone-direction edge cases.
 */
import { POSE_LANDMARKS } from '../../../sports/pose/PoseAdapter';
import { makeDefaultKickScript } from '../../../sports/pose/fakePoseEstimator';
import {
  CHAIN_BONES,
  CHEST_JOINT,
  EXTENDED_JOINT_COUNT,
  PELVIS_JOINT,
  boneDirection,
  calibrateSkeleton,
  extendKeypoints,
  pickCalibrationFrame,
  vecDistance,
} from '../dummyModel';

const L = POSE_LANDMARKS;

const addressFrame = () => ({
  frameIndex: 0,
  timestampMs: 0,
  keypoints: makeDefaultKickScript()[0]!.keypoints,
});

describe('extendKeypoints', () => {
  it('adds the virtual pelvis and chest at the girdle midpoints', () => {
    const ext = extendKeypoints(addressFrame().keypoints);
    expect(ext.positions).toHaveLength(EXTENDED_JOINT_COUNT);
    // Default script: hips (164, 320)/(196, 320), shoulders (160/200, 180).
    expect(ext.positions[PELVIS_JOINT]).toEqual({ x: 180, y: 320, z: 0 });
    expect(ext.positions[CHEST_JOINT]).toEqual({ x: 180, y: 180, z: 0 });
    expect(ext.visibility[PELVIS_JOINT]).toBe(1);
    expect(ext.visibility[CHEST_JOINT]).toBe(1);
  });

  it('rejects keypoint arrays that are not the BlazePose topology', () => {
    expect(() => extendKeypoints([])).toThrow(/33 keypoints/);
  });
});

describe('calibrateSkeleton', () => {
  it('measures segment lengths from the pose', () => {
    const skeleton = calibrateSkeleton(addressFrame());
    expect(skeleton.hipHalfWidthPx).toBeCloseTo(16, 6);
    expect(skeleton.shoulderHalfWidthPx).toBeCloseTo(20, 6);
    expect(skeleton.spineLengthPx).toBeCloseTo(140, 6);
    const thighIdx = CHAIN_BONES.findIndex((b) => b.name === 'left-thigh');
    // Left hip (164, 320) -> left knee (164, 420).
    expect(skeleton.chainLengthsPx[thighIdx]).toBeCloseTo(100, 6);
  });

  it('calibrates invisible segments to zero length', () => {
    const skeleton = calibrateSkeleton(addressFrame());
    // The default script never scripts the eyes: visibility 0.
    const eyeIdx = CHAIN_BONES.findIndex((b) => b.child === L.leftEye);
    expect(skeleton.chainLengthsPx[eyeIdx]).toBe(0);
    expect(skeleton.jointVisibility[L.leftEye]).toBe(0);
  });
});

describe('pickCalibrationFrame', () => {
  it('prefers the frame with the highest summed visibility', () => {
    const good = addressFrame();
    const dim = {
      frameIndex: 1,
      timestampMs: 33,
      keypoints: good.keypoints.map((k) => ({ ...k, visibility: k.visibility * 0.4 })),
    };
    expect(pickCalibrationFrame([dim, good])).toBe(good);
  });

  it('throws on an empty frame list', () => {
    expect(() => pickCalibrationFrame([])).toThrow(/at least one frame/);
  });
});

describe('boneDirection', () => {
  it('returns the unit parent->child direction', () => {
    const ext = extendKeypoints(addressFrame().keypoints);
    const dir = boneDirection(ext, L.leftHip, L.leftKnee);
    expect(dir).not.toBeNull();
    expect(dir!.x).toBeCloseTo(0, 9);
    expect(dir!.y).toBeCloseTo(1, 9);
    expect(Math.hypot(dir!.x, dir!.y, dir!.z)).toBeCloseTo(1, 9);
  });

  it('returns null for invisible or degenerate segments', () => {
    const ext = extendKeypoints(addressFrame().keypoints);
    expect(boneDirection(ext, L.nose, L.leftEye)).toBeNull();
    // Degenerate: same position both ends.
    const clone = extendKeypoints(addressFrame().keypoints);
    clone.positions[L.leftKnee] = { ...clone.positions[L.leftHip]! };
    expect(boneDirection(clone, L.leftHip, L.leftKnee)).toBeNull();
  });
});

describe('vecDistance', () => {
  it('is 3D Euclidean', () => {
    expect(
      vecDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 12 }),
    ).toBeCloseTo(13, 9);
  });
});
