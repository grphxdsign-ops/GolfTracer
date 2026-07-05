/**
 * Shot display helpers shared by the Sessions screen and Home's recent
 * session card — one place turns a ShotRecord into user-facing strings so
 * both surfaces stay consistent (sport name, headline stat, quality tone,
 * relative/day time labels).
 */
import type { BadgeProps } from '../../app/components';
import type { ShotRecord } from '../../state/historyStore';
import type { TrackQuality } from '../../types/tracking';
import { SPORT_CATALOG, type SportId } from '../sports/sportCatalog';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export function sportName(sport: SportId): string {
  // Perfected action left the sport catalog (it's a tool, DESIGN.md §11) but
  // may exist in older history records — keep its display name stable.
  if (sport === 'perfected') {
    return 'Perfected action';
  }
  return SPORT_CATALOG.find((entry) => entry.id === sport)?.name ?? sport;
}

export interface ShotHeadlineParts {
  value: string;
  unit: string;
  /** Metric name (e.g. "Carry", "Ball speed") — the StatTile caption for
   * layouts that give the number its own row (Home's recent-session hero). */
  label: string;
}

/** Trailing word `shotHeadline`'s flat string adds after the unit, keyed by
 * the metric label — only carry/total distinguish themselves that way. */
const HEADLINE_SUFFIX: Partial<Record<string, string>> = {
  Carry: 'carry',
  Total: 'total',
};

/** Structured value/unit/label split of the headline stat, for layouts
 * (Home's recent-session hero) that give the number its own row. */
export function shotHeadlineParts(shot: ShotRecord): ShotHeadlineParts | null {
  if (shot.sport === 'soccer') {
    return shot.shotSpeedKmh !== undefined
      ? { value: String(Math.round(shot.shotSpeedKmh)), unit: 'km/h', label: 'Shot speed' }
      : null;
  }
  if (shot.carryYards !== undefined) {
    return { value: String(Math.round(shot.carryYards)), unit: 'yd', label: 'Carry' };
  }
  if (shot.totalYards !== undefined) {
    return { value: String(Math.round(shot.totalYards)), unit: 'yd', label: 'Total' };
  }
  if (shot.ballSpeedMph !== undefined) {
    return { value: String(Math.round(shot.ballSpeedMph)), unit: 'mph', label: 'Ball speed' };
  }
  return null;
}

/** Headline stat: the one number that identifies the shot at a glance. */
export function shotHeadline(shot: ShotRecord): string | null {
  const parts = shotHeadlineParts(shot);
  if (!parts) {
    return null;
  }
  const suffix = HEADLINE_SUFFIX[parts.label];
  return suffix
    ? `${parts.value} ${parts.unit} ${suffix}`
    : `${parts.value} ${parts.unit}`;
}

const QUALITY_META: Record<
  TrackQuality,
  { label: string; tone: NonNullable<BadgeProps['tone']> }
> = {
  high: { label: 'High', tone: 'success' },
  medium: { label: 'Medium', tone: 'accent' },
  low: { label: 'Low', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
};

export function qualityLabel(quality: TrackQuality): string {
  return QUALITY_META[quality].label;
}

export function qualityTone(
  quality: TrackQuality,
): NonNullable<BadgeProps['tone']> {
  return QUALITY_META[quality].tone;
}

const startOfDay = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/** Calendar-day header: Today / Yesterday / "30 Jun" (+ year if not this year). */
export function dayLabel(at: number, now: number = Date.now()): string {
  const dayDiff = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (dayDiff <= 0) {
    return 'Today';
  }
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  const d = new Date(at);
  const label = `${d.getDate()} ${MONTHS[d.getMonth()]!}`;
  return d.getFullYear() === new Date(now).getFullYear()
    ? label
    : `${label} ${d.getFullYear()}`;
}

/** Relative "when" for Home's recent-session card. */
export function formatRelativeWhen(at: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - at);
  if (diff < MINUTE_MS) {
    return 'Just now';
  }
  if (diff < HOUR_MS) {
    return `${Math.floor(diff / MINUTE_MS)} min ago`;
  }
  if (diff < DAY_MS) {
    return `${Math.floor(diff / HOUR_MS)} hr ago`;
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (dayDiff === 1) {
    return 'Yesterday';
  }
  if (dayDiff < 7) {
    return `${dayDiff} days ago`;
  }
  return dayLabel(at, now);
}

/** Time-of-day for session rows (the day header carries the date). */
export function formatClockTime(at: number): string {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}
