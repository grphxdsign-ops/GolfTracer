/**
 * Procedural dummy renderer — pure TS, no Skia/React imports. Emits a
 * frame sequence of SVG/canvas-style geometry (circles + line segments):
 * the morphed dummy performing the perfected action in the left pane and
 * the simulated perfected ball flight in the right pane, with the ball
 * animated along the trajectory in sync with the dummy's playback clock.
 *
 * Reuses the overlay adapter's letterbox math (computeLetterbox /
 * videoToView, read-only) to contain-fit each pane, exactly like the
 * broadcast tracer overlay maps video pixels onto a view.
 */
import {
  computeLetterbox,
  videoToView,
  type LetterboxMapping,
} from '../../../adapters/overlay/overlayMath';
import type { BallFlightResult } from '../../sports/engine/ballFlight';
import { POSE_LANDMARKS } from '../../sports/pose/PoseAdapter';
import type { PerfectedPoseFrame } from '../../sports/sportsSessionStore';
import {
  CHAIN_BONES,
  CHEST_JOINT,
  PELVIS_JOINT,
  VISIBILITY_THRESHOLD,
  extendKeypoints,
} from '../skeleton/dummyModel';

export interface RenderCircle {
  kind: 'circle';
  role: 'joint' | 'head' | 'ball';
  cx: number;
  cy: number;
  r: number;
}

export interface RenderLine {
  kind: 'line';
  role: 'bone' | 'flight';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type RenderShape = RenderCircle | RenderLine;

export interface RenderedFrame {
  index: number;
  timestampMs: number;
  widthPx: number;
  heightPx: number;
  shapes: RenderShape[];
}

export interface RenderPerfectedOptions {
  widthPx?: number;
  heightPx?: number;
}

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 360;
/** Inset so joint/ball circles never poke past the frame edge. */
const PANE_MARGIN = 12;
/** Fraction of the frame width given to the dummy pane. */
const DUMMY_PANE_FRACTION = 0.55;
const JOINT_RADIUS = 3;
const HEAD_RADIUS = 8;
const BALL_RADIUS = 5;
/** Cap on flight polyline segments (trajectory is sampled every ~10 ms). */
const MAX_FLIGHT_SEGMENTS = 160;

const L = POSE_LANDMARKS;

/** Bones drawn between real landmarks (girdle axes drawn separately). */
const DRAWN_BONES: readonly [number, number][] = [
  [L.leftHip, L.rightHip],
  [L.leftShoulder, L.rightShoulder],
  ...CHAIN_BONES.filter(
    (bone) => bone.parent !== CHEST_JOINT && bone.parent !== L.nose,
  ).map((bone) => [bone.parent, bone.child] as [number, number]),
];

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const growBounds = (b: Bounds, x: number, y: number): void => {
  if (x < b.minX) b.minX = x;
  if (y < b.minY) b.minY = y;
  if (x > b.maxX) b.maxX = x;
  if (y > b.maxY) b.maxY = y;
};

interface PaneMapping {
  mapping: LetterboxMapping;
  offsetX: number;
  offsetY: number;
  bounds: Bounds;
  flipY: boolean;
}

/** Contain-fit a source bounding box into a pane of the output frame. */
function paneMapping(
  bounds: Bounds,
  paneX: number,
  paneY: number,
  paneWidth: number,
  paneHeight: number,
  flipY: boolean,
): PaneMapping {
  const srcW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const srcH = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const innerW = Math.max(paneWidth - 2 * PANE_MARGIN, 1);
  const innerH = Math.max(paneHeight - 2 * PANE_MARGIN, 1);
  return {
    mapping: computeLetterbox(srcW, srcH, 0, innerW, innerH),
    offsetX: paneX + PANE_MARGIN,
    offsetY: paneY + PANE_MARGIN,
    bounds,
    flipY,
  };
}

/** Map a source-space point through a pane into frame coordinates. */
function toPane(pane: PaneMapping, x: number, y: number): { x: number; y: number } {
  const sx = x - pane.bounds.minX;
  const syRaw = y - pane.bounds.minY;
  const sy = pane.flipY ? pane.bounds.maxY - pane.bounds.minY - syRaw : syRaw;
  const p = videoToView({ x: sx, y: sy }, pane.mapping);
  return { x: p.x + pane.offsetX, y: p.y + pane.offsetY };
}

/** Ball position on the trajectory at a flight time, linearly interpolated. */
function flightPositionAt(
  flight: BallFlightResult,
  t: number,
): { x: number; y: number } {
  const samples = flight.trajectory;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;
  if (t <= first.t) {
    return { x: first.positionM.x, y: first.positionM.y };
  }
  if (t >= last.t) {
    return { x: last.positionM.x, y: last.positionM.y };
  }
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i]!;
    if (t <= b.t) {
      const a = samples[i - 1]!;
      const span = b.t - a.t;
      const u = span > 1e-12 ? (t - a.t) / span : 0;
      return {
        x: a.positionM.x + u * (b.positionM.x - a.positionM.x),
        y: a.positionM.y + u * (b.positionM.y - a.positionM.y),
      };
    }
  }
  return { x: last.positionM.x, y: last.positionM.y };
}

/**
 * Render the perfected action: dummy skeleton geometry (left pane) beside
 * the simulated perfected ball flight (right pane), one RenderedFrame per
 * input pose frame.
 */
