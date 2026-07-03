/**
 * Module registry — FROZEN after scaffold. Workstreams plug in by fleshing
 * out their own module's index.tsx; this file is NEVER edited again.
 */
import type { AppModule } from '../types/modules';
import { captureModule } from '../modules/capture';
import { trackingModule } from '../modules/tracking';
import { distanceModule } from '../modules/distance';

export const modules: AppModule[] = [captureModule, trackingModule, distanceModule];
