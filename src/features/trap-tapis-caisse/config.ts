/** Balancing values of the checkout conveyor belts. */

/** A checkout added on top of the arena layout, at floor level (x, z). */
export interface ExtraCheckout {
  x: number;
  z: number;
}

export const TAPIS_CONFIG = {
  /** Extra checkouts placed on free floor, away from doors and aisles. */
  extraCheckouts: [
    { x: -18, z: -2 },
    { x: 18, z: -2 },
    { x: -18, z: -14 },
    { x: 18, z: -14 },
  ] as ExtraCheckout[],

  /** Counter used by the extra checkouts (the arena checkouts already have theirs). */
  counter: {
    /** Width along X, matches the arena checkouts. */
    width: 1.2,
    /** Length along Z, matches the arena checkouts. */
    length: 4,
    /** Height of the counter top. */
    height: 1.1,
  },

  belt: {
    /** Width of the belt along X, measured outwards from the counter face. */
    width: 2.2,
    /** Number of moving stripes across the belt. */
    stripeCount: 6,
    /** Width of one stripe along the flow. */
    stripeWidth: 0.14,
    /** Sharpness of the speed change towards the target speed (1/s). */
    speedSharpness: 2.5,
    /** Seconds between two speed changes, picked at random in this range. */
    switchInterval: { min: 2, max: 4.5 },
  },

  /** Possible belt behaviours, picked at random by weight at every switch. */
  modes: {
    slow: { weight: 0.4, speed: { min: 0.8, max: 1.8 }, color: 0x8ac926 },
    fast: { weight: 0.35, speed: { min: 4, max: 6.5 }, color: 0xf77f00 },
    /** Negative speed: the belt runs away from the counter. */
    reverse: { weight: 0.25, speed: { min: -3.5, max: -1.5 }, color: 0xe63946 },
  },

  colors: {
    base: 0x4a4e69,
    rail: 0x8d99ae,
    stripe: 0xfcbf49,
  },

  eject: {
    /** Distance from the counter face in which a body is caught (m). */
    catchDistance: 1.0,
    /** Minimum speed towards the counter needed to be ejected (m/s). */
    minSpeed: 0.3,
    /** Seconds before the same body can be ejected again. */
    cooldown: 1.2,
    player: {
      /** Horizontal launch speed towards the counter (m/s). */
      forward: 14,
      /** Upward launch speed (m/s). */
      up: 8,
      /** Seconds during which the player cannot steer while flying. */
      stun: 0.5,
    },
    enemy: {
      /** Horizontal launch speed towards the counter (m/s). */
      forward: 3.5,
      /** Upward launch speed (m/s). */
      up: 8,
      /** Seconds the enemy stays knocked out while flying. */
      stun: 0.8,
    },
    /** Puff of particles at the launch point. */
    fx: {
      color: [0xfcbf49, 0xffffff],
      count: 10,
      size: 0.25,
      speed: 3,
      gravity: -4,
    },
  },
} as const;
