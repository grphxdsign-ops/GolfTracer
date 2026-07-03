/**
 * Pose estimator adapter — the seam where a native/ML full-body pose
 * backend can replace the scripted fake without touching any analysis
 * logic, mirroring the detector adapter (`createDetector`) pattern.
 *
 * The keypoint schema is the 33-landmark BlazePose topology (MediaPipe
 * Pose), which is a superset of the 17-point COCO/MoveNet set — adapters
 * for COCO-style backends fill the extra landmarks with visibility 0.
 */
import type { VideoFrame } from '../../../types/media';
import { FakePoseEstimator, type PoseKeyframe } from './fakePoseEstimator';
import { NativePoseEstimator } from './nativePoseEstimator';

export interface Keypoint {
  /** Pixel x in the frame the pose was estimated on. */
  x: number;
  /** Pixel y in the frame the pose was estimated on. */
  y: number;
  /** Optional depth (BlazePose world z, meters-ish, camera-relative). */
  z?: number;
  /** Landmark visibility/confidence, 0..1. */
  visibility: number;
}

export interface PoseFrame {
  frameIndex: number;
  timestampMs: number;
  /** Exactly 33 keypoints in BlazePose index order (POSE_LANDMARKS). */
  keypoints: Keypoint[];
}

/** BlazePose 33-landmark index map. */
export const POSE_LANDMARKS = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

/** Number of landmarks in the BlazePose topology. */
export const POSE_LANDMARK_COUNT = 33;

export interface PoseEstimator {
  /**
   * Estimate the most prominent person's pose in a frame; resolves null
   * when no person is visible.
   */
  estimatePose(frame: VideoFrame): Promise<PoseFrame | null>;
}

export type PoseEstimatorKind = 'fake' | 'native';

export function createPoseEstimator(
  kind: PoseEstimatorKind = 'fake',
  scriptedKeyframes?: PoseKeyframe[],
): PoseEstimator {
  switch (kind) {
    case 'native':
      return new NativePoseEstimator();
    case 'fake':
      return new FakePoseEstimator(scriptedKeyframes);
  }
}
