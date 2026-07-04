/**
 * SportIcon — custom Tracr brandkit icons, docs/DESIGN.md §10 (sport tiles).
 *
 * One simple geometric line icon per SportId, drawn with Skia in a 44x44
 * viewport: 2px strokes in `colors.accent` on transparent, no fills. Accent
 * only — the tracer ember palette is video-stage only and never appears in
 * chrome (DESIGN.md §2). Decorative: the owning tile carries the accessible
 * name.
 */
import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';

import type { SportId } from '../../modules/sports/sportCatalog';
import { colors } from '../theme';

export interface SportIconProps {
  sport: SportId;
  /** Rendered square size in pt. Icons are authored in a 44x44 viewport. */
  size?: number;
}

const VIEWPORT = 44;
const STROKE = 2;

const stroke = {
  color: colors.accent,
  style: 'stroke',
  strokeWidth: STROKE,
  strokeCap: 'round',
  strokeJoin: 'round',
} as const;

/** Ball on a tee plus the flight arc — the tracer in one glyph. */
function GolfGlyph(): React.JSX.Element {
  return (
    <>
      <Circle cx={14} cy={16} r={6} {...stroke} />
      {/* Tee: crossbar under the ball + stem. */}
      <Path path="M 10 26 L 18 26 M 14 26 L 14 34" {...stroke} />
      {/* Flight arc rising off the ball. */}
      <Path path="M 21 11 Q 31 2 38 16" {...stroke} />
    </>
  );
}

/** Ball outline with the classic center pentagon panel + three seams. */
function SoccerGlyph(): React.JSX.Element {
  return (
    <>
      <Circle cx={22} cy={22} r={14} {...stroke} />
      <Path
        path="M 22 16.5 L 27.2 20.3 L 25.2 26.4 L 18.8 26.4 L 16.8 20.3 Z"
        {...stroke}
      />
      <Path path="M 22 16.5 L 22 9 M 27.2 20.3 L 34 18 M 16.8 20.3 L 10 18" {...stroke} />
    </>
  );
}

/** Two keyframe diamonds joined by a morph arc — your action, perfected. */
function PerfectedGlyph(): React.JSX.Element {
  return (
    <>
      <Path path="M 12 21 L 18 27 L 12 33 L 6 27 Z" {...stroke} />
      <Path path="M 32 11 L 38 17 L 32 23 L 26 17 Z" {...stroke} />
      <Path path="M 15 22 Q 19 13 26 12" {...stroke} />
    </>
  );
}

/** Racket head with cross strings + angled handle. */
function TennisGlyph(): React.JSX.Element {
  return (
    <>
      <Circle cx={18} cy={16} r={10} {...stroke} />
      <Path path="M 18 7 L 18 25 M 9.5 16 L 26.5 16" {...stroke} />
      <Path path="M 25 24 L 35 36" {...stroke} />
    </>
  );
}

/** Ball outline with the two facing stitch arcs. */
function BaseballGlyph(): React.JSX.Element {
  return (
    <>
      <Circle cx={22} cy={22} r={14} {...stroke} />
      <Path path="M 12.5 12 Q 19 22 12.5 32" {...stroke} />
      <Path path="M 31.5 12 Q 25 22 31.5 32" {...stroke} />
    </>
  );
}

const glyphs: Record<SportId, () => React.JSX.Element> = {
  golf: GolfGlyph,
  soccer: SoccerGlyph,
  perfected: PerfectedGlyph,
  tennis: TennisGlyph,
  baseball: BaseballGlyph,
};

export function SportIcon({
  sport,
  size = VIEWPORT,
}: SportIconProps): React.JSX.Element {
  const Glyph = glyphs[sport];
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: size / VIEWPORT }]}>
        <Glyph />
      </Group>
    </Canvas>
  );
}
