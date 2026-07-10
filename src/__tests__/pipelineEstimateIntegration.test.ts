/**
 * Cross-module integration: tracking pipeline → distance estimation.
 *
 * Locks the coordinate-space invariant: runTracking analyzes frames at a
 * downsampled analysis width but must emit its BallTrack in *native* video
 * pixels, because calibration reference points are given in native pixels
 * and the homography/camera model is built from native video metadata. If
 * the track leaked analysis coordinates, the measured (homography) carry
 * would be wrong by the downsample factor — this test would fail by ~2x.
 */
import { runTracking } from '../modules/tracking/tracker/pipeline';
import {
  makeFlight,
  makeFrameSource,
} from '../modules/tracking/testutils/syntheticFrames';
import { estimateDistance } from '../modules/distance/estimate/estimateDistance';
import type { CalibrationInput } from '../types';

jest.setTimeout(60000);

describe('pipeline → estimateDistance at native resolution', () => {
  it('measures the homography carry in native pixel space', async () => {
    // Default flight geometry scaled 2x to a 960x540 "native" video; the
    // pipeline downsamples to its 480px analysis width internally.
    const flight = makeFlight({
      width: 960,
      height: 540,
      launch: { x: 260, y: 450 },
      velocity: { vx: 11, vy: 26.4 },
      gravity: 0.92,
      radius: 10,
      seed: 11,
    });
    const frameSource = makeFrameSource(flight.frames);
    // Frozen clock: this synthetic run takes tens of seconds of jest
    // wall-clock, which would trip the real 3 s default budget (DESIGN §12)
    // and make results machine-speed-dependent.
    const { track } = await runTracking(frameSource, { clock: () => 0 });
    expect(track.frameWidth).toBe(960);
    expect(track.landingPointIndex).toBeDefined();

    // Ground-plane reference points in NATIVE pixels around the tee:
    // worldXYards = (imageX - 260) / 10, worldZYards = (450 - imageY) / 10.
    const calibration: CalibrationInput = {
      club: 'driver',
      cameraAngle: 'down-the-line',
      referencePoints: [
        { imageX: 260, imageY: 450, worldXYards: 0, worldZYards: 0, label: 'tee' },
        { imageX: 460, imageY: 450, worldXYards: 20, worldZYards: 0, label: 'a' },
        { imageX: 460, imageY: 250, worldXYards: 20, worldZYards: 20, label: 'b' },
        { imageX: 260, imageY: 250, worldXYards: 0, worldZYards: 20, label: 'c' },
      ],
    };

    const asset = frameSource.asset;
    const estimate = estimateDistance(track, calibration, {
      width: asset.width,
      height: asset.height,
      fps: asset.fps,
      recordedFps: asset.recordedFps,
    });
    expect(estimate.method).toBe('homography');

    // Expected carry: the ground-truth ball position at the tracked landing
    // timestamp, mapped through the same affine px→yards reference map.
    const landing = track.smoothedPath[track.landingPointIndex!]!;
    const truth = flight.truth.reduce((a, b) =>
      Math.abs(b.timestampMs - landing.timestampMs) <
      Math.abs(a.timestampMs - landing.timestampMs)
        ? b
        : a,
    );
    const expectedCarry = Math.hypot(
      (truth.x - 260) / 10,
      (450 - truth.y) / 10,
    );
    // Tracking noise is <=6 native px (~0.6 yd on this map); a track left in
    // analysis pixels would miss by tens of yards.
    expect(Math.abs(estimate.carryYards - expectedCarry)).toBeLessThan(2);
  });
});
