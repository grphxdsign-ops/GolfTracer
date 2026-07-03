/**
 * Pure geometry for mapping a tap inside a contain-fit ("letterboxed") layout
 * box back to native video pixel coordinates. Kept free of any React import
 * so it is unit-testable on its own; rotation is out of scope here because
 * the AnalyzeScreen sizes its tap box from the already-rotated asset dims.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Map a tap in layout coordinates to native video pixels, assuming the video
 * is contain-fit (uniform scale, centered) inside the layout box. Taps in the
 * letterbox bars clamp onto the nearest video edge.
 */
export function mapTapToVideoPoint(tap: Point, layout: Size, video: Size): Point {
  if (video.width <= 0 || video.height <= 0) return { x: 0, y: 0 };
  const scale = Math.min(layout.width / video.width, layout.height / video.height);
  if (!Number.isFinite(scale) || scale <= 0) return { x: 0, y: 0 };
  const offsetX = (layout.width - video.width * scale) / 2;
  const offsetY = (layout.height - video.height * scale) / 2;
  const x = (tap.x - offsetX) / scale;
  const y = (tap.y - offsetY) / scale;
  return {
    x: Math.min(video.width - 1, Math.max(0, Math.round(x))),
    y: Math.min(video.height - 1, Math.max(0, Math.round(y))),
  };
}
