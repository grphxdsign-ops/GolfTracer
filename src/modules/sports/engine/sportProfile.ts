/**
 * Sport profiles — the sport-agnostic parameter pack that drives the shared
 * multi-sport engine. Each profile bundles the ball's physical/aerodynamic
 * spec (drag table + quadratic Magnus model, mirroring the golf module's
 * validated coefficient shapes), the metric world-anchor templates used to
 * pin a monocular scene to real dimensions (goal mouth, hoop rim, court
 * corners), the sport's event grammar (contact → flight → outcome), and the
 * headline power metrics the analysis screens report.
 *
 * Dimension sources: IFAB Laws of the Game (goal 7.32 m x 2.44 m, size-5
 * ball 68-70 cm circumference, 410-450 g); FIBA/NBA rulebooks (rim inner
 * diameter 45.72 cm at 3.048 m, ball ~24.2 cm / 624 g); ITF Rules of Tennis
 * (doubles court 23.77 m x 10.97 m, ball 6.54-6.86 cm / 56.0-59.4 g); USA
 * Pickleball rulebook (court 44 ft x 20 ft = 13.41 m x 6.10 m, ball
 * 2.87-2.97 in / 0.78-0.935 oz).
 *
 * Aero sources: soccer drag crisis and post-critical C_D ~0.2 from Asai et
 * al. (2007) and Goff & Carre (2009); basketball C_D ~0.54 (sub-critical,
 * Okubo & Hubbard 2006); tennis C_D ~0.55 nearly speed-independent (Mehta
 * et al. 2008, the fuzz keeps the boundary layer tripped); pickleball
 * C_D ~0.40 for the perforated plastic ball (measured 0.33-0.45 range).
 */

export type SportId = 'soccer' | 'basketball' | 'tennis' | 'pickleball';

export interface BallSpec {
  diameterM: number;
  massKg: number;
  /** Frontal (cross-sectional) area, m^2. */
  areaM2: number;
  /**
   * Piecewise-linear C_D(speed) table as [speed m/s, C_D] pairs sorted by
   * speed; values outside the table clamp to the end points.
   */
  dragTable: [number, number][];
  /**
   * Quadratic Magnus lift model on the spin ratio S = omega*r / v:
   * C_L = clamp(clLinear*S + clQuad*S^2, 0, maxCl), with S itself clamped
   * to maxSpinRatio (saturation), and exponential spin decay in flight.
   */
  magnus: {
    maxSpinRatio: number;
    maxCl: number;
    clLinear: number;
    clQuad: number;
    spinDecayPerS: number;
  };
}

/** A named landmark on an anchor plane, in plane coordinates (meters). */
export interface AnchorPoint {
  name: string;
  xM: number;
  yM: number;
}

/**
 * A physical structure of known metric dimensions used to anchor the
 * monocular scene to a world frame: detected image corners of the template
 * are matched to `points` (same order) and solved as a plane homography.
 *
 * Plane coordinates: x runs across the structure; for vertical planes
 * (goal mouth) y runs up from the ground, for horizontal planes (court,
 * rim plane) y runs along the second ground axis. `planeHeightM` is the
 * height of the plane's origin above the ground.
 */
export interface WorldAnchorTemplate {
  id: string;
  sport: SportId;
  plane: 'vertical' | 'horizontal';
  planeHeightM: number;
  widthM: number;
  heightM: number;
  points: AnchorPoint[];
}

/**
 * Event grammar — the three-phase vocabulary every sport analysis shares:
 * a contact (foot/hand/racquet strikes ball), a flight (tracked
 * trajectory), and an outcome (goal-line cross, rim result, landing call).
 */
export interface EventGrammar {
  contact: string;
  flight: string;
  outcome: string;
}

/** A headline power/performance metric the sport's results screen reports. */
export interface PowerMetricDef {
  id: string;
  label: string;
  unit: 'km/h' | 'mph' | 'm/s' | 'deg';
  /** Typical competitive range in `unit` (gauge scaling, coaching context). */
  typicalRange: [number, number];
}

