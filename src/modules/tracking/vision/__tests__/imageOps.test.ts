import {
  absDiff,
  binarize,
  clampRoi,
  downsample,
  extractRoi,
  labelComponents,
  meanLuma,
  otsuThreshold,
  positiveDiff,
} from '../imageOps';
import type { VideoFrame } from '../../../../types/media';

/** Build a binary buffer from ASCII art ('X' = 1). */
function bitmap(rows: string[]): { data: Uint8Array; width: number; height: number } {
  const width = rows[0]!.length;
  const height = rows.length;
  const data = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = row[x] === 'X' ? 1 : 0;
    }
  });
  return { data, width, height };
}

function frameOf(width: number, height: number, fill: (x: number, y: number) => number): VideoFrame {
  const luma = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      luma[y * width + x] = fill(x, y);
    }
  }
  return { index: 0, timestampMs: 0, width, height, luma };
}

describe('downsample', () => {
  it('halves dimensions and box-averages values', () => {
    const frame = frameOf(8, 4, (x) => (x < 4 ? 100 : 200));
    const out = downsample(frame, 4);
    expect(out.width).toBe(4);
    expect(out.height).toBe(2);
    expect(out.luma.length).toBe(8);
    // Left half all 100, right half all 200 (2x2 boxes are uniform).
    expect(out.luma[0]).toBe(100);
    expect(out.luma[3]).toBe(200);
  });

  it('returns the frame untouched when already narrow enough', () => {
    const frame = frameOf(4, 4, () => 42);
    expect(downsample(frame, 480)).toBe(frame);
  });

  it('averages mixed boxes', () => {
    // 2x1 -> 1x1 (aspect rounds to 1): average of 0 and 200 = 100.
    const frame = frameOf(2, 2, (x) => (x === 0 ? 0 : 200));
    const out = downsample(frame, 1);
    expect(out.width).toBe(1);
    expect(out.luma[0]).toBe(100);
  });
});

describe('diffs and thresholding', () => {
  it('absDiff and positiveDiff behave as expected', () => {
    const a = new Uint8Array([10, 200, 50]);
    const b = new Uint8Array([30, 100, 50]);
    expect(Array.from(absDiff(a, b))).toEqual([20, 100, 0]);
    expect(Array.from(positiveDiff(a, b))).toEqual([0, 100, 0]);
    expect(() => absDiff(a, new Uint8Array(2))).toThrow('length mismatch');
  });

  it('binarize thresholds strictly above', () => {
    const out = binarize(new Uint8Array([0, 10, 11, 255]), 10);
    expect(Array.from(out)).toEqual([0, 0, 1, 1]);
  });

  it('otsu separates a bimodal distribution', () => {
    const data = new Uint8Array(200);
    for (let i = 0; i < 100; i++) data[i] = 20 + (i % 3);
    for (let i = 100; i < 200; i++) data[i] = 220 + (i % 3);
    const t = otsuThreshold(data);
    expect(t).toBeGreaterThanOrEqual(22);
    expect(t).toBeLessThan(220);
  });
});

describe('clampRoi / extractRoi / meanLuma', () => {
  it('clamps out-of-bounds ROIs', () => {
    const r = clampRoi({ x: -10, y: 5, w: 100, h: 100 }, 20, 10);
    expect(r).toEqual({ x: 0, y: 5, w: 20, h: 5 });
  });

  it('extracts an ROI and computes means', () => {
    const frame = frameOf(4, 4, (x, y) => (y < 2 ? 10 : 90));
    const roi = extractRoi(frame.luma, 4, { x: 0, y: 2, w: 4, h: 2 });
    expect(Array.from(roi)).toEqual(new Array(8).fill(90));
    expect(meanLuma(frame.luma, 4, 4)).toBe(50);
    expect(meanLuma(frame.luma, 4, 4, { x: 0, y: 0, w: 4, h: 2 })).toBe(10);
  });
});

describe('labelComponents', () => {
  it('finds blobs with correct area, centroid, and bbox', () => {
    const { data, width, height } = bitmap([
      '..........',
      '.XX...X...',
      '.XX...X...',
      '......X...',
      '..........',
    ]);
    const blobs = labelComponents(data, width, height);
    expect(blobs).toHaveLength(2);
    const square = blobs.find((b) => b.area === 4)!;
    const bar = blobs.find((b) => b.area === 3)!;
    expect(square.cx).toBeCloseTo(1.5);
    expect(square.cy).toBeCloseTo(1.5);
    expect(square.bbox).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(bar.cx).toBeCloseTo(6);
    expect(bar.cy).toBeCloseTo(2);
    expect(bar.bbox).toEqual({ x: 6, y: 1, w: 1, h: 3 });
  });

  it('does not merge diagonal-only neighbours (4-connectivity)', () => {
    const { data, width, height } = bitmap(['X.', '.X']);
    const blobs = labelComponents(data, width, height);
    expect(blobs).toHaveLength(2);
  });

  it('respects minArea', () => {
    const { data, width, height } = bitmap(['X.XX']);
    expect(labelComponents(data, width, height, 2)).toHaveLength(1);
  });

  it('rates discs as far more circular than bars', () => {
    // Disc of radius 8 in a 32x32 buffer.
    const size = 32;
    const disc = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - 16;
        const dy = y - 16;
        if (dx * dx + dy * dy <= 64) disc[y * size + x] = 1;
      }
    }
    const discBlob = labelComponents(disc, size, size)[0]!;

    const bar = new Uint8Array(size * size);
    for (let x = 4; x < 28; x++) {
      bar[10 * size + x] = 1;
      bar[11 * size + x] = 1;
    }
    const barBlob = labelComponents(bar, size, size)[0]!;

    expect(discBlob.circularity).toBeGreaterThan(0.8);
    expect(barBlob.circularity).toBeLessThan(0.5);
    expect(discBlob.circularity).toBeGreaterThan(barBlob.circularity);
  });
});
