/**
 * Balancing values and texts of the promo announcements feature.
 * Durations are simulated seconds: the timers stop while the game is paused.
 */
export const PROMO_CONFIG = {
  /** Random delay between the end of a promo and the next one. */
  interval: {
    min: 25,
    max: 45,
  },
  promo: {
    /** How long the AI attractor pulls the crowd to the promo aisle. */
    duration: 10,
    /** Chance in [0, 1] that an enemy goes to the promo instead of the player. */
    pull: 0.85,
  },
  /** Commentator line. "{aisle}" is replaced by the aisle number. */
  shout: "ET C'EST LA PROMOOOO AU RAYON {aisle} !!",
  /** One offer is picked at random for each promo. "{aisle}" is replaced by the aisle number. */
  offers: [
    'Chaussettes orphelines à -90 % au rayon {aisle} !!',
    "De l'air frais en bouteille, deux achetées, trois offertes !!",
    'La baguette XXL de deux mètres au rayon boulangerie !!',
    "Tout est gratuit pour les tontons qui s'appellent Gilbert !!",
  ],
  /** Big on-screen text, shown for this many seconds. */
  announcement: {
    duration: 4,
  },
  /** Confetti markers above the promo aisle. */
  marker: {
    /** Height of the bursts above the floor, in metres. */
    height: 3.8,
    /** Number of bursts during one promo, evenly spread over its duration. */
    bursts: 4,
    /** Fraction of the aisle half-length where bursts can land. */
    spread: 0.8,
    count: 18,
    speed: 5,
    size: 0.22,
    life: 1.4,
    gravity: -6,
    colors: [0xff4d6d, 0xffd60a, 0x4cc9f0, 0x80ed99, 0xb388ff],
  },
  /** Synthesized jingle played when a promo starts. */
  jingle: {
    notes: [
      { freq: 523, delay: 0, duration: 0.12, volume: 0.18 },
      { freq: 659, delay: 0.12, duration: 0.12, volume: 0.18 },
      { freq: 784, delay: 0.24, duration: 0.12, volume: 0.18 },
      { freq: 1046, delay: 0.36, duration: 0.35, volume: 0.2 },
    ],
    /** Crowd cheering, a filtered noise burst. */
    crowd: {
      delay: 0.1,
      duration: 1.6,
      volume: 0.12,
      filterFreq: 1400,
    },
  },
} as const;
