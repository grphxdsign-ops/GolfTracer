/**
 * TracerMark — the Tracr logomark, docs/DESIGN.md §1.1.
 *
 * The logomark IS the tracer: a ball-flight tracer arc — a bright white-gold
 * ball at the head with a glowing ember trail (tail → mid → head gradient)
 * curving back to the impact bulb. Drawn from the tracer tokens (never a
 * bitmap) so the mark can never drift from the product. Counts as its
 * screen's one ember element (§1.1): Welcome/SignIn and empty stages only,
 * never chrome ornament, never beside a live tracer.
 *
 * The animated sibling TracerLoader reveals this exact arc head-first (a ball
 * hit, tracing out, then fading) for loading moments.
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
import {
  ARC_COLORS,
  ARC_POSITIONS,
  BULB,
  buildCrescentPath,
  HEAD,
  VIEWPORT,
} from './tracerArc';

export interface TracerMarkProps {
  /** Rendered square size in pt. Authored in a 100×100 viewport. */
  size?: number;
  testID?: string;
}

const CRESCENT = buildCrescentPath();
/** Ball head marker (viewport units): white-hot core over a soft glow. */
const HEAD_R = 2.6;

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
          <Circle cx={HEAD.p.x} cy={HEAD.p.y} r={HEAD_R * 2.4} color={tracer.glow} />
        </Group>
        {/* Rounded bulb under the crescent's impact end (tail color — the
            gradient is at its tail stop there anyway). */}
        <Circle cx={BULB.p.x} cy={BULB.p.y} r={BULB.w} color={tracer.tail} />
        {/* The comet body: tail → mid → white-gold head (§6 recipe). */}
        <Path path={CRESCENT}>
          <LinearGradient
            start={vec(BULB.p.x, BULB.p.y)}
            end={vec(HEAD.p.x, HEAD.p.y)}
            colors={[...ARC_COLORS]}
            positions={[...ARC_POSITIONS]}
          />
        </Path>
        {/* Ball at the head — the tracer's leading edge, always white-hot. */}
        <Circle cx={HEAD.p.x} cy={HEAD.p.y} r={HEAD_R} color={tracer.head} />
      </Group>
    </Canvas>
  );
}
