/** Balancing values and look of the Mamie Cabas enemy. Every tunable number lives here. */
export const MAMIE_CABAS_CONFIG = {
  id: 'mamie-cabas',
  displayName: 'Mamie Cabas',
  /** Score awarded on death, before the combo multiplier. */
  points: 30,
  /** Overrides applied on top of DEFAULT_ENEMY_STATS. */
  stats: {
    maxHealth: 80,
    /** Run speed in m/s (slow). */
    speed: 2,
    damage: 18,
    attackForce: 22,
    attackRange: 2,
    /** Seconds between two tourniquet swings. */
    attackCooldown: 2,
    /** Seconds of telegraphed spin before the swing lands. */
    attackWindup: 0.6,
    mass: 60,
    /** Divides incoming knockback: very hard to push around. */
    sturdiness: 2.5,
    scale: 0.9,
  },
  look: {
    /** Violet coat. */
    shirt: 0x6a4c93,
    pants: 0x4a4e69,
    skin: 0xf1c27d,
    /** Light grey hair in a bun. */
    hair: 0xdcdcdc,
    hairStyle: 'bun',
    accessories: ['glasses', 'bag'],
    /** Color of the shopping bag (cabas). */
    bag: 0x2a9d8f,
  },
  tourniquet: {
    /** Horizontal radius of the spinning bag swing, in meters. */
    radius: 2.3,
    /** Spin speed of the upper body during the windup and swing, in rad/s. */
    spinSpeed: 14,
    /** Extra spin time after the windup ends, in seconds. */
    spinTail: 0.4,
    /** Velocity change, in m/s, given to other enemies caught in the swing. */
    pushSpeed: 6,
    /** Seconds the speech bubble stays on screen. */
    bubbleDuration: 1.5,
    /** Height of the speech bubble above the feet, in local units. */
    bubbleHeight: 2.75,
    lines: ['Ah ça, jeune homme !', 'Je faisais la queue !', 'Mon cabas !', 'De mon temps...'],
  },
} as const;
