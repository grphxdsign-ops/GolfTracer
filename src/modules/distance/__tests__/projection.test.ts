/**
 * Pinned DTL camera-geometry tests: pinhole round trips, camera placement
 * from the tee ray, the 1D pitch-for-height solve, the sign conventions
 * the whole DTL fit relies on, and quadratic tee back-extrapolation.
 */
import {
  cameraFromTeeRay,
  projectWorldPoint,
  solvePitchForHeight,
  teePointFromTrack,
  type CameraPose,
  type PixelPoint,
  type Vec3,
} from '../estimate/projection';
import { focalLengthPxFromFov } from '../calibration/pinhole';
import { BALL_DIAMETER_M, degToRad } from '../physics/constants';

/** 1080x1920 portrait frame (evidence clip after rotation). */
const FRAME = { width: 1080, height: 1920 };
const CX = FRAME.width / 2;
const CY = FRAME.height / 2;
const FOCAL_PX = focalLengthPxFromFov(44, FRAME.width);

function pose(cameraCenter: Vec3, pitchDeg: number, focalPx = FOCAL_PX): CameraPose {
  return { cameraCenter, pitchDeg, focalPx, cx: CX, cy: CY };
}

/**
 * World-frame unit direction of the ray through a pixel (the inverse
 * rotation of the projection basis) — test-local, used to verify that
 * projection round-trips onto the original ray.
 */
function pixelRayWorld(px: PixelPoint, pitchDeg: number, focalPx: number): Vec3 {
  const dx = (px.x - CX) / focalPx;
  const dy = (px.y - CY) / focalPx;
  const norm = Math.hypot(dx, dy, 1);
  const xc = dx / norm;
  const yc = dy / norm;
  const zc = 1 / norm;
  const th = degToRad(pitchDeg);
  const sin = Math.sin(th);
  const cos = Math.cos(th);
  return {
    x: yc * sin + zc * cos,
    y: -xc,
    z: -yc * cos + zc * sin,
  };
}

describe('projectWorldPoint round trips', () => {
  it('projected pixel ray passes through the original 3D point', () => {
    const camera: Vec3 = { x: -4, y: 0.4, z: 1.6 };
    const pitchDeg = 6;
    const points: Vec3[] = [
      { x: 0, y: 0, z: 0 },
      { x: 12, y: 1.5, z: 3 },
      { x: 40, y: -3, z: 12 },
      { x: 90, y: 6, z: 20 },
    ];
    for (const p of points) {
      const proj = projectWorldPoint(p, pose(camera, pitchDeg));
      expect(proj.zc).toBeGreaterThan(0);
      // Reconstruct the world ray through that pixel and check the point
      // sits on it: (p - camera) x ray = 0 and the range matches.
      const ray = pixelRayWorld({ x: proj.u, y: proj.v }, pitchDeg, FOCAL_PX);
      const w: Vec3 = { x: p.x - camera.x, y: p.y - camera.y, z: p.z - camera.z };
      const range = Math.hypot(w.x, w.y, w.z);
      expect(w.x).toBeCloseTo(ray.x * range, 6);
      expect(w.y).toBeCloseTo(ray.y * range, 6);
      expect(w.z).toBeCloseTo(ray.z * range, 6);
    }
  });

  it('a point on the optical axis projects to the image center', () => {
    const pitchDeg = 10;
    const th = degToRad(pitchDeg);
    const camera: Vec3 = { x: 0, y: 0, z: 0 };
    // 5 m along the (pitched-up) optical axis f̂ = (cosθ, 0, sinθ).
    const proj = projectWorldPoint(
      { x: 5 * Math.cos(th), y: 0, z: 5 * Math.sin(th) },
      pose(camera, pitchDeg),
    );
    expect(proj.u).toBeCloseTo(CX, 9);
    expect(proj.v).toBeCloseTo(CY, 9);
    expect(proj.zc).toBeCloseTo(5, 9);
  });

  it('reports zc <= 0 for points behind the camera', () => {
    const proj = projectWorldPoint(
      { x: -10, y: 0, z: 1 },
      pose({ x: 0, y: 0, z: 1.5 }, 0),
    );
    expect(proj.zc).toBeLessThan(0);
  });
});

describe('cameraFromTeeRay', () => {
  it('recovers a synthetically placed camera height and center to 1e-6', () => {
    const camera: Vec3 = { x: -9, y: 0.4, z: 1.6 };
    const pitchDeg = 5;
    // Tee = world origin; its projection gives the tee pixel, and the
    // camera-to-tee distance plays the ball-anchor D_tee role.
    const proj = projectWorldPoint({ x: 0, y: 0, z: 0 }, pose(camera, pitchDeg));
    const dTee = Math.hypot(camera.x, camera.y, camera.z);
    const recovered = cameraFromTeeRay(
      { x: proj.u, y: proj.v },
      pitchDeg,
      FOCAL_PX,
      CX,
      CY,
      dTee,
    );
    expect(recovered.cameraCenter.x).toBeCloseTo(camera.x, 6);
    expect(recovered.cameraCenter.y).toBeCloseTo(camera.y, 6);
    expect(recovered.cameraCenter.z).toBeCloseTo(camera.z, 6);
    expect(recovered.cameraHeightM).toBeCloseTo(camera.z, 6);
  });

  it('matches the real-clip anchor numbers (θ≈0 ⇒ h_c≈1.92, θ=6 ⇒ ≈1.53)', () => {
    // Real clip: tee (730, 1676), 7 px ball radius, 44° HFOV.
    const dTee = (FOCAL_PX * BALL_DIAMETER_M) / (2 * 7);
    const tee = { x: 730, y: 1676 };
    const h0 = cameraFromTeeRay(tee, 0, FOCAL_PX, CX, CY, dTee).cameraHeightM;
    const h6 = cameraFromTeeRay(tee, 6, FOCAL_PX, CX, CY, dTee).cameraHeightM;
    expect(h0).toBeGreaterThan(1.85);
    expect(h0).toBeLessThan(1.98);
    expect(h6).toBeGreaterThan(1.46);
    expect(h6).toBeLessThan(1.6);
  });
});

