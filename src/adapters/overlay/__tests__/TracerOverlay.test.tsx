import { render } from '@testing-library/react-native';
import { Canvas } from '@shopify/react-native-skia';

import { TracerOverlay } from '../TracerOverlay';
import type { TracerPath, TrackPoint } from '../../../types/tracking';
import { DEFAULT_TRACER_STYLE } from '../../../modules/tracking/tracker/tracerGeometry';

function tracerOf(count: number): TracerPath {
  const points: TrackPoint[] = [];
  for (let i = 0; i < count; i++) {
    points.push({
      timestampMs: i * 10,
      x: 10 + i * 4,
      y: 200 - i * 3,
      interpolated: false,
    });
  }
  return { points, apexIndex: count - 1, style: { ...DEFAULT_TRACER_STYLE } };
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

const baseProps = {
  videoWidth: 480,
  videoHeight: 270,
  viewWidth: 480,
  viewHeight: 270,
} as const;

describe('TracerOverlay', () => {
  it('draws a glow stroke under a solid core stroke with round caps', () => {
    const result = render(<TracerOverlay tracer={tracerOf(10)} {...baseProps} />);
    const strokes = strokeElements(result);
    expect(strokes).toHaveLength(2);
    const [glow, core] = strokes;
    expect(glow!.color).toBe(DEFAULT_TRACER_STYLE.glowColor);
    expect(core!.color).toBe(DEFAULT_TRACER_STYLE.color);
    expect(glow!.strokeWidth as number).toBeGreaterThan(
      core!.strokeWidth as number,
    );
    expect(glow!.strokeCap).toBe('round');
    expect(core!.strokeCap).toBe('round');
    // Identity mapping (view == video): path starts at the first point.
    const svg = (core!.path as { toSVGString(): string }).toSVGString();
    expect(svg.startsWith('M 10 200')).toBe(true);
    expect(svg.split('L').length).toBe(10); // moveTo + 9 lineTo

    // Animated head circle at the last visible point.
    const head = canvasChildProps(result).find((p) => 'cx' in p)!;
    expect(head.cx).toBe(10 + 9 * 4);
    expect(head.cy).toBe(200 - 9 * 3);
  });

  it('reveals only the first k(t) points, anchored to timestamps', () => {
    const result = render(
      <TracerOverlay tracer={tracerOf(10)} {...baseProps} revealFraction={0.5} />,
    );
    const strokes = strokeElements(result);
    const svg = (strokes[1]!.path as { toSVGString(): string }).toSVGString();
    // t=45 → 5 points visible (timestamps 0..40) → 4 line segments.
    expect(svg.split('L').length).toBe(5);
    const head = canvasChildProps(result).find((p) => 'cx' in p)!;
    expect(head.cx).toBe(10 + 4 * 4);
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
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.color).toBe(DEFAULT_TRACER_STYLE.color);
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
    const strokes = strokeElements(result);
    const svg = (strokes[1]!.path as { toSVGString(): string }).toSVGString();
    // (0,50) → (0,0); (100,0) → (50,100).
    expect(svg).toBe('M 0 0 L 50 100');
  });
});
