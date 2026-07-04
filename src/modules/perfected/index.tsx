/**
 * Perfected-action module (W3): the biomechanically-perfected dummy.
 *
 * Pipeline: user PoseFrames -> DummySkeleton (bone lengths calibrated once
 * from the user's own pose) -> DTW-aligned quaternion morph toward the
 * per-sport BIOMECH_TARGETS expert track -> procedural dummy renderer
 * (geometry frames beside the simulated perfected ball flight) -> video
 * exporter adapter. Registers the 'PerfectedAction' and 'PerfectedResults'
 * routes through the shared registry (mounted via App.tsx's existing route
 * cast; navigation goes through navigateSport).
 */
import type { ScreenRegistration } from '../../types/modules';
import { PerfectedActionScreen } from './screens/PerfectedActionScreen';
import { PerfectedResultsScreen } from './screens/PerfectedResultsScreen';

export type { DummySkeleton } from './skeleton/dummyModel';
export {
  CHAIN_BONES,
  calibrateSkeleton,
  pickCalibrationFrame,
} from './skeleton/dummyModel';
export { BIOMECH_TARGETS } from './morph/targets';
export type { BiomechMetricTarget, SportBiomechTargets } from './morph/targets';
export { dtwAlign } from './morph/dtw';
export type { DtwAlignment } from './morph/dtw';
export {
  contactFrameIndex,
  morphMotion,
  samplePoseFrames,
} from './morph/morphMotion';
export type { MorphedMotion, MotionAlignment } from './morph/morphMotion';
export { renderPerfectedFrames } from './render/dummyRenderer';
export type {
  RenderedFrame,
  RenderShape,
  RenderPerfectedOptions,
} from './render/dummyRenderer';
export {
  FakeVideoExporter,
  NativeVideoExporter,
  createVideoExporter,
} from './export/VideoExporter';
export type {
  ExportedVideo,
  VideoExporter,
  VideoExportRequest,
} from './export/VideoExporter';
export { buildPerfectedResult, demoMeasuredFrames } from './perfectedPipeline';
export type { PerfectActionInput } from './perfectedPipeline';

export const perfectedModule: { name: string; screens: ScreenRegistration[] } = {
  name: 'perfected',
  screens: [
    {
      route: 'PerfectedAction',
      component: PerfectedActionScreen,
      title: 'Perfected action',
    },
    {
      route: 'PerfectedResults',
      component: PerfectedResultsScreen,
      title: 'Perfected results',
    },
  ],
};
