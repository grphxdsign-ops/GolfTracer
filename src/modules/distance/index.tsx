/**
 * Distance module — OWNED by the distance-calibration-physics workstream
 * after scaffold. It rewrites this file (and only this shared touchpoint) to
 * register real Calibration / Results screens.
 *
 * Contract: registers exactly the fixed routes 'Calibration', 'Results';
 * consumes useSessionStore().trackingResult, publishes via
 * setCalibration / setDistance.
 */
import { Text, View } from 'react-native';

import type { AppModule } from '../../types/modules';
import { sharedStyles, typography } from '../../app/theme';

const placeholder = (label: string) => {
  const Placeholder = () => (
    <View style={sharedStyles.centered}>
      <Text style={typography.title}>{label}</Text>
      <Text style={typography.subtitle}>Coming soon</Text>
    </View>
  );
  Placeholder.displayName = `DistancePlaceholder(${label})`;
  return Placeholder;
};

export const distanceModule: AppModule = {
  name: 'distance',
  screens: [
    {
      route: 'Calibration',
      component: placeholder('Calibration'),
      title: 'Calibration',
    },
    { route: 'Results', component: placeholder('Results'), title: 'Results' },
  ],
};
