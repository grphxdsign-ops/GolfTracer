/**
 * Insights selectors — pure derivations from shot history for the Insights
 * tab. Every aggregate here follows the honesty rules distilled from the
 * market research (docs/RESEARCH-APPS.md §1): explicit labeled windows,
 * measured shots only (club-prior guesses never launder into "your
 * average"), and a hard MIN_SHOTS_FOR_DELTA gate below which a club reports
 * `calibrating` instead of a fake trend.
 */
import type { ClubType } from '../../types/distance';
import {
  MIN_SHOTS_FOR_DELTA,
  type ShotRecord,
} from '../../state/historyStore';

/** Rolling window per club — labeled in the UI ("last 20 shots"). */
export const CLUB_WINDOW = 20;

/** Bag display order: longest club first, matching launch-monitor tables. */
export const CLUB_ORDER: readonly ClubType[] = [
  'driver',
  '3-wood',
  '5-wood',
  '3-iron',
  '5-iron',
  '7-iron',
  '9-iron',
  'pitching-wedge',
  'sand-wedge',
  'lob-wedge',
];

export interface ClubInsight {
  club: ClubType;
  /** Measured shots inside the window. */
  count: number;
  /** True while count < MIN_SHOTS_FOR_DELTA — render "calibrating". */
  calibrating: boolean;
  avgCarry?: number;
  minCarry?: number;
  maxCarry?: number;
  /** All-time personal best carry for the club (measured only). */
  pbCarry?: number;
  /** Window carries as 0..1 positions between min and max, oldest→newest. */
  positions: number[];
  /** Whether the window's max equals the all-time PB (ember tick). */
  windowHasPb: boolean;
}

export interface CarryTrend {
  club: ClubType;
  /** Oldest→newest carries in the current window. */
  series: number[];
  avg: number;
  best: number;
  /** Average of the PREVIOUS window (baseline), when it exists. */
  prevAvg?: number;
  /** How many shots the baseline used — the UI labels it honestly. */
  prevCount?: number;
  /** Rounded delta of avg vs prevAvg. */
  delta?: number;
}

export interface SoccerInsights {
  count: number;
  calibrating: boolean;
  avgKmh?: number;
  maxKmh?: number;
  /** 0..1 share of shots that crossed inside the goal mouth. */
  onTargetRate?: number;
  /** Oldest→newest speeds, capped to the window. */
  series: number[];
}

export interface PromotedInsight {
  /** e.g. "7-iron carry up 4 yd" */
  title: string;
  /** e.g. "Across your last 10 tracked shots" */
  caption: string;
}

/** Measured golf shots (never club-prior), newest-first like the store. */
const measuredGolf = (shots: readonly ShotRecord[]): ShotRecord[] =>
  shots.filter(
    (s) =>
      s.sport === 'golf' &&
      s.carryYards !== undefined &&
      s.club !== undefined &&
      s.method !== 'club-prior',
  );

const avgOf = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length;

/** Per-club bag breakdown over the labeled rolling window. */
export function golfBag(shots: readonly ShotRecord[]): ClubInsight[] {
  const measured = measuredGolf(shots);
  return CLUB_ORDER.flatMap((club): ClubInsight[] => {
    const all = measured.filter((s) => s.club === club);
    if (all.length === 0) {
      return [];
    }
    // Store is newest-first; the window is the newest N, series oldest-first.
    const window = all.slice(0, CLUB_WINDOW).reverse();
    const carries = window.map((s) => s.carryYards!);
    const pbCarry = Math.max(...all.map((s) => s.carryYards!));
    if (window.length < MIN_SHOTS_FOR_DELTA) {
      return [
        {
          club,
          count: window.length,
          calibrating: true,
          pbCarry,
          positions: [],
          windowHasPb: false,
        },
      ];
    }
    const minCarry = Math.min(...carries);
    const maxCarry = Math.max(...carries);
    const span = maxCarry - minCarry || 1;
    return [
      {
        club,
        count: window.length,
        calibrating: false,
        avgCarry: avgOf(carries),
        minCarry,
        maxCarry,
        pbCarry,
        positions: carries.map((c) => (c - minCarry) / span),
        windowHasPb: maxCarry >= pbCarry,
      },
    ];
  });
}

