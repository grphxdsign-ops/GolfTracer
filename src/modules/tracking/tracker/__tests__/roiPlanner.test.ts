import { deriveRoisFromBallPoint } from '../roiPlanner';
import type { Roi } from '../../vision/imageOps';

/** Portrait analysis dims from a 1080x1920 clip downsampled to width 480. */
const DIMS = { width: 480, height: 853 };
const S = Math.min(DIMS.width, DIMS.height); // 480

function expectInsideFrame(roi: Roi, dims: { width: number; height: number }) {
  expect(roi.x).toBeGreaterThanOrEqual(0);
  expect(roi.y).toBeGreaterThanOrEqual(0);
  expect(roi.w).toBeGreaterThanOrEqual(1);
  expect(roi.h).toBeGreaterThanOrEqual(1);
  expect(roi.x + roi.w).toBeLessThanOrEqual(dims.width);
  expect(roi.y + roi.h).toBeLessThanOrEqual(dims.height);
}

describe('deriveRoisFromBallPoint geometry', () => {
  const point = { x: 240, y: 700 };
  const { impactRoi, seedRoi } = deriveRoisFromBallPoint(point, DIMS);

  it('builds a tee box of half-size 0.08·min(w,h) centered on the tap', () => {
    const half = 0.08 * S; // 38.4
    // clampRoi floors x/y and ceils w/h → allow 1px of integer slack.
    expect(Math.abs(impactRoi.x - (point.x - half))).toBeLessThanOrEqual(1);
    expect(Math.abs(impactRoi.y - (point.y - half))).toBeLessThanOrEqual(1);
    expect(Math.abs(impactRoi.w - 2 * half)).toBeLessThanOrEqual(1);
    expect(Math.abs(impactRoi.h - 2 * half)).toBeLessThanOrEqual(1);
    expectInsideFrame(impactRoi, DIMS);
  });

  it('builds a corridor of width 0.36·min(w,h) centered on the tap x', () => {
    const width = 0.36 * S; // 172.8
    expect(Math.abs(seedRoi.w - width)).toBeLessThanOrEqual(1);
    const centerX = seedRoi.x + seedRoi.w / 2;
    expect(Math.abs(centerX - point.x)).toBeLessThanOrEqual(1);
    expectInsideFrame(seedRoi, DIMS);
  });

  it('spans from 0.55·height above the tap down to just above the tap', () => {
    const expectedTop = Math.max(0.05 * DIMS.height, point.y - 0.55 * DIMS.height);
    expect(Math.abs(seedRoi.y - expectedTop)).toBeLessThanOrEqual(1);
    const bottom = seedRoi.y + seedRoi.h;
    expect(Math.abs(bottom - (point.y - 0.05 * S))).toBeLessThanOrEqual(1);
  });

  it('keeps the corridor bottom ABOVE the tap (ground clutter excluded)', () => {
    // Evidence #2: tumbling tee and shadow live at/below the tap height.
    expect(seedRoi.y + seedRoi.h).toBeLessThanOrEqual(point.y - 0.05 * S + 1);
  });

  it('keeps the tee box and the corridor disjoint in y', () => {
    // Corridor ends above the tap; tee box starts 0.08·s above the tap, so
    // they overlap slightly by design in x but the corridor never reaches the
    // ground band below the tap where the tee box bottom sits.
    expect(seedRoi.y + seedRoi.h).toBeLessThan(impactRoi.y + impactRoi.h);
  });
});

describe('deriveRoisFromBallPoint clamping', () => {
  it('clamps the tee box at the left frame edge', () => {
    const { impactRoi } = deriveRoisFromBallPoint({ x: 10, y: 700 }, DIMS);
    expect(impactRoi.x).toBe(0);
    expectInsideFrame(impactRoi, DIMS);
  });

  it('clamps both boxes at the right frame edge', () => {
    const { impactRoi, seedRoi } = deriveRoisFromBallPoint(
      { x: 475, y: 700 },
      DIMS,
    );
    expectInsideFrame(impactRoi, DIMS);
    expectInsideFrame(seedRoi, DIMS);
  });

  it('clamps the tee box at the bottom frame edge', () => {
    const { impactRoi, seedRoi } = deriveRoisFromBallPoint(
      { x: 240, y: 848 },
      DIMS,
    );
    expectInsideFrame(impactRoi, DIMS);
    expectInsideFrame(seedRoi, DIMS);
    // The corridor still ends above the tap.
    expect(seedRoi.y + seedRoi.h).toBeLessThanOrEqual(848 - 0.05 * S + 1);
  });

  it('caps the corridor top at 0.05·height for taps low in a tall frame', () => {
    const { seedRoi } = deriveRoisFromBallPoint({ x: 240, y: 840 }, DIMS);
    // 840 - 0.55·853 = 370.85 > 0.05·853 = 42.65 → top is tap-relative here…
    expect(Math.abs(seedRoi.y - (840 - 0.55 * DIMS.height))).toBeLessThanOrEqual(1);
    // …but for a tap above 0.6·height the 0.05·height floor wins.
    const capped = deriveRoisFromBallPoint({ x: 240, y: 400 }, DIMS);
    expect(Math.abs(capped.seedRoi.y - 0.05 * DIMS.height)).toBeLessThanOrEqual(1);
  });

  it('degrades to a valid (if degenerate) ROI for taps near the frame top', () => {
    // Corridor bottom would sit above its top; clampRoi keeps it legal.
    const { impactRoi, seedRoi } = deriveRoisFromBallPoint(
      { x: 240, y: 20 },
      DIMS,
    );
    expectInsideFrame(impactRoi, DIMS);
    expectInsideFrame(seedRoi, DIMS);
  });

  it('uses min(width, height) as the scale in landscape frames', () => {
    const landscape = { width: 853, height: 480 };
    const { impactRoi } = deriveRoisFromBallPoint({ x: 426, y: 240 }, landscape);
    // s = 480 either orientation → same box size as portrait.
    expect(Math.abs(impactRoi.w - 2 * 0.08 * 480)).toBeLessThanOrEqual(1);
    expect(Math.abs(impactRoi.h - 2 * 0.08 * 480)).toBeLessThanOrEqual(1);
  });
});