export interface SportProfile {
  id: SportId;
  name: string;
  ball: BallSpec;
  anchors: WorldAnchorTemplate[];
  events: EventGrammar;
  powerMetrics: PowerMetricDef[];
}

const ballArea = (diameterM: number): number =>
  Math.PI * (diameterM / 2) * (diameterM / 2);

// ---------------------------------------------------------------------------
// World anchor templates (exact rulebook dimensions)
// ---------------------------------------------------------------------------

/** Full-size soccer goal mouth: 7.32 m wide, 2.44 m to the crossbar. */
export const SOCCER_GOAL: WorldAnchorTemplate = {
  id: 'soccer-goal',
  sport: 'soccer',
  plane: 'vertical',
  planeHeightM: 0,
  widthM: 7.32,
  heightM: 2.44,
  points: [
    { name: 'post-bottom-left', xM: 0, yM: 0 },
    { name: 'post-bottom-right', xM: 7.32, yM: 0 },
    { name: 'crossbar-right', xM: 7.32, yM: 2.44 },
    { name: 'crossbar-left', xM: 0, yM: 2.44 },
  ],
};

/** Basketball rim: 0.4572 m inner diameter, plane at 3.048 m. */
export const BASKETBALL_HOOP: WorldAnchorTemplate = {
  id: 'basketball-hoop',
  sport: 'basketball',
  plane: 'horizontal',
  planeHeightM: 3.048,
  widthM: 0.4572,
  heightM: 0.4572,
  points: [
    { name: 'rim-front', xM: 0.2286, yM: 0 },
    { name: 'rim-right', xM: 0.4572, yM: 0.2286 },
    { name: 'rim-back', xM: 0.2286, yM: 0.4572 },
    { name: 'rim-left', xM: 0, yM: 0.2286 },
  ],
};

/** Tennis doubles court: 23.77 m x 10.97 m (x across, y downcourt). */
export const TENNIS_COURT: WorldAnchorTemplate = {
  id: 'tennis-court',
  sport: 'tennis',
  plane: 'horizontal',
  planeHeightM: 0,
  widthM: 10.97,
  heightM: 23.77,
  points: [
    { name: 'corner-near-left', xM: 0, yM: 0 },
    { name: 'corner-near-right', xM: 10.97, yM: 0 },
    { name: 'corner-far-right', xM: 10.97, yM: 23.77 },
    { name: 'corner-far-left', xM: 0, yM: 23.77 },
  ],
};

/** Pickleball court: 13.41 m x 6.10 m (44 ft x 20 ft; x across, y downcourt). */
export const PICKLEBALL_COURT: WorldAnchorTemplate = {
  id: 'pickleball-court',
  sport: 'pickleball',
  plane: 'horizontal',
  planeHeightM: 0,
  widthM: 6.1,
  heightM: 13.41,
  points: [
    { name: 'corner-near-left', xM: 0, yM: 0 },
    { name: 'corner-near-right', xM: 6.1, yM: 0 },
    { name: 'corner-far-right', xM: 6.1, yM: 13.41 },
    { name: 'corner-far-left', xM: 0, yM: 13.41 },
  ],
};

// ---------------------------------------------------------------------------
// Ball specs
// ---------------------------------------------------------------------------

/** FIFA size-5 ball: 0.22 m diameter, 0.43 kg. */
const SOCCER_BALL: BallSpec = {
  diameterM: 0.22,
  massKg: 0.43,
  areaM2: ballArea(0.22),
  // Drag crisis near 12-15 m/s (Asai 2007); post-critical C_D ~0.2.
  dragTable: [
    [0, 0.47],
    [8, 0.47],
    [11, 0.42],
    [14, 0.27],
    [18, 0.22],
    [25, 0.2],
    [40, 0.2],
  ],
  magnus: {
    maxSpinRatio: 0.35,
    maxCl: 0.33,
    clLinear: 1.4,
    clQuad: -1.6,
    spinDecayPerS: 0.05,
  },
};

