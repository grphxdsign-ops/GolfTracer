/**
 * Module-local draft state for the calibration screen. The finished draft
 * is published to the cross-module session store as a CalibrationInput via
 * setCalibration; this store only holds in-progress edits.
 */
import { create } from 'zustand';

import type {
  CalibrationInput,
  CameraAngle,
  ClubType,
  ReferencePoint,
} from '../../types';

export interface DistanceDraftState {
  club: ClubType;
  cameraAngle: CameraAngle;
  /** Raw text of the optional FOV input ('' = unset). */
  fovText: string;
  referencePoints: ReferencePoint[];

  setClub(club: ClubType): void;
  setCameraAngle(angle: CameraAngle): void;
  setFovText(text: string): void;
  addReferencePoint(point: ReferencePoint): void;
  updateReferencePoint(index: number, patch: Partial<ReferencePoint>): void;
  removeReferencePoint(index: number): void;
  resetDraft(): void;
}

const initialDraft = {
  club: 'driver' as ClubType,
  cameraAngle: 'down-the-line' as CameraAngle,
  fovText: '',
  referencePoints: [] as ReferencePoint[],
};

export const useDistanceStore = create<DistanceDraftState>((set) => ({
  ...initialDraft,

  setClub: (club) => set({ club }),
  setCameraAngle: (cameraAngle) => set({ cameraAngle }),
  setFovText: (fovText) => set({ fovText }),
  addReferencePoint: (point) =>
    set((s) => ({ referencePoints: [...s.referencePoints, point] })),
  updateReferencePoint: (index, patch) =>
    set((s) => ({
      referencePoints: s.referencePoints.map((p, i) =>
        i === index ? { ...p, ...patch } : p,
      ),
    })),
  removeReferencePoint: (index) =>
    set((s) => ({
      referencePoints: s.referencePoints.filter((_, i) => i !== index),
    })),
  resetDraft: () => set({ ...initialDraft, referencePoints: [] }),
}));

/** Assemble the published CalibrationInput from the current draft. */
export function draftToCalibrationInput(
  draft: Pick<
    DistanceDraftState,
    'club' | 'cameraAngle' | 'fovText' | 'referencePoints'
  >,
): CalibrationInput {
  const fov = Number.parseFloat(draft.fovText);
  const input: CalibrationInput = {
    club: draft.club,
    cameraAngle: draft.cameraAngle,
  };
  if (Number.isFinite(fov) && fov > 0 && fov < 180) {
    input.horizontalFovDeg = fov;
  }
  if (draft.referencePoints.length > 0) {
    input.referencePoints = [...draft.referencePoints];
  }
  return input;
}
