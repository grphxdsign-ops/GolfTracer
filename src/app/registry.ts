/**
 * Module registry — the single coordinated shell edit point (owned by the
 * sports-engine workstream). Workstreams plug in by fleshing out their own
 * module's index.tsx; only this list is shared.
 *
 * `modules` is annotated with a structural supertype of AppModule so the
 * sport modules (whose names are not in AppModule's closed union) register
 * without touching the frozen src/types/modules.ts — AppModule values stay
 * assignable, and App.tsx only ever reads `screens`.
 */
import type { ScreenRegistration } from '../types/modules';
import { onboardingModule } from '../modules/onboarding';
import { captureModule } from '../modules/capture';
import { trackingModule } from '../modules/tracking';
import { distanceModule } from '../modules/distance';
import { soccerModule } from '../modules/soccer';
import { perfectedModule } from '../modules/perfected';
import { sessionsModule } from '../modules/sessions';

export const modules: { screens: ScreenRegistration[]; name: string }[] = [
  onboardingModule,
  captureModule,
  trackingModule,
  distanceModule,
  soccerModule,
  perfectedModule,
  sessionsModule,
];
