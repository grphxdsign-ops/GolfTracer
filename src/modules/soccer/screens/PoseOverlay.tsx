/**
 * Pose-at-Contact freeze-frame overlay: draws the estimated skeleton (and
 * the ball contact point) over a letterboxed video stage, following the
 * TracerOverlay adapter pattern — all geometry goes through the shared
 * overlayMath letterbox mapping, Skia is only the rendering shell.
 */
import { useMemo } from 'react';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';

import {
  computeLetterbox,
  videoToView,
  type Point,
  type RotationDeg,
} from '../../../adapters/overlay/overlayMath';
import {
  POSE_LANDMARKS,
  type Keypoint,
  type PoseFrame,
} from '../../sports/pose/PoseAdapter';
import { colors } from '../../../app/theme';

const L = POSE_LANDMARKS;

/** Skeleton bones as landmark-index pairs (torso + legs + arms). */
const BONES: ReadonlyArray<readonly [number, number]> = [
  [L.leftShoulder, L.rightShoulder],
  [L.leftHip, L.rightHip],
  [L.leftShoulder, L.leftHip],
  [L.rightShoulder, L.rightHip],
  [L.leftHip, L.leftKnee],
  [L.leftKnee, L.leftAnkle],
  [L.leftAnkle, L.leftFootIndex],
  [L.rightHip, L.rightKnee],
  [L.rightKnee, L.rightAnkle],
  [L.rightAnkle, L.rightFootIndex],
  [L.leftShoulder, L.leftElbow],
  [L.leftElbow, L.leftWrist],
  [L.rightShoulder, L.rightElbow],
  [L.rightElbow, L.rightWrist],
];

const MIN_VISIBILITY = 0.3;

export interface PoseOverlayProps {
  pose: PoseFrame;
  /** Native video dimensions (the space the keypoints live in). */
  videoWidth: number;
  videoHeight: number;
  rotationDeg?: RotationDeg;
  /** Size of the stage view the overlay is layered over. */
  viewWidth: number;
  viewHeight: number;
  /** Ball position at contact (native video px), drawn as a marker. */
  ballPoint?: Point;
}

export function PoseOverlay({
  pose,
  videoWidth,
  videoHeight,
  rotationDeg = 0,
  viewWidth,
  viewHeight,
  ballPoint,
}: PoseOverlayProps) {
  const mapping = useMemo(
    () =>
      computeLetterbox(videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight),
    [videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight],
  );

  const visible = (kp: Keypoint | undefined): kp is Keypoint =>
    kp !== undefined && kp.visibility >= MIN_VISIBILITY;

  const bonePath = useMemo(() => {
    const path = Skia.Path.Make();
    for (const [a, b] of BONES) {
      const ka = pose.keypoints[a];
      const kb = pose.keypoints[b];
      if (!visible(ka) || !visible(kb)) continue;
      const pa = videoToView(ka, mapping);
      const pb = videoToView(kb, mapping);
      path.moveTo(pa.x, pa.y);
      path.lineTo(pb.x, pb.y);
    }
    return path;
    // `visible` is a stable pure predicate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pose.keypoints, mapping]);

  const joints = useMemo(
    () =>
      pose.keypoints
        .filter((kp) => kp.visibility >= MIN_VISIBILITY)
        .map((kp) => videoToView(kp, mapping)),
    [pose.keypoints, mapping],
  );

  if (viewWidth <= 0 || viewHeight <= 0 || joints.length === 0) {
    return null;
  }

  const ball = ballPoint ? videoToView(ballPoint, mapping) : null;

  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewWidth,
        height: viewHeight,
      }}
    >
      <Path
        path={bonePath}
        color={colors.accent}
        style="stroke"
        strokeWidth={2.5}
        strokeCap="round"
        strokeJoin="round"
      />
      {joints.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={3.5} color={colors.text} />
      ))}
      {ball ? <Circle cx={ball.x} cy={ball.y} r={5} color={colors.danger} /> : null}
    </Canvas>
  );
}
