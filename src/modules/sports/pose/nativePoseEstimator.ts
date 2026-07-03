/**
 * Native pose estimator — device-runtime stub, mirroring TfliteBallDetector.
 *
 * Upgrade path (not available in the Linux CI environment):
 *  - Cross-platform: MediaPipe Tasks Vision PoseLandmarker running the
 *    BlazePose (full) model — emits exactly the 33-landmark topology in
 *    POSE_LANDMARKS with per-landmark visibility, GPU-delegated on both
 *    platforms (react-native-mediapipe or a thin JSI binding).
 *  - TFLite alternative: MoveNet Thunder via react-native-fast-tflite —
 *    17 COCO keypoints; the adapter maps them into the BlazePose indices
 *    and reports the remaining landmarks with visibility 0.
 *  - iOS-only alternative: Apple Vision VNDetectHumanBodyPoseRequest
 *    (19 joints, no extra model download), mapped the same way.
 *
 * On device the estimator would receive luma frames (or run directly on
 * the camera/video buffer for zero-copy), letterbox to the model input,
 * run inference, and map normalized landmarks back to frame pixels.
 */
import type { VideoFrame } from '../../../types/media';
import type { PoseEstimator, PoseFrame } from './PoseAdapter';

export const NATIVE_POSE_ESTIMATOR_ERROR =
  'NativePoseEstimator requires device runtime (MediaPipe Tasks / MoveNet / ' +
  'Apple Vision); use FakePoseEstimator in this environment';

export class NativePoseEstimator implements PoseEstimator {
  estimatePose(_frame: VideoFrame): Promise<PoseFrame | null> {
    return Promise.reject(new Error(NATIVE_POSE_ESTIMATOR_ERROR));
  }
}
