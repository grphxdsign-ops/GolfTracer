/**
 * Pure geometry for mapping video pixel coordinates onto a letterboxed view
 * ("contain" fit), honoring the asset's rotation metadata. Kept free of any
 * Skia/React import so it is unit-testable on its own.
 */
import type { TrackPoint } from '../../types/tracking';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RotationDeg = 0 | 90 | 180 | 270;

export interface LetterboxMapping {
  videoWidth: number;
  videoHeight: number;
  rotationDeg: RotationDeg;
  /** Rotated ("display") dimensions of the video in its own pixel units. */
  displayWidth: number;
  displayHeight: number;
  /** The rect inside the view that the video occupies. */
  rect: Rect;
  /** Uniform display-px → view-px scale factor. */
  scale: number;
}

/**
 * Compute the contain-fit letterbox rect for a rotated video inside a view.
 */
export function computeLetterbox(
  videoWidth: number,
  videoHeight: number,
  rotationDeg: RotationDeg,
  viewWidth: number,
  viewHeight: number,
): LetterboxMapping {
  const swapped = rotationDeg === 90 || rotationDeg === 270;
  const displayWidth = swapped ? videoHeight : videoWidth;
  const displayHeight = swapped ? videoWidth : videoHeight;
  const scale =
    displayWidth <= 0 || displayHeight <= 0
      ? 0
      : Math.min(viewWidth / displayWidth, viewHeight / displayHeight);
  const rectWidth = displayWidth * scale;
  const rectHeight = displayHeight * scale;
  return {
    videoWidth,
    videoHeight,
    rotationDeg,
    displayWidth,
    displayHeight,
    rect: {
      x: (viewWidth - rectWidth) / 2,
      y: (viewHeight - rectHeight) / 2,
      width: rectWidth,
      height: rectHeight,
    },
    scale,
  };
}

/** Rotate a video-space point into display space (clockwise rotation). */
function rotateToDisplay(p: Point, m: LetterboxMapping): Point {
  switch (m.rotationDeg) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: m.videoHeight - p.y, y: p.x };
    case 180:
      return { x: m.videoWidth - p.x, y: m.videoHeight - p.y };
    case 270:
      return { x: p.y, y: m.videoWidth - p.x };
  }
}

/** Inverse of rotateToDisplay. */
function rotateFromDisplay(p: Point, m: LetterboxMapping): Point {
  switch (m.rotationDeg) {
    case 0:
      return { x: p.x, y: p.y };
    case 90:
      return { x: p.y, y: m.videoHeight - p.x };
    case 180:
      return { x: m.videoWidth - p.x, y: m.videoHeight - p.y };
    case 270:
      return { x: m.videoWidth - p.y, y: p.x };
  }
}

/** Map a point from video pixel space to view coordinates. */
export function videoToView(p: Point, m: LetterboxMapping): Point {
  const d = rotateToDisplay(p, m);
  return {
    x: m.rect.x + d.x * m.scale,
    y: m.rect.y + d.y * m.scale,
  };
}

/** Map a point from view coordinates back to video pixel space. */
export function viewToVideo(p: Point, m: LetterboxMapping): Point {
  if (m.scale === 0) return { x: 0, y: 0 };
  const d = {
    x: (p.x - m.rect.x) / m.scale,
    y: (p.y - m.rect.y) / m.scale,
  };
  return rotateFromDisplay(d, m);
}

/**
 * How many tracer points are visible at `fraction` (0..1) of the reveal.
 *
 * Anchored to the points' own timestamps — not to a wall-clock point count —
 * so the animated head moves at the speed the ball actually flew and never
 * lags or rushes ahead of the trajectory timing.
 */
export function revealCount(
  points: readonly TrackPoint[],
  fraction: number,
): number {
  const n = points.length;
  if (n === 0) return 0;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return n;
  const t0 = points[0]!.timestampMs;
  const t1 = points[n - 1]!.timestampMs;
  if (t1 <= t0) return n;
  const cutoff = t0 + fraction * (t1 - t0);
  let count = 0;
  while (count < n && points[count]!.timestampMs <= cutoff) {
    count++;
  }
  return Math.max(1, count);
}
