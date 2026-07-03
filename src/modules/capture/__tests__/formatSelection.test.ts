import type { DeviceCaptureCapabilities } from '../../../adapters/camera/CameraAdapter';
import {
  DEFAULT_CAPTURE_PREFERENCE,
  selectCaptureFormat,
} from '../logic/formatSelection';

const caps = (
  formats: Array<[width: number, height: number, maxFps: number, hdr?: boolean]>,
): DeviceCaptureCapabilities => ({
  formats: formats.map(([width, height, maxFps, hdr = false]) => ({
    width,
    height,
    maxFps,
    supportsHdr: hdr,
  })),
});

describe('selectCaptureFormat', () => {
  it('picks 240fps at the preferred height on a flagship device', () => {
    const device = caps([
      [3840, 2160, 60],
      [1920, 1080, 240],
      [1280, 720, 240],
      [1920, 1080, 60],
    ]);
    const sel = selectCaptureFormat(device, DEFAULT_CAPTURE_PREFERENCE);
    expect(sel).not.toBeNull();
    expect(sel?.fps).toBe(240);
    expect(sel?.height).toBe(1080);
  });

  it('falls back down the ladder on a no-240fps device', () => {
    const device = caps([
      [3840, 2160, 30],
      [1920, 1080, 120],
      [1280, 720, 120],
    ]);
    const sel = selectCaptureFormat(device, DEFAULT_CAPTURE_PREFERENCE);
    expect(sel?.fps).toBe(120);
    expect(sel?.height).toBe(1080);
  });

  it('falls all the way back to 30fps', () => {
    const device = caps([[3840, 2160, 30]]);
    const sel = selectCaptureFormat(device, DEFAULT_CAPTURE_PREFERENCE);
    expect(sel?.fps).toBe(30);
    expect(sel?.height).toBe(2160);
  });

  it('rejects HDR formats even when they are the only high-fps option', () => {
    const device = caps([
      [1920, 1080, 240, true], // HDR-only 240fps: must not be picked
      [1920, 1080, 120],
    ]);
    const sel = selectCaptureFormat(device, DEFAULT_CAPTURE_PREFERENCE);
    expect(sel?.fps).toBe(120);
    expect(sel?.format.supportsHdr).toBe(false);
  });

  it('returns null when every format is HDR', () => {
    const device = caps([
      [1920, 1080, 240, true],
      [1280, 720, 60, true],
    ]);
    expect(selectCaptureFormat(device, DEFAULT_CAPTURE_PREFERENCE)).toBeNull();
  });

  it('returns null when nothing reaches minFps', () => {
    const device = caps([[1920, 1080, 24]]);
    expect(
      selectCaptureFormat(device, { preferFps: 240, minFps: 30, preferHeight: 1080 }),
    ).toBeNull();
  });

  it('respects preferFps as a cap (does not exceed 60 when asked for 60)', () => {
    const device = caps([
      [1920, 1080, 240],
      [1920, 1080, 60],
    ]);
    const sel = selectCaptureFormat(device, {
      preferFps: 60,
      minFps: 30,
      preferHeight: 1080,
    });
    expect(sel?.fps).toBe(60);
  });

  it('tie-breaks equal height distance toward the larger frame', () => {
    const device = caps([
      [1280, 720, 60], // 360 below 1080
      [2560, 1440, 60], // 360 above 1080
    ]);
    const sel = selectCaptureFormat(device, {
      preferFps: 60,
      minFps: 30,
      preferHeight: 1080,
    });
    expect(sel?.height).toBe(1440);
  });

  it('handles an empty capability list', () => {
    expect(selectCaptureFormat(caps([]), DEFAULT_CAPTURE_PREFERENCE)).toBeNull();
  });
});