/** Size-7 basketball: 0.242 m diameter, 0.624 kg. */
const BASKETBALL: BallSpec = {
  diameterM: 0.242,
  massKg: 0.624,
  areaM2: ballArea(0.242),
  // Shot speeds (5-10 m/s) stay sub-critical: C_D ~0.54 (Okubo & Hubbard).
  dragTable: [
    [0, 0.54],
    [6, 0.54],
    [10, 0.52],
    [15, 0.5],
    [25, 0.5],
  ],
  magnus: {
    maxSpinRatio: 0.3,
    maxCl: 0.28,
    clLinear: 1.0,
    clQuad: -1.0,
    spinDecayPerS: 0.06,
  },
};

/** ITF ball: 0.067 m diameter, 0.0577 kg. */
const TENNIS_BALL: BallSpec = {
  diameterM: 0.067,
  massKg: 0.0577,
  areaM2: ballArea(0.067),
  // Fuzz keeps the boundary layer tripped: C_D ~0.55 across the speed range.
  dragTable: [
    [0, 0.62],
    [10, 0.59],
    [20, 0.56],
    [35, 0.55],
    [60, 0.55],
  ],
  magnus: {
    maxSpinRatio: 0.6,
    maxCl: 0.5,
    clLinear: 1.2,
    clQuad: -0.9,
    spinDecayPerS: 0.04,
  },
};

/** Outdoor pickleball: 0.074 m diameter, 0.024 kg perforated plastic. */
const PICKLEBALL: BallSpec = {
  diameterM: 0.074,
  massKg: 0.024,
  areaM2: ballArea(0.074),
  // Perforations keep C_D near 0.40 with little speed dependence.
  dragTable: [
    [0, 0.45],
    [5, 0.42],
    [10, 0.4],
    [20, 0.4],
    [30, 0.4],
  ],
  magnus: {
    maxSpinRatio: 0.4,
    maxCl: 0.22,
    clLinear: 0.8,
    clQuad: -0.8,
    spinDecayPerS: 0.08,
  },
};

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

const PROFILES: Record<SportId, SportProfile> = {
  soccer: {
    id: 'soccer',
    name: 'Soccer',
    ball: SOCCER_BALL,
    anchors: [SOCCER_GOAL],
    events: {
      contact: 'kick',
      flight: 'shot flight',
      outcome: 'goal-line cross',
    },
    powerMetrics: [
      {
        id: 'shot-speed',
        label: 'Shot speed',
        unit: 'km/h',
        typicalRange: [45, 120],
      },
    ],
  },
  basketball: {
    id: 'basketball',
    name: 'Basketball',
    ball: BASKETBALL,
    anchors: [BASKETBALL_HOOP],
    events: {
      contact: 'release',
      flight: 'shot arc',
      outcome: 'rim result',
    },
    powerMetrics: [
      {
        id: 'release-speed',
        label: 'Release speed',
        unit: 'm/s',
        typicalRange: [6, 10],
      },
      {
        id: 'release-angle',
        label: 'Release angle',
        unit: 'deg',
        typicalRange: [45, 55],
      },
    ],
  },
  tennis: {
    id: 'tennis',
    name: 'Tennis',
    ball: TENNIS_BALL,
    anchors: [TENNIS_COURT],
    events: {
      contact: 'racquet impact',
      flight: 'ball flight',
      outcome: 'landing call',
    },
    powerMetrics: [
      {
        id: 'serve-speed',
        label: 'Serve speed',
        unit: 'km/h',
        typicalRange: [120, 220],
      },
    ],
  },
  pickleball: {
    id: 'pickleball',
    name: 'Pickleball',
    ball: PICKLEBALL,
    anchors: [PICKLEBALL_COURT],
    events: {
      contact: 'paddle impact',
      flight: 'ball flight',
      outcome: 'landing call',
    },
    powerMetrics: [
      {
        id: 'drive-speed',
        label: 'Drive speed',
        unit: 'km/h',
        typicalRange: [40, 90],
      },
    ],
  },
};

export function getSportProfile(id: SportId): SportProfile {
  return PROFILES[id];
}
