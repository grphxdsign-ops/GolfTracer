/**
 * Shot display helper tests — time labels pinned against a fixed "now" so
 * they never depend on the wall clock.
 */
import type { ShotRecord } from '../../../state/historyStore';
import {
  dayLabel,
  formatRelativeWhen,
  qualityLabel,
  qualityTone,
  shotHeadline,
  shotHeadlineParts,
  sportName,
} from '../shotDisplay';

// Wed 2026-07-01 12:00 local time.
const NOW = new Date(2026, 6, 1, 12, 0, 0).getTime();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('formatRelativeWhen', () => {
  it('walks the ladder from just now to day labels', () => {
    expect(formatRelativeWhen(NOW - 10_000, NOW)).toBe('Just now');
    expect(formatRelativeWhen(NOW - 5 * MIN, NOW)).toBe('5 min ago');
    expect(formatRelativeWhen(NOW - 3 * HOUR, NOW)).toBe('3 hr ago');
    expect(formatRelativeWhen(NOW - DAY, NOW)).toBe('Yesterday');
    expect(formatRelativeWhen(NOW - 3 * DAY, NOW)).toBe('3 days ago');
    expect(formatRelativeWhen(NOW - 10 * DAY, NOW)).toBe('21 Jun');
  });
});

describe('dayLabel', () => {
  it('labels today, yesterday, dates, and cross-year dates', () => {
    expect(dayLabel(NOW - HOUR, NOW)).toBe('Today');
    expect(dayLabel(NOW - DAY, NOW)).toBe('Yesterday');
    expect(dayLabel(NOW - 3 * DAY, NOW)).toBe('28 Jun');
    expect(dayLabel(new Date(2025, 11, 30, 9, 0).getTime(), NOW)).toBe(
      '30 Dec 2025',
    );
  });
});

describe('shotHeadline', () => {
  const base: ShotRecord = { id: 'x', at: 0, sport: 'golf', quality: 'high' };

  it('prefers carry, then total, then ball speed for golf', () => {
    expect(shotHeadline({ ...base, carryYards: 241.4 })).toBe('241 yd carry');
    expect(shotHeadline({ ...base, totalYards: 260.6 })).toBe('261 yd total');
    expect(shotHeadline({ ...base, ballSpeedMph: 148 })).toBe('148 mph');
    expect(shotHeadline(base)).toBeNull();
  });

  it('uses shot speed for soccer', () => {
    expect(
      shotHeadline({ ...base, sport: 'soccer', shotSpeedKmh: 75.2 }),
    ).toBe('75 km/h');
    expect(shotHeadline({ ...base, sport: 'soccer' })).toBeNull();
  });
});

describe('shotHeadlineParts', () => {
  const base: ShotRecord = { id: 'x', at: 0, sport: 'golf', quality: 'high' };

  it('splits value, unit, and metric label for golf', () => {
    expect(shotHeadlineParts({ ...base, carryYards: 241.4 })).toEqual({
      value: '241',
      unit: 'yd',
      label: 'Carry',
    });
    expect(shotHeadlineParts({ ...base, totalYards: 260.6 })).toEqual({
      value: '261',
      unit: 'yd',
      label: 'Total',
    });
    expect(shotHeadlineParts({ ...base, ballSpeedMph: 148 })).toEqual({
      value: '148',
      unit: 'mph',
      label: 'Ball speed',
    });
    expect(shotHeadlineParts(base)).toBeNull();
  });

  it('splits shot speed for soccer', () => {
    expect(
      shotHeadlineParts({ ...base, sport: 'soccer', shotSpeedKmh: 75.2 }),
    ).toEqual({ value: '75', unit: 'km/h', label: 'Shot speed' });
    expect(shotHeadlineParts({ ...base, sport: 'soccer' })).toBeNull();
  });
});

describe('quality and sport labels', () => {
  it('maps quality to label and badge tone', () => {
    expect(qualityLabel('high')).toBe('High');
    expect(qualityTone('high')).toBe('success');
    expect(qualityTone('medium')).toBe('accent');
    expect(qualityTone('low')).toBe('warning');
    expect(qualityTone('failed')).toBe('danger');
  });

  it('resolves catalog names', () => {
    expect(sportName('golf')).toBe('Golf');
    expect(sportName('perfected')).toBe('Perfected action');
  });
});