/** The user's most-recorded measured club — the hero card's subject. */
export function primaryClub(shots: readonly ShotRecord[]): ClubType | null {
  const counts = new Map<ClubType, number>();
  for (const s of measuredGolf(shots)) {
    counts.set(s.club!, (counts.get(s.club!) ?? 0) + 1);
  }
  let best: ClubType | null = null;
  let bestCount = 0;
  for (const club of CLUB_ORDER) {
    const c = counts.get(club) ?? 0;
    if (c > bestCount) {
      best = club;
      bestCount = c;
    }
  }
  return bestCount >= MIN_SHOTS_FOR_DELTA ? best : null;
}

/** Hero trend for a club: current window vs the previous window baseline. */
export function carryTrend(
  shots: readonly ShotRecord[],
  club: ClubType,
): CarryTrend | null {
  const all = measuredGolf(shots).filter((s) => s.club === club);
  if (all.length < MIN_SHOTS_FOR_DELTA) {
    return null;
  }
  const window = all.slice(0, CLUB_WINDOW).reverse();
  const prev = all.slice(CLUB_WINDOW, CLUB_WINDOW * 2);
  const series = window.map((s) => s.carryYards!);
  const avg = avgOf(series);
  const trend: CarryTrend = {
    club,
    series,
    avg,
    best: Math.max(...all.map((s) => s.carryYards!)),
  };
  // Baseline gate scales with the current window: a 20-shot average
  // compared against 3 old shots is noise dressed as a trend (review
  // finding) — require at least half the current window, floor MIN.
  const prevGate = Math.max(
    MIN_SHOTS_FOR_DELTA,
    Math.floor(window.length / 2),
  );
  if (prev.length >= prevGate) {
    trend.prevAvg = avgOf(prev.map((s) => s.carryYards!));
    trend.prevCount = prev.length;
    trend.delta = Math.round(avg - trend.prevAvg);
  }
  return trend;
}

/** Soccer aggregates over the labeled window, gated like golf. */
export function soccerInsights(shots: readonly ShotRecord[]): SoccerInsights {
  const all = shots.filter(
    (s) => s.sport === 'soccer' && s.shotSpeedKmh !== undefined,
  );
  const window = all.slice(0, CLUB_WINDOW).reverse();
  const series = window.map((s) => s.shotSpeedKmh!);
  if (window.length < MIN_SHOTS_FOR_DELTA) {
    return { count: window.length, calibrating: true, series };
  }
  const judged = window.filter((s) => s.onTarget !== undefined);
  return {
    count: window.length,
    calibrating: false,
    avgKmh: avgOf(series),
    maxKmh: Math.max(...series),
    onTargetRate:
      judged.length > 0
        ? judged.filter((s) => s.onTarget).length / judged.length
        : undefined,
    series,
  };
}

/**
 * The single promoted insight (Oura's "one big thing"): the club with the
 * largest recent carry gain, comparing the newest half of the last 10
 * measured shots against the older half. Requires 2×MIN shots and a gain
 * of ≥2 yd — otherwise nothing is promoted; a reach for an insight reads
 * as noise (coaching tone, never gamification — docs/RESEARCH-APPS.md §2).
 */
export function promotedInsight(
  shots: readonly ShotRecord[],
): PromotedInsight | null {
  const measured = measuredGolf(shots);
  let best: { club: ClubType; delta: number; sample: number } | null = null;
  for (const club of CLUB_ORDER) {
    const window = measured
      .filter((s) => s.club === club)
      .slice(0, 10)
      .reverse();
    if (window.length < MIN_SHOTS_FOR_DELTA * 2) {
      continue;
    }
    const half = Math.floor(window.length / 2);
    const older = window.slice(0, half).map((s) => s.carryYards!);
    const newer = window.slice(half).map((s) => s.carryYards!);
    const delta = Math.round(avgOf(newer) - avgOf(older));
    if (delta >= 2 && (best === null || delta > best.delta)) {
      best = { club, delta, sample: window.length };
    }
  }
  if (!best) {
    return null;
  }
  const clubLabel = best.club.replace(/-/g, ' ');
  const name = clubLabel.charAt(0).toUpperCase() + clubLabel.slice(1);
  return {
    title: `${name} carry up ${best.delta} yd`,
    caption: `Across your last ${best.sample} tracked shots`,
  };
}
