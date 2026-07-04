/**
 * Broadcast-comet tracer overlay (docs/DESIGN.md §6): a Skia canvas drawing
 * the TracerPath as layered strokes, bottom → top:
 *
 *   1. Glow      — full revealed path, blurred, skipped when glowWidth is 0.
 *   2. Core      — full revealed path painted by a tail→head LinearGradient
 *                  (tail 55% alpha → style.color → white-hot head tint).
 *   3. Hot head  — the last few points restroked wider in the head tint,
 *                  the comet's bright leading edge.
 *   4. Head      — soft glow under-circle + solid head-tint circle.
 *   5. Apex ring — a stroked ring once the reveal passes apexIndex.
 *
 * The reveal draws points[0..k] where k is derived from the observation
 * timestamps via `revealCount` — never from wall-clock frame counts, so the
 * head keeps pace with the real flight. All geometry lives in overlayMath.ts
 * (pure, unit-tested, frozen); this component is a thin Skia rendering shell.
 */
import { useMemo } from 'react';
import {
  BlurMask,
  Canvas,
  Circle,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import type { TracerPath } from '../../types/tracking';
import {
  computeLetterbox,
  revealCount,
  videoToView,
  type Point,
  type RotationDeg,
} from './overlayMath';

export interface TracerOverlayProps {
  tracer: TracerPath;
  /** Native video dimensions (pre-rotation, as encoded). */
  videoWidth: number;
  videoHeight: number;
  rotationDeg?: RotationDeg;
  /** Size of the view the overlay is layered over. */
  viewWidth: number;
  viewHeight: number;
  /** Reveal progress 0..1 (timestamp-anchored). Default 1 = fully drawn. */
  revealFraction?: number;
}

export interface CometTints {
  /** style.color mixed 65% toward white — the hot leading edge. */
  head: string;
  /** style.color verbatim. */
  mid: string;
  /** style.color at 55% alpha — the cooling tail. */
  tail: string;
}

/** Parse #RGB / #RRGGBB hex into channels; null for anything else. */
function parseHex(color: string): { r: number; g: number; b: number } | null {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color);
  if (m3) {
    return {
      r: parseInt(m3[1]! + m3[1]!, 16),
      g: parseInt(m3[2]! + m3[2]!, 16),
      b: parseInt(m3[3]! + m3[3]!, 16),
    };
  }
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (m6) {
    return {
      r: parseInt(m6[1]!, 16),
      g: parseInt(m6[2]!, 16),
      b: parseInt(m6[3]!, 16),
    };
  }
  return null;
}

/**
 * Derive the comet gradient tints from a preset color (DESIGN.md §6): head =
 * 65% mix toward #FFFFFF, mid = the color itself, tail = the color at 55%
 * alpha. Non-hex inputs (named colors) degrade to the input color for every
 * stop — only preset hexes occur in practice.
 */
export function cometTints(color: string): CometTints {
  const rgb = parseHex(color);
  if (!rgb) {
    return { head: color, mid: color, tail: color };
  }
  const mix = (c: number) => Math.round(c + (255 - c) * 0.65);
  const hex = (c: number) => c.toString(16).padStart(2, '0').toUpperCase();
  return {
    head: `#${hex(mix(rgb.r))}${hex(mix(rgb.g))}${hex(mix(rgb.b))}`,
    mid: color,
    tail: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.55)`,
  };
}

/** How many trailing points get the hot head restroke. */
const HEAD_SEGMENT_POINTS = 6;

function buildPath(points: readonly Point[], from: number, to: number) {
  const skPath = Skia.Path.Make();
  if (to - from >= 2) {
    skPath.moveTo(points[from]!.x, points[from]!.y);
    for (let i = from + 1; i < to; i++) {
      skPath.lineTo(points[i]!.x, points[i]!.y);
    }
  }
  return skPath;
}

export function TracerOverlay({
  tracer,
  videoWidth,
  videoHeight,
  rotationDeg = 0,
  viewWidth,
  viewHeight,
  revealFraction = 1,
}: TracerOverlayProps) {
  const mapping = useMemo(
    () =>
      computeLetterbox(videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight),
    [videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight],
  );

  const mapped: Point[] = useMemo(
    () => tracer.points.map((p) => videoToView(p, mapping)),
    [tracer.points, mapping],
  );

  const k = revealCount(tracer.points, revealFraction);

  const path = useMemo(() => buildPath(mapped, 0, k), [mapped, k]);

  const headSegmentPath = useMemo(
    () => buildPath(mapped, Math.max(0, k - Math.min(HEAD_SEGMENT_POINTS, k)), k),
    [mapped, k],
  );

  if (viewWidth <= 0 || viewHeight <= 0 || k < 2) {
    return null;
  }

  const { style, apexIndex } = tracer;
  const tail = mapped[0]!;
  const head = mapped[k - 1]!;
  const tints = cometTints(style.color);
  const headRadius = Math.max(2.5, style.strokeWidth * 1.3);
  const showApex =
    apexIndex >= 0 && apexIndex < mapped.length && k > apexIndex;
  const apex = showApex ? mapped[apexIndex]! : null;

  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewWidth,
        height: viewHeight,
      }}
    >
      {style.glowWidth > 0 ? (
        <Path
          path={path}
          color={style.glowColor}
          style="stroke"
          strokeWidth={style.glowWidth * 1.6}
          strokeCap="round"
          strokeJoin="round"
        >
          <BlurMask blur={6} style="normal" />
        </Path>
      ) : null}
      <Path
        path={path}
        color={style.color}
        style="stroke"
        strokeWidth={style.strokeWidth}
        strokeCap="round"
        strokeJoin="round"
      >
        <LinearGradient
          start={vec(tail.x, tail.y)}
          end={vec(head.x, head.y)}
          colors={[tints.tail, tints.mid, tints.head]}
          positions={[0, 0.55, 1]}
        />
      </Path>
      <Path
        path={headSegmentPath}
        color={tints.head}
        style="stroke"
        strokeWidth={style.strokeWidth * 1.4}
        strokeCap="round"
        strokeJoin="round"
      />
      <Circle
        cx={head.x}
        cy={head.y}
        r={headRadius * 2.2}
        color={style.glowColor}
      />
      <Circle cx={head.x} cy={head.y} r={headRadius} color={tints.head} />
      {apex ? (
        <Circle
          cx={apex.x}
          cy={apex.y}
          r={5}
          style="stroke"
          strokeWidth={3}
          color={tints.head}
          opacity={0.9}
        />
      ) : null}
    </Canvas>
  );
}
