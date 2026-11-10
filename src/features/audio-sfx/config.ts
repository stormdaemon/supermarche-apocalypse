/** A single syllable of a crowd shout: a formant-filtered sawtooth gliding from one pitch to another. */
export interface ShoutSyllable {
  /** Starting pitch in Hz. */
  fromFreq: number;
  /** Pitch reached at the end of the syllable, in Hz. */
  toFreq: number;
  /** Centre of the vowel filter in Hz (the formant). */
  formant: number;
  /** Length of the syllable in seconds. */
  duration: number;
}

/**
 * Tuning values of the audio-sfx feature: volumes, pitches, cooldowns and frequencies.
 * Every sound is synthesized, there are no audio files.
 */
export const AUDIO_SFX_CONFIG = {
  /** localStorage key holding the mute state ('1' = muted). */
  storageKey: 'supermarche-apocalypse.audio.muted',
  /** Keyboard key toggling the mute, bound as the custom action 'custom:mute'. */
  muteKey: 'm',

  mixer: {
    /** Maximum number of synthesized sounds playing at the same time. */
    maxVoices: 16,
  },

  /** Random pitch variation applied to every sound, as a ratio (0.1 = plus or minus 10%). */
  pitchJitter: 0.1,

  impact: {
    /** Hits at or above this damage (or any explosion) play the PAF. */
    heavyDamage: 25,
    /** Hits at or above this damage, below the heavy threshold, play the BOING. */
    mediumDamage: 10,
    /** Minimum delay between two sounds of the same impact type, in seconds. */
    cooldown: 0.05,
    /** Sine with a fast pitch sweep up then down. */
    boing: {
      freq: 420,
      peakFreq: 1000,
      endFreq: 260,
      duration: 0.32,
      volume: 0.22,
    },
    /** Short noise burst plus a low thump. */
    paf: {
      noiseFilter: 1800,
      thumpFrom: 150,
      thumpTo: 45,
      thumpDuration: 0.18,
      duration: 0.14,
      volume: 0.25,
    },
    /** Squeaky horn: sawtooth with a slight vibrato. */
    pouet: {
      freq: 340,
      endFreq: 250,
      duration: 0.3,
      volume: 0.12,
      filter: 2400,
      vibratoRate: 22,
      vibratoDepth: 18,
    },
  },

  checkout: {
    /** Minimum delay between two checkout beeps, in seconds. */
    cooldown: 0.12,
    firstFreq: 1760,
    firstDuration: 0.06,
    secondFreq: 2637,
    secondDuration: 0.1,
    volume: 0.1,
    /** Length of the whole beep, used by the mixer. */
    duration: 0.2,
  },

  caddie: {
    /** Hits whose kind contains this word play the shopping cart sounds. */
    keyword: 'caddie',
    /** Minimum delay between two cart sounds, in seconds. */
    cooldown: 0.3,
    duration: 0.5,
    /** Periodic high squeak of a wheel turning. */
    squeak: {
      chirps: 3,
      spacing: 0.11,
      fromFreq: 2200,
      toFreq: 2800,
      chirpDuration: 0.07,
      volume: 0.07,
    },
    /** Filtered noise clicks of metal rattling. */
    rattle: {
      clicks: 8,
      duration: 0.35,
      filter: 3200,
      clickDuration: 0.03,
      volume: 0.12,
    },
  },

  crowd: {
    /** Minimum delay between two shouts, in seconds. */
    cooldown: 1.2,
    /** Length of a shout, used by the mixer. */
    duration: 0.9,
    /** Seconds between shouts when there is one enemy alone. */
    maxInterval: 9,
    /** Seconds between shouts when the arena is saturated. */
    minInterval: 2,
    /** Enemy count at which shouts reach their maximum frequency. */
    saturationCount: 12,
    volume: 0.14,
    /** Resonance of the vowel filter: higher is more nasal. */
    formantQ: 6,
    syllableGap: 0.04,
    pitchJitter: 0.08,
    /** Shout patterns, picked at random. */
    shouts: [
      [{ fromFreq: 180, toFreq: 320, formant: 900, duration: 0.6 }],
      [
        { fromFreq: 280, toFreq: 200, formant: 1400, duration: 0.18 },
        { fromFreq: 260, toFreq: 300, formant: 1100, duration: 0.12 },
        { fromFreq: 300, toFreq: 230, formant: 700, duration: 0.3 },
      ],
    ],
  },

  jingle: {
    /** Minimum delay between two announcement jingles, in seconds. */
    cooldown: 0.5,
    duration: 0.8,
    volume: 0.2,
    /** Ding-dong: two sine notes, the second one lower. */
    notes: [
      { freq: 659, delay: 0, duration: 0.35 },
      { freq: 523, delay: 0.18, duration: 0.6 },
    ],
  },
};
