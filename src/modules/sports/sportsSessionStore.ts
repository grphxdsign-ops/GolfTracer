/**
 * Sports session store — module-local zustand state shared by the sport
 * analysis workstreams (mirrors the distance module's local store; the
 * frozen cross-module sessionStore is never touched). Also defines the
 * result types the producers (soccer analysis, perfected action) and their
 * results screens agree on.
 */
import { create } from 'zustand';

import type { BallFlightResult, Vec3 } from './engine/ballFlight';
import type { SportId } from './engine/sportProfile';
import type { Keypoint, PoseFrame } from './pose/PoseAdapter';
import type { JointAngleTable } from './pose/jointAngles';

/** One monocular 3D ball fix in the anchored world frame. */
export interface BallPositionSample {
  timestampMs: number;
  /** Ball position, m (goal/court-anchored world frame). */
  positionM: Vec3;
  /** Instantaneous speed at this sample, m/s. */
  speedMps: number;
  /** Apparent ball diameter in the frame, px (the depth cue). */
  apparentDiameterPx: number;
}

/** Goal-plane cross detector output. */
export interface GoalCrossing {
  /** Whether the ball's track crossed the goal plane. */
  crossed: boolean;
  /** Interpolated crossing time, ms (when crossed). */
  timestampMs?: number;
  /** Crossing point across the goal mouth (0 = left post), m. */
  xM?: number;
  /** Crossing height above the ground, m. */
  yM?: number;
  /** GOAL? verdict: crossed inside the posts and under the crossbar. */
  isGoal: boolean;
}

/** Analysis of a single take (one kick/shot in one clip). */
export interface SoccerTakeResult {
  /** User-facing label, e.g. 'fast take' / 'slow take'. */
  label: string;
  samples: BallPositionSample[];
  peakSpeedMps: number;
  peakSpeedKmh: number;
  /** Ball distance to the goal line at contact, m (when anchored). */
  distanceToGoalM: number | null;
  crossing: GoalCrossing | null;
  contactTimestampMs: number | null;
  poseAtContact: PoseFrame | null;
  jointAnglesAtContact: JointAngleTable | null;
}

/** Full soccer analysis: one or more takes plus cross-take insights. */
export interface SoccerAnalysisResult {
  takes: SoccerTakeResult[];
  /** Index into `takes` of the fastest take. */
  bestTakeIndex: number;
  /** Coaching insights (e.g. joint-angle deltas between fast/slow takes). */
  insights: string[];
}

/** One rendered pose of the perfected-action dummy. */
export interface PerfectedPoseFrame {
  timestampMs: number;
  /** Dummy skeleton joints, 33-index BlazePose order (world meters). */
  keypoints: Keypoint[];
}

/** Perfected-action output: morphed dummy motion + simulated ball flight. */
export interface PerfectedResult {
  sport: SportId;
  /** The dummy performing the perfected action. */
  morphedFrames: PerfectedPoseFrame[];
  /** The perfected ball flight simulated from the improved contact. */
  flight: BallFlightResult;
  /** Biomechanical target angles the morph converged to. */
  targetAngles: JointAngleTable;
  /** What changed vs the measured motion, for the results screen. */
  notes: string[];
}

export interface SportsSessionState {
  soccerResult: SoccerAnalysisResult | null;
  perfectedResult: PerfectedResult | null;

  setSoccerResult(result: SoccerAnalysisResult | null): void;
  setPerfectedResult(result: PerfectedResult | null): void;
  reset(): void;
}

export const useSportsSessionStore = create<SportsSessionState>((set) => ({
  soccerResult: null,
  perfectedResult: null,

  setSoccerResult: (soccerResult) => set({ soccerResult }),
  setPerfectedResult: (perfectedResult) => set({ perfectedResult }),
  reset: () => set({ soccerResult: null, perfectedResult: null }),
}));
