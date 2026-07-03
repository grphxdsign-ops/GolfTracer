/**
 * Plane homography estimation via the normalized DLT (direct linear
 * transform). Given >= 4 point correspondences between the image and the
 * ground plane (tee markers, yardage flags, range targets), estimate the
 * 3x3 homography H mapping image pixels to world ground coordinates.
 *
 * Both point sets are Hartley-normalized (centroid at origin, mean distance
 * sqrt(2)); the 2n x 8 DLT system (h33 fixed to 1) is solved by least
 * squares with the small Gaussian-elimination utilities in linalg.ts.
 * Degenerate (e.g. collinear) configurations surface as a
 * SingularMatrixError.
 */
import {
  matMul3,
  solveLeastSquares,
  type Matrix,
} from './linalg';

export interface Point2 {
  x: number;
  y: number;
}

export interface PointPair {
  src: Point2;
  dst: Point2;
}

export interface HomographyResult {
  /** Row-major 3x3 homography, src -> dst. */
  H: Matrix;
  /** Per-pair reprojection error (dst units). */
  reprojectionErrors: number[];
  /** RMS reprojection error (dst units). */
  rmsError: number;
  /** Largest single-pair reprojection error (dst units). */
  maxError: number;
}

/** Apply a 3x3 homography to a 2D point. */
export function applyHomography(H: Matrix, pt: Point2): Point2 {
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

  const T: Matrix = [
    [scale, 0, -scale * cx],
    [0, scale, -scale * cy],
    [0, 0, 1],
  ];
  return {
    T,
    points: points.map((p) => ({
      x: scale * (p.x - cx),
      y: scale * (p.y - cy),
    })),
  };
}

function invertSimilarity(T: Matrix): Matrix {
  // T = [s 0 tx; 0 s ty; 0 0 1] -> inverse is [1/s 0 -tx/s; 0 1/s -ty/s; 0 0 1].
  const s = T[0]![0]!;
  return [
    [1 / s, 0, -T[0]![2]! / s],
    [0, 1 / s, -T[1]![2]! / s],
    [0, 0, 1],
  ];
}

/**
 * Estimate the homography mapping each pair's src point to its dst point.
 * Requires at least 4 correspondences; throws on degenerate geometry
 * (collinear points) via SingularMatrixError from the solver.
 */
export function computeHomography(pairs: PointPair[]): HomographyResult {
  if (pairs.length < 4) {
    throw new Error(
      `Homography needs at least 4 point pairs, got ${pairs.length}`,
    );
  }

  const srcNorm = normalizePoints(pairs.map((p) => p.src));
  const dstNorm = normalizePoints(pairs.map((p) => p.dst));

  // Build the 2n x 8 DLT system with h33 = 1:
  //   [x y 1 0 0 0 -x*x' -y*x'] h = x'
  //   [0 0 0 x y 1 -x*y' -y*y'] h = y'
  const A: Matrix = [];
  const b: number[] = [];
  for (let i = 0; i < pairs.length; i++) {
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

  // Denormalize: H = T_dst^-1 * Hn * T_src.
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

  const reprojectionErrors = pairs.map((p) => {
    const mapped = applyHomography(H, p.src);
    return Math.hypot(mapped.x - p.dst.x, mapped.y - p.dst.y);
  });
  const rmsError = Math.sqrt(
    reprojectionErrors.reduce((acc, e) => acc + e * e, 0) /
      reprojectionErrors.length,
  );
  const maxError = Math.max(...reprojectionErrors);

  return { H, reprojectionErrors, rmsError, maxError };
}
