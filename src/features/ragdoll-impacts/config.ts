/** Balancing values for the ragdoll-impacts feature. Lengths in meters, masses in kg, impulses in N·s. */
export const RAGDOLL_CONFIG = {
  /** Minimum hit force length that launches an enemy into a flight. */
  minImpactForce: 12,
  /** Horizontal knockback multiplier applied on top of the regular hit impulse. */
  knockbackMultiplier: 1.8,
  /** Extra upward velocity given at launch (m/s), which sets the height of the flight. */
  liftVelocity: 6,
  /** Seconds the enemy stays knocked out (ragdoll) before it gets back up. */
  knockoutDuration: 1.6,
  /** Spin impulse applied at launch so the enemy tumbles in the air. */
  spinTorque: 90,
  /** Restitution of the enemy body while it flies, so it bounces on the floor and the shelves. */
  bounce: 0.45,
  /** Upward velocity (m/s) given on recovery, the little "as if nothing happened" hop. */
  recoverHop: 2.5,
  /** Standing height of a scale-1 character, used to scale the limb layout (see characterFactory). */
  baseHeight: 1.95,
  /** Distance from the feet to the center of the enemy body (capsule half height + radius). */
  feetToCenter: 0.88,
  /** Joint anchors on the enemy body, relative to its center, at scale 1. */
  anchors: {
    shoulderX: 0.38,
    shoulderY: 0.57,
    hipX: 0.14,
    hipY: -0.03,
  },
  /** Physical limbs attached to the enemy body by spherical joints. */
  limbs: {
    armHalfLength: 0.3,
    legHalfLength: 0.4,
    halfThickness: 0.07,
    mass: 4,
    restitution: 0.6,
    friction: 0.6,
    linearDamping: 0.2,
    angularDamping: 0.5,
  },
  /** Visual sparkle emitted when the enemy gets back up. */
  recoverSparkles: {
    count: 12,
    size: 0.3,
    speed: 3,
    gravity: 2,
  },
} as const;
