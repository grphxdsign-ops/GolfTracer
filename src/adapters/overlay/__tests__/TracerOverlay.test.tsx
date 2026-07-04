import { render } from '@testing-library/react-native';
import { Canvas } from '@shopify/react-native-skia';

import { cometTints, TracerOverlay } from '../TracerOverlay';
import type { TracerPath, TrackPoint } from '../../../types/tracking';
import { DEFAULT_TRACER_STYLE } from '../../../modules/tracking/tracker/tracerGeometry';

function tracerOf(count: number, apexIndex = count - 1): TracerPath {
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      timestampMs: i * 10,
      x: 10 + i * 4,
      y: 200 - i * 3,
      interpolated: false,
    });
  }
  return { points, apexIndex, style: { ...DEFAULT_TRACER_STYLE } };
}

/**
 * The Skia mock's Canvas renders null, so its children never mount; inspect
 * the React elements passed to the Canvas instead.
 */
function canvasChildProps(
  result: ReturnType<typeof render>,
): Array<Record<string, unknown>> {
  const canvas = result.UNSAFE_root.findAll(
    (node: { type: unknown }) => node.type === Canvas,
  )[0];
  if (!canvas) return [];
  const out: Array<Record<string, unknown>> = [];
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const el = node as { props?: Record<string, unknown> };
    if (el.props) {
      out.push(el.props);
      walk(el.props.children);
    }
  };
  walk(canvas.props.children);
  return out;
}

function strokeElements(
  result: ReturnType<typeof render>,
): Array<Record<string, unknown>> {
  return canvasChildProps(result).filter((p) => 'path' in p);
}

/** The core comet stroke — identified by its strokeWidth, not position. */
function coreStroke(result: ReturnType<typeof render>): Record<string, unknown> {
  const core = strokeElements(result).find(
    (p) => p.strokeWidth === DEFAULT_TRACER_STYLE.strokeWidth,
  );
  expect(core).toBeTruthy();
  return core!;
}

function circles(
  result: ReturnType<typeof render>,
): Array<Record<string, unknown>> {
  return canvasChildProps(result).filter((p) => 'cx' in p);
}

const HEAD_RADIUS = Math.max(2.5, DEFAULT_TRACER_STYLE.strokeWidth * 1.3);
const HEAD_TINT = cometTints(DEFAULT_TRACER_STYLE.color).head;

function headMarker(result: ReturnType<typeof render>): Record<string, unknown> {
  const head = circles(result).find((p) => p.r === HEAD_RADIUS);
  expect(head).toBeTruthy();
  return head!;
}

function apexRing(
  result: ReturnType<typeof render>,
): Record<string, unknown> | undefined {
  return circles(result).find((p) => p.style === 'stroke');
}

const baseProps = {
  videoWidth: 480,
  videoHeight: 270,
  viewWidth: 480,
  viewHeight: 270,
} as const;

describe('cometTints', () => {
  it('derives head/mid/tail tints from a hex preset color', () => {
    const tints = cometTints('#FF3B1F');
    expect(tints.mid).toBe('#FF3B1F');
    // head = each channel mixed 65% toward white.
    expect(tints.head).toBe('#FFBAB1');
    // tail = the color at 55% alpha.
    expect(tints.tail).toBe('rgba(255, 59, 31, 0.55)');
  });

  it('supports shorthand hex and pure white', () => {
    expect(cometTints('#fff')).toEqual({
      head: '#FFFFFF',
      mid: '#fff',
      tail: 'rgba(255, 255, 255, 0.55)',
    });
  });

  it('degrades non-hex input to the input color for every stop', () => {
    expect(cometTints('tomato')).toEqual({
      head: 'tomato',
      mid: 'tomato',
      tail: 'tomato',
    });
  });
});

