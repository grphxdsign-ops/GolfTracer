/**
 * Anchor homography — pins the monocular scene to a metric world frame by
 * solving the plane homography between detected image corners of a
 * WorldAnchorTemplate (goal mouth, court corners, rim extremes) and the
 * template's known plane coordinates in meters.
 *
 * Normalized DLT (Hartley normalization, 2n x 8 system with h33 = 1,
 * least-squares via the local linalg kit). With the minimal 4 corners the
 * solve is exact; extra landmarks over-determine and are fit in a
 * least-squares sense. Degenerate (collinear) corners surface as a
 * SingularMatrixError.
 */
import type { WorldAnchorTemplate } from './sportProfile';
import { matMul3, solveLeastSquares, type Matrix } from './linalg';

export interface Point2 {
  x: number;
  y: number;
}

export interface AnchorHomography {
  /** Row-major 3x3 homography, image px -> anchor-plane meters. */
  H: Matrix;
  template: WorldAnchorTemplate;
  /** Per-corner residual against the template, m. */
  errorsM: number[];
  rmsErrorM: number;
  maxErrorM: number;
}

/** Apply a 3x3 homography to a 2D point. */
function applyHomography(H: Matrix, pt: Point2): Point2 {
  const w = H[2]![0]! * pt.x + H[2]![1]! * pt.y + H[2]![2]!;
  if (Math.abs(w) < 1e-12) {
    throw new Error('Point maps to infinity under homography');
  }
  return {
    x: (H[0]![0]! * pt.x + H[0]![1]! * pt.y + H[0]![2]!) / w,
    y: (H[1]![0]! * pt.x + H[1]![1]! * pt.y + H[1]![2]!) / w,
  };
}

interface Normalization {
  /** Similarity transform T (3x3) with pts' = T * pts. */
  T: Matrix;
  points: Point2[];
}

function normalizePoints(points: Point2[]): Normalization {
  const n = points.length;
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  let meanDist = 0;
  for (const p of points) {
    meanDist += Math.hypot(p.x - cx, p.y - cy);
  }
  meanDist /= n;
  const scale = meanDist > 1e-12 ? Math.SQRT2 / meanDist : 1;

  return {
    T: [
      [scale, 0, -scale * cx],
      [0, scale, -scale * cy],
      [0, 0, 1],
    ],
    points: points.map((p) => ({
      x: scale * (p.x - cx),
      y: scale * (p.y - cy),
    })),
  };
}

function invertSimilarity(T: Matrix): Matrix {
  const s = T[0]![0]!;
  return [
    [1 / s, 0, -T[0]![2]! / s],
    [0, 1 / s, -T[1]![2]! / s],
    [0, 0, 1],
  ];
}

/**
 * Solve the image -> world-plane homography for an anchor template.
 * `imagePoints` are the detected pixel positions of `template.points`, in
 * the same order (at least 4).
 */
export function solveAnchorHomography(
  imagePoints: Point2[],
  template: WorldAnchorTemplate,
): AnchorHomography {
  if (imagePoints.length !== template.points.length) {
    throw new Error(
      `Expected ${template.points.length} image points for template ` +
        `'${template.id}', got ${imagePoints.length}`,
    );
  }
  if (imagePoints.length < 4) {
    throw new Error(
      `Anchor homography needs at least 4 points, got ${imagePoints.length}`,
    );
  }

  const worldPoints: Point2[] = template.points.map((p) => ({
    x: p.xM,
    y: p.yM,
  }));
  const srcNorm = normalizePoints(imagePoints);
  const dstNorm = normalizePoints(worldPoints);

  // 2n x 8 DLT system with h33 = 1:
  //   [x y 1 0 0 0 -x*x' -y*x'] h = x'
  //   [0 0 0 x y 1 -x*y' -y*y'] h = y'
  const A: Matrix = [];
  const b: number[] = [];
  for (let i = 0; i < imagePoints.length; i++) {
    const s = srcNorm.points[i]!;
    const d = dstNorm.points[i]!;
    A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }

  const h = solveLeastSquares(A, b);
  const Hn: Matrix = [
    [h[0]!, h[1]!, h[2]!],
    [h[3]!, h[4]!, h[5]!],
    [h[6]!, h[7]!, 1],
  ];

  // Denormalize: H = T_world^-1 * Hn * T_image.
  const H = matMul3(matMul3(invertSimilarity(dstNorm.T), Hn), srcNorm.T);

  // Normalize so H[2][2] = 1 when possible (cosmetic, aids testing).
  const h22 = H[2]![2]!;
  if (Math.abs(h22) > 1e-12) {
    for (let i = 0; i < 3; i++) {
      const row = H[i]!;
      for (let j = 0; j < 3; j++) {
        row[j] = row[j]! / h22;
      }
    }
  }

  const errorsM = imagePoints.map((p, i) => {
    const mapped = applyHomography(H, p);
    const world = worldPoints[i]!;
    return Math.hypot(mapped.x - world.x, mapped.y - world.y);
  });
  const rmsErrorM = Math.sqrt(
    errorsM.reduce((acc, e) => acc + e * e, 0) / errorsM.length,
  );

  return {
    H,
    template,
    errorsM,
    rmsErrorM,
    maxErrorM: Math.max(...errorsM),
  };
}

/**
 * Map an image pixel onto the anchor plane, in the template's metric plane
 * coordinates (e.g. meters across the goal mouth / up from the ground).
 */
export function imageToWorld(anchor: AnchorHomography, pt: Point2): Point2 {
  return applyHomography(anchor.H, pt);
}
