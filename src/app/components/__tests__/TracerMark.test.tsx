/**
 * TracerMark — the logomark IS the tracer (DESIGN.md §1.1): the crescent
 * must be painted from the ember tracer tokens (gradient tail → mid →
 * head over the glow) and never from chrome colors.
 */
import { render } from '@testing-library/react-native';
import { Canvas, LinearGradient, Path } from '@shopify/react-native-skia';

import { colors, tracer } from '../../theme';
import { TracerMark } from '../TracerMark';

function canvasElements(
  result: ReturnType<typeof render>,
): Array<{ type: unknown; props: Record<string, unknown> }> {
  const canvas = result.UNSAFE_root.findAll(
    (node: { type: unknown }) => node.type === Canvas,
  )[0];
  if (!canvas) return [];
  const out: Array<{ type: unknown; props: Record<string, unknown> }> = [];
  const walk = (node: unknown): void => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.props) {
      out.push(el as { type: unknown; props: Record<string, unknown> });
      walk(el.props.children);
    }
  };
  walk(canvas.props.children);
  return out;
}

describe('TracerMark', () => {
  it('sizes the canvas square to the size prop', () => {
    // The mocked Canvas renders null, so query the element, not the tree.
    const result = render(<TracerMark size={120} testID="mark" />);
    const canvas = result.UNSAFE_root.findAll(
      (node: { type: unknown }) => node.type === Canvas,
    )[0];
    expect(canvas).toBeTruthy();
    expect(canvas!.props.style).toEqual({ width: 120, height: 120 });
    expect(canvas!.props.testID).toBe('mark');
  });

  it('paints the crescent with the ember gradient over the glow', () => {
    const result = render(<TracerMark />);
    const els = canvasElements(result);

    const gradient = els.find((e) => e.type === LinearGradient);
    expect(gradient).toBeTruthy();
    expect(gradient!.props.colors).toEqual([
      tracer.tail,
      tracer.mid,
      tracer.head,
    ]);
    expect(gradient!.props.positions).toEqual([0, 0.55, 1]);

    const glowPath = els.find(
      (e) => e.type === Path && e.props.color === tracer.glow,
    );
    expect(glowPath).toBeTruthy();

    // A white-hot ball marks the head — the tracer's leading edge.
    const ballHead = els.find((e) => e.props.color === tracer.head);
    expect(ballHead).toBeTruthy();
  });

  it('never borrows chrome colors — ember only (DESIGN.md §1.1)', () => {
    const result = render(<TracerMark />);
    const used = canvasElements(result)
      .map((e) => e.props.color)
      .filter((c): c is string => typeof c === 'string');
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) {
      expect([tracer.glow, tracer.tail, tracer.mid, tracer.head]).toContain(c);
      expect(c).not.toBe(colors.primary);
      expect(c).not.toBe(colors.accent);
    }
  });
});
