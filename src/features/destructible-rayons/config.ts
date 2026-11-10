/** A kind of product a shelf can drop when it falls. */
export interface ProductTheme {
  readonly id: string;
  /** French label, used in the in-game message. */
  readonly name: string;
  /** Primitive used for both the visual and the physics collider. */
  readonly shape: 'box' | 'cylinder' | 'ico';
  /** Full size in metres: width (diameter for round shapes), height, depth. */
  readonly size: readonly [number, number, number];
  readonly colors: readonly number[];
}

/** Balancing values of the destructible shelves. */
export const RAYONS_CONFIG = {
  /** Mass of one shelf unit in kg. Heavy: only big impacts move it. */
  mass: 300,
  friction: 0.9,

  impact: {
    /**
     * A dynamic body hitting a stable shelf starts a wobble when it is both fast enough and
     * heavy enough. Checked against the real weapons:
     * - runaway cart of Tonton Gilbert: 9 m/s x 30 kg = 270 kg.m/s, starts a wobble;
     * - charged caddie (8 m/s x 20 kg = 160) and walking shoppers (3.5 m/s x 70 kg) do not.
     */
    contactSpeed: 6,
    contactMomentum: 200,
    /**
     * Explosion force (velocity change, m/s) needed to start a wobble when the blast reaches
     * the shelf. The water pack explosion uses 12.
     */
    explosionForce: 10,
    /** Horizontal distance (m) from a shelf footprint at which a strong hit starts a wobble. */
    hitReach: 1.2,
    /**
     * Knockback (velocity change, m/s) of a hit that starts a wobble when it lands near a
     * shelf. 10 is a strong hit; the caddie charge (12) and the runaway cart (14) qualify.
     */
    hitForce: 10,
  },

  wobble: {
    /** Random duration range (s) of the sway before the shelf decides what to do. */
    minDuration: 4.5,
    maxDuration: 6.5,
    /** Peak tilt of the sway, in radians. */
    amplitude: 0.16,
    /** Two sway frequencies in Hz, mixed so the lean never looks regular. */
    frequencies: [0.7, 1.1] as const,
    /** Chance that the sway ends with the shelf tipping over (otherwise it settles back). */
    tipChance: 0.6,
    /** Proportional gain of the controller that drives the tilt during the sway. */
    gain: 25,
    /** Clamp of the angular speed commanded to the shelf (rad/s). */
    maxAngularSpeed: 4,
    /** Seconds allowed for a shelf to settle back upright after a sway that did not tip. */
    recoverTimeout: 2.5,
  },

  hesitation: {
    /** Seconds the shelf stays leaning before it goes over. */
    duration: 0.9,
    /** Lean angle (rad) held during the hesitation. */
    lean: 0.2,
  },

  push: {
    /** Angular speed (rad/s) of the final push. */
    angularSpeed: 1.6,
    /** Tilt (rad) past which physics takes over: the centre of mass is beyond the edge. */
    releaseAngle: 0.7,
  },

  fall: {
    /** Tilt (rad) above which the shelf counts as lying down. */
    settleAngle: 1.0,
    /** Angular speed (rad/s) below which the fall counts as finished. */
    settleSpeed: 0.1,
    /** Seconds the shelf must stay still and lying down. */
    settleTime: 0.35,
    /** Safety timeout (s) after which a fall is forced to end. */
    timeout: 5,
  },

  crush: {
    /** Small damage: being crushed mostly means being launched. */
    damage: 6,
    /**
     * Upward speed (m/s) given to a crushed enemy: the trampoline effect. 9 is just under a
     * strong hit (10), so the flight lasts about 1.5 s and peaks near 2 m.
     */
    bounceSpeed: 9,
    /** Sideways speed (m/s) of the bounce, away from the shelf. */
    sideSpeed: 2.5,
    /** Seconds of stun during the bounce (the enemy cannot steer in the air). */
    stun: 0.7,
    /** Extra margin (m) around the falling shelf used to detect crushed enemies. */
    margin: 0.4,
  },

  products: {
    /** Dynamic product bodies spawned per shelf when it falls. */
    bodiesPerShelf: 10,
    /** Pooled-looking particles burst per shelf when it falls (cheap, no physics). */
    particlesPerShelf: 16,
    /** Hard cap on live product bodies in the whole arena. */
    maxBodies: 40,
    /** Seconds before a product body is removed. */
    lifetime: 6,
    mass: 0.5,
    friction: 0.6,
    restitution: 0.2,
  },

  feedback: {
    /** Screen shake when a wobble starts, and when a shelf lands. */
    wobbleTrauma: 0.12,
    landingTrauma: 0.5,
    /** Gain of the creak and thud sounds. */
    creakVolume: 0.08,
    thudVolume: 0.25,
  },
} as const;

/** Product themes: each shelf picks one at random when the arena is built. */
export const PRODUCT_THEMES: readonly ProductTheme[] = [
  {
    id: 'bouteilles',
    name: "bouteilles d'eau",
    shape: 'cylinder',
    size: [0.3, 0.9, 0.3],
    colors: [0x4cc9f0, 0x1982c4, 0xe9f5ff],
  },
  {
    id: 'legumes',
    name: 'légumes',
    shape: 'ico',
    size: [0.36, 0.36, 0.36],
    colors: [0x8ac926, 0xf77f00, 0xe63946, 0xfcbf49],
  },
  {
    id: 'papier-toilette',
    name: 'papier toilette',
    shape: 'cylinder',
    size: [0.42, 0.3, 0.42],
    colors: [0xf4f1ea, 0xff70a6],
  },
  {
    id: 'cereales',
    name: 'céréales',
    shape: 'box',
    size: [0.5, 0.75, 0.18],
    colors: [0xfcbf49, 0xf77f00, 0x2a9d8f],
  },
];
