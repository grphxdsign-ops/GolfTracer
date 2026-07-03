/**
 * Tiny dense linear-algebra kit for the anchor-homography solver (8x8
 * systems at most): Gaussian elimination with partial pivoting,
 * least-squares via normal equations, and 3x3 products. Kept local to the
 * sports engine so it stays decoupled from the golf distance module.
 *
 * Non-null assertions are used for raw index access — every loop is bounded
 * by the validated matrix dimensions.
 */

export type Matrix = number[][];

/** Relative pivot threshold below which a system is treated as singular. */
const SINGULAR_EPS = 1e-10;

export class SingularMatrixError extends Error {
  constructor(message = 'Matrix is singular or badly conditioned') {
    super(message);
    this.name = 'SingularMatrixError';
  }
}

/**
 * Solve the square system A x = b by Gaussian elimination with partial
 * pivoting. Throws SingularMatrixError on a (numerically) zero pivot —
 * e.g. collinear anchor corners.
 */
export function solveLinearSystem(A: Matrix, b: number[]): number[] {
  const n = A.length;
  if (n === 0 || A.some((row) => row.length !== n) || b.length !== n) {
    throw new Error('solveLinearSystem requires a square system');
  }

  const M: number[][] = A.map((row, i) => [...row, b[i]!]);

  let maxAbs = 0;
  for (const row of A) {
    for (const v of row) {
      maxAbs = Math.max(maxAbs, Math.abs(v));
    }
  }
  const threshold = SINGULAR_EPS * Math.max(maxAbs, 1);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r]![col]!) > Math.abs(M[pivotRow]![col]!)) {
        pivotRow = r;
      }
    }
    if (Math.abs(M[pivotRow]![col]!) <= threshold) {
      throw new SingularMatrixError();
    }
    if (pivotRow !== col) {
      const tmp = M[col]!;
      M[col] = M[pivotRow]!;
      M[pivotRow] = tmp;
    }

    const pivotRowArr = M[col]!;
    const pivot = pivotRowArr[col]!;
    for (let r = col + 1; r < n; r++) {
      const rowArr = M[r]!;
      const factor = rowArr[col]! / pivot;
      if (factor === 0) {
        continue;
      }
      for (let c = col; c <= n; c++) {
        rowArr[c] = rowArr[c]! - factor * pivotRowArr[c]!;
      }
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    const rowArr = M[r]!;
    let sum = rowArr[n]!;
    for (let c = r + 1; c < n; c++) {
      sum -= rowArr[c]! * x[c]!;
    }
    x[r] = sum / rowArr[r]!;
  }
  return x;
}

/**
 * Least-squares solution of the (over-determined) system A x ~= b via the
 * normal equations A^T A x = A^T b.
 */
export function solveLeastSquares(A: Matrix, b: number[]): number[] {
  if (A.length !== b.length) {
    throw new Error('solveLeastSquares: row count mismatch');
  }
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const AtA: Matrix = Array.from({ length: cols }, () =>
    new Array<number>(cols).fill(0),
  );
  const Atb = new Array<number>(cols).fill(0);
  for (let r = 0; r < rows; r++) {
    const row = A[r]!;
    const br = b[r]!;
    for (let i = 0; i < cols; i++) {
      const vi = row[i]!;
      if (vi === 0) {
        continue;
      }
      const outRow = AtA[i]!;
      for (let j = 0; j < cols; j++) {
        outRow[j] = outRow[j]! + vi * row[j]!;
      }
      Atb[i] = Atb[i]! + vi * br;
    }
  }
  return solveLinearSystem(AtA, Atb);
}

/** Product of two 3x3 matrices. */
export function matMul3(A: Matrix, B: Matrix): Matrix {
  const out: Matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    const ai = A[i]!;
    const oi = out[i]!;
    for (let j = 0; j < 3; j++) {
      oi[j] = ai[0]! * B[0]![j]! + ai[1]! * B[1]![j]! + ai[2]! * B[2]![j]!;
    }
  }
  return out;
}
