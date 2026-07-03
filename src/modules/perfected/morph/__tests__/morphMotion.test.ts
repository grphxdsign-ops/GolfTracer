/**
 * Motion-morph tests: convergence at the strength endpoints (0 = measured
 * angles, 1 = expert-track angles), monotone interpolation of joint angles
 * at intermediate strengths, zero segment-length drift at every strength,
 * and a monotone DTW alignment onto the expert track.
 */
import { FakePoseEstimator, makeDefaultKickScript } from '../../../sports/pose/fakePoseEstimator';
import type { PoseFrame } from '../../../sports/pose/PoseAdapter';
import { POSE_LANDMARKS } from '../../../sports/pose/PoseAdapter';
import { computeJointAngleTable } from '../../../sports/pose/jointAngles';
import {
  CHAIN_BONES,
  calibrateSkeleton,
  extendKeypoints,
  pickCalibrationFrame,
  vecDistance,
  type DummySkeleton,
} from '../../skeleton/dummyModel';
import { BIOMECH_TARGETS } from '../targets';
import { morphMotion, samplePoseFrames } from '../morphMotion';

const L = POSE_LANDMARKS;
const REFERENCE = BIOMECH_TARGETS.soccer.referenceTrack;

/**
 * The measured motion, "rigidified": reconstructed once at strength 0 so
 * its bone lengths already equal the calibrated skeleton (real projected
 * poses foreshorten, so raw keypoints drift in segment length — the FK
 * dummy never does). Angles are preserved exactly by the reconstruction.
 */
function rigidMeasured(): { frames: PoseFrame[]; skeleton: DummySkeleton } {
  const raw = samplePoseFrames(makeDefaultKickScript(), 30);
  const skeleton = calibrateSkeleton(pickCalibrationFrame(raw));
  const frames = morphMotion(raw, REFERENCE, skeleton, 0).frames;
  return { frames, skeleton };
}

describe('morphMotion endpoints', () => {
  it('reproduces the measured joint angles exactly at strength 0', () => {
    const { frames, skeleton } = rigidMeasured();
    const morphed = morphMotion(frames, REFERENCE, skeleton, 0);
    expect(morphed.frames).toHaveLength(frames.length);
    for (let i = 0; i < frames.length; i++) {
      const got = computeJointAngleTable(morphed.frames[i]!);
      const want = computeJointAngleTable(frames[i]!);
      for (const side of ['left', 'right'] as const) {
        expect(got[side].shoulderHip).toBeCloseTo(want[side].shoulderHip, 6);
        expect(got[side].hipKnee).toBeCloseTo(want[side].hipKnee, 6);
        expect(got[side].kneeAnkle).toBeCloseTo(want[side].kneeAnkle, 6);
      }
    }
  });

  it('converges to the expert-track bone angles at strength 1', () => {
    const { frames, skeleton } = rigidMeasured();
    const morphed = morphMotion(frames, REFERENCE, skeleton, 1);
    const expert = new FakePoseEstimator(REFERENCE);
    for (let i = 0; i < frames.length; i++) {
      const got = computeJointAngleTable(morphed.frames[i]!);
      const want = computeJointAngleTable({
        frameIndex: i,
        timestampMs: morphed.alignment.mappedReferenceMs[i]!,
        keypoints: expert.keypointsAt(morphed.alignment.mappedReferenceMs[i]!),
      });
      // hipKnee and kneeAnkle are pure bone-to-bone angles, preserved
      // exactly when the dummy is retargeted onto the user's proportions.
      for (const side of ['left', 'right'] as const) {
        expect(got[side].hipKnee).toBeCloseTo(want[side].hipKnee, 5);
        expect(got[side].kneeAnkle).toBeCloseTo(want[side].kneeAnkle, 5);
      }
    }
    // At strength 1 the morph IS the target motion.
    for (let i = 0; i < frames.length; i++) {
      const got = computeJointAngleTable(morphed.frames[i]!);
      const target = computeJointAngleTable(morphed.targetFrames[i]!);
      for (const side of ['left', 'right'] as const) {
        expect(got[side].shoulderHip).toBeCloseTo(target[side].shoulderHip, 6);
        expect(got[side].hipKnee).toBeCloseTo(target[side].hipKnee, 6);
        expect(got[side].kneeAnkle).toBeCloseTo(target[side].kneeAnkle, 6);
      }
    }
  });

  it('clamps out-of-range strengths', () => {
    const { frames, skeleton } = rigidMeasured();
    expect(morphMotion(frames, REFERENCE, skeleton, -1).strength).toBe(0);
    expect(morphMotion(frames, REFERENCE, skeleton, 2).strength).toBe(1);
  });
});

