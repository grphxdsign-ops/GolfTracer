/**
 * Module-local state for the AnalyzeScreen's tap-to-place-ball UX. The point
 * is in NATIVE video pixels (the coordinate space runTracking's ballPoint
 * option expects); the cross-module session store stays frozen, so this
 * lives beside the screen instead.
 */
import { create } from 'zustand';

export interface BallPointState {
  ballPoint: { x: number; y: number } | null;
  setBallPoint(p: { x: number; y: number }): void;
  clear(): void;
}

export const useBallPointStore = create<BallPointState>((set) => ({
  ballPoint: null,
  setBallPoint: (ballPoint) => set({ ballPoint }),
  clear: () => set({ ballPoint: null }),
}));
