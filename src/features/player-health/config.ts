/** Balance values of the player-health feature. Durations are simulated seconds. */
export const PLAYER_HEALTH_CONFIG = {
  /** Seconds of invulnerability granted after each hit taken. */
  invulnerableSeconds: 0.5,
  /** Seconds without damage before health starts to regenerate. */
  regenDelaySeconds: 4,
  /** Health points restored per second while regenerating. */
  regenPerSecond: 8,
  /** Health ratio under which the red vignette is stronger. */
  lowHealthRatio: 0.3,
  vignette: {
    /** Vignette opacity at comfortable health (0 = invisible). */
    idleOpacity: 0,
    /** Vignette opacity below the low health ratio. */
    lowHealthOpacity: 0.4,
    /** Extra opacity right after a hit, fading out over hitFadeSeconds. */
    hitOpacity: 0.6,
    /** Seconds for the hit flash to fade out. */
    hitFadeSeconds: 0.35,
  },
  fall: {
    /** Seconds the guard takes to fall backwards. */
    seconds: 0.45,
    /** Final backward tilt of the body, in radians. */
    angle: Math.PI / 2,
  },
  respawn: {
    /** Keyboard key used for the debug respawn. */
    key: 'r',
    /** Logical action bound to that key. */
    action: 'custom:respawn',
  },
} as const;
