/** Balancing and tuning values of the baguette weapon. */
export const BAGUETTE_CONFIG = {
  attack: {
    /** Seconds between two swings. */
    cooldown: 0.25,
    /** Duration of the swing animation on the rig. */
    swingDuration: 0.2,
    /** Damage per enemy hit. */
    damage: 5,
    /** Sweep reach in metres. */
    range: 1.8,
    /** Full cone angle of the sweep, in degrees. */
    arcDegrees: 110,
    /** Horizontal knockback impulse applied to each hit enemy. */
    force: 3,
  },
  durability: {
    /** Number of swings touching at least one enemy before the baguette breaks. */
    hitsToBreak: 8,
  },
  model: {
    /** Full length of the baguette in metres. */
    length: 0.9,
    /** Radius of the baguette cylinder. */
    radius: 0.06,
    /** Number of lighter notches carved along the baguette. */
    notches: 4,
    /** Mass of the whole baguette in kilograms (light). */
    mass: 0.4,
    /** Half-width of the thin cuboid collider. */
    colliderHalfWidth: 0.05,
  },
  hold: {
    /** Offset of the baguette centre from the right hand, in hand space. */
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0.4,
    /** Pitch turning the Y axis of the baguette towards the forward axis (+Z). */
    pitch: Math.PI / 2,
  },
  crumbs: {
    /** Crumbs spawned on each swing that hits. */
    perHit: 10,
    /** Crumbs spawned when the baguette breaks. */
    perBreak: 40,
    /** Lifetime of a crumb in seconds. */
    life: 0.7,
    /** Initial speed of a crumb in m/s. */
    speed: 3,
    /** Size of a crumb. */
    size: 0.09,
    /** Vertical acceleration of a crumb. */
    gravity: -12,
    /** Cone spread of the rain of crumbs on a hit, in [0, 1]. */
    spread: 0.8,
    /** Crumb colours (beige and golden). */
    colors: [0xe8d2a8, 0xe0a93b, 0xf3e3bf] as const,
  },
  fragments: {
    /** Seconds before a broken piece is removed. */
    lifetime: 4,
    /** Horizontal impulse pushing each piece away from the player (kg m/s). */
    impulse: 0.6,
    /** Upward impulse given to each piece (kg m/s). */
    upwardImpulse: 0.5,
    /** Maximum random angular velocity applied to each piece (rad/s). */
    spin: 8,
    /** Mass of one piece in kilograms. */
    mass: 0.2,
  },
  colors: {
    wood: 0xc8922e,
    notch: 0xf2d28a,
  },
} as const;
