import {
  validateImportedVideo,
  type ImportedVideoMeta,
  type ValidationIssueCode,
} from '../logic/validation';

const meta = (overrides: Partial<ImportedVideoMeta> = {}): ImportedVideoMeta => ({
  durationMs: 12000,
  fps: 30,
  rotationDeg: 0,
  width: 1920,
  height: 1080,
  ...overrides,
});

const codesOf = (m: ImportedVideoMeta): ValidationIssueCode[] => {
  const result = validateImportedVideo(m);
  return result.ok ? [] : result.issues.map((i) => i.code);
};

describe('validateImportedVideo', () => {
  it.each<[Partial<ImportedVideoMeta>, ValidationIssueCode[]]>([
    [{}, []],
    [{ durationMs: 1499 }, ['too-short']],
    [{ durationMs: 1500 }, []],
    [{ durationMs: 60000 }, []],
    [{ durationMs: 60001 }, ['too-long']],
    [{ fps: 23.9 }, ['low-fps']],
    [{ fps: 24 }, []],
    [{ rotationDeg: 90 }, []],
    [{ rotationDeg: 270 }, []],
    [{ rotationDeg: 45 }, ['unsupported-rotation']],
    [{ rotationDeg: -90 }, ['unsupported-rotation']],
    [
      { durationMs: 900, fps: 15, rotationDeg: 13 },
      ['too-short', 'low-fps', 'unsupported-rotation'],
    ],
  ])('validates %j → issues %j', (overrides, expected) => {
    expect(codesOf(meta(overrides))).toEqual(expected);
  });

  it('provides a human-readable message per issue', () => {
    const result = validateImportedVideo(meta({ durationMs: 500 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.message).toMatch(/too short/i);
    }
  });
});
