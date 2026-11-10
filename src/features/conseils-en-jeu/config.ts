/**
 * Balancing values and texts of the contextual tips.
 * Durations are simulated seconds: the tips freeze while the game is paused.
 */
export const CONSEILS_CONFIG = {
  /** localStorage key holding how many times each tip was shown (JSON object). */
  storageKey: 'supermarche-apocalypse:tips-shown',
  /** Seconds a tip stays on screen. */
  displaySeconds: 4.5,
  /** Seconds of quiet between the end of a tip and the next one. */
  cooldownSeconds: 6,
  /** Seconds after the run starts before the first start tips appear. */
  startDelay: 2,
  /** Distance in metres under which an enemy counts as near the player. */
  enemyNearDistance: 7,
  /** Number of near enemies needed for the attack tip. */
  enemyNearCount: 1,
  /** Seconds the player must stand next to a weapon (without holding one) before the pickup tip. */
  pickupDwell: 1.2,
  /** Seconds a weapon must be held, without throwing it, before the throw tip. */
  holdSeconds: 8,
  /** Health ratio under which the dodge tip appears. */
  lowHealthRatio: 0.3,
  /** Maximum number of times each tip is shown, counted across sessions. */
  maxShows: {
    dodge: 3,
    objective: 1,
    controls: 1,
    attack: 2,
    pickup: 3,
    throw: 2,
    intermission: 3,
  },
  /**
   * Article written before the weapon name in the pickup tip, keyed by weapon id.
   * The trailing space is part of the article, except for the elided "l'".
   */
  weaponArticles: {
    baguette: 'la ',
    caddie: 'le ',
    extincteur: "l'",
    'pack-eau': 'le ',
    serpillere: 'la ',
  } as Readonly<Record<string, string>>,
  texts: {
    objective: 'Protège la dernière télé géante !',
    controls: 'ZQSD pour bouger, la souris pour viser',
    attack: 'Clic gauche pour taper !',
    /** "{article}" and "{weapon}" are replaced with the weapon name from the registry. */
    pickup: 'Appuie sur E pour prendre {article}{weapon} !',
    throw: 'Clic droit pour la lancer !',
    dodge: 'Attention ! Esquive avec Shift !',
    intermission: 'Profite de la pause pour ramasser une arme',
  },
} as const;