describe('morphMotion interpolation', () => {
  it('moves bone angles monotonically from measured to target', () => {
    const { frames, skeleton } = rigidMeasured();
    const strengths = [0, 0.25, 0.5, 0.75, 1];
    const tables = strengths.map((s) =>
      morphMotion(frames, REFERENCE, skeleton, s).frames.map((f) =>
        computeJointAngleTable(f),
      ),
    );
    const eps = 1e-6;
    for (let i = 0; i < frames.length; i++) {
      for (const side of ['left', 'right'] as const) {
        for (const key of ['hipKnee', 'kneeAnkle'] as const) {
          const series = tables.map((t) => t[i]![side][key]);
          const lo = Math.min(series[0]!, series[series.length - 1]!) - eps;
          const hi = Math.max(series[0]!, series[series.length - 1]!) + eps;
          const increasing = series[series.length - 1]! >= series[0]!;
          for (let k = 0; k < series.length; k++) {
            expect(series[k]!).toBeGreaterThanOrEqual(lo);
            expect(series[k]!).toBeLessThanOrEqual(hi);
            if (k > 0) {
              if (increasing) {
                expect(series[k]!).toBeGreaterThanOrEqual(series[k - 1]! - eps);
              } else {
                expect(series[k]!).toBeLessThanOrEqual(series[k - 1]! + eps);
              }
            }
          }
        }
      }
    }
  });

  it('never drifts segment lengths at any strength (bone-length invariance)', () => {
    const { frames, skeleton } = rigidMeasured();
    for (const strength of [0, 0.33, 0.66, 1]) {
      const morphed = morphMotion(frames, REFERENCE, skeleton, strength);
      for (const frame of morphed.frames) {
        const ext = extendKeypoints(frame.keypoints);
        const p = ext.positions;
        // Girdles and spine.
        expect(
          vecDistance(p[L.leftHip]!, p[L.rightHip]!),
        ).toBeCloseTo(2 * skeleton.hipHalfWidthPx, 6);
        expect(
          vecDistance(p[L.leftShoulder]!, p[L.rightShoulder]!),
        ).toBeCloseTo(2 * skeleton.shoulderHalfWidthPx, 6);
        const pelvis = {
          x: (p[L.leftHip]!.x + p[L.rightHip]!.x) / 2,
          y: (p[L.leftHip]!.y + p[L.rightHip]!.y) / 2,
          z: (p[L.leftHip]!.z + p[L.rightHip]!.z) / 2,
        };
        const chest = {
          x: (p[L.leftShoulder]!.x + p[L.rightShoulder]!.x) / 2,
          y: (p[L.leftShoulder]!.y + p[L.rightShoulder]!.y) / 2,
          z: (p[L.leftShoulder]!.z + p[L.rightShoulder]!.z) / 2,
        };
        expect(vecDistance(pelvis, chest)).toBeCloseTo(skeleton.spineLengthPx, 6);
        // Every calibrated chain segment.
        for (let b = 0; b < CHAIN_BONES.length; b++) {
          const bone = CHAIN_BONES[b]!;
          const len = skeleton.chainLengthsPx[b]!;
          expect(
            vecDistance(p[bone.parent]!, p[bone.child]!),
          ).toBeCloseTo(len, 6);
        }
      }
    }
  });
});

describe('morphMotion alignment', () => {
  it('maps measured frames monotonically onto the expert track', () => {
    const { frames, skeleton } = rigidMeasured();
    const morphed = morphMotion(frames, REFERENCE, skeleton, 0.5);
    const mapped = morphed.alignment.mappedReferenceMs;
    expect(mapped).toHaveLength(frames.length);
    for (let i = 1; i < mapped.length; i++) {
      expect(mapped[i]!).toBeGreaterThanOrEqual(mapped[i - 1]!);
    }
    const t0 = REFERENCE[0]!.timestampMs;
    const t1 = REFERENCE[REFERENCE.length - 1]!.timestampMs;
    expect(mapped[0]!).toBeGreaterThanOrEqual(t0);
    expect(mapped[mapped.length - 1]!).toBeLessThanOrEqual(t1);
  });

  it('rejects an empty measured motion', () => {
    const { skeleton } = rigidMeasured();
    expect(() => morphMotion([], REFERENCE, skeleton, 1)).toThrow(
      /at least one measured frame/,
    );
  });
});
