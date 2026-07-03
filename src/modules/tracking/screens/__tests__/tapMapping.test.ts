import { mapTapToVideoPoint } from '../tapMapping';

describe('mapTapToVideoPoint', () => {
  const video = { width: 1920, height: 1080 };

  it('maps taps in an aspect-matched box straight to native pixels', () => {
    const layout = { width: 320, height: 180 }; // exactly 1/6 scale
    expect(mapTapToVideoPoint({ x: 160, y: 90 }, layout, video)).toEqual({
      x: 960,
      y: 540,
    });
    expect(mapTapToVideoPoint({ x: 0, y: 0 }, layout, video)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('round-trips native pixels through a letterboxed (pillarboxed) layout', () => {
    // Wide layout around a 16:9 video: horizontal bars on the sides.
    const layout = { width: 400, height: 180 };
    const scale = Math.min(layout.width / video.width, layout.height / video.height);
    const offsetX = (layout.width - video.width * scale) / 2;
    const native = { x: 569, y: 779 };
    const tap = {
      x: offsetX + native.x * scale,
      y: native.y * scale,
    };
    expect(mapTapToVideoPoint(tap, layout, video)).toEqual(native);
  });

  it('round-trips native pixels through a letterboxed portrait video', () => {
    const portrait = { width: 1080, height: 1920 };
    const layout = { width: 300, height: 200 };
    const scale = Math.min(
      layout.width / portrait.width,
      layout.height / portrait.height,
    );
    const offsetX = (layout.width - portrait.width * scale) / 2;
    const offsetY = (layout.height - portrait.height * scale) / 2;
    const native = { x: 522, y: 505 };
    const tap = {
      x: offsetX + native.x * scale,
      y: offsetY + native.y * scale,
    };
    expect(mapTapToVideoPoint(tap, layout, portrait)).toEqual(native);
  });

  it('clamps taps in the letterbox bars onto the nearest video edge', () => {
    const layout = { width: 400, height: 180 };
    expect(mapTapToVideoPoint({ x: 1, y: 90 }, layout, video)).toEqual({
      x: 0,
      y: 540,
    });
    expect(mapTapToVideoPoint({ x: 399, y: 90 }, layout, video)).toEqual({
      x: video.width - 1,
      y: 540,
    });
  });

  it('degrades to the origin on degenerate dimensions', () => {
    expect(
      mapTapToVideoPoint({ x: 10, y: 10 }, { width: 0, height: 0 }, video),
    ).toEqual({ x: 0, y: 0 });
    expect(
      mapTapToVideoPoint(
        { x: 10, y: 10 },
        { width: 320, height: 180 },
        { width: 0, height: 0 },
      ),
    ).toEqual({ x: 0, y: 0 });
  });
});
