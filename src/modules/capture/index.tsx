/**
 * Capture module — OWNED by the capture-media-pipeline workstream.
 *
 * Registers the fixed routes 'Record', 'Import', 'Review'; publishes the
 * confirmed clip via useSessionStore().setVideo(asset, frameSource).
 */
import type { AppModule } from '../../types/modules';
import { RecordScreen } from './screens/RecordScreen';
import { ImportScreen } from './screens/ImportScreen';
import { ReviewScreen } from './screens/ReviewScreen';

export const captureModule: AppModule = {
  name: 'capture',
  screens: [
    { route: 'Record', component: RecordScreen, title: 'Record Swing' },
    { route: 'Import', component: ImportScreen, title: 'Import Video' },
    { route: 'Review', component: ReviewScreen, title: 'Review Clip' },
  ],
};
