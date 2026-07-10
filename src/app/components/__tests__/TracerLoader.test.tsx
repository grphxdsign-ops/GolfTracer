/**
 * TracerLoader — the loading animation is the logomark drawing itself on
 * (DESIGN.md §1.1). It paints the ember trail from the tracer tokens (never
 * chrome), sizes to the prop, flies a white-hot ball along the arc, and
 * degrades to the static full mark under reduce-motion.
 */
import { AccessibilityInfo } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { Canvas, LinearGradient } from '@shopify/react-native-skia';

import { colors, tracer } from '../../theme';
import { TracerLoader } from '../TracerLoader';

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

describe('TracerLoader', () => {
  it('sizes the container to the size prop', () => {
    const result = render(<TracerLoader size={140} testID="loader" />);
    const box = result.getByTestId('loader');
    // The animated container carries the width/height (style may be an array).
    const flat = ([] as unknown[]).concat(box.props.style).filter(Boolean);
    const dims = flat.find(
      (s) => (s as { width?: number }).width !== undefined,
    ) as { width: number; height: number };
    expect(dims.width).toBe(140);
    expect(dims.height).toBe(140);
  });

  it('paints the ember trail gradient in Skia (tail → mid → head)', () => {
    const result = render(<TracerLoader />);
    const gradient = canvasElements(result).find(
      (e) => e.type === LinearGradient,
    );
    expect(gradient).toBeTruthy();
    expect(gradient!.props.colors).toEqual([
      tracer.tail,
      tracer.mid,
      tracer.head,
    ]);
    expect(gradient!.props.positions).toEqual([0, 0.55, 1]);
  });

  it('never borrows chrome colors in the trail — ember only (§1.1)', () => {
    const result = render(<TracerLoader />);
    const used = canvasElements(result)
      .map((e) => e.props.color)
      .filter((c): c is string => typeof c === 'string');
    for (const c of used) {
      expect([tracer.glow, tracer.tail, tracer.mid, tracer.head]).toContain(c);
      expect(c).not.toBe(colors.primary);
      expect(c).not.toBe(colors.accent);
    }
  });

  it('degrades to the static full mark under reduce-motion', async () => {
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(true);
    const result = render(<TracerLoader size={96} testID="loader" />);
    await act(async () => {});

    // TracerMark renders its own Canvas (mock → null) carrying the testID,
    // and no animated wrapper View — so the host container is gone and the
    // Canvas element still shows the ember gradient.
    expect(result.queryByTestId('loader')).toBeNull();
    const canvas = result.UNSAFE_root.findAll(
      (node: { type: unknown; props?: { testID?: string } }) =>
        node.type === Canvas && node.props?.testID === 'loader',
    )[0];
    expect(canvas).toBeTruthy();
    const hasGradient = canvasElements(result).some(
      (e) => e.type === LinearGradient,
    );
    expect(hasGradient).toBe(true);
    jest.restoreAllMocks();
  });
});
