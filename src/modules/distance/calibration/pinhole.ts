/**
 * Pinhole camera relations. The golf ball's regulated diameter (42.67 mm)
 * is the monocular scale anchor: at the address frame, the ball's pixel
 * radius plus the focal length yields the camera-to-ball distance, and the
 * pixel radius alone yields meters-per-pixel at the ball's depth.
 */
import { BALL_DIAMETER_M, degToRad } from '../physics/constants';

/**
 * Focal length in pixels from a horizontal field of view and image width:
 * f = (w/2) / tan(hFov/2).
 */
export function focalLengthPxFromFov(
  hFovDeg: number,
  imageWidthPx: number,
): number {
  if (hFovDeg <= 0 || hFovDeg >= 180) {
    throw new Error(`horizontal FOV out of range: ${hFovDeg}`);
  }
  if (imageWidthPx <= 0) {
    throw new Error(`image width must be positive: ${imageWidthPx}`);
  }
  return imageWidthPx / 2 / Math.tan(degToRad(hFovDeg) / 2);
}

/**
 * Camera-to-ball distance (m) from the ball's apparent pixel radius:
 * D = f * d_real / d_px.
 */
export function distanceFromBallDiameter(
  focalPx: number,
  ballRadiusPx: number,
): number {
  if (focalPx <= 0 || ballRadiusPx <= 0) {
    throw new Error('focal length and ball radius must be positive');
  }
  return (focalPx * BALL_DIAMETER_M) / (2 * ballRadiusPx);
}

/**
 * Scene scale (meters per pixel) at the ball's depth, directly from the
 * ball's apparent pixel radius — no focal length needed, since the ratio
 * d_real / d_px is exactly the local scale of the fronto-parallel plane
 * through the ball.
 */
export function metersPerPixelFromBallRadius(ballRadiusPx: number): number {
  if (ballRadiusPx <= 0) {
    throw new Error('ball radius must be positive');
  }
  return BALL_DIAMETER_M / (2 * ballRadiusPx);
}

/**
 * Inverse of distanceFromBallDiameter: recover the focal length (px) from a
 * known camera-to-ball distance and the observed pixel radius.
 */
export function focalPxFromKnownDistance(
  distanceM: number,
  ballRadiusPx: number,
): number {
  if (distanceM <= 0 || ballRadiusPx <= 0) {
    throw new Error('distance and ball radius must be positive');
  }
  return (distanceM * 2 * ballRadiusPx) / BALL_DIAMETER_M;
}
