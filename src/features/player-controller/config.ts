/** Balancing values of the arcade player controller. */
export const PLAYER_CONTROLLER_CONFIG = {
  move: {
    runSpeed: 7.5,
    /** Velocity blend rate on the ground (1/s): high = snappy. */
    groundAcceleration: 28,
    airAcceleration: 10,
  },
  jump: {
    velocity: 9.5,
    /** Gravity multiplier while rising / falling: heavier fall feels punchier. */
    riseGravity: 1.1,
    fallGravity: 1.9,
    /** Seconds after leaving a ledge during which a jump is still allowed. */
    coyoteTime: 0.1,
    /** Seconds a jump press is remembered before landing. */
    bufferTime: 0.12,
  },
  dive: {
    /** Belly-slide start speed (m/s). */
    speed: 15,
    /** Speed decay rate while sliding (1/s). */
    friction: 3.2,
    duration: 0.7,
    invulnerability: 0.45,
    /** Time spent getting back up, without control. */
    getUp: 0.35,
    cooldown: 0.9,
    /** Enemies touched during the slide are bowled over. */
    hitRadius: 1.1,
    hitDamage: 4,
    hitForce: 9,
    hitStun: 1.1,
  },
  punch: {
    /** Seconds after a punch during which the next combo step can be chained. */
    comboWindow: 0.55,
    /** Minimum time between two punches. */
    cooldown: 0.22,
    range: 1.5,
    arc: Math.PI * 0.6,
    /** Damage, knockback and lift of punches 1, 2 and 3 (uppercut). */
    steps: [
      { damage: 6, force: 5, lift: 1, stun: 0.35 },
      { damage: 6, force: 6, lift: 1, stun: 0.35 },
      { damage: 14, force: 9, lift: 9, stun: 0.9 },
    ],
  },
} as const;
