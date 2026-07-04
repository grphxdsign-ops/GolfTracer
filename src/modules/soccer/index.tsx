/**
 * Soccer module — OWNED by the soccer analysis workstream (W2).
 *
 * Contract: registers exactly the routes 'SoccerAnalyze', 'SoccerResults'
 * (mounted through App.tsx's existing route cast; NOT added to the frozen
 * RootStackParamList); consumes useSessionStore().frameSource and publishes
 * SoccerAnalysisResult via the W1 sports session store.
 */
import type { ScreenRegistration } from '../../types/modules';
import { SoccerAnalyzeScreen } from './screens/SoccerAnalyzeScreen';
import { SoccerResultsScreen } from './screens/SoccerResultsScreen';

/**
 * Structurally AppModule-compatible except for the (frozen) name union;
 * W1's registry widens `modules` to this structural supertype.
 */
export interface SportAppModule {
  name: string;
  screens: ScreenRegistration[];
}

export const soccerModule: SportAppModule = {
  name: 'soccer',
  screens: [
    {
      route: 'SoccerAnalyze',
      component: SoccerAnalyzeScreen,
      title: 'Analyze soccer shot',
    },
    {
      route: 'SoccerResults',
      component: SoccerResultsScreen,
      title: 'Soccer results',
    },
  ],
};

export type {
  GoalDetector,
  GoalDetection,
  GoalCornerBox,
  GoalCornerId,
  GoalDetectorKind,
  ScriptedGoalDetection,
} from './goal/GoalDetector';
export {
  FakeGoalDetector,
  TfliteGoalDetector,
  createGoalDetector,
  GOAL_CORNER_IDS,
} from './goal/GoalDetector';
export { analyzeSoccerTake, type SoccerAnalysisOptions } from './analysis/analyzeSoccerShot';
export {
  appendTakeToResult,
  compareTakes,
  comparisonInsights,
  type TakeComparison,
} from './analysis/takeCompare';