describe('solvePitchForHeight', () => {
  const tee = { x: 730, y: 1676 };
  const dTee = (FOCAL_PX * BALL_DIAMETER_M) / (2 * 7);

  it('inverts cameraFromTeeRay: solve(h(θ*)) = θ* to 1e-6', () => {
    for (const trueTheta of [-8, -2, 0, 3, 5, 12]) {
      const h = cameraFromTeeRay(tee, trueTheta, FOCAL_PX, CX, CY, dTee).cameraHeightM;
      const solved = solvePitchForHeight(tee, FOCAL_PX, CX, CY, dTee, h);
      expect(solved).toBeDefined();
      expect(solved!).toBeCloseTo(trueTheta, 6);
      // Self-consistency: plugging the solved pitch back reproduces h.
      const roundTrip = cameraFromTeeRay(tee, solved!, FOCAL_PX, CX, CY, dTee)
        .cameraHeightM;
      expect(roundTrip).toBeCloseTo(h, 9);
    }
  });

  it('solves the real-clip prior height at θ≈5.6°', () => {
    const solved = solvePitchForHeight(tee, FOCAL_PX, CX, CY, dTee, 1.55);
    expect(solved).toBeDefined();
    expect(solved!).toBeGreaterThan(5);
    expect(solved!).toBeLessThan(6.3);
  });

  it('returns undefined when no in-bounds pitch reaches the height', () => {
    // Requested height above the geometric maximum R = |tee_cam|.
    expect(
      solvePitchForHeight(tee, FOCAL_PX, CX, CY, dTee, 100),
    ).toBeUndefined();
    // Reachable only far outside the pitch bounds.
    expect(
      solvePitchForHeight(tee, FOCAL_PX, CX, CY, dTee, -3.5, [-20, 25]),
    ).toBeUndefined();
  });
});

describe('sign conventions', () => {
  const camera: Vec3 = { x: -8, y: 0, z: 1.5 };

  it('higher ball (world +Z) moves up the image (v decreases)', () => {
    const low = projectWorldPoint({ x: 15, y: 0, z: 1 }, pose(camera, 3));
    const high = projectWorldPoint({ x: 15, y: 0, z: 6 }, pose(camera, 3));
    expect(high.v).toBeLessThan(low.v);
  });

  it('world-left (+Y) moves left in the image (u decreases)', () => {
    const centre = projectWorldPoint({ x: 15, y: 0, z: 2 }, pose(camera, 3));
    const left = projectWorldPoint({ x: 15, y: 3, z: 2 }, pose(camera, 3));
    expect(left.u).toBeLessThan(centre.u);
  });

  it('pitching up drops the horizon (its v increases)', () => {
    // A very distant point along the horizontal forward direction ~ horizon.
    const horizonPoint: Vec3 = { x: 1e6, y: 0, z: camera.z };
    const level = projectWorldPoint(horizonPoint, pose(camera, 0));
    const pitchedUp = projectWorldPoint(horizonPoint, pose(camera, 8));
    expect(level.v).toBeCloseTo(CY, 3);
    expect(pitchedUp.v).toBeGreaterThan(level.v);
  });
});

describe('teePointFromTrack', () => {
  it('recovers the t=0 point of exactly quadratic pixel motion', () => {
    // u(t) = 730 − 1400t + 900t², v(t) = 1676 − 7000t + 6000t².
    const samples = [0.1, 0.133, 0.167, 0.2, 0.233, 0.267].map((t) => ({
      t,
      u: 730 - 1400 * t + 900 * t * t,
      v: 1676 - 7000 * t + 6000 * t * t,
    }));
    const tee = teePointFromTrack(samples);
    expect(tee.x).toBeCloseTo(730, 6);
    expect(tee.y).toBeCloseTo(1676, 6);
  });

  it('uses only the first 6 samples (later outliers are ignored)', () => {
    const clean = [0.1, 0.14, 0.18, 0.22, 0.26, 0.3].map((t) => ({
      t,
      u: 500 - 100 * t + 50 * t * t,
      v: 900 - 400 * t + 300 * t * t,
    }));
    const withOutlier = [...clean, { t: 0.34, u: 5000, v: -5000 }];
    const a = teePointFromTrack(clean);
    const b = teePointFromTrack(withOutlier);
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
  });

  it('degrades to linear extrapolation with two samples', () => {
    const tee = teePointFromTrack([
      { t: 0.1, u: 90, v: 190 },
      { t: 0.2, u: 80, v: 180 },
    ]);
    expect(tee.x).toBeCloseTo(100, 9);
    expect(tee.y).toBeCloseTo(200, 9);
  });

  it('returns the sole sample when only one exists', () => {
    const tee = teePointFromTrack([{ t: 0.1, u: 42, v: 24 }]);
    expect(tee.x).toBe(42);
    expect(tee.y).toBe(24);
  });
});
