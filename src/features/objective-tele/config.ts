/** One synthesized note of a sound cue. Times are in seconds. */
export interface ToneNote {
  freq: number;
  /** Frequency reached at the end of the note (pitch slide). */
  endFreq?: number;
  type: 'square' | 'triangle' | 'sawtooth' | 'sine';
  duration: number;
  volume: number;
  delay?: number;
}

/**
 * Balancing values, look and texts of the "protect the last giant TV" objective.
 * Durations are simulated seconds: they stop while the game is paused or in hitstop.
 */
export const TELE_CONFIG = {
  id: 'objective-tele',
  texts: {
    label: 'Dernière télé : -90 %',
    priceSign: '-90 %',
    thiefAlert: 'IL PART AVEC LA TÉLÉ !! Tape-le !',
    thiefMarker: 'VOLEUR !',
    escaped: 'La télé est partie...',
    returned: 'La télé est revenue !',
  },
  /** Display stand in the open central aisle. position is the center of the stand on the floor. */
  stand: {
    position: { x: 0, z: 0 },
    width: 3.4,
    height: 0.5,
    depth: 1.2,
    color: 0x4a4e69,
  },
  tv: {
    width: 3.2,
    height: 1.8,
    depth: 0.18,
    bodyColor: 0x17171c,
    screenColor: 0x4cc9f0,
    /** Hue cycle of the glowing screen, in turns per second. */
    hueSpeed: 0.12,
    screenLightness: 0.55,
  },
  labels: {
    /** Height of the red price sign above the TV, in meters. */
    priceSignHeight: 0.8,
    priceSignOffset: 0.5,
    labelHeight: 0.55,
    labelOffset: 1.25,
  },
  /** Permanent AI attractor on the stand: chance that an enemy goes for the TV over the player. */
  attractor: {
    pull: 0.35,
  },
  grab: {
    /** Horizontal distance to the stand center at which an enemy grabs the TV, in meters. */
    radius: 2.6,
    /** Enemy ids that never steal the TV (bosses and special characters). */
    excludedTypeIds: ['vigile', 'caissiere'] as readonly string[],
  },
  carry: {
    /** Walking speed of the thief while he carries the TV, in m/s (the normal client runs at 3.5). */
    speed: 1.5,
    /** Gap between the top of the thief's head and the bottom of the TV, in meters. */
    gap: 0.15,
    /** Gap between the top of the TV and the red marker, in meters. */
    markerGap: 0.7,
    markerBob: 0.12,
    markerBobSpeed: 6,
  },
  alert: {
    /** Seconds the alert toast stays on screen. */
    duration: 3.5,
  },
  drop: {
    /** Sideways offset of the landing spot, from the thief's position, in meters. */
    sideOffset: 1.4,
    /** Seconds for the TV to fall from the thief's head to the floor. */
    fallDuration: 0.45,
    /** Seconds the TV lies on the floor before it flies back to the stand. */
    delay: 2,
  },
  flight: {
    /** Seconds of the flight from the floor back to the stand. */
    duration: 1,
    /** Height of the parabola drawn by the flight, in meters. */
    arcHeight: 2.5,
    /** Seconds between two sparkle bursts during the flight. */
    sparkleInterval: 0.1,
  },
  exit: {
    /** Horizontal distance to the exit door at which the thief escapes, in meters. */
    radius: 1.6,
    /** Seconds between the escape and the game over receipt. */
    endingDelay: 2.5,
  },
  /** Margin kept between a dropped TV and the walls of the arena, in meters. */
  landingMargin: 2,
  sparkle: {
    colors: [0xffe066, 0x4cc9f0, 0xff70a6, 0xffffff],
    /** Particles of a single burst when the TV is dropped. */
    dropCount: 14,
    speed: 3,
    size: 0.2,
    life: 0.6,
    gravity: -4,
  },
  audio: {
    grab: [
      { freq: 880, endFreq: 220, type: 'sawtooth', duration: 0.5, volume: 0.25 },
      { freq: 1320, type: 'square', duration: 0.15, volume: 0.18, delay: 0.15 },
    ] as readonly ToneNote[],
    drop: [
      { freq: 300, endFreq: 120, type: 'triangle', duration: 0.25, volume: 0.2 },
    ] as readonly ToneNote[],
    returned: [
      { freq: 523, type: 'triangle', duration: 0.15, volume: 0.2 },
      { freq: 784, type: 'triangle', duration: 0.15, volume: 0.2, delay: 0.12 },
      { freq: 1046, type: 'triangle', duration: 0.35, volume: 0.2, delay: 0.24 },
    ] as readonly ToneNote[],
    escapeNoise: { duration: 0.8, volume: 0.3, filterFreq: 900 },
  },
} as const;
