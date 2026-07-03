/**
 * Distance/calibration contracts — FROZEN after scaffold. Workstreams never
 * edit this file.
 */

export type ClubType =
  | 'driver'
  | '3-wood'
  | '5-wood'
  | '3-iron'
  | '5-iron'
  | '7-iron'
  | '9-iron'
  | 'pitching-wedge'
  | 'sand-wedge'
  | 'lob-wedge';

export type CameraAngle = 'down-the-line' | 'face-on' | 'behind';

export interface ReferencePoint {
  imageX: number;
  imageY: number;
  worldXYards: number;
  worldZYards: number;
  label: string;
}

export interface CalibrationInput {
  club: ClubType;
  cameraAngle: CameraAngle;
  horizontalFovDeg?: number;
  focalLengthPx?: number;
  ballRadiusAtAddressPx?: number;
  cameraHeightM?: number;
  referencePoints?: ReferencePoint[];
}

export type EstimationMethod = 'homography' | 'physics-fit' | 'club-prior';

export interface DistanceEstimate {
  carryYards: number;
  totalYards: number;
  apexFeet?: number;
  ballSpeedMph?: number;
  launchAngleDeg?: number;
  /** 0..1 */
  confidence: number;
  method: EstimationMethod;
}
