/**
 * Tracking contracts — FROZEN after scaffold. Workstreams never edit this file.
 */

export interface BallObservation {
  frameIndex: number;
  timestampMs: number;
  cx: number;
  cy: number;
  radiusPx: number;
  confidence: number;
}

export interface TrackPoint {
  timestampMs: number;
  x: number;
  y: number;
  interpolated: boolean;
}

export type TrackQuality = 'high' | 'medium' | 'low' | 'failed';

export interface BallTrack {
  observations: BallObservation[];
  smoothedPath: TrackPoint[];
  impactFrameIndex: number;
  impactTimestampMs: number;
  apexPointIndex: number;
  landingPointIndex?: number;
  frameWidth: number;
  frameHeight: number;
  quality: TrackQuality;
}

export interface TracerStyle {
  color: string;
  glowColor: string;
  strokeWidth: number;
  glowWidth: number;
}

export interface TracerPath {
  points: TrackPoint[];
  apexIndex: number;
  style: TracerStyle;
}

export interface TrackingResult {
  track: BallTrack;
  tracer: TracerPath;
}

export interface BallDetector {
  detect(
    frame: import('./media').VideoFrame,
    roi?: { x: number; y: number; w: number; h: number },
  ): Promise<BallObservation[]>;
}
