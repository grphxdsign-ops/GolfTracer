/**
 * Tracking module — OWNED by the detection-tracking-tracer workstream after
 * scaffold. It rewrites this file (and only this shared touchpoint) to
 * register real Analyze / TracerPreview screens.
 *
 * Contract: registers exactly the fixed routes 'Analyze', 'TracerPreview';
 * consumes useSessionStore().frameSource, publishes via
 * setTrackingStatus / setTrackingResult.
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
  Placeholder.displayName = `TrackingPlaceholder(${label})`;
  return Placeholder;
};

export const trackingModule: AppModule = {
  name: 'tracking',
  screens: [
    { route: 'Analyze', component: placeholder('Analyze'), title: 'Analyze Shot' },
    {
      route: 'TracerPreview',
      component: placeholder('TracerPreview'),
      title: 'Tracer Preview',
    },
  ],
};
