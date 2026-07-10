/**
 * Insights selector tests — the honesty rules are the product: measured
 * shots only, labeled windows, MIN gate → calibrating, baseline = previous
 * window, promoted insight only on a real gain.
 */
import type { ShotRecord } from '../../../state/historyStore';
import {
  carryTrend,
  CLUB_WINDOW,
  golfBag,
  primaryClub,
  promotedInsight,
  soccerInsights,
} from '../insights';

let seq = 0;
const golf = (
  carryYards: number,
  over: Partial<ShotRecord> = {},
): ShotRecord => ({
  id: `g${seq++}`,
  // Store is newest-first; earlier-created fixtures are NEWER.
  at: 1_000_000 - seq,
  sport: 'golf',
  quality: 'high',
  club: 'driver',
  method: 'physics-fit',
  carryYards,
  ...over,
});

const soccer = (shotSpeedKmh: number, onTarget?: boolean): ShotRecord => ({
  id: `s${seq++}`,
  at: 1_000_000 - seq,
  sport: 'soccer',
  quality: 'high',
  shotSpeedKmh,
  onTarget,
});

beforeEach(() => {
  seq = 0;
});

describe('golfBag', () => {
  it('reports calibrating below the MIN gate and stats at/above it', () => {
    const shots = [golf(240), golf(250), golf(150, { club: '7-iron' })];
    const bag = golfBag(shots);
    expect(bag.map((c) => c.club)).toEqual(['driver', '7-iron']);
    expect(bag[0]!.calibrating).toBe(true);
    expect(bag[0]!.count).toBe(2);

    const withThree = [...shots, golf(245)];
    const driver = golfBag(withThree)[0]!;
    expect(driver.calibrating).toBe(false);
    expect(driver.avgCarry).toBeCloseTo(245, 5);
    expect(driver.minCarry).toBe(240);
    expect(driver.maxCarry).toBe(250);
    expect(driver.positions).toHaveLength(3);
  });

  it('excludes club-prior guesses entirely', () => {
    const shots = [
      golf(240),
      golf(242),
      golf(244),
      golf(400, { method: 'club-prior' }),
    ];
    const driver = golfBag(shots)[0]!;
    expect(driver.count).toBe(3);
    expect(driver.maxCarry).toBe(244);
  });

  it('caps the window and flags when the window still holds the PB', () => {
    const carries = Array.from({ length: CLUB_WINDOW + 5 }, (_, i) => 200 + i);
    // Newest-first store: the LAST created are oldest. PB (224) is newest.
    const shots = carries.reverse().map((c) => golf(c));
    const driver = golfBag(shots)[0]!;
    expect(driver.count).toBe(CLUB_WINDOW);
    expect(driver.pbCarry).toBe(224);
    expect(driver.windowHasPb).toBe(true);
  });
});

describe('primaryClub / carryTrend', () => {
  it('picks the most-recorded measured club once past the gate', () => {
    expect(primaryClub([golf(240), golf(241)])).toBeNull();
    const shots = [
      golf(240),
      golf(241),
      golf(242),
      golf(150, { club: '7-iron' }),
    ];
    expect(primaryClub(shots)).toBe('driver');
  });

  it('computes the window trend with the previous window as baseline', () => {
    // 40 shots: newest 20 average 250, previous 20 average 240.
    const newer = Array.from({ length: CLUB_WINDOW }, () => golf(250));
    const older = Array.from({ length: CLUB_WINDOW }, () => golf(240));
    const trend = carryTrend([...newer, ...older], 'driver')!;
    expect(trend.series).toHaveLength(CLUB_WINDOW);
    expect(trend.avg).toBeCloseTo(250, 5);
    expect(trend.prevAvg).toBeCloseTo(240, 5);
    expect(trend.delta).toBe(10);
    expect(trend.best).toBe(250);
  });

  it('omits the baseline when the previous window is too small', () => {
    const trend = carryTrend([golf(240), golf(241), golf(242)], 'driver')!;
    expect(trend.prevAvg).toBeUndefined();
    expect(trend.delta).toBeUndefined();
  });
});

describe('soccerInsights', () => {
  it('gates below MIN and aggregates at/above it', () => {
    expect(soccerInsights([soccer(80)]).calibrating).toBe(true);
    const s = soccerInsights([
      soccer(80, true),
      soccer(90, false),
      soccer(100, true),
    ]);
    expect(s.calibrating).toBe(false);
    expect(s.avgKmh).toBeCloseTo(90, 5);
    expect(s.maxKmh).toBe(100);
    expect(s.onTargetRate).toBeCloseTo(2 / 3, 5);
  });

  it('leaves onTargetRate undefined when no shots carry a verdict', () => {
    const s = soccerInsights([soccer(80), soccer(85), soccer(90)]);
    expect(s.onTargetRate).toBeUndefined();
  });
});

describe('promotedInsight', () => {
  it('promotes the biggest genuine recent gain', () => {
    // Oldest half ~230, newest half ~244 (created newest-first).
    const shots = [
      golf(244),
      golf(243),
      golf(245),
      golf(230),
      golf(229),
      golf(231),
    ];
    const insight = promotedInsight(shots)!;
    expect(insight.title).toMatch(/^Driver carry up \d+ yd$/);
    expect(insight.caption).toBe('Across your last 6 tracked shots');
  });

  it('returns null on flat or insufficient data — never a reach', () => {
    expect(promotedInsight([golf(240), golf(240), golf(240)])).toBeNull();
    const flat = Array.from({ length: 6 }, () => golf(240));
    expect(promotedInsight(flat)).toBeNull();
  });
});
