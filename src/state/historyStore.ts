/**
 * Session history — every completed shot lands here, persisted, so Results
 * can show honest deltas ("vs your driver average") and Home can surface
 * recent sessions. Writers: Results (golf), SoccerResults (soccer).
 *
 * Deltas are only ever computed against PRIOR shots (the average excludes
 * the shot being displayed) and only shown once enough history exists
 * (MIN_SHOTS_FOR_DELTA) — a delta against one old shot is noise dressed as
 * insight (DESIGN.md §8: no fake precision).
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ClubType, EstimationMethod } from '../types/distance';
import type { TrackQuality } from '../types/tracking';
import type { SportId } from '../modules/sports/sportCatalog';

export const MIN_SHOTS_FOR_DELTA = 3;

/**
 * One point of a persisted trace, normalized to the source frame
 * (x,y ∈ 0..1, y down). Traces are stored downsampled (≤24 points) so every
 * shot's tracer stays redrawable in history — Toptracer's most-complained
 * gap is losing the visual trace after the session (docs/RESEARCH-APPS.md).
 */
export interface TracePoint {
  x: number;
  y: number;
}

export interface ShotRecord {
  id: string;
  sport: SportId;
  /** Epoch ms when the shot was recorded into history. */
  at: number;
  quality: TrackQuality;
  /** Redrawable flight path (normalized, downsampled) when tracking had one. */
  tracePoints?: TracePoint[];
  // Golf
  club?: ClubType;
  method?: EstimationMethod;
  carryYards?: number;
  totalYards?: number;
  apexFeet?: number;
  ballSpeedMph?: number;
  launchAngleDeg?: number;
  confidence?: number;
  // Soccer — km/h is the sport's canon (FIFA/UEFA/sports-science
  // convention); the analyzer measures km/h natively.
  shotSpeedKmh?: number;
  onTarget?: boolean;
}

export interface ClubAverages {
  count: number;
  carryYards?: number;
  totalYards?: number;
  ballSpeedMph?: number;
  apexFeet?: number;
}

export interface HistoryState {
  shots: ShotRecord[];
  addShot(shot: Omit<ShotRecord, 'id' | 'at'> & { at?: number }): void;
  /** Delete a single shot (ShotDetail's delete action). Unknown ids no-op. */
  removeShot(id: string): void;
  clear(): void;
}

const MAX_SHOTS = 500;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      shots: [],
      addShot: (shot) =>
        set((s) => ({
          shots: [
            {
              ...shot,
              at: shot.at ?? Date.now(),
              id: `shot-${(shot.at ?? Date.now()).toString(36)}-${(s.shots.length + 1).toString(36)}`,
            },
            ...s.shots,
          ].slice(0, MAX_SHOTS),
        })),
      removeShot: (id) =>
        set((s) => ({ shots: s.shots.filter((shot) => shot.id !== id) })),
      clear: () => set({ shots: [] }),
    }),
    {
      name: 'tracr-history',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

const avg = (xs: number[]): number | undefined =>
  xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

/**
 * Averages for a club across PRIOR golf shots, excluding `excludeId` (the
 * shot currently on screen). Club-prior fallbacks are excluded — averaging
 * our own guesses back into "your average" would launder them into data.
 */
export function clubAverages(
  shots: readonly ShotRecord[],
  club: ClubType,
  excludeId?: string,
): ClubAverages {
  const relevant = shots.filter(
    (s) =>
      s.sport === 'golf' &&
      s.club === club &&
      s.id !== excludeId &&
      s.method !== 'club-prior',
  );
  return {
    count: relevant.length,
    carryYards: avg(relevant.flatMap((s) => (s.carryYards !== undefined ? [s.carryYards] : []))),
    totalYards: avg(relevant.flatMap((s) => (s.totalYards !== undefined ? [s.totalYards] : []))),
    ballSpeedMph: avg(relevant.flatMap((s) => (s.ballSpeedMph !== undefined ? [s.ballSpeedMph] : []))),
    apexFeet: avg(relevant.flatMap((s) => (s.apexFeet !== undefined ? [s.apexFeet] : []))),
  };
}
