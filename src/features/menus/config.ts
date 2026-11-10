/** Timings and storage keys of the menus. */
export const MENUS_CONFIG = {
  /** localStorage key holding the best score (read and written inside try/catch). */
  bestScoreKey: 'supermarche-apocalypse.best-score',
  title: {
    /** Duration of the sliding doors animation before the run starts, in milliseconds. */
    doorOpenMs: 1400,
    /** Number of shoppers squashed against the glass. */
    crowdSize: 13,
  },
  gameOver: {
    /** Delay between the player's death and the receipt, so the death animation can play. */
    deathDelayMs: 1800,
    /** Time for the receipt to slide out of the printer slot, in milliseconds. */
    paperOutMs: 60,
    /** Delay before the first receipt line is printed, in milliseconds. */
    printStartMs: 700,
    /** Delay between two printed receipt lines, in milliseconds. */
    printStepMs: 320,
  },
} as const;

/** Game texts, in French. */
export const MENUS_TEXT = {
  title: 'SUPERMARCHÉ APOCALYPSE',
  tagline: 'Le Black Friday ne fait pas de quartier.',
  openDoors: 'OUVRIR LES PORTES',
  pauseTitle: 'PAUSE CAFÉ',
  pauseHint: 'Échap ou P pour reprendre',
  resume: 'Reprendre',
  restart: 'Recommencer',
  bestScore: 'Meilleur score',
  receiptBrand: 'SUPERMARCHÉ APOCALYPSE',
  receiptTitle: 'TICKET DE CAISSE',
  waves: 'Vagues tenues',
  kills: 'Ennemis éliminés',
  savings: 'Euros économisés',
  newRecord: 'NOUVEAU RECORD !',
  thanks: 'Merci de votre visite !',
  reopen: 'Rouvrir le magasin',
} as const;
