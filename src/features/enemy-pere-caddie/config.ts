/** Balancing and layout values for the "Papa Caddie" enemy. */
export const PERE_CADDIE_CONFIG = {
  /** Base stats handed to BaseEnemy (copied per instance, so speed can change later). */
  stats: {
    maxHealth: 50,
    speed: 2.2,
    mass: 90,
    sturdiness: 1.8,
    damage: 12,
    scale: 1.08,
    radius: 0.45,
    halfHeight: 0.5,
  },
  /** Physical and visual size of the shopping cart (metres). */
  cart: {
    width: 1,
    height: 1,
    length: 1.4,
    /** Distance between the enemy's feet and the cart centre, along the walking direction. */
    forwardOffset: 1.1,
  },
  /** Periodic shove the cart delivers in front of itself. */
  sweep: {
    /** Seconds between two shoves. */
    interval: 0.3,
    /** Reach of the shove from its origin, in metres. */
    range: 1.2,
    /** Full cone angle in radians. */
    arc: 1.8,
    /** Damage per shove (applied to every target touched, including enemies). */
    damage: 2,
    /** Forward impulse of the shove. */
    pushForce: 18,
    /** Lateral impulse, alternating left and right each shove. */
    lateralForce: 6,
    /** Upward impulse, so the victims stumble. */
    liftForce: 4,
  },
  /** When the enemy gives up its cart. */
  loss: {
    /** Fraction of max health below which the cart is lost. */
    healthRatio: 0.5,
    /** Walk speed (m/s) once the cart is gone: same as a normal shopper. */
    speedAfterLoss: 3.5,
    /** Speed (m/s) the abandoned cart rolls forward with when it is left as a prop. */
    dropSpeed: 2,
  },
  /** Cart produce pile: small coloured boxes on top of the basket. */
  produceBoxSize: 0.22,
} as const;
