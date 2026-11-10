/** Balancing values of the Extincteur weapon. Visual-only values live in index.ts. */
export const EXTINGUISHER_CONFIG = {
  /** Mass of the extinguisher body, in kilograms. */
  mass: 6,
  charge: {
    /** Seconds of continuous spraying before the tank is empty. */
    capacity: 4,
  },
  push: {
    /** Seconds between two cone sweeps. */
    interval: 0.1,
    /** Reach of the cone, in meters. */
    range: 4,
    /** Full opening angle of the cone, in degrees. */
    arcDegrees: 50,
    /** Impulse magnitude applied along the aim direction. */
    force: 4,
    /** Damage per sweep hit (kept very low: the extinguisher pushes, it does not hurt). */
    damage: 1,
    /** Seconds an enemy loses control after being pushed. */
    stun: 0.25,
  },
  recoil: {
    /** Backwards speed applied to the player while spraying, in m/s. */
    speed: 5,
  },
  smoke: {
    /** Particles emitted on every fixed step while spraying. */
    particlesPerStep: 3,
    /** White and grey tones picked at random for each particle. */
    colors: [0xf4f1ea, 0xd9dde3, 0xb8c0cc] as const,
    size: 0.2,
    life: 0.9,
    speed: 3.5,
    /** Slightly positive: the cloud drifts upwards. */
    gravity: 1.5,
    spread: 0.35,
    /** Height of the spray origin above the feet, in meters. */
    originHeight: 1.1,
    /** Distance of the spray origin in front of the player, in meters. */
    originDistance: 0.9,
  },
  /** Short "pfff" puff emitted once when the tank runs out. */
  puff: {
    count: 12,
    speed: 3,
    size: 0.14,
    life: 0.6,
    gravity: 1.5,
    spread: 0.3,
  },
  /** Big cloud and small explosion when an empty extinguisher is thrown and lands. */
  emptyBlast: {
    count: 40,
    speed: 6,
    size: 0.35,
    life: 1.4,
    gravity: 0.8,
    radius: 2.2,
    force: 8,
    damage: 12,
  },
} as const;
