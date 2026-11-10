/** Balancing values and texts of the first-launch tutorial. */
export const TUTORIAL_CONFIG = {
  /** localStorage key, set to '1' once the tutorial was finished or skipped. */
  storageKey: 'supermarche-apocalypse:tutorial-done',
  /** Metres the player must walk in the movement step. */
  walkDistance: 4,
  /** Cumulated cursor rotation, in radians, required in the aiming step. */
  aimAngle: 3,
  /** Hits the training dummy must receive in the hit step. */
  dummyHits: 3,
  /** Distance in front of the player where the training dummy appears. */
  dummySpawnDistance: 3,
  /** Seconds the final message stays on screen before the panel hides. */
  finaleDuration: 2.5,
  /** Seconds the bravo toast stays on screen between two steps. */
  bravoDuration: 1.6,
  bravoMessages: ['Bien joué !', 'Excellent !', 'Parfait !', 'Super !', 'Au top !'],
  dummy: {
    /** Large enough that the dummy never dies during the tutorial. */
    maxHealth: 100000,
    skin: 0xe8cba6,
    shirt: 0xd8c3a0,
    pants: 0xb8a58a,
    shoes: 0x5c4d3c,
  },
  /** Floating cone marking the target of the current step. */
  indicator: {
    /** Height of the cone tip above the target's feet. */
    height: 2.4,
    radius: 0.3,
    length: 0.6,
    bobAmplitude: 0.15,
    /** Bob cycles per second, in radians per second. */
    bobSpeed: 3,
    /** Spin speed in radians per second. */
    spinSpeed: 2.5,
  },
  texts: {
    dummyName: "Mannequin d'entraînement",
    counter: 'Étape',
    move: 'Bouge avec ZQSD (ou WASD)',
    aim: 'Vise avec la souris : le vigile regarde le curseur',
    dodge: 'Shift : plongeon !',
    jump: 'Espace : saute',
    hit: 'Frappe le mannequin (clic gauche)',
    equip: 'E : ramasse une arme',
    throw: 'Clic droit : lance-la sur le mannequin',
    finale: 'Prêt ! Les clients arrivent...',
    skip: 'Passer le tuto',
  },
} as const;
