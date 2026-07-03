/**
 * Soccer module — OWNED by the soccer-analysis workstream (W2), which
 * replaces this file's placeholder screens wholesale.
 *
 * W1 scaffolds only the barrel shape pinned by the integration contract:
 * `soccerModule` registering the routes 'SoccerAnalyze' and 'SoccerResults'
 * (mounted through App.tsx's existing route cast), so the coordinated
 * registry.ts edit typechecks before the workstreams merge.
 */
import { Text, View } from 'react-native';

import type { ScreenRegistration } from '../../types/modules';
import { sharedStyles, typography } from '../../app/theme';

function SoccerAnalyzePlaceholder() {
  return (
    <View style={sharedStyles.screen}>
      <Text style={typography.title}>Soccer Analysis</Text>
      <Text style={typography.body}>
        Shot speed, goal-line cross detection and pose-at-contact analysis
        land here (soccer workstream).
      </Text>
    </View>
  );
}

function SoccerResultsPlaceholder() {
  return (
    <View style={sharedStyles.screen}>
      <Text style={typography.title}>Soccer Results</Text>
      <Text style={typography.body}>
        Take comparison and GOAL? verdicts land here (soccer workstream).
      </Text>
    </View>
  );
}

export const soccerModule: { name: string; screens: ScreenRegistration[] } = {
  name: 'soccer',
  screens: [
    {
      route: 'SoccerAnalyze',
      component: SoccerAnalyzePlaceholder,
      title: 'Soccer Analysis',
    },
    {
      route: 'SoccerResults',
      component: SoccerResultsPlaceholder,
      title: 'Soccer Results',
    },
  ],
};
