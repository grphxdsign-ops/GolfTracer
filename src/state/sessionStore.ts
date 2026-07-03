/**
 * Cross-module session store — FROZEN after scaffold. Workstreams never edit
 * this file; they read and write only through the actions below.
 *
 * Pipeline: capture publishes (video, frameSource) → tracking consumes
 * frameSource and publishes trackingResult → distance consumes the track and
 * publishes calibration + distance.
 */
import { create } from 'zustand';

import type { FrameSource, VideoAsset } from '../types/media';
import type { TrackingResult } from '../types/tracking';
import type { CalibrationInput, DistanceEstimate } from '../types/distance';

export type TrackingStatus = 'idle' | 'running' | 'done' | 'error';

export interface SessionState {
  video: VideoAsset | null;
  frameSource: FrameSource | null;
  trackingResult: TrackingResult | null;
  trackingStatus: TrackingStatus;
  trackingError: string | null;
  calibration: CalibrationInput | null;
  distance: DistanceEstimate | null;

  setVideo(video: VideoAsset, frameSource: FrameSource): void;
  setTrackingStatus(status: TrackingStatus, error?: string | null): void;
  setTrackingResult(result: TrackingResult): void;
  setCalibration(calibration: CalibrationInput): void;
  setDistance(distance: DistanceEstimate): void;
  reset(): void;
}

const initialState = {
  video: null,
  frameSource: null,
  trackingResult: null,
  trackingStatus: 'idle' as TrackingStatus,
  trackingError: null,
  calibration: null,
  distance: null,
};

export const useSessionStore = create<SessionState>((set) => ({
  ...initialState,

  setVideo: (video, frameSource) =>
    // A new video invalidates everything downstream of capture.
    set({
      video,
      frameSource,
      trackingResult: null,
      trackingStatus: 'idle',
      trackingError: null,
      distance: null,
    }),

  setTrackingStatus: (status, error = null) =>
    set({
      trackingStatus: status,
      trackingError: status === 'error' ? (error ?? 'Unknown error') : null,
    }),

  setTrackingResult: (result) =>
    set({
      trackingResult: result,
      trackingStatus: 'done',
      trackingError: null,
      // A new track invalidates any previously computed distance.
      distance: null,
    }),

  setCalibration: (calibration) => set({ calibration }),

  setDistance: (distance) => set({ distance }),

  reset: () => set({ ...initialState }),
}));
