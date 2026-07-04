import { render } from '@testing-library/react-native';
import { Canvas } from '@shopify/react-native-skia';

import type { SportId } from '../../../modules/sports/sportCatalog';
import { colors, tracer } from '../../theme';
import { SportIcon } from '../SportIcon';

const SPORT_IDS: SportId[] = [
  'golf',
  'soccer',
  'perfected',
  'tennis',
  'baseball',
];

/**
 * The Skia mock's Canvas renders null, so its children never mount; inspect
 * the React elements passed to the Canvas instead (same approach as the
 * TracerOverlay tests).
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
    const el = node as {
      type?: unknown;
      props?: Record<string, unknown>;
    };
    if (el.props) {
      // Function components (the glyphs) need rendering by hand to reach
      // their draw elements.
      if (typeof el.type === 'function') {
        walk((el.type as (p: unknown) => unknown)(el.props));
      }
      out.push(el.props);
      walk(el.props.children);
    }
  };
  walk(canvas.props.children);
  return out;
}

function drawElements(
  result: ReturnType<typeof render>,
): Array<Record<string, unknown>> {
  return canvasChildProps(result).filter(
    (p) => 'path' in p || 'cx' in p,
  );
}

describe('SportIcon', () => {
  it.each(SPORT_IDS)('renders a %s glyph without throwing', (sport) => {
    const result = render(<SportIcon sport={sport} />);
    expect(drawElements(result).length).toBeGreaterThan(0);
  });

  it.each(SPORT_IDS)(
    'strokes %s in the accent color at 2px — never ember',
    (sport) => {
      const result = render(<SportIcon sport={sport} />);
      const draws = drawElements(result);
      const emberValues = Object.values(tracer) as string[];
      for (const draw of draws) {
        expect(draw.color).toBe(colors.accent);
        expect(draw.style).toBe('stroke');
        expect(draw.strokeWidth).toBe(2);
        expect(emberValues).not.toContain(draw.color);
      }
    },
  );

  it.each(SPORT_IDS)('keeps %s paths simple (<12 ops each)', (sport) => {
    const result = render(<SportIcon sport={sport} />);
    for (const draw of drawElements(result)) {
      if (typeof draw.path === 'string') {
        const ops = draw.path.match(/[MLQCZ]/g) ?? [];
        expect(ops.length).toBeLessThan(12);
      }
    }
  });

  it('sizes the canvas from the size prop and defaults to 44', () => {
    const sized = render(<SportIcon sport="golf" size={32} />);
    const canvas = sized.UNSAFE_root.findAll(
      (node: { type: unknown }) => node.type === Canvas,
    )[0];
    expect(canvas?.props.style).toEqual({ width: 32, height: 32 });

    const fallback = render(<SportIcon sport="golf" />);
    const defaultCanvas = fallback.UNSAFE_root.findAll(
      (node: { type: unknown }) => node.type === Canvas,
    )[0];
    expect(defaultCanvas?.props.style).toEqual({ width: 44, height: 44 });
  });
});
