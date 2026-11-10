import type { EnemyStats } from '../../core/enemies';

/** Display name of the mini-boss, shown on his dedicated health bar. */
export const VIGILE_NAME = 'Mohamed Le Mur';
/** Display name of the reinforcements he calls on his walkie-talkie. */
export const CAISSIERE_NAME = 'Caissière furieuse';

/** Every balancing value of the boss-vigile feature lives here. Times are in seconds. */
export const BOSS_CONFIG = {
  vigile: {
    /** Score awarded on defeat, before the combo multiplier. */
    points: 500,
    /** Overrides of the BaseEnemy defaults. */
    stats: {
      maxHealth: 260,
      speed: 3.2,
      acceleration: 6,
      damage: 14,
      attackRange: 1.8,
      attackCooldown: 1.6,
      attackWindup: 0.45,
      attackForce: 10,
      mass: 220,
      radius: 0.42,
      halfHeight: 0.55,
      scale: 1.45,
      sturdiness: 3,
    } satisfies Partial<EnemyStats>,
    /** Radians per second the boss turns to face the player. Hits from behind are judged on this facing. */
    turnSpeed: 2.5,
    /** A hit counts as coming from behind when the player is past this dot product with his facing. */
    behindThreshold: -0.2,
  },

  /** The wrestling move "le tourniquet": grab, spin, release in a random direction. */
  grab: {
    /** Seconds between two grabs. */
    cooldown: 7,
    /** How long the player spins in the air. */
    spinDuration: 2.4,
    /** Rotation speed of the spin, in radians per second. */
    spinSpeed: 9,
    /** Distance between the boss and the spun player, in meters. */
    orbitRadius: 1.6,
    /** Height reached by the spun player, in meters. */
    liftHeight: 1.1,
    /** Time taken to lift the player to full height. */
    rampDuration: 0.4,
    /** Horizontal launch speed of the release, in m/s: 20 is a flying hit. */
    releaseSpeed: 20,
    /** Vertical launch speed of the release, in m/s. */
    releaseLift: 7,
    /** Share of a hit force that core Player.applyHit already applies as velocity (0.6). */
    playerHitShare: 0.6,
    /** Damage dealt by the release. */
    damage: 22,
    /** Stun given to the player by the release, in seconds. */
    stun: 0.5,
    /** Multiplier applied to the grab cooldown once he panics. */
    panicCooldownFactor: 2,
  },

  /** Walkie-talkie: calls reinforcements while he has it. */
  talkie: {
    /** Seconds from the start of the fight before the first call. */
    firstCallDelay: 5,
    /** Seconds between two calls. */
    callCooldown: 14,
    /** Minimum number of caissières per call. */
    callMin: 2,
    /** Maximum number of caissières per call. */
    callMax: 3,
    /** Maximum number of caissières alive at the same time. */
    maxCaissieres: 6,
    /** Radius around a door where the reinforcements appear, in meters. */
    doorSpread: 1,
    /** Horizontal distance under which E steals the talkie, in meters. */
    reach: 2.4,
    /** Seconds the stolen talkie stays on the floor before it disappears. */
    propLifetime: 20,
    /** Horizontal speed given to the stolen talkie, in m/s. */
    kickSpeed: 4,
    /** Upward speed given to the stolen talkie, in m/s. */
    kickLift: 6,
  },

  /** Behaviour once the talkie is gone. */
  panic: {
    /** Multiplier on his run speed. */
    speedFactor: 1.6,
    /** Multiplier on his attack cooldown: he attacks less often. */
    attackCooldownFactor: 2.5,
    /** Probability, at each decision, that he runs at the player instead of wandering. */
    chaseChance: 0.35,
    /** Distance of his erratic wandering goals, in meters. */
    wanderRadius: 3,
  },

  /** Defeat: he runs to the nearest door and vanishes there. */
  flee: {
    /** Run speed, in m/s. */
    speed: 6,
    /** Longest time he can run before he vanishes anyway. */
    maxDuration: 8,
    /** Distance to the door at which he vanishes, in meters. */
    arrivalDistance: 1.2,
  },

  /** Caissière furieuse: a ranged enemy that throws receipt rolls. */
  caissiere: {
    /** Score awarded on defeat, before the combo multiplier. */
    points: 40,
    /** Overrides of the BaseEnemy defaults. */
    stats: {
      maxHealth: 25,
      speed: 3.4,
      acceleration: 6,
      mass: 60,
    } satisfies Partial<EnemyStats>,
    /** Distance she tries to keep from the player, in meters. */
    preferredRange: 5,
    /** Slack around the preferred distance before she moves again, in meters. */
    rangeTolerance: 1,
    /** Fraction of her run speed used when backing away. */
    backOffFactor: 0.7,
    /** Longest distance at which she throws, in meters. */
    throwRange: 10,
    /** Seconds between two throws. */
    throwCooldown: 2.4,
    /** Seconds of the throw animation before the roll leaves her hand. */
    throwWindup: 0.5,
    /** Height of the hand the roll leaves from, in meters. */
    throwHeight: 1.3,
    /** Height aimed at on the player (chest), in meters above the feet. */
    targetHeight: 0.9,
    /** Random aim error applied on each axis, in meters. */
    aimError: 0.8,
    /** Horizontal speed of the roll, in m/s. */
    rollSpeed: 13,
    /** Longest time a roll flies before it disappears, in seconds. */
    rollLifetime: 4,
    /** Damage dealt by a roll touching the player. */
    rollDamage: 6,
    /** Horizontal push given to the player by a roll, in m/s: 4 is a light shove. */
    rollPush: 4,
    /** Seconds a caissière stays on the floor before she leaves on her own (no score). */
    lifetime: 20,
  },

  /** Texts shown in game (French). */
  texts: {
    grabShout: 'PERSONNE NE PASSE LE MUR !!',
    reinforcements: 'Talkie : renforts en route !',
    talkieLost: 'Son talkie ! Il panique !',
    returns: 'Je reviendrai !!',
    stealHint: 'E : piquer le talkie',
  },
} as const;
