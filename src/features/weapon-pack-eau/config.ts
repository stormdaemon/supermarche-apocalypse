/** Balancing values of the water pack weapon. */
export const WEAPON_PACK_EAU_CONFIG = {
  /** Mass of the full pack, in kg. */
  mass: 9,
  /** Horizontal distance the pack can be thrown, in metres. */
  maxRange: 9,
  /** Flight time for a throw at point-blank range, in seconds. */
  flightTimeMin: 0.7,
  /** Flight time for a throw at maximum range, in seconds. */
  flightTimeMax: 1.3,
  /** Height above the aimed ground point where the pack is meant to land, in metres. */
  landingHeight: 0.2,
  /** Number of points drawn on the dotted aim curve. */
  guidePoints: 20,
  explosion: {
    radius: 3,
    force: 12,
    damage: 25,
  },
  bottles: {
    /** Bottles launched by one explosion. */
    count: 6,
    /** Horizontal launch speed, in m/s. */
    speed: 7,
    /** Vertical launch speed, in m/s. */
    upward: 4,
    /** Seconds before a bottle disappears. */
    lifetime: 6,
    /** Mass of one bottle, in kg. */
    mass: 0.4,
    /** Collider radius of one bottle, in metres. */
    radius: 0.07,
    /** Collider half height of one bottle, in metres. */
    halfHeight: 0.14,
    /** Damage dealt by one bottle hitting an enemy. */
    damage: 3,
    /** Seconds an enemy is stunned by one bottle. */
    stunTime: 1,
    /** Minimum bottle speed, in m/s, for a contact to count as a hit. */
    hitMinSpeed: 3,
  },
} as const;
