/** Inclusive range of random values. */
export interface Range {
  min: number;
  max: number;
}

/** One note of the chime played when a wave starts. */
export interface ChimeNote {
  freq: number;
  /** Seconds after the start of the chime. */
  delay: number;
  duration: number;
}

/** Balancing values of the wave system. Every number tuned by hand lives here. */
export const WAVE_CONFIG = {
  /** Seconds between the start of the run and the first wave. */
  firstWaveDelay: 4,
  /** Seconds of store-light crackling between two waves. */
  pauseDuration: 6,
  /** Enemies in wave 1, before the difficulty trend and the surprise multiplier. */
  baseCount: 5,
  /** Extra enemies added by each new wave (the general trend). */
  countPerWave: 1.5,
  /** Hard cap on the number of enemies in one wave. */
  maxCountPerWave: 36,

  surprise: {
    /** Chance that a wave (from wave 2 on) is an easy one, followed by a huge wave. */
    easyChance: 0.25,
    /** Enemy count multiplier of an easy wave. */
    easyMultiplier: { min: 0.4, max: 0.6 } satisfies Range,
    /** Enemy count multiplier of the huge wave that follows an easy one. */
    hugeMultiplier: { min: 1.8, max: 2.6 } satisfies Range,
  },

  rush: {
    /** Enemies entering through the doors at the same instant. */
    perBurst: 4,
    /** Seconds between two bursts of the rush. */
    burstInterval: 0.25,
    /** Random offset around a door point, so enemies do not overlap. */
    offsetX: 1,
    offsetZ: 0.6,
    /** Height at which enemies are spawned. */
    spawnY: 0.2,
    /** Sound of the doors opening. */
    whoosh: { duration: 0.35, volume: 0.12, filterFreq: 1800 },
    /** Colours of the dust puffs at the doors. */
    dustColors: [0xf2efe6, 0xc9d6df, 0xffe066],
  },

  boss: {
    /** Enemy id of the boss (Mohamed Le Mur). Only one can be alive at a time. */
    typeId: 'vigile',
    /** Chance that a wave brings the boss. */
    chancePerWave: 0.2,
    /** Seconds after the start of the rush at which the boss may walk in. */
    spawnDelay: { min: 3, max: 8 } satisfies Range,
  },

  /** Enemy ids never picked for a normal wave (bosses and special characters). */
  excludedTypeIds: ['vigile', 'caissiere'] as readonly string[],
  /** Relative chance of each normal enemy type. Unlisted types use defaultWeight. */
  enemyWeights: {
    client: 6,
  } as Readonly<Partial<Record<string, number>>>,
  defaultWeight: 1,

  lights: {
    /** Seconds between two changes of the crackling light intensity. */
    flickerInterval: { min: 0.05, max: 0.25 } satisfies Range,
    /** Intensity multiplier while the light is crackling. */
    flickerLevel: { min: 0.1, max: 1.3 } satisfies Range,
    /** Chance that a crackle is a full blackout, with a short electric sound. */
    blackoutChance: 0.2,
  },

  announcement: {
    /** Seconds the store voice stays on screen. */
    duration: 3.5,
    /** Store voice lines. "{wave}" is replaced with the wave number. */
    waveLines: [
      'Chers clients, les soldes commencent MAINTENANT !',
      'Vague {wave} : les caisses sont ouvertes, les prix sont fous !',
      'Vague {wave} : plus de clients, toujours plus de -70 % !',
      'Vague {wave} : ruez-vous sur les promos, il n’y en aura pas pour tout le monde.',
    ] as readonly string[],
    /** Store voice line when the boss walks in. */
    bossLine: 'Attention, Mohamed Le Mur arrive par la porte !',
  },

  /** Notes of the chime played when a wave starts. */
  chime: [
    { freq: 523.25, delay: 0, duration: 0.18 },
    { freq: 659.25, delay: 0.12, duration: 0.18 },
    { freq: 783.99, delay: 0.24, duration: 0.35 },
  ] as readonly ChimeNote[],
} as const;
