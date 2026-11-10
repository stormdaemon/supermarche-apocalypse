import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import type { GameEvents } from '../../core/events';
import { EnemyTag } from '../../core/types';
import { JUICE_CONFIG } from './config';

const cfg = JUICE_CONFIG;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Impact feedback: freeze frames and light shake on big hits, particles, and slow motion on the last enemy. */
export default defineFeature({
  id: 'juice',
  setup(game: Game) {
    let waveActive = false;
    let slowActive = false;
    /** Real seconds left at the slow speed. */
    let slowHold = 0;
    /** Real seconds elapsed since the slow speed ended, used for the ramp back to 1. */
    let slowRamp = 0;
    let lastRealTime = game.time.realElapsed;

    const startSlowMotion = (): void => {
      slowActive = true;
      slowHold = cfg.slowMotion.holdDuration;
      slowRamp = 0;
      game.time.scale = cfg.slowMotion.scale;
    };

    /** Restores the normal simulation speed exactly. */
    const stopSlowMotion = (): void => {
      slowActive = false;
      slowHold = 0;
      slowRamp = 0;
      game.time.scale = 1;
    };

    game.events.on('hit', (e) => {
      const hit = cfg.hit;
      const forceMagnitude = e.force.length();
      const ratio = Math.max(e.damage / hit.bigDamage, forceMagnitude / hit.bigForce);

      if (ratio >= 1) {
        const strength = Math.min(ratio, hit.maxStrength);
        game.time.hitstop(
          Math.min(hit.hitstopMax, hit.hitstopBase + (strength - 1) * hit.hitstopPerStrength),
        );
        game.cameraRig.addTrauma(Math.min(hit.maxTrauma, hit.trauma * strength));
      }

      // Small hits only get a tiny burst; bigger damage gives more particles.
      const count = clamp(
        Math.round(hit.particlesBase + e.damage * hit.particlesPerDamage),
        hit.particlesMin,
        hit.particlesMax,
      );
      const direction =
        forceMagnitude > 0.0001 ? e.force.clone().divideScalar(forceMagnitude) : undefined;
      const stars = Math.ceil(count / 2);
      game.fx.burst({
        position: e.point,
        color: hit.starColors,
        count: stars,
        shape: 'ico',
        speed: hit.speed,
        size: hit.starSize,
        life: hit.life,
        gravity: hit.gravity,
        direction,
        spread: hit.spread,
      });
      game.fx.burst({
        position: e.point,
        color: hit.debrisColors,
        count: count - stars,
        shape: 'box',
        speed: hit.speed,
        size: hit.debrisSize,
        life: hit.life,
        gravity: hit.gravity,
        direction,
        spread: hit.spread,
      });
    });

    game.events.on('explosion', (e: GameEvents['explosion']) => {
      const boom = cfg.explosion;
      const stars = Math.ceil(boom.particles / 2);
      game.fx.burst({
        position: e.position,
        color: boom.starColors,
        count: stars,
        shape: 'ico',
        speed: boom.speed,
        size: boom.starSize,
        life: boom.life,
        gravity: boom.gravity,
      });
      game.fx.burst({
        position: e.position,
        color: boom.debrisColors,
        count: boom.particles - stars,
        shape: 'box',
        speed: boom.speed,
        size: boom.debrisSize,
        life: boom.life,
        gravity: boom.gravity,
      });
      game.cameraRig.addTrauma(boom.trauma);
    });

    game.events.on('death', ({ entity }) => {
      if (!waveActive || !entity.tags.has(EnemyTag)) return;
      // Enemies killed by a fall are still flagged alive at this point, so the dying one is
      // excluded explicitly instead of relying on game.enemies.count.
      const remaining = game.enemies.alive.filter(
        (enemy) => enemy.entity !== entity && enemy.state !== 'dead',
      ).length;
      if (remaining === 0) startSlowMotion();
    });

    game.events.on('waveStart', () => {
      waveActive = true;
    });

    game.events.on('waveEnd', () => {
      waveActive = false;
    });

    game.events.on('reset', () => {
      waveActive = false;
      stopSlowMotion();
    });

    // Runs every rendered frame. Timers use real time so the slow motion lasts a fixed duration.
    game.addSystem({
      name: 'juice-slow-motion',
      priority: 100,
      update: () => {
        const now = game.time.realElapsed;
        const realDt = now - lastRealTime;
        lastRealTime = now;
        if (!slowActive) return;
        if (slowHold > 0) {
          slowHold -= realDt;
          return;
        }
        slowRamp += realDt;
        const t = Math.min(1, slowRamp / cfg.slowMotion.restoreDuration);
        if (t >= 1) {
          stopSlowMotion();
          return;
        }
        const eased = 1 - (1 - t) ** 3;
        game.time.scale = cfg.slowMotion.scale + (1 - cfg.slowMotion.scale) * eased;
      },
    });
  },
});
