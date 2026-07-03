/**
 * Module-local capture store (zustand).
 *
 * Review/trim state deliberately lives here rather than in component state:
 * Shot Tracer's known "lost edits on save" failure mode came from keeping
 * edits component-local, so scrub position and trim handles survive
 * re-renders, navigation, and remounts. The upload queue state machine is
 * hosted here too.
 */
import { create } from 'zustand';

import type { FrameSource, VideoAsset } from '../../../types/media';
import { clampTrimWindow, computeTrimWindow, type TrimWindow } from './trim';
import {
  INITIAL_UPLOAD_STATE,
  uploadReducer,
  type UploadEvent,
  type UploadState,
} from './uploadQueue';

export interface CaptureState {
  /** The clip currently under review (not yet published to the session). */
  pendingVideo: VideoAsset | null;
  pendingFrameSource: FrameSource | null;
  trim: TrimWindow | null;
  playheadMs: number;
  upload: UploadState;

  /** Stage a freshly recorded/imported clip and seed a default trim window. */
  setPending(video: VideoAsset, frameSource: FrameSource): void;
  setTrim(window: TrimWindow): void;
  setPlayhead(ms: number): void;
  dispatchUpload(event: UploadEvent): void;
  clearPending(): void;
  reset(): void;
}

const initialState = {
  pendingVideo: null,
  pendingFrameSource: null,
  trim: null,
  playheadMs: 0,
  upload: INITIAL_UPLOAD_STATE,
};

export const useCaptureStore = create<CaptureState>((set, get) => ({
  ...initialState,

  setPending: (video, frameSource) =>
    set({
      pendingVideo: video,
      pendingFrameSource: frameSource,
      trim: computeTrimWindow(video.durationMs),
      playheadMs: 0,
      upload: INITIAL_UPLOAD_STATE,
    }),

  setTrim: (window) => {
    const video = get().pendingVideo;
    if (video === null) {
      return;
    }
    set({ trim: clampTrimWindow(window, video.durationMs) });
  },

  setPlayhead: (ms) => {
    const video = get().pendingVideo;
    const duration = video?.durationMs ?? 0;
    set({ playheadMs: Math.max(0, Math.min(duration, ms)) });
  },

  dispatchUpload: (event) => set({ upload: uploadReducer(get().upload, event) }),

  clearPending: () => set({ ...initialState }),

  reset: () => set({ ...initialState }),
}));
