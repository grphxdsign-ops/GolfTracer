/**
 * Sport catalog — the single source of truth for what Tracr can trace.
 * Onboarding renders one selection tile per entry (max 4 visible per screen,
 * scroll for more — DESIGN.md §10); Home's sport shortcuts read the user's
 * chosen subset.
 *
 * Honesty rule: `available: false` sports render as "Coming soon" and cannot
 * be selected — we never imply tracing we don't ship (DESIGN.md §8).
 */

export type SportId =
  | 'golf'
  | 'soccer'
  | 'perfected'
  | 'tennis'
  | 'baseball';

export interface SportEntry {
  id: SportId;
  /** Tile title, sentence case. */
  name: string;
  /** One-line value line under the name. */
  tagline: string;
  /** Which Skia brand icon the tile draws (see components/SportIcon). */
  icon: SportId;
  available: boolean;
  /** Route the Home shortcut opens (available sports only). */
  route?: 'Record' | 'SoccerAnalyze' | 'PerfectedAction';
}

export const SPORT_CATALOG: readonly SportEntry[] = [
  {
    id: 'golf',
    name: 'Golf',
    tagline: 'Ball tracer, carry and apex',
    icon: 'golf',
    available: true,
    route: 'Record',
  },
  {
    id: 'soccer',
    name: 'Soccer',
    tagline: 'Shot speed and goal verdict',
    icon: 'soccer',
    available: true,
    route: 'SoccerAnalyze',
  },
  {
    id: 'perfected',
    name: 'Perfected action',
    tagline: 'Your swing, morphed to ideal',
    icon: 'perfected',
    available: true,
    route: 'PerfectedAction',
  },
  {
    id: 'tennis',
    name: 'Tennis',
    tagline: 'Serve speed and placement',
    icon: 'tennis',
    available: false,
  },
  {
    id: 'baseball',
    name: 'Baseball',
    tagline: 'Exit velocity and launch',
    icon: 'baseball',
    available: false,
  },
] as const;

export const availableSports = (): readonly SportEntry[] =>
  SPORT_CATALOG.filter((s) => s.available);
