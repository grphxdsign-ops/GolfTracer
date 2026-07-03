/**
 * Distance module — OWNED by the distance-calibration-physics workstream.
 *
 * Registers the fixed routes 'Calibration' and 'Results'; consumes
 * useSessionStore().trackingResult + video metadata, publishes via
 * setCalibration / setDistance.
 */
import type { AppModule } from '../../types/modules';

import { CalibrationScreen } from './screens/CalibrationScreen';
import { ResultsScreen } from './screens/ResultsScreen';

export const distanceModule: AppModule = {
  name: 'distance',
  screens: [
    {
      route: 'Calibration',
      component: CalibrationScreen,
      title: 'Calibration',
    },
    { route: 'Results', component: ResultsScreen, title: 'Results' },
  ],
};
