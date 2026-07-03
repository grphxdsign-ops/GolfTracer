/**
 * Sport profile tests: exact rulebook anchor dimensions, self-consistent
 * ball specs, and well-formed drag tables / event grammar for every sport.
 */
import {
  BASKETBALL_HOOP,
  PICKLEBALL_COURT,
  SOCCER_GOAL,
  TENNIS_COURT,
  getSportProfile,
  type SportId,
} from '../sportProfile';

const ALL_SPORTS: SportId[] = ['soccer', 'basketball', 'tennis', 'pickleball'];

describe('world anchor templates', () => {
  it('soccer goal is exactly 7.32 m x 2.44 m with 4 corner points', () => {
    expect(SOCCER_GOAL.widthM).toBe(7.32);
    expect(SOCCER_GOAL.heightM).toBe(2.44);
    expect(SOCCER_GOAL.plane).toBe('vertical');
    expect(SOCCER_GOAL.planeHeightM).toBe(0);
    expect(SOCCER_GOAL.points).toHaveLength(4);
    const xs = SOCCER_GOAL.points.map((p) => p.xM);
    const ys = SOCCER_GOAL.points.map((p) => p.yM);
    expect(Math.max(...xs)).toBe(7.32);
    expect(Math.max(...ys)).toBe(2.44);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.min(...ys)).toBe(0);
  });

  it('basketball hoop is a 0.4572 m rim on a plane at 3.048 m', () => {
    expect(BASKETBALL_HOOP.widthM).toBe(0.4572);
    expect(BASKETBALL_HOOP.heightM).toBe(0.4572);
    expect(BASKETBALL_HOOP.plane).toBe('horizontal');
    expect(BASKETBALL_HOOP.planeHeightM).toBe(3.048);
    expect(BASKETBALL_HOOP.points).toHaveLength(4);
    // The four rim extremes all sit on the rim circle.
    const r = 0.4572 / 2;
    for (const p of BASKETBALL_HOOP.points) {
      expect(Math.hypot(p.xM - r, p.yM - r)).toBeCloseTo(r, 9);
    }
  });

  it('tennis doubles court is 10.97 m x 23.77 m on the ground', () => {
    expect(TENNIS_COURT.widthM).toBe(10.97);
    expect(TENNIS_COURT.heightM).toBe(23.77);
    expect(TENNIS_COURT.plane).toBe('horizontal');
    expect(TENNIS_COURT.planeHeightM).toBe(0);
  });

  it('pickleball court is 6.10 m x 13.41 m on the ground', () => {
    expect(PICKLEBALL_COURT.widthM).toBe(6.1);
    expect(PICKLEBALL_COURT.heightM).toBe(13.41);
    expect(PICKLEBALL_COURT.plane).toBe('horizontal');
  });
});

describe('getSportProfile', () => {
  it('returns a profile for every sport, keyed by its own id', () => {
    for (const id of ALL_SPORTS) {
      const profile = getSportProfile(id);
      expect(profile.id).toBe(id);
      expect(profile.anchors.length).toBeGreaterThan(0);
      expect(profile.anchors.every((a) => a.sport === id)).toBe(true);
      expect(profile.powerMetrics.length).toBeGreaterThan(0);
    }
  });

  it('ball specs are physically self-consistent', () => {
    for (const id of ALL_SPORTS) {
      const ball = getSportProfile(id).ball;
      expect(ball.diameterM).toBeGreaterThan(0);
      expect(ball.massKg).toBeGreaterThan(0);
      const area = Math.PI * (ball.diameterM / 2) ** 2;
      expect(ball.areaM2).toBeCloseTo(area, 9);
      expect(ball.magnus.maxCl).toBeGreaterThan(0);
      expect(ball.magnus.spinDecayPerS).toBeGreaterThan(0);
    }
  });

  it('published ball dimensions: soccer 22 cm/430 g, tennis 6.7 cm/57.7 g', () => {
    expect(getSportProfile('soccer').ball.diameterM).toBeCloseTo(0.22, 9);
    expect(getSportProfile('soccer').ball.massKg).toBeCloseTo(0.43, 9);
    expect(getSportProfile('basketball').ball.diameterM).toBeCloseTo(0.242, 9);
    expect(getSportProfile('basketball').ball.massKg).toBeCloseTo(0.624, 9);
    expect(getSportProfile('tennis').ball.diameterM).toBeCloseTo(0.067, 9);
    expect(getSportProfile('tennis').ball.massKg).toBeCloseTo(0.0577, 9);
    expect(getSportProfile('pickleball').ball.diameterM).toBeCloseTo(0.074, 9);
  });

  it('drag tables are sorted by speed with positive coefficients', () => {
    for (const id of ALL_SPORTS) {
      const table = getSportProfile(id).ball.dragTable;
      expect(table.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < table.length; i++) {
        expect(table[i]![1]).toBeGreaterThan(0);
        if (i > 0) {
          expect(table[i]![0]).toBeGreaterThan(table[i - 1]![0]);
        }
      }
    }
  });

  it('every sport speaks the contact -> flight -> outcome grammar', () => {
    for (const id of ALL_SPORTS) {
      const events = getSportProfile(id).events;
      expect(events.contact.length).toBeGreaterThan(0);
      expect(events.flight.length).toBeGreaterThan(0);
      expect(events.outcome.length).toBeGreaterThan(0);
    }
  });

  it('power metric ranges are ordered low < high', () => {
    for (const id of ALL_SPORTS) {
      for (const metric of getSportProfile(id).powerMetrics) {
        expect(metric.typicalRange[0]).toBeLessThan(metric.typicalRange[1]);
      }
    }
  });
});
