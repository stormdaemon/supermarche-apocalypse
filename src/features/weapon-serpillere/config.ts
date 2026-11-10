/** Balancing values of the serpillière (mop) weapon. */
export const SERPILLIERE_CONFIG = {
  /** Seconds between two sweeps. */
  cooldown: 0.8,
  /** Horizontal reach of the sweep, in metres. */
  range: 2.3,
  /** Height above the feet where the sweep is centred, in metres. */
  sweepHeight: 0.6,
  /** Damage dealt to each enemy caught in the sweep. */
  damage: 9,
  /** Horizontal push applied radially, away from the player. */
  force: 6,
  /** Upward component of the push. */
  lift: 2.5,
  /** Stagger time after a hit, in seconds. */
  stun: 0.35,
  /** Mass of the mop when it lies on the ground, in kg. */
  mass: 2,
  /** Duration of the full spin animation, in seconds. */
  spinDuration: 0.35,
  puddle: {
    /** Radius of a puddle left at each sweep, in metres. */
    radius: 1.5,
    /** Lifetime of a puddle, in simulated seconds. */
    duration: 8,
    /** Final seconds during which the puddle fades out. */
    fadeDuration: 1.5,
    /** Steering control inside the puddle (1 = normal grip). */
    control: 0.08,
    color: 0x4cc9f0,
    opacity: 0.45,
    /** Maximum number of puddles alive at once; the oldest is removed first. */
    maxCount: 6,
  },
  slip: {
    /** Seconds between two checks of enemies standing in puddles. */
    interval: 0.25,
    /** Probability that an enemy standing in a puddle slips at each check. */
    chance: 0.15,
    /** Seconds an enemy stays down after slipping. */
    fallDuration: 1.2,
    /** Impulse that slides a fallen enemy away from the puddle centre. */
    slideImpulse: 120,
    /** Minimum seconds between two slip toasts. */
    toastCooldown: 2.5,
    toastText: 'Ça glisse !',
  },
  splash: {
    count: 16,
    colors: [0x4cc9f0, 0x1982c4, 0xffffff],
    size: 0.18,
    speed: 4.5,
    life: 0.6,
  },
} as const;
