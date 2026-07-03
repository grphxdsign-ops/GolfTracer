/**
 * Capture module — OWNED by the capture-media-pipeline workstream after
 * scaffold. It rewrites this file (and only this shared touchpoint) to
 * register real Record / Import / Review screens.
 *
 * Contract: registers exactly the fixed routes 'Record', 'Import', 'Review';
 * publishes via useSessionStore().setVideo(asset, frameSource).
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
  Placeholder.displayName = `CapturePlaceholder(${label})`;
  return Placeholder;
};

export const captureModule: AppModule = {
  name: 'capture',
  screens: [
    { route: 'Record', component: placeholder('Record'), title: 'Record Swing' },
    { route: 'Import', component: placeholder('Import'), title: 'Import Video' },
    { route: 'Review', component: placeholder('Review'), title: 'Review Clip' },
  ],
};
