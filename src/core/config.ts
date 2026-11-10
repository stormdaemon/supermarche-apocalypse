/** Core tuning values. Each feature keeps its own balancing values in its own config.ts. */
export const CORE_CONFIG = {
  physics: {
    fixedHz: 60,
    maxStepsPerFrame: 5,
    gravity: -20,
  },
  camera: {
    fov: 60,
    distance: 6.5,
    minDistance: 1.2,
    height: 1.6,
    sensitivity: 0.0025,
    minPitch: -0.35,
    maxPitch: 1.1,
    followSharpness: 12,
  },
  player: {
    walkSpeed: 6,
    turnSharpness: 14,
    maxHealth: 100,
    radius: 0.4,
    halfHeight: 0.5,
    interactRange: 2.2,
  },
  enemy: {
    thinkInterval: 0.4,
    staggerTime: 0.35,
  },
  weapon: {
    throwSpeed: 16,
    throwUpward: 4,
    throwDamagePerSpeed: 1.5,
    minThrowImpactSpeed: 4,
  },
  score: {
    comboWindow: 2.5,
  },
  arena: {
    width: 44,
    depth: 60,
    wallHeight: 7,
    tileSize: 2,
  },
} as const;
