/**
 * Contract tests for session history — the delta rules are the product:
 * averages exclude the on-screen shot and club-prior guesses, and deltas
 * need MIN_SHOTS_FOR_DELTA prior shots to exist at all.
 */
import {
  clubAverages,
  MIN_SHOTS_FOR_DELTA,
  useHistoryStore,
  type ShotRecord,
} from '../historyStore';

const golfShot = (over: Partial<ShotRecord>): Omit<ShotRecord, 'id' | 'at'> => ({
  sport: 'golf',
  quality: 'high',
  club: 'driver',
  method: 'physics-fit',
  carryYards: 240,
  ...over,
});

describe('historyStore', () => {
  beforeEach(() => useHistoryStore.getState().clear());

  it('prepends shots and assigns ids', () => {
    useHistoryStore.getState().addShot(golfShot({ carryYards: 250, at: 1000 }));
    useHistoryStore.getState().addShot(golfShot({ carryYards: 230, at: 2000 }));
    const shots = useHistoryStore.getState().shots;
    expect(shots).toHaveLength(2);
    expect(shots[0]!.carryYards).toBe(230);
    expect(new Set(shots.map((s) => s.id)).size).toBe(2);
  });

  it('exposes the minimum-history gate for deltas', () => {
    expect(MIN_SHOTS_FOR_DELTA).toBeGreaterThanOrEqual(2);
  });
});

describe('clubAverages', () => {
  const mk = (id: string, over: Partial<ShotRecord>): ShotRecord => ({
    id,
    at: 0,
    sport: 'golf',
    quality: 'high',
    club: 'driver',
    method: 'physics-fit',
    ...over,
  });

  it('averages only the requested club and excludes the on-screen shot', () => {
    const shots = [
      mk('current', { carryYards: 300 }),
      mk('a', { carryYards: 240 }),
      mk('b', { carryYards: 260 }),
      mk('c', { club: '7-iron', carryYards: 150 }),
    ];
    const a = clubAverages(shots, 'driver', 'current');
    expect(a.count).toBe(2);
    expect(a.carryYards).toBe(250);
  });

  it('never launders club-prior guesses into the average', () => {
    const shots = [
      mk('a', { carryYards: 240 }),
      mk('b', { method: 'club-prior', carryYards: 500 }),
    ];
    const a = clubAverages(shots, 'driver');
    expect(a.count).toBe(1);
    expect(a.carryYards).toBe(240);
  });

  it('returns count 0 and undefined stats with no history', () => {
    const a = clubAverages([], 'driver');
    expect(a.count).toBe(0);
    expect(a.carryYards).toBeUndefined();
  });
});