export function renderPerfectedFrames(
  frames: PerfectedPoseFrame[],
  flight: BallFlightResult,
  options?: RenderPerfectedOptions,
): RenderedFrame[] {
  if (frames.length === 0) {
    throw new Error('renderPerfectedFrames needs at least one frame');
  }
  if (flight.trajectory.length === 0) {
    throw new Error('renderPerfectedFrames needs a non-empty trajectory');
  }
  const widthPx = options?.widthPx ?? DEFAULT_WIDTH;
  const heightPx = options?.heightPx ?? DEFAULT_HEIGHT;
  const dummyPaneW = widthPx * DUMMY_PANE_FRACTION;
  const flightPaneW = widthPx - dummyPaneW;

  // Dummy pane bounds: every visible joint across all frames, so the whole
  // action stays inside the pane.
  const poseBounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const frame of frames) {
    for (const k of frame.keypoints) {
      if (k.visibility >= VISIBILITY_THRESHOLD) {
        growBounds(poseBounds, k.x, k.y);
      }
    }
  }
  if (!Number.isFinite(poseBounds.minX)) {
    throw new Error('renderPerfectedFrames needs at least one visible joint');
  }
  const dummyPane = paneMapping(poseBounds, 0, 0, dummyPaneW, heightPx, false);

  // Flight pane bounds: the full trajectory (x downrange, y up).
  const flightBounds: Bounds = {
    minX: 0,
    minY: 0,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const s of flight.trajectory) {
    growBounds(flightBounds, s.positionM.x, s.positionM.y);
  }
  const flightPane = paneMapping(
    flightBounds,
    dummyPaneW,
    0,
    flightPaneW,
    heightPx,
    true,
  );

  // The flight polyline is static; build it once.
  const stride = Math.max(
    1,
    Math.ceil((flight.trajectory.length - 1) / MAX_FLIGHT_SEGMENTS),
  );
  const flightLines: RenderLine[] = [];
  let prev = toPane(
    flightPane,
    flight.trajectory[0]!.positionM.x,
    flight.trajectory[0]!.positionM.y,
  );
  for (let i = stride; i < flight.trajectory.length; i += stride) {
    const s = flight.trajectory[Math.min(i, flight.trajectory.length - 1)]!;
    const p = toPane(flightPane, s.positionM.x, s.positionM.y);
    flightLines.push({
      kind: 'line',
      role: 'flight',
      x1: prev.x,
      y1: prev.y,
      x2: p.x,
      y2: p.y,
    });
    prev = p;
  }
  const lastSample = flight.trajectory[flight.trajectory.length - 1]!;
  const lastPoint = toPane(
    flightPane,
    lastSample.positionM.x,
    lastSample.positionM.y,
  );
  if (lastPoint.x !== prev.x || lastPoint.y !== prev.y) {
    flightLines.push({
      kind: 'line',
      role: 'flight',
      x1: prev.x,
      y1: prev.y,
      x2: lastPoint.x,
      y2: lastPoint.y,
    });
  }

  const clock0 = frames[0]!.timestampMs;
  const clock1 = frames[frames.length - 1]!.timestampMs;
  const clockSpan = Math.max(clock1 - clock0, 1e-9);

  return frames.map((frame, index) => {
    const shapes: RenderShape[] = [];
    const ext = extendKeypoints(frame.keypoints);

    // Bones (including the spine between the virtual pelvis and chest).
    const pelvis = ext.positions[PELVIS_JOINT]!;
    const chest = ext.positions[CHEST_JOINT]!;
    if (
      ext.visibility[PELVIS_JOINT]! >= VISIBILITY_THRESHOLD &&
      ext.visibility[CHEST_JOINT]! >= VISIBILITY_THRESHOLD
    ) {
      const a = toPane(dummyPane, pelvis.x, pelvis.y);
      const b = toPane(dummyPane, chest.x, chest.y);
      shapes.push({ kind: 'line', role: 'bone', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
    for (const [i, j] of DRAWN_BONES) {
      if (
        ext.visibility[i]! < VISIBILITY_THRESHOLD ||
        ext.visibility[j]! < VISIBILITY_THRESHOLD
      ) {
        continue;
      }
      const pi = ext.positions[i]!;
      const pj = ext.positions[j]!;
      const a = toPane(dummyPane, pi.x, pi.y);
      const b = toPane(dummyPane, pj.x, pj.y);
      shapes.push({ kind: 'line', role: 'bone', x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }

    // Joints (head circle at the nose).
    for (let i = 0; i < frame.keypoints.length; i++) {
      const k = frame.keypoints[i]!;
      if (k.visibility < VISIBILITY_THRESHOLD) {
        continue;
      }
      const p = toPane(dummyPane, k.x, k.y);
      shapes.push({
        kind: 'circle',
        role: i === L.nose ? 'head' : 'joint',
        cx: p.x,
        cy: p.y,
        r: i === L.nose ? HEAD_RADIUS : JOINT_RADIUS,
      });
    }

    // Ball flight: full arc plus the ball at the synced flight time.
    shapes.push(...flightLines);
    const u = (frame.timestampMs - clock0) / clockSpan;
    const ball = flightPositionAt(flight, u * flight.flightTimeS);
    const bp = toPane(flightPane, ball.x, ball.y);
    shapes.push({ kind: 'circle', role: 'ball', cx: bp.x, cy: bp.y, r: BALL_RADIUS });

    return {
      index,
      timestampMs: frame.timestampMs,
      widthPx,
      heightPx,
      shapes,
    };
  });
}
