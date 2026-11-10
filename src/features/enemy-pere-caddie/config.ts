/** Balancing values of Tonton Gilbert, the panicking barbecue dad with his shopping cart. */
export const GILBERT = {
  id: 'pere-caddie',
  displayName: 'Tonton Gilbert',
  /** Score awarded on death, before the combo multiplier. */
  points: 60,

  /** Body stats. He is fragile and his own punch is weak. */
  stats: {
    maxHealth: 20,
    /** Punch damage, only used when he is cornered by the player. */
    damage: 4,
    attackRange: 1.3,
    attackCooldown: 1.6,
    attackWindup: 0.35,
    attackForce: 4,
    /** How fast he reaches his target speed (1/s). */
    acceleration: 6,
    mass: 70,
    radius: 0.38,
    halfHeight: 0.5,
    scale: 1.05,
    sturdiness: 1,
  },

  ai: {
    /** Distance (m) under which he sees the player and starts panicking. */
    panicRadius: 7,
    /** Within this distance he stops zigzagging and swings at the player. */
    cornerRange: 1.6,
    panicSpeed: 4.2,
    wanderSpeed: 1.1,
    /** Radius (m) around his spawn point where he wanders when calm. */
    wanderRadius: 5,
    /** Maximum step (m) away from the player for one zigzag goal. */
    zigzagForward: 2.5,
    /** Lateral distance (m) range of one zigzag goal. */
    zigzagSideMin: 2.5,
    zigzagSideMax: 5,
    /** Chance to switch lateral side on each decision. */
    flipChance: 0.5,
    /** Seconds between two decisions while panicking or wandering. */
    thinkMin: 0.25,
    thinkMax: 0.6,
    /** Keeps his goals away from the arena walls (m). */
    arenaMargin: 1.5,
  },

  shout: {
    text: 'Pas mes saucisses !!',
    /** Seconds the speech bubble stays visible. */
    duration: 2.2,
    /** Minimum seconds between two shouts. */
    cooldown: 4,
    /** Chance to shout on each decision while already panicking (once the cooldown is over). */
    chance: 0.25,
    /** Pitch (Hz) of the synthesized shout. */
    pitch: 620,
    /** Height of the speech bubble above his head (m). */
    offset: 0.9,
  },

  cart: {
    /** Half extents of the cart collider (m). */
    halfWidth: 0.42,
    halfHeight: 0.42,
    halfLength: 0.62,
    mass: 30,
    friction: 0.5,
    restitution: 0.2,
    /** Slows a runaway cart down over time. */
    linearDamping: 0.4,
    /** Distance (m) between Gilbert's centre and the cart centre while he pushes it. */
    holdDistance: 1.15,
    /** Spring stiffness (1/s) that makes the held cart follow him. */
    followGain: 12,
    /** Maximum speed (m/s) of the held cart while it catches up with him. */
    maxFollowSpeed: 10,
    /** Lag (m) above which the cart counts as stuck against something. */
    stallDistance: 0.9,
    /** Seconds stuck before he lets go of the cart. */
    stallSeconds: 0.6,
    /** Speed (m/s) under which a bump on a wall or shelf does not make him let go. */
    bumpMinSpeed: 2,
    /** A hard collider only counts as a bump when its top is this far (m) above the cart bottom. */
    bumpGroundMargin: 0.05,
    /** Launch speed (m/s) of the cart when he lets go. */
    runawaySpeed: 9,
    /** Speed (m/s) under which a runaway cart stops hurting what it touches. */
    minHurtSpeed: 3,
    /** Seconds a runaway cart stays on the floor before it disappears. */
    lifetime: 12,
    /** Seconds before the same cart can hit the same target again (one pass = one hit). */
    hitCooldown: 1,
    /** Seconds Gilbert is spared by his own cart right after letting go of it. */
    selfImmunity: 0.8,
    /** Damage of one hit from the runaway cart. */
    damage: 40,
    /** Horizontal knockback of one hit from the runaway cart (impulse units of Combat.hit). */
    knockback: 14,
    /** Vertical knockback of one hit from the runaway cart. */
    knockbackUp: 3,
    /** Stun duration (s) given to whatever the cart hits. */
    stun: 0.6,
  },

  /** Number of each grocery type heaped in the cart. */
  groceries: {
    watermelons: 4,
    baguettes: 7,
    cans: 14,
  },
} as const;
