/**
 * Monocular pinhole relations for a ball of known diameter — the depth
 * anchor behind "BALL PX 57 -> 24" style readouts: the ball's apparent
 * pixel diameter plus the focal length yields camera-to-ball distance, and
 * the pixel diameter alone yields meters-per-pixel at the ball's depth.
 *
 * Self-contained on purpose (no imports from the golf distance module):
 * every sport passes its own ball diameter from its BallSpec.
 */

/**
 * Focal length in pixels from a horizontal field of view and image width:
 * f = (w/2) / tan(hFov/2).
 */
export function focalPxFromFov(hFovDeg: number, imageWidthPx: number): number {
  if (hFovDeg <= 0 || hFovDeg >= 180) {
    throw new Error(`horizontal FOV out of range: ${hFovDeg}`);
  }
  if (imageWidthPx <= 0) {
    throw new Error(`image width must be positive: ${imageWidthPx}`);
  }
  return imageWidthPx / 2 / Math.tan(((hFovDeg * Math.PI) / 180) / 2);
}

/**
 * Camera-to-ball distance (m) from the ball's apparent pixel diameter:
 * D = f * d_real / d_px.
 */
export function distanceFromApparentDiameterM(
  focalPx: number,
  apparentDiameterPx: number,
  ballDiameterM: number,
): number {
  if (focalPx <= 0 || apparentDiameterPx <= 0 || ballDiameterM <= 0) {
    throw new Error('focal length, apparent diameter and ball diameter must be positive');
  }
  return (focalPx * ballDiameterM) / apparentDiameterPx;
}

/**
 * Scene scale (meters per pixel) on the fronto-parallel plane through the
 * ball, directly from the apparent pixel diameter — no focal length needed.
 */
export function metersPerPixelAtBall(
  apparentDiameterPx: number,
  ballDiameterM: number,
): number {
  if (apparentDiameterPx <= 0 || ballDiameterM <= 0) {
    throw new Error('apparent diameter and ball diameter must be positive');
  }
  return ballDiameterM / apparentDiameterPx;
}

/**
 * Inverse of distanceFromApparentDiameterM: the apparent pixel diameter of
 * a ball at a known camera distance, d_px = f * d_real / D.
 */
export function apparentDiameterPxAtDistance(
  focalPx: number,
  distanceM: number,
  ballDiameterM: number,
): number {
  if (focalPx <= 0 || distanceM <= 0 || ballDiameterM <= 0) {
    throw new Error('focal length, distance and ball diameter must be positive');
  }
  return (focalPx * ballDiameterM) / distanceM;
}
