/**
 * Nelder–Mead downhill simplex minimizer for small-dimensional, smooth-ish
 * objectives (here: 3-parameter launch condition refinement). Standard
 * reflection / expansion / contraction / shrink coefficients.
 */

export interface NelderMeadOptions {
  /** Initial simplex step per dimension (scalar or per-dim array). */
  step?: number | number[];
  maxIterations?: number;
  /** Convergence tolerance on the simplex function-value spread. */
  fTolerance?: number;
  /** Convergence tolerance on the simplex size (max vertex distance). */
  xTolerance?: number;
}

export interface NelderMeadResult {
  x: number[];
  fx: number;
  iterations: number;
  converged: boolean;
}

const ALPHA = 1; // reflection
const GAMMA = 2; // expansion
const RHO = 0.5; // contraction
const SIGMA = 0.5; // shrink

export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  options: NelderMeadOptions = {},
): NelderMeadResult {
  const n = x0.length;
  const maxIterations = options.maxIterations ?? 200 * n;
  const fTol = options.fTolerance ?? 1e-8;
  const xTol = options.xTolerance ?? 1e-8;
  const stepOf = (i: number): number => {
    if (Array.isArray(options.step)) {
      return options.step[i] ?? 0.1;
    }
    return options.step ?? Math.max(Math.abs(x0[i]!) * 0.1, 0.1);
  };

  // Initial simplex: x0 plus one perturbed vertex per dimension.
  const simplex: { x: number[]; fx: number }[] = [
    { x: [...x0], fx: f(x0) },
  ];
  for (let i = 0; i < n; i++) {
    const v = [...x0];
    v[i] = v[i]! + stepOf(i);
    simplex.push({ x: v, fx: f(v) });
  }

  const centroidOf = (excludeLast: boolean): number[] => {
    const c = new Array<number>(n).fill(0);
    const count = excludeLast ? simplex.length - 1 : simplex.length;
    for (let i = 0; i < count; i++) {
      const vertex = simplex[i]!;
      for (let d = 0; d < n; d++) {
        c[d] = c[d]! + vertex.x[d]! / count;
      }
    }
    return c;
  };

  let iterations = 0;
  let converged = false;
  while (iterations < maxIterations) {
    iterations++;
    simplex.sort((a, b) => a.fx - b.fx);
    const best = simplex[0]!;
    const worst = simplex[n]!;

    // Convergence: function spread and simplex extent both small.
    const spread = Math.abs(worst.fx - best.fx);
    let extent = 0;
    for (let i = 1; i <= n; i++) {
      const vertex = simplex[i]!;
      for (let d = 0; d < n; d++) {
        extent = Math.max(extent, Math.abs(vertex.x[d]! - best.x[d]!));
      }
    }
    if (spread <= fTol && extent <= xTol) {
      converged = true;
      break;
    }

    const centroid = centroidOf(true);
    const reflect = centroid.map((c, d) => c + ALPHA * (c - worst.x[d]!));
    const fReflect = f(reflect);

    if (fReflect < best.fx) {
      // Try expanding further.
      const expand = centroid.map((c, d) => c + GAMMA * (reflect[d]! - c));
      const fExpand = f(expand);
      simplex[n] =
        fExpand < fReflect
          ? { x: expand, fx: fExpand }
          : { x: reflect, fx: fReflect };
      continue;
    }

    if (fReflect < simplex[n - 1]!.fx) {
      simplex[n] = { x: reflect, fx: fReflect };
      continue;
    }

    // Contraction (outside if reflection improved on worst, else inside).
    const towards = fReflect < worst.fx ? reflect : worst.x;
    const contract = centroid.map((c, d) => c + RHO * (towards[d]! - c));
    const fContract = f(contract);
    if (fContract < Math.min(fReflect, worst.fx)) {
      simplex[n] = { x: contract, fx: fContract };
      continue;
    }

    // Shrink towards the best vertex.
    for (let i = 1; i <= n; i++) {
      const shrunk = simplex[i]!.x.map(
        (v, d) => best.x[d]! + SIGMA * (v - best.x[d]!),
      );
      simplex[i] = { x: shrunk, fx: f(shrunk) };
    }
  }

  simplex.sort((a, b) => a.fx - b.fx);
  const winner = simplex[0]!;
  return {
    x: winner.x,
    fx: winner.fx,
    iterations,
    converged,
  };
}
