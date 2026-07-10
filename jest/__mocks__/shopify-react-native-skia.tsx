/**
 * Manual mock for @shopify/react-native-skia.
 * Provides null-rendering components plus a chainable Skia.Path stub so the
 * tracer overlay adapter can build paths in unit tests without native Skia.
 */
import type { ReactNode } from 'react';

type AnyProps = Record<string, unknown> & { children?: ReactNode };

/**
 * Each export gets its OWN null component so tests can discriminate
 * elements by type (e.g. find the LinearGradient inside a Path).
 */
const makeNull = () => (_props: AnyProps): null => null;

export const Canvas = makeNull();
export const Group = makeNull();
export const Path = makeNull();
export const Circle = makeNull();
export const Line = makeNull();
export const Paint = makeNull();
export const BlurMask = makeNull();
export const LinearGradient = makeNull();
export const RadialGradient = makeNull();

export const vec = (x: number, y: number) => ({ x, y });

export interface SkPathStub {
  moveTo(x: number, y: number): SkPathStub;
  lineTo(x: number, y: number): SkPathStub;
  quadTo(cx: number, cy: number, x: number, y: number): SkPathStub;
  cubicTo(
    c1x: number,
    c1y: number,
    c2x: number,
    c2y: number,
    x: number,
    y: number,
  ): SkPathStub;
  close(): SkPathStub;
  reset(): SkPathStub;
  toSVGString(): string;
  readonly commands: string[];
}

const makePath = (): SkPathStub => {
  const commands: string[] = [];
  const path: SkPathStub = {
    commands,
    moveTo(x, y) {
      commands.push(`M ${x} ${y}`);
      return path;
    },
    lineTo(x, y) {
      commands.push(`L ${x} ${y}`);
      return path;
    },
    quadTo(cx, cy, x, y) {
      commands.push(`Q ${cx} ${cy} ${x} ${y}`);
      return path;
    },
    cubicTo(c1x, c1y, c2x, c2y, x, y) {
      commands.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
      return path;
    },
    close() {
      commands.push('Z');
      return path;
    },
    reset() {
      commands.length = 0;
      return path;
    },
    toSVGString() {
      return commands.join(' ');
    },
  };
  return path;
};

export const Skia = {
  Path: {
    Make: makePath,
  },
  Color: (color: string): string => color,
};

export const useCanvasRef = () => ({ current: null });
