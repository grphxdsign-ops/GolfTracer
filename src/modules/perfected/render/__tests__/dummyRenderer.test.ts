/**
 * Dummy renderer tests: geometric consistency of the emitted frame
 * sequence — every shape inside the frame, bone lines connecting joint
 * circles, and a ball-flight curve monotone in flight time.
 */
import { buildPerfectedResult, demoMeasuredFrames } from '../../perfectedPipeline';
import { renderPerfectedFrames, type RenderedFrame } from '../dummyRenderer';

const WIDTH = 640;
const HEIGHT = 360;

const result = buildPerfectedResult({
  sport: 'soccer',
  measuredFrames: demoMeasuredFrames(),
  strength: 1,
});
const rendered = renderPerfectedFrames(result.morphedFrames, result.flight, {
  widthPx: WIDTH,
  heightPx: HEIGHT,
});

const inFrame = (x: number, y: number): boolean =>
  x >= 0 && x <= WIDTH && y >= 0 && y <= HEIGHT;

const circleCenters = (frame: RenderedFrame): { x: number; y: number }[] =>
  frame.shapes.flatMap((s) =>
    s.kind === 'circle' && s.role !== 'ball' ? [{ x: s.cx, y: s.cy }] : [],
  );

describe('renderPerfectedFrames geometry', () => {
  it('emits one frame per pose frame, timestamps preserved', () => {
    expect(rendered).toHaveLength(result.morphedFrames.length);
    rendered.forEach((frame, i) => {
      expect(frame.index).toBe(i);
      expect(frame.timestampMs).toBe(result.morphedFrames[i]!.timestampMs);
      expect(frame.widthPx).toBe(WIDTH);
      expect(frame.heightPx).toBe(HEIGHT);
    });
  });

  it('keeps every joint, bone and flight shape inside the frame', () => {
    for (const frame of rendered) {
      for (const shape of frame.shapes) {
        if (shape.kind === 'circle') {
          expect(inFrame(shape.cx - shape.r, shape.cy - shape.r)).toBe(true);
          expect(inFrame(shape.cx + shape.r, shape.cy + shape.r)).toBe(true);
        } else {
          expect(inFrame(shape.x1, shape.y1)).toBe(true);
          expect(inFrame(shape.x2, shape.y2)).toBe(true);
        }
      }
    }
  });

  it('preserves connectivity: every bone endpoint sits on a joint (or girdle midpoint)', () => {
    for (const frame of rendered) {
      const centers = circleCenters(frame);
      const anchors = [...centers];
      // The spine connects the virtual pelvis/chest: midpoints of joint pairs.
      for (let i = 0; i < centers.length; i++) {
        for (let j = i + 1; j < centers.length; j++) {
          anchors.push({
            x: (centers[i]!.x + centers[j]!.x) / 2,
            y: (centers[i]!.y + centers[j]!.y) / 2,
          });
        }
      }
      const onAnchor = (x: number, y: number): boolean =>
        anchors.some((a) => Math.hypot(a.x - x, a.y - y) < 1e-6);
      const bones = frame.shapes.filter(
        (s) => s.kind === 'line' && s.role === 'bone',
      );
      expect(bones.length).toBeGreaterThan(8);
      for (const bone of bones) {
        if (bone.kind !== 'line') continue;
        expect(onAnchor(bone.x1, bone.y1)).toBe(true);
        expect(onAnchor(bone.x2, bone.y2)).toBe(true);
      }
    }
  });

  it('draws a ball-flight curve monotone in flight time', () => {
    const flightLines = rendered[0]!.shapes.filter(
      (s) => s.kind === 'line' && s.role === 'flight',
    );
    expect(flightLines.length).toBeGreaterThan(4);
    let prevEnd: { x: number; y: number } | null = null;
    for (const line of flightLines) {
      if (line.kind !== 'line') continue;
      // Downrange (view x) never reverses.
      expect(line.x2).toBeGreaterThanOrEqual(line.x1 - 1e-6);
      if (prevEnd) {
        expect(line.x1).toBeCloseTo(prevEnd.x, 6);
        expect(line.y1).toBeCloseTo(prevEnd.y, 6);
      }
      prevEnd = { x: line.x2, y: line.y2 };
    }
  });

  it('animates the ball downrange with the playback clock', () => {
    const ballXs = rendered.map((frame) => {
      const ball = frame.shapes.find(
        (s) => s.kind === 'circle' && s.role === 'ball',
      );
      expect(ball).toBeDefined();
      return ball!.kind === 'circle' ? ball!.cx : 0;
    });
    for (let i = 1; i < ballXs.length; i++) {
      expect(ballXs[i]!).toBeGreaterThanOrEqual(ballXs[i - 1]! - 1e-6);
    }
    expect(ballXs[ballXs.length - 1]!).toBeGreaterThan(ballXs[0]!);
  });

  it('rejects empty input', () => {
    expect(() => renderPerfectedFrames([], result.flight)).toThrow(
      /at least one frame/,
    );
  });
});
