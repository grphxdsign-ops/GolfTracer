/**
 * Dynamic time warping over multi-dimensional feature curves (here:
 * joint-angle vectors per frame). Classic O(n·m) dynamic program with the
 * standard step pattern (match / insert / delete), full backtrack, and a
 * per-query-frame representative mapping used to look up which expert
 * reference frame each user frame corresponds to.
 */

export interface DtwAlignment {
  /** Warping path as [queryIndex, referenceIndex] pairs, both monotone. */
  path: [number, number][];
  /** Total accumulated distance along the path. */
  cost: number;
  /**
   * For each query index, a representative reference index (the rounded
   * mean of all reference indices matched to it) — monotone nondecreasing.
   */
  map: number[];
}

const euclidean = (a: number[], b: number[]): number => {
  let sum = 0;
  for (let d = 0; d < a.length; d++) {
    const diff = a[d]! - (b[d] ?? 0);
    sum += diff * diff;
  }
  return Math.sqrt(sum);
};

/**
 * Align a query feature sequence to a reference feature sequence. Every
 * frame is a fixed-length feature vector (e.g. the six chain joint angles).
 */
export function dtwAlign(
  query: number[][],
  reference: number[][],
): DtwAlignment {
  const n = query.length;
  const m = reference.length;
  if (n === 0 || m === 0) {
    throw new Error('dtwAlign needs non-empty query and reference sequences');
  }

  // Accumulated-cost matrix, row-major (n+1)x(m+1) with an inf border.
  const acc = new Float64Array((n + 1) * (m + 1)).fill(Number.POSITIVE_INFINITY);
  const at = (i: number, j: number): number => i * (m + 1) + j;
  acc[at(0, 0)] = 0;

  for (let i = 1; i <= n; i++) {
    const q = query[i - 1]!;
    for (let j = 1; j <= m; j++) {
      const d = euclidean(q, reference[j - 1]!);
      const best = Math.min(
        acc[at(i - 1, j - 1)]!,
        acc[at(i - 1, j)]!,
        acc[at(i, j - 1)]!,
      );
      acc[at(i, j)] = d + best;
    }
  }

  // Backtrack from (n, m) to (1, 1), preferring the diagonal on ties.
  const path: [number, number][] = [];
  let i = n;
  let j = m;
  while (i >= 1 && j >= 1) {
    path.push([i - 1, j - 1]);
    if (i === 1 && j === 1) {
      break;
    }
    const diag = i > 1 && j > 1 ? acc[at(i - 1, j - 1)]! : Number.POSITIVE_INFINITY;
    const up = i > 1 ? acc[at(i - 1, j)]! : Number.POSITIVE_INFINITY;
    const left = j > 1 ? acc[at(i, j - 1)]! : Number.POSITIVE_INFINITY;
    if (diag <= up && diag <= left) {
      i -= 1;
      j -= 1;
    } else if (up <= left) {
      i -= 1;
    } else {
      j -= 1;
    }
  }
  path.reverse();

  // Representative reference index per query frame.
  const sums = new Array<number>(n).fill(0);
  const counts = new Array<number>(n).fill(0);
  for (const [qi, ri] of path) {
    sums[qi]! += ri;
    counts[qi]! += 1;
  }
  const map = new Array<number>(n);
  for (let k = 0; k < n; k++) {
    map[k] = counts[k]! > 0 ? Math.round(sums[k]! / counts[k]!) : 0;
  }
  // Rounding of averaged plateaus can locally invert by one; enforce the
  // monotonicity the path already guarantees.
  for (let k = 1; k < n; k++) {
    if (map[k]! < map[k - 1]!) {
      map[k] = map[k - 1]!;
    }
  }

  return { path, cost: acc[at(n, m)]!, map };
}
