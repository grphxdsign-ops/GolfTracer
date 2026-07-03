/**
 * "Pose at Contact": reuse the tracking pipeline's impact frame (motion
 * energy + audio-fused strike detection) as the kick-contact frame, run the
 * pose estimator on exactly that frame, and derive the measure_plan-style
 * joint-angle table (shoulder-to-hip, hip-to-knee, knee-to-ankle, both
 * sides) via W1's pure joint-angle utilities.
 */
import type { FrameSource } from '../../../types/media';
import type { BallTrack } from '../../../types/tracking';
import type { PoseEstimator, PoseFrame } from '../../sports/pose/PoseAdapter';
import {
  computeJointAngleTable,
  type JointAngleTable,
} from '../../sports/pose/jointAngles';

export interface ContactPoseResult {
  frameIndex: number;
  timestampMs: number;
  pose: PoseFrame | null;
  jointAngles: JointAngleTable | null;
}

/**
 * Estimate the kicker's pose at the contact frame. Pose failures (no person,
 * native estimator unavailable) degrade to null rather than failing the
 * whole shot analysis — ball metrics stay valid without a skeleton.
 */
export async function poseAtContact(
  frameSource: FrameSource,
  track: Pick<BallTrack, 'impactFrameIndex' | 'impactTimestampMs'>,
  estimator: PoseEstimator,
): Promise<ContactPoseResult> {
  const base = {
    frameIndex: track.impactFrameIndex,
    timestampMs: track.impactTimestampMs,
  };
  let pose: PoseFrame | null = null;
  try {
    const frame = await frameSource.frameAt(track.impactTimestampMs);
    pose = await estimator.estimatePose(frame);
  } catch {
    pose = null;
  }
  return {
    ...base,
    pose,
    jointAngles: pose ? computeJointAngleTable(pose) : null,
  };
}
