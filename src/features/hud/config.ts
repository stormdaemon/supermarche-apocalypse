/** Tuning values of the HUD: sizes, counts, animation timings and prices. */
export const HUD_CONFIG = {
  /** Font sizes in pixels, applied as CSS variables on the document. */
  sizes: {
    heartPx: 30,
    starPx: 26,
    scorePx: 34,
    wavePx: 22,
    tagPx: 22,
  },
  hearts: {
    /** Hit points represented by one heart. The heart count is maxHealth / healthPerHeart. */
    healthPerHeart: 20,
    /** Horizontal shake distance of the hearts when the player is hit. */
    hitShakePx: 6,
    /** Duration of the hit shake and flash. */
    hitShakeMs: 350,
  },
  score: {
    /** Euros displayed for each point of score. */
    euroPerPoint: 1,
    /** Scale reached by the score pop when it goes up. */
    popScale: 1.25,
    /** Duration of the score pop. */
    popMs: 260,
  },
  combo: {
    /** Number of stars drawn; the combo lights one star per step up to this count. */
    maxStars: 5,
  },
  weapons: {
    /** Price in euros of a weapon id missing from `prices`. */
    defaultPrice: 4.99,
    /** Price tag values in euros, keyed by weapon id. */
    prices: {
      baguette: 0.99,
      caddie: 49.9,
      extincteur: 19.5,
      'pack-eau': 3.49,
      serpillere: 6.9,
    },
  },
} as const;
