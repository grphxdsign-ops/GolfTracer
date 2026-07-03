/**
 * Pure pixel operations on grayscale (luma) buffers.
 *
 * Everything in this file works on the `VideoFrame.luma` Uint8Array contract
 * (row-major, width*height bytes) and is deliberately dependency-free so it
 * runs identically in Jest on Linux and inside the app's JS runtime.
 */
import type { VideoFrame } from '../../../types/media';

export interface Roi {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Blob {
  /** Centroid, in the coordinate space of the labeled buffer. */
  cx: number;
  cy: number;
  /** Foreground pixel count. */
  area: number;
  /** Euclidean perimeter estimate: 4-neighbour exposed-edge count × π/4. */
  perimeter: number;
  /** 4π·area / perimeter², clamped to [0, 1]. ~1 for discs, →0 for bars. */
  circularity: number;
  bbox: Roi;
}

/** Clamp an ROI to the bounds of a width×height image, integer coords. */
export function clampRoi(roi: Roi, width: number, height: number): Roi {
  const x = Math.max(0, Math.min(width - 1, Math.floor(roi.x)));
  const y = Math.max(0, Math.min(height - 1, Math.floor(roi.y)));
  const w = Math.max(1, Math.min(width - x, Math.ceil(roi.w)));
  const h = Math.max(1, Math.min(height - y, Math.ceil(roi.h)));
  return { x, y, w, h };
}

/**
 * Area-averaging downsample of a grayscale frame to `targetWidth`, preserving
 * aspect ratio. Returns the frame unchanged when it is already narrow enough.
 */
export function downsample(frame: VideoFrame, targetWidth: number): VideoFrame {
  if (frame.width <= targetWidth) {
    return frame;
  }
  const scale = frame.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(frame.height / scale));
  const out = new Uint8Array(targetWidth * targetHeight);
  const src = frame.luma;
  for (let ty = 0; ty < targetHeight; ty++) {
    const y0 = Math.min(frame.height - 1, Math.floor(ty * scale));
    const y1 = Math.max(y0 + 1, Math.min(frame.height, Math.floor((ty + 1) * scale)));
    for (let tx = 0; tx < targetWidth; tx++) {
      const x0 = Math.min(frame.width - 1, Math.floor(tx * scale));
      const x1 = Math.max(x0 + 1, Math.min(frame.width, Math.floor((tx + 1) * scale)));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * frame.width;
        for (let x = x0; x < x1; x++) {
          sum += src[row + x]!;
        }
      }
      out[ty * targetWidth + tx] = Math.round(sum / ((y1 - y0) * (x1 - x0)));
    }
  }
  return {
    index: frame.index,
    timestampMs: frame.timestampMs,
    width: targetWidth,
    height: targetHeight,
    luma: out,
  };
}

/** |a - b| per pixel. Buffers must be the same length. */
export function absDiff(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`absDiff: length mismatch (${a.length} vs ${b.length})`);
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = Math.abs(a[i]! - b[i]!);
  }
  return out;
}

/** max(0, a - b) per pixel — "brighter than background" difference. */
export function positiveDiff(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length !== b.length) {
    throw new Error(`positiveDiff: length mismatch (${a.length} vs ${b.length})`);
  }
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    out[i] = d > 0 ? d : 0;
  }
  return out;
}

/**
 * Otsu's method: threshold maximizing between-class variance. Returns a value
 * t such that foreground = pixels with value > t.
 */
export function otsuThreshold(data: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i++) {
    hist[data[i]!]!++;
  }
  const total = data.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) {
    sumAll += v * hist[v]!;
  }
  let sumBg = 0;
  let weightBg = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t]!;
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t]!;
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const variance = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Binary threshold: 1 where data > threshold, else 0. */
export function binarize(data: Uint8Array, threshold: number): Uint8Array {
  const out = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    out[i] = data[i]! > threshold ? 1 : 0;
  }
  return out;
}

/** Copy a rectangular ROI out of a row-major buffer. */
export function extractRoi(
  luma: Uint8Array,
  width: number,
  roi: Roi,
): Uint8Array {
  const out = new Uint8Array(roi.w * roi.h);
  for (let y = 0; y < roi.h; y++) {
    const srcRow = (roi.y + y) * width + roi.x;
    out.set(luma.subarray(srcRow, srcRow + roi.w), y * roi.w);
  }
  return out;
}

/** Mean luma over an optional ROI (whole buffer when omitted). */
export function meanLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  roi?: Roi,
): number {
  const r = clampRoi(roi ?? { x: 0, y: 0, w: width, h: height }, width, height);
  let sum = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    const row = y * width;
    for (let x = r.x; x < r.x + r.w; x++) {
      sum += luma[row + x]!;
    }
  }
  return sum / (r.w * r.h);
}

/**
 * 4-connected component labeling on a 0/1 binary buffer.
 *
 * Iterative flood fill (explicit stack, no recursion). The raw perimeter
 * (count of foreground pixels' 4-neighbours that are background or outside
 * the buffer) is a taxicab length that overestimates the Euclidean perimeter
 * of a disc by 4/π, so it is corrected by ×π/4 before computing circularity
 * = 4π·area/perimeter². Discs then score ≈1 while thin bars stay well below
 * the 0.6 ball threshold.
 */
export function labelComponents(
  binary: Uint8Array,
  width: number,
  height: number,
  minArea = 1,
): Blob[] {
  const visited = new Uint8Array(binary.length);
  const stack = new Int32Array(binary.length);
  const blobs: Blob[] = [];

  for (let start = 0; start < binary.length; start++) {
    if (binary[start] === 0 || visited[start] === 1) continue;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    let area = 0;
    let perimeter = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    while (top > 0) {
      const idx = stack[--top]!;
      const x = idx % width;
      const y = (idx - x) / width;
      area++;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      // Left
      if (x > 0 && binary[idx - 1] === 1) {
        if (visited[idx - 1] === 0) {
          visited[idx - 1] = 1;
          stack[top++] = idx - 1;
        }
      } else {
        perimeter++;
      }
      // Right
      if (x < width - 1 && binary[idx + 1] === 1) {
        if (visited[idx + 1] === 0) {
          visited[idx + 1] = 1;
          stack[top++] = idx + 1;
        }
      } else {
        perimeter++;
      }
      // Up
      if (y > 0 && binary[idx - width] === 1) {
        if (visited[idx - width] === 0) {
          visited[idx - width] = 1;
          stack[top++] = idx - width;
        }
      } else {
        perimeter++;
      }
      // Down
      if (y < height - 1 && binary[idx + width] === 1) {
        if (visited[idx + width] === 0) {
          visited[idx + width] = 1;
          stack[top++] = idx + width;
        }
      } else {
        perimeter++;
      }
    }

    if (area < minArea) continue;
    // Taxicab → Euclidean perimeter correction (×π/4).
    const euclideanPerimeter = perimeter * (Math.PI / 4);
    const circularity = Math.min(
      1,
      (4 * Math.PI * area) /
        Math.max(1, euclideanPerimeter * euclideanPerimeter),
    );
    blobs.push({
      cx: sumX / area,
      cy: sumY / area,
      area,
      perimeter: euclideanPerimeter,
      circularity,
      bbox: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    });
  }

  return blobs;
}
