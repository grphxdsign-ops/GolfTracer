/**
 * Global data association — offline fallback for launches the online tracker
 * cannot seed reliably.
 *
 * At 30 fps a real tee box is adversarial for online seeding: within ~0.3 s
 * of impact the launch corridor contains club-shaft glints, divot chunks,
 * the tumbling tee, and the ball's ground shadow, while the ball itself is a
 * motion-blurred streak for its first frames. Any single-frame seed policy
 * can be fooled; what separates the ball from every confuser is temporal
 * consistency — it is the only object with a smooth, upward, decelerating
 * path sustained across the whole flight window.
 *
 * So instead of seeding-then-gating, this pass detects candidates in EVERY
 * post-impact frame first, then solves for the best chain: a longest-path
 * dynamic program over (frame, candidate) nodes where an edge requires
 * non-descending flight (small tolerance), a bounded first step, and
 * velocity coherence with the chain so far. Clutter forms short or jerky
 * chains and loses to the ball on score.
 */
import type { VideoFrame } from '../../../types/media';
import type { BallDetector, BallObservation } from '../../../types/tracking';
import { clampRoi, type Roi } from '../vision/imageOps';

export interface GlobalAssociationOptions {
  /** Region candidates are collected from (analysis px). */
  searchRoi: Roi;
  /** Max frames a chain may skip between consecutive observations. */
  maxFrameGap?: number;
  /** Minimum chain length to accept a result. */
  minChain?: number;
  /** Velocity-coherence gate as a fraction of the previous step speed. */
  velGateFrac?: number;
  /** Absolute velocity-coherence floor, px/frame. */
  velGateMinPx?: number;
  /** Largest allowed first step, px/frame (launch blur can jump far). */
  maxStepPx?: number;
  /**
   * Smallest allowed step, px/frame. A ball in flight never hovers, but
   * permanent scene changes (the divot hole, displaced turf, the tee in its
   * new resting spot) differ from a frozen background in every frame and
   * would otherwise chain into perfectly-coherent zero-velocity "tracks".
   */
  minStepPx?: number;
  /** Downward drift tolerated per frame, px (noise on a rising ball). */
  descentTolerancePx?: number;
  /** Candidates kept per frame (top-confidence first). */
  maxCandidatesPerFrame?: number;
  /**
   * Deceleration factor: a step's speed may be at most the previous step's
   * speed times this (plus a small absolute allowance). A climbing,
   * receding ball only slows in the image; debris, glints and body motion
   * speed up and down erratically, which is what breaks their chains.
   */
  decelTolerance?: number;
  /** A chain must begin within this many frames of impact (frame 0). */
  maxStartDelayFrames?: number;
}

interface Node {
  obs: BallObservation;
  frameIdx: number;
  score: number;
  chainLen: number;
  /** px-per-frame velocity of the edge that reached this node. */
  vx: number;
  vy: number;
  prev: Node | null;
}

/**
 * Detect candidates in every frame inside `searchRoi`, then return the best
 * temporally-consistent chain, chronological. Empty array when no chain
 * reaches `minChain` observations. The detector should already be warmed on
 * pre-impact frames; frames are consumed in order so rolling backgrounds
 * stay coherent.
 */
export async function associateGlobally(
  frames: VideoFrame[],
  detector: BallDetector,
  options: GlobalAssociationOptions,
): Promise<BallObservation[]> {
  const maxGap = options.maxFrameGap ?? 3;
  const minChain = options.minChain ?? 6;
  const velGateFrac = options.velGateFrac ?? 0.6;
  const velGateMinPx = options.velGateMinPx ?? 10;
  const maxStepPx = options.maxStepPx ?? 140;
  const minStepPx = options.minStepPx ?? 2;
  const descentTol = options.descentTolerancePx ?? 3;
  const perFrame = options.maxCandidatesPerFrame ?? 32;
  const decelTolerance = options.decelTolerance ?? 1.2;
  const maxStartDelay = options.maxStartDelayFrames ?? 10;

  if (frames.length === 0) return [];
  const roi = clampRoi(options.searchRoi, frames[0]!.width, frames[0]!.height);

  const nodesByFrame: Node[][] = [];
  for (let i = 0; i < frames.length; i++) {
    const candidates = await detector.detect(frames[i]!, roi);
    nodesByFrame.push(
      candidates.slice(0, perFrame).map((obs) => ({
        obs,
        frameIdx: i,
        score: obs.confidence,
        chainLen: 1,
        vx: 0,
        vy: 0,
        prev: null,
      })),
    );
  }

  // Longest-path DP: extend every node from the best-scoring compatible
  // predecessor within maxGap frames.
  let best: Node | null = null;
  for (let j = 0; j < nodesByFrame.length; j++) {
    for (const node of nodesByFrame[j]!) {
      for (let i = Math.max(0, j - maxGap); i < j; i++) {
        for (const pred of nodesByFrame[i]!) {
          const dtFrames = j - i;
          const vx = (node.obs.cx - pred.obs.cx) / dtFrames;
          const vy = (node.obs.cy - pred.obs.cy) / dtFrames;

          // A launched ball never sinks in the image during early flight.
          if (vy > descentTol) continue;

          const speed = Math.hypot(vx, vy);
          if (speed < minStepPx) continue;
          if (pred.prev === null) {
            if (pred.frameIdx > maxStartDelay) continue;
            if (speed > maxStepPx) continue;
          } else {
            const predSpeed = Math.hypot(pred.vx, pred.vy);
            if (speed > predSpeed * decelTolerance + 2) continue;
            const dv = Math.hypot(vx - pred.vx, vy - pred.vy);
            const gate = Math.max(velGateFrac * predSpeed, velGateMinPx);
            if (dv > gate) continue;
          }

          const gapPenalty = 0.15 * (dtFrames - 1);
          const score = pred.score + 1 + 0.25 * node.obs.confidence - gapPenalty;
          if (score > node.score) {
            node.score = score;
            node.chainLen = pred.chainLen + 1;
            node.vx = vx;
            node.vy = vy;
            node.prev = pred;
          }
        }
      }
      if (!best || node.score > best.score) best = node;
    }
  }

  if (!best || best.chainLen < minChain) return [];
  const chain: BallObservation[] = [];
  for (let n: Node | null = best; n; n = n.prev) chain.push(n.obs);
  chain.reverse();
  return chain;
}

/**
 * The region the fallback searches: the seed corridor widened a quarter on
 * each side and extended to the top of the frame, since a climbing ball
 * leaves the corridor long before it fades.
 */
export function fallbackSearchRoi(seedRoi: Roi, width: number, height: number): Roi {
  const pad = Math.round(seedRoi.w * 0.25);
  return clampRoi(
    {
      x: seedRoi.x - pad,
      y: 0,
      w: seedRoi.w + 2 * pad,
      h: seedRoi.y + seedRoi.h,
    },
    width,
    height,
  );
}
