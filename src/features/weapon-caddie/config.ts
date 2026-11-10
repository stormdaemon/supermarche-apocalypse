/** Balancing values of the Caddie weapon. Distances in metres, times in seconds, speeds in m/s. */
export const CADDIE_CONFIG = {
  /** Mass of the cart when it lies on the ground, shared by its colliders. */
  mass: 20,
  /** Walking speed multiplier while the player pushes the cart. */
  carrySpeedMultiplier: 0.6,
  /** Position of the cart's origin relative to the player's rig when held. */
  holdOffset: { x: 0, y: 0.1, z: 1.1 },
  /** Cart geometry: basket size and wheel radius. */
  body: {
    width: 1,
    length: 1.4,
    wheelRadius: 0.1,
    wheelX: 0.42,
    wheelZ: 0.55,
    wallHeight: 0.65,
    friction: 0.1,
  },
  charge: {
    /** Time the player keeps charging after a click. */
    duration: 0.8,
    /** Time before the next charge can start, counted from the end of the previous one. */
    cooldown: 1.2,
    /** Forward push applied to the player during the charge. */
    pushSpeed: 8,
    /** Distance from the player's feet to the centre of the sweep, in front of the player. */
    reach: 1.3,
    /** Radius of the sweep sphere around its centre. */
    radius: 1.2,
    /** Full cone angle of the sweep in radians. */
    arc: 1.9,
    damage: 25,
    /** Horizontal impulse pushing the hit enemy away from the cart. */
    force: 12,
    /** Upward impulse that makes hit enemies tumble. */
    lift: 4,
    /** Seconds an enemy stays stunned after being run over. */
    stun: 1,
  },
  sparks: {
    /** Seconds between two spark bursts while charging. */
    interval: 0.05,
    count: 5,
    size: 0.07,
    life: 0.35,
  },
  throw: {
    /** Multiplier applied to the default thrown damage. */
    damageMultiplier: 1.5,
    /** Multiplier applied to the thrown velocity used as knockback. */
    forceMultiplier: 1.3,
    /** Seconds an enemy stays stunned after being hit by the thrown cart. */
    stun: 1,
  },
} as const;
