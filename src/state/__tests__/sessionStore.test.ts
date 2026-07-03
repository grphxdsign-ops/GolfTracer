import { useSessionStore } from '../sessionStore';
import type { FrameSource, VideoAsset, VideoFrame } from '../../types/media';
import type { TrackingResult } from '../../types/tracking';
import type { CalibrationInput, DistanceEstimate } from '../../types/distance';

const makeAsset = (id: string): VideoAsset => ({
  id,
  uri: `file:///videos/${id}.mov`,
  width: 1920,
  height: 1080,
  fps: 240,
  recordedFps: 240,
  durationMs: 4000,
  rotationDeg: 0,
  isSlowMotion: true,
  source: 'recorded',
  createdAt: 1_700_000_000_000,
});

const makeFrameSource = (asset: VideoAsset): FrameSource => ({
  asset,
  frames(): AsyncIterable<VideoFrame> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: true as const, value: undefined }),
        };
      },
    };
  },
  frameAt: async (timestampMs: number): Promise<VideoFrame> => ({
    index: 0,
    timestampMs,
    width: asset.width,
    height: asset.height,
    luma: new Uint8Array(asset.width * asset.height),
  }),
});

const makeTrackingResult = (): TrackingResult => ({
  track: {
    observations: [],
    smoothedPath: [],
    impactFrameIndex: 12,
    impactTimestampMs: 50,
    apexPointIndex: 0,
    frameWidth: 1920,
    frameHeight: 1080,
    quality: 'high',
  },
  tracer: {
    points: [],
    apexIndex: 0,
    style: { color: '#ff3b30', glowColor: '#ff9500', strokeWidth: 4, glowWidth: 12 },
  },
});

const calibration: CalibrationInput = {
  club: 'driver',
  cameraAngle: 'down-the-line',
  horizontalFovDeg: 65,
};

const distance: DistanceEstimate = {
  carryYards: 245,
  totalYards: 262,
  confidence: 0.8,
  method: 'physics-fit',
};

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('starts empty and idle', () => {
    const s = useSessionStore.getState();
    expect(s.video).toBeNull();
    expect(s.frameSource).toBeNull();
    expect(s.trackingResult).toBeNull();
    expect(s.trackingStatus).toBe('idle');
    expect(s.trackingError).toBeNull();
    expect(s.calibration).toBeNull();
    expect(s.distance).toBeNull();
  });

  it('stores video and frame source together', () => {
    const asset = makeAsset('a');
    const fs = makeFrameSource(asset);
    useSessionStore.getState().setVideo(asset, fs);

    const s = useSessionStore.getState();
    expect(s.video).toBe(asset);
    expect(s.frameSource).toBe(fs);
  });

  it('setting a new video resets downstream tracking and distance state', () => {
    const first = makeAsset('first');
    const store = useSessionStore.getState();
    store.setVideo(first, makeFrameSource(first));
    store.setTrackingStatus('running');
    store.setTrackingResult(makeTrackingResult());
    store.setCalibration(calibration);
    store.setDistance(distance);

    expect(useSessionStore.getState().trackingResult).not.toBeNull();
    expect(useSessionStore.getState().distance).not.toBeNull();

    const second = makeAsset('second');
    useSessionStore.getState().setVideo(second, makeFrameSource(second));

    const s = useSessionStore.getState();
    expect(s.video).toBe(second);
    expect(s.trackingResult).toBeNull();
    expect(s.trackingStatus).toBe('idle');
    expect(s.trackingError).toBeNull();
    expect(s.distance).toBeNull();
  });

  it('setTrackingResult marks tracking done and invalidates stale distance', () => {
    const store = useSessionStore.getState();
    store.setDistance(distance);
    store.setTrackingResult(makeTrackingResult());

    const s = useSessionStore.getState();
    expect(s.trackingStatus).toBe('done');
    expect(s.trackingError).toBeNull();
    expect(s.distance).toBeNull();
  });

  it('tracks error status with a message and clears it on non-error status', () => {
    const store = useSessionStore.getState();
    store.setTrackingStatus('error', 'ball not found');
    expect(useSessionStore.getState().trackingError).toBe('ball not found');

    store.setTrackingStatus('running');
    expect(useSessionStore.getState().trackingStatus).toBe('running');
    expect(useSessionStore.getState().trackingError).toBeNull();
  });

  it('reset returns to the initial state', () => {
    const asset = makeAsset('a');
    const store = useSessionStore.getState();
    store.setVideo(asset, makeFrameSource(asset));
    store.setCalibration(calibration);
    store.setDistance(distance);

    useSessionStore.getState().reset();

    const s = useSessionStore.getState();
    expect(s.video).toBeNull();
    expect(s.frameSource).toBeNull();
    expect(s.calibration).toBeNull();
    expect(s.distance).toBeNull();
    expect(s.trackingStatus).toBe('idle');
  });
});