describe('TracerOverlay', () => {
  it('draws glow, gradient core, and hot head segment strokes with round caps', () => {
    const result = render(<TracerOverlay tracer={tracerOf(10)} {...baseProps} />);
    const strokes = strokeElements(result);
    // Glow + core + head segment.
    expect(strokes).toHaveLength(3);

    const glow = strokes.find(
      (p) => p.strokeWidth === DEFAULT_TRACER_STYLE.glowWidth * 1.6,
    )!;
    expect(glow).toBeTruthy();
    expect(glow.color).toBe(DEFAULT_TRACER_STYLE.glowColor);
    expect(glow.strokeCap).toBe('round');
    // Glow is blurred via a BlurMask child.
    const blur = canvasChildProps(result).find((p) => 'blur' in p)!;
    expect(blur.blur).toBe(6);

    const core = coreStroke(result);
    expect(core.color).toBe(DEFAULT_TRACER_STYLE.color);
    expect((glow.strokeWidth as number) > (core.strokeWidth as number)).toBe(
      true,
    );
    expect(core.strokeCap).toBe('round');
    // Identity mapping (view == video): path starts at the first point.
    const svg = (core.path as { toSVGString(): string }).toSVGString();
    expect(svg.startsWith('M 10 200')).toBe(true);
    expect(svg.split('L').length).toBe(10); // moveTo + 9 lineTo

    // Hot head segment: last 6 points, restroked wider in the head tint.
    const headSegment = strokes.find(
      (p) => p.strokeWidth === DEFAULT_TRACER_STYLE.strokeWidth * 1.4,
    )!;
    expect(headSegment).toBeTruthy();
    expect(headSegment.color).toBe(HEAD_TINT);
    const segSvg = (
      headSegment.path as { toSVGString(): string }
    ).toSVGString();
    expect(segSvg.split('L').length).toBe(6); // moveTo + 5 lineTo

    // Head marker at the last visible point: soft under-circle + solid dot.
    const head = headMarker(result);
    expect(head.cx).toBe(10 + 9 * 4);
    expect(head.cy).toBe(200 - 9 * 3);
    expect(head.color).toBe(HEAD_TINT);
    const under = circles(result).find((p) => p.r === HEAD_RADIUS * 2.2)!;
    expect(under).toBeTruthy();
    expect(under.color).toBe(DEFAULT_TRACER_STYLE.glowColor);
    expect(under.cx).toBe(head.cx);
  });

  it('paints the core with a tail→head gradient of three tints', () => {
    const result = render(<TracerOverlay tracer={tracerOf(10)} {...baseProps} />);
    const gradient = canvasChildProps(result).find((p) => 'colors' in p)!;
    expect(gradient).toBeTruthy();
    const tints = cometTints(DEFAULT_TRACER_STYLE.color);
    expect(gradient.colors).toEqual([tints.tail, tints.mid, tints.head]);
    expect(gradient.positions).toEqual([0, 0.55, 1]);
    // Anchored tail (first revealed point) → head (last revealed point).
    expect(gradient.start).toEqual({ x: 10, y: 200 });
    expect(gradient.end).toEqual({ x: 10 + 9 * 4, y: 200 - 9 * 3 });
  });

  it('reveals only the first k(t) points, anchored to timestamps', () => {
    const result = render(
      <TracerOverlay tracer={tracerOf(10)} {...baseProps} revealFraction={0.5} />,
    );
    const svg = (
      coreStroke(result).path as { toSVGString(): string }
    ).toSVGString();
    // t=45 → 5 points visible (timestamps 0..40) → 4 line segments.
    expect(svg.split('L').length).toBe(5);
    const head = headMarker(result);
    expect(head.cx).toBe(10 + 4 * 4);
  });

  it('shows the apex ring only once the reveal passes apexIndex', () => {
    // Apex at index 5; half reveal shows 5 points (k=5, not past the apex).
    const early = render(
      <TracerOverlay
        tracer={tracerOf(10, 5)}
        {...baseProps}
        revealFraction={0.5}
      />,
    );
    expect(apexRing(early)).toBeUndefined();

    const full = render(<TracerOverlay tracer={tracerOf(10, 5)} {...baseProps} />);
    const ring = apexRing(full)!;
    expect(ring).toBeTruthy();
    expect(ring.cx).toBe(10 + 5 * 4);
    expect(ring.cy).toBe(200 - 5 * 3);
    expect(ring.r).toBe(5);
    expect(ring.strokeWidth).toBe(3);
    expect(ring.color).toBe(HEAD_TINT);
    expect(ring.opacity).toBeCloseTo(0.9);
  });

  it('guards an out-of-bounds apexIndex', () => {
    const result = render(
      <TracerOverlay tracer={tracerOf(10, 99)} {...baseProps} />,
    );
    expect(apexRing(result)).toBeUndefined();
  });

  it('renders nothing before two points are visible', () => {
    const zero = render(
      <TracerOverlay tracer={tracerOf(10)} {...baseProps} revealFraction={0} />,
    );
    expect(zero.toJSON()).toBeNull();
    const empty = render(<TracerOverlay tracer={tracerOf(0)} {...baseProps} />);
    expect(empty.toJSON()).toBeNull();
    const zeroView = render(
      <TracerOverlay tracer={tracerOf(10)} {...baseProps} viewWidth={0} />,
    );
    expect(zeroView.toJSON()).toBeNull();
  });

  it('omits the glow stroke when glowWidth is 0', () => {
    const tracer = tracerOf(10);
    tracer.style.glowWidth = 0;
    const result = render(<TracerOverlay tracer={tracer} {...baseProps} />);
    const strokes = strokeElements(result);
    // Core + head segment only.
    expect(strokes).toHaveLength(2);
    expect(coreStroke(result).color).toBe(DEFAULT_TRACER_STYLE.color);
    expect(canvasChildProps(result).find((p) => 'blur' in p)).toBeUndefined();
  });

  it('maps points through the letterbox for rotated video', () => {
    // 100x50 video rotated 90cw in an exactly-fitting 50x100 view.
    const tracer = tracerOf(2);
    tracer.points[0] = { timestampMs: 0, x: 0, y: 50, interpolated: false };
    tracer.points[1] = { timestampMs: 10, x: 100, y: 0, interpolated: false };
    const result = render(
      <TracerOverlay
        tracer={tracer}
        videoWidth={100}
        videoHeight={50}
        rotationDeg={90}
        viewWidth={50}
        viewHeight={100}
      />,
    );
    const svg = (
      coreStroke(result).path as { toSVGString(): string }
    ).toSVGString();
    // (0,50) → (0,0); (100,0) → (50,100).
    expect(svg).toBe('M 0 0 L 50 100');
  });
});
