/**
 * Tracking module — OWNED by the detection-tracking-tracer workstream.
 *
 * Contract: registers exactly the fixed routes 'Analyze', 'TracerPreview';
 * consumes useSessionStore().frameSource, publishes via
 * setTrackingStatus / setTrackingResult.
 */
import type { AppModule } from '../../types/modules';
import { AnalyzeScreen } from './screens/AnalyzeScreen';
import { TracerPreviewScreen } from './screens/TracerPreviewScreen';

export const trackingModule: AppModule = {
  name: 'tracking',
  screens: [
    { route: 'Analyze', component: AnalyzeScreen, title: 'Analyzing shot' },
    {
      route: 'TracerPreview',
      component: TracerPreviewScreen,
      title: 'Tracer preview',
    },
  ],
};
