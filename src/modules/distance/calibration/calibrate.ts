/**
 * Build a CameraModel from user calibration input and video metadata.
 *
 * Monocular scale ladder (research-backed, most to least robust):
 *   1. Ground-plane homography from >= 4 co-planar reference points
 *      (tee markers, yardage flags) — enables direct landing measurement.
 *   2. Ball-diameter anchor: the 42.67 mm ball at address gives
 *      meters-per-pixel at the ball's depth.
 *   3. Focal length: explicit > derived from FOV > default 60 deg FOV,
 *      combined with an assumed camera-to-ball distance.
 */
import type { CalibrationInput, CameraAngle, ClubType } from '../../../types';

import {
  distanceFromBallDiameter,
  focalLengthPxFromFov,
  metersPerPixelFromBallRadius,
} from './pinhole';
import {
  applyHomography,
  computeHomography,
  type HomographyResult,
  type Point2,
} from './homography';

export type FocalSource = 'explicit' | 'fov' | 'default';
export type ScaleSource = 'ball-anchor' | 'homography' | 'assumed-depth';

/** Default horizontal FOV assumed when nothing better is known (deg). */
export const DEFAULT_HFOV_DEG = 60;

/** Assumed camera-to-ball distance when no anchor is available (m). */
export const DEFAULT_CAMERA_DISTANCE_M = 10;

export interface VideoMeta {
  width: number;
  height: number;
  fps: number;
}

export interface CameraModel {
  imageWidth: number;
  imageHeight: number;
  focalLengthPx: number;
  focalSource: FocalSource;
  /** Meters-per-pixel at the ball plane from the ball-diameter anchor. */
  ballAnchorMetersPerPixel?: number;
  /** Camera-to-ball distance implied by the ball anchor + focal (m). */
  cameraDistanceM: number;
  /** Whether cameraDistanceM was measured (ball anchor) or assumed. */
  cameraDistanceSource: 'ball-anchor' | 'assumed';
  /** Image px -> world ground-plane yards, when reference points given. */
  homography?: HomographyResult;
  club: ClubType;
  cameraAngle: CameraAngle;
}

/**
 * Resolve the camera model from calibration input. Reference points that
 * fail homography estimation (degenerate geometry) are ignored rather than
 * fatal — the model simply lacks a homography rung.
 */
export function buildCalibration(
  input: CalibrationInput,
  videoMeta: VideoMeta,
): CameraModel {
  let focalLengthPx: number;
  let focalSource: FocalSource;
  if (input.focalLengthPx !== undefined && input.focalLengthPx > 0) {
    focalLengthPx = input.focalLengthPx;
    focalSource = 'explicit';
  } else if (
    input.horizontalFovDeg !== undefined &&
    input.horizontalFovDeg > 0 &&
    input.horizontalFovDeg < 180
  ) {
    focalLengthPx = focalLengthPxFromFov(input.horizontalFovDeg, videoMeta.width);
    focalSource = 'fov';
  } else {
    focalLengthPx = focalLengthPxFromFov(DEFAULT_HFOV_DEG, videoMeta.width);
    focalSource = 'default';
  }

  let ballAnchorMetersPerPixel: number | undefined;
  let cameraDistanceM = DEFAULT_CAMERA_DISTANCE_M;
  let cameraDistanceSource: CameraModel['cameraDistanceSource'] = 'assumed';
  if (
    input.ballRadiusAtAddressPx !== undefined &&
    input.ballRadiusAtAddressPx > 0
  ) {
    ballAnchorMetersPerPixel = metersPerPixelFromBallRadius(
      input.ballRadiusAtAddressPx,
    );
    cameraDistanceM = distanceFromBallDiameter(
      focalLengthPx,
      input.ballRadiusAtAddressPx,
    );
    cameraDistanceSource = 'ball-anchor';
  }

  let homography: HomographyResult | undefined;
  if (input.referencePoints && input.referencePoints.length >= 4) {
    try {
      homography = computeHomography(
        input.referencePoints.map((rp) => ({
          src: { x: rp.imageX, y: rp.imageY },
          dst: { x: rp.worldXYards, y: rp.worldZYards },
        })),
      );
    } catch (_err) {
      homography = undefined; // degenerate reference geometry — skip rung
    }
  }

  return {
    imageWidth: videoMeta.width,
    imageHeight: videoMeta.height,
    focalLengthPx,
    focalSource,
    ballAnchorMetersPerPixel,
    cameraDistanceM,
    cameraDistanceSource,
    homography,
    club: input.club,
    cameraAngle: input.cameraAngle,
  };
}

/**
 * Meters-per-pixel at the ball plane, resolved down the scale ladder:
 * ball anchor > homography local scale (finite differences around `at`) >
 * focal length + camera distance (assumed when not anchored).
 */
export function metersPerPixelAt(model: CameraModel, at?: Point2): number {
  if (model.ballAnchorMetersPerPixel !== undefined) {
    return model.ballAnchorMetersPerPixel;
  }
  if (model.homography && at) {
    try {
      const step = 1; // px
      const p0 = applyHomography(model.homography.H, at);
      const px = applyHomography(model.homography.H, { x: at.x + step, y: at.y });
      const py = applyHomography(model.homography.H, { x: at.x, y: at.y + step });
      const sx = Math.hypot(px.x - p0.x, px.y - p0.y);
      const sy = Math.hypot(py.x - p0.x, py.y - p0.y);
      const yardsPerPixel = (sx + sy) / 2;
      if (yardsPerPixel > 0 && Number.isFinite(yardsPerPixel)) {
        return yardsPerPixel * 0.9144;
      }
    } catch (_err) {
      // fall through to focal-based scale
    }
  }
  return model.cameraDistanceM / model.focalLengthPx;
}

/** The scale ladder rung a given model resolves to (for confidence). */
export function scaleSource(model: CameraModel): ScaleSource {
  if (model.ballAnchorMetersPerPixel !== undefined) {
    return 'ball-anchor';
  }
  if (model.homography) {
    return 'homography';
  }
  return 'assumed-depth';
}
