/**
 * Perfected-action module — OWNED by the perfected-action workstream (W3),
 * which replaces this file's placeholder screens wholesale.
 *
 * W1 scaffolds only the barrel shape pinned by the integration contract:
 * `perfectedModule` registering the routes 'PerfectedAction' and
 * 'PerfectedResults' (mounted through App.tsx's existing route cast), so
 * the coordinated registry.ts edit typechecks before the workstreams merge.
 */
import { Text, View } from 'react-native';

import type { ScreenRegistration } from '../../types/modules';
import { sharedStyles, typography } from '../../app/theme';

function PerfectedActionPlaceholder() {
  return (
    <View style={sharedStyles.screen}>
      <Text style={typography.title}>Perfected Action</Text>
      <Text style={typography.body}>
        The dummy performing your perfected action lands here (perfected
        workstream).
      </Text>
    </View>
  );
}

function PerfectedResultsPlaceholder() {
  return (
    <View style={sharedStyles.screen}>
      <Text style={typography.title}>Perfected Results</Text>
      <Text style={typography.body}>
        Morphed motion playback and the perfected ball flight land here
        (perfected workstream).
      </Text>
    </View>
  );
}

export const perfectedModule: { name: string; screens: ScreenRegistration[] } = {
  name: 'perfected',
  screens: [
    {
      route: 'PerfectedAction',
      component: PerfectedActionPlaceholder,
      title: 'Perfected Action',
    },
    {
      route: 'PerfectedResults',
      component: PerfectedResultsPlaceholder,
      title: 'Perfected Results',
    },
  ],
};
