/**
 * Module registration contracts — FROZEN after scaffold. Workstreams never
 * edit this file.
 */
import type { ComponentType } from 'react';

export interface ScreenRegistration {
  route: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: ComponentType<any>;
  title: string;
}

export interface AppModule {
  name: 'capture' | 'tracking' | 'distance';
  screens: ScreenRegistration[];
}
