/**
 * TracerMark — the Tracr logomark, docs/DESIGN.md §1.1.
 *
 * The logomark IS the tracer: an ember comet crescent filled with the §2
 * ember gradient (tail → mid → white-gold head) over a soft glow. In-app it
 * is always drawn from the tracer tokens — never from a bitmap — so the
 * mark cannot drift from the product. It counts as the screen's one ember
 * element (§1.1 quota): Welcome/SignIn and empty stages only, never chrome
 * ornament, never beside a live tracer.
 *
 * Geometry: a ~215° arc swept from the fat bulb (lower left) through the
 * bottom and right to a thin thread near top center, width tapering with
 * (1−t)^1.6 — matching docs/brand/logomark-master.png. Decorative only; a
 * parent carries any accessible name.
 */
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  vec,
} from '@shopify/react-native-skia';

import { tracer } from '../theme';

export interface TracerMarkProps {
  /** Rendered square size in pt. Authored in a 100×100 viewport. */
  size?: number;
  testID?: string;
}

const VIEWPORT = 100;
/** Arc center, sized so glow never clips the viewport. */
const CX = 46;
const CY = 46;
/** Sweep: bulb at 135° through bottom (90°) and right (0°) to −80°. */
const START_DEG = 135;
const SWEEP_DEG = 215;
/** Radius eases inward toward the head — a comet, not a compass circle. */
const R_START = 38;
const R_DRIFT = 4;
/** Half-width taper: ~7 at the bulb to a 0.6 thread at the head. */
const W_MAX = 6.4;
const W_MIN = 0.6;
const SAMPLES = 36;

interface Pt {
  x: number;
  y: number;
}

function arcPoint(t: number): { p: Pt; n: Pt; w: number } {
  const theta = ((START_DEG - SWEEP_DEG * t) * Math.PI) / 180;
  const r = R_START - R_DRIFT * t;
  const n = { x: Math.cos(theta), y: Math.sin(theta) };
  return {
    p: { x: CX + r * n.x, y: CY + r * n.y },
    n,
    w: W_MIN + W_MAX * Math.pow(1 - t, 1.6),
  };
}

/** Filled tapered crescent: outer edge out, inner edge back, closed. */
function buildCrescentPath(): string {
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const { p, n, w } = arcPoint(t);
    outer.push({ x: p.x + n.x * w, y: p.y + n.y * w });
    inner.push({ x: p.x - n.x * w, y: p.y - n.y * w });
  }
  const fmt = (pt: Pt) => `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
  const forward = outer.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${fmt(pt)}`);
  const back = inner.reverse().map((pt) => `L ${fmt(pt)}`);
  return `${forward.join(' ')} ${back.join(' ')} Z`;
}

const CRESCENT = buildCrescentPath();
const BULB = arcPoint(0);
const HEAD = arcPoint(1);

export function TracerMark({
  size = 96,
  testID,
}: TracerMarkProps): React.JSX.Element {
  const scale = size / VIEWPORT;
  return (
    <Canvas style={{ width: size, height: size }} testID={testID}>
      <Group transform={[{ scale }]}>
        {/* Glow underlay — the mark carries its own stage light. */}
        <Group>
          <BlurMask blur={9} style="normal" />
          <Path path={CRESCENT} color={tracer.glow} />
          <Circle cx={BULB.p.x} cy={BULB.p.y} r={BULB.w * 1.8} color={tracer.glow} />
        </Group>
        {/* Rounded bulb under the crescent's butt end (tail color — the
            gradient is at its tail stop there anyway). */}
        <Circle cx={BULB.p.x} cy={BULB.p.y} r={BULB.w} color={tracer.tail} />
        {/* The comet body: tail → mid → white-gold head (§6 recipe). */}
        <Path path={CRESCENT}>
          <LinearGradient
            start={vec(BULB.p.x, BULB.p.y)}
            end={vec(HEAD.p.x, HEAD.p.y)}
            colors={[tracer.tail, tracer.mid, tracer.head]}
            positions={[0, 0.55, 1]}
          />
        </Path>
      </Group>
    </Canvas>
  );
}
