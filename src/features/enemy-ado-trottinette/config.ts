/**
 * Balancing values for the « Ado Trottinette » enemy.
 * Durations are in seconds, distances in metres, speeds in m/s.
 */
export const ADO_TROTTINETTE_CONFIG = {
  typeId: 'ado-trottinette',
  displayName: 'Ado Trottinette',
  /** Score awarded on death, before the combo multiplier. */
  points: 20,
  stats: {
    maxHealth: 15,
    /** Orbit speed while circling the player. */
    speed: 7,
    acceleration: 10,
    damage: 10,
    attackForce: 14,
    mass: 50,
    /** Below 1: the fragile rider is pushed further by every hit. */
    sturdiness: 0.7,
  },
  /** Height of the deck above the feet: the rider stands on the scooter. */
  deckHeight: 0.14,
  orbit: {
    /** Distance kept from the player while circling. */
    radius: 6,
    minDuration: 1.5,
    maxDuration: 2.5,
    /** Gain pulling the enemy back to the orbit radius (1/s). */
    radialGain: 2,
    /** Limit of the radial correction speed (m/s). */
    maxRadialSpeed: 4,
  },
  charge: {
    speed: 14,
    /** Longest charge before the enemy gives up and circles again. */
    duration: 1.2,
    /** Horizontal distance to the player at which the charge hits. */
    hitDistance: 1.2,
    /** Multiplies the enemy attack force for the charge impact. */
    hitForceMultiplier: 2,
    /** Length of the forward probe that detects walls and shelves (from the body centre). */
    wallProbeDistance: 0.9,
    /** Height of the forward probe above the feet. */
    wallProbeHeight: 0.5,
  },
  crash: {
    /** Time the rider stays down after a crash. */
    knockOutTime: 2,
    /** Time the « AÏE ! » bubble stays above the rider. */
    bubbleTime: 1,
    /** Backward launch speed of the rider (m/s). */
    backSpeed: 3,
    /** Upward launch speed of the rider (m/s). */
    upSpeed: 5,
    /** Gravity applied to the fallen scooter (m/s²). */
    wreckGravity: 20,
    /** Spin of the fallen scooter while it is in the air (rad/s). */
    wreckSpin: 6,
    /** Screen shake added on crash (trauma, 0 to 1). */
    shake: 0.3,
  },
  bubbleText: 'AÏE !',
} as const;
