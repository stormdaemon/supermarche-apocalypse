/** Juice tuning values: hit feedback, explosions and last-enemy slow motion. */
export const JUICE_CONFIG = {
  hit: {
    // Damage or force at or above these values make a hit "big" (freeze frame and light shake).
    bigDamage: 14,
    bigForce: 10,
    // Strength of a hit is capped so that huge hits do not freeze the game for long.
    maxStrength: 2.5,
    // Freeze frame in real seconds: base duration, plus time per unit of strength above 1.
    hitstopBase: 0.06,
    hitstopPerStrength: 0.05,
    hitstopMax: 0.12,
    // Light screen shake (camera trauma) added by a big hit, scaled by strength and capped.
    trauma: 0.18,
    maxTrauma: 0.35,
    // Impact particles: count = base + damage * perDamage, clamped to [min, max].
    particlesBase: 2,
    particlesPerDamage: 0.5,
    particlesMin: 2,
    particlesMax: 18,
    // Stars use the icosahedron shape, debris uses the cube shape.
    starColors: [0xffe066, 0xffffff],
    debrisColors: [0x8c8c8c, 0xf4f1de, 0xe4572e],
    speed: 5,
    life: 0.5,
    gravity: -14,
    spread: 0.5,
    starSize: 0.12,
    debrisSize: 0.16,
  },
  explosion: {
    particles: 40,
    starColors: [0xffe066, 0xffffff, 0xff7b00],
    debrisColors: [0x3a3a3a, 0xff7b00, 0x9e9e9e],
    speed: 9,
    life: 0.9,
    gravity: -14,
    starSize: 0.2,
    debrisSize: 0.28,
    trauma: 0.3,
  },
  slowMotion: {
    // Simulation speed during the slow motion (1 is normal speed).
    scale: 0.3,
    // Real seconds spent at the slow speed.
    holdDuration: 1.2,
    // Real seconds of smooth ramp back to normal speed.
    restoreDuration: 0.6,
  },
};
