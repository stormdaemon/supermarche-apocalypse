import * as THREE from 'three';
import type { AisleInfo } from '../../core/arena';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import type { Attractor } from '../../core/world-services';
import { PROMO_CONFIG } from './config';
import './promo.css';

/** Random pick from a list; undefined only when the list is empty. */
function randomItem<T>(items: readonly T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Replaces every "{aisle}" placeholder with the aisle number. */
function fillAisle(template: string, aisleNumber: number): string {
  return template.replace(/\{aisle\}/g, String(aisleNumber));
}

/** Promo currently running in the arena. */
interface ActivePromo {
  aisle: AisleInfo;
  attractor: Attractor;
  /** Simulated seconds since the promo started. */
  elapsed: number;
  /** Number of confetti bursts already fired. */
  burstsFired: number;
}

/**
 * Store promos: a random timer picks an aisle, the commentator announces it, a jingle
 * plays, an AI attractor pulls the crowd onto the aisle and confetti marks the spot.
 * Timers run on simulated time, so they stop while the game is paused or in hitstop.
 */
class PromoAnnouncer {
  private readonly banner: HTMLDivElement;
  private cooldown: number;
  private bannerTimer = 0;
  private promo: ActivePromo | null = null;

  constructor(private readonly game: Game) {
    this.banner = game.ui.add('top-center', 'promo-banner');
    this.cooldown = this.nextInterval();
    game.events.on('playerDeath', () => this.endPromo());
    game.events.on('reset', () => this.reset());
    game.addSystem({
      name: 'promo-announcements',
      priority: 100,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
    });
  }

  /** Runs only while the game is not paused (the loop skips fixed steps when paused). */
  private fixedUpdate(dt: number): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('promo-banner-visible');
    }
    // The store waits for the restart before scheduling the next promo.
    if (this.game.player.health.dead) return;
    if (this.promo) {
      this.updatePromo(this.promo, dt);
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0) this.startPromo();
  }

  private startPromo(): void {
    const aisle = randomItem(this.game.arena.layout.aisles);
    if (!aisle) {
      this.cooldown = this.nextInterval();
      return;
    }
    const offer = fillAisle(randomItem(PROMO_CONFIG.offers) ?? '', aisle.number);
    const shout = fillAisle(PROMO_CONFIG.shout, aisle.number);
    const attractor = this.game.ai.addAttractor(
      aisle.walkway,
      PROMO_CONFIG.promo.duration,
      PROMO_CONFIG.promo.pull,
    );
    this.promo = { aisle, attractor, elapsed: 0, burstsFired: 0 };
    const text = `${shout}\n${offer}`;
    // The banner is drawn here, not from the 'announcement' listener, so other features
    // listening to the generic event (toasts) do not show the message twice.
    this.showBanner(text, PROMO_CONFIG.announcement.duration);
    this.game.events.emit('announcement', {
      text,
      duration: PROMO_CONFIG.announcement.duration,
      position: aisle.walkway.clone(),
    });
    this.playJingle();
  }

  private updatePromo(promo: ActivePromo, dt: number): void {
    const { duration } = PROMO_CONFIG.promo;
    const { bursts } = PROMO_CONFIG.marker;
    promo.elapsed += dt;
    while (
      promo.burstsFired < bursts &&
      promo.elapsed >= ((promo.burstsFired + 1) * duration) / (bursts + 1)
    ) {
      promo.burstsFired++;
      this.confetti(promo.aisle);
    }
    if (promo.elapsed >= duration) this.endPromo();
  }

  /** Ends the running promo (if any) and schedules the next one. */
  private endPromo(): void {
    if (this.promo) {
      this.game.ai.removeAttractor(this.promo.attractor);
      this.promo = null;
    }
    this.cooldown = this.nextInterval();
  }

  /** Drops the promo, the banner and the timer when the game restarts. */
  private reset(): void {
    this.endPromo();
    this.bannerTimer = 0;
    this.banner.textContent = '';
    this.banner.classList.remove('promo-banner-visible');
  }

  private showBanner(text: string, duration: number): void {
    this.banner.textContent = text;
    this.banner.classList.add('promo-banner-visible');
    this.bannerTimer = duration;
  }

  /** One confetti burst, somewhere above the shelf of the promo aisle. */
  private confetti(aisle: AisleInfo): void {
    const { marker } = PROMO_CONFIG;
    const { shelf } = aisle;
    const across = (Math.random() * 2 - 1) * shelf.depth;
    const along = (Math.random() * 2 - 1) * (shelf.length / 2) * marker.spread;
    this.game.fx.burst({
      position: new THREE.Vector3(
        shelf.position.x + across,
        marker.height,
        shelf.position.z + along,
      ),
      color: [...marker.colors],
      count: marker.count,
      speed: marker.speed,
      size: marker.size,
      life: marker.life,
      gravity: marker.gravity,
      shape: 'box',
    });
  }

  private playJingle(): void {
    const { jingle } = PROMO_CONFIG;
    for (const note of jingle.notes) {
      this.game.audio.tone({
        freq: note.freq,
        delay: note.delay,
        duration: note.duration,
        volume: note.volume,
      });
    }
    this.game.audio.noise({
      delay: jingle.crowd.delay,
      duration: jingle.crowd.duration,
      volume: jingle.crowd.volume,
      filterFreq: jingle.crowd.filterFreq,
    });
  }

  private nextInterval(): number {
    return randomBetween(PROMO_CONFIG.interval.min, PROMO_CONFIG.interval.max);
  }
}

export default defineFeature({
  id: 'promo-announcements',
  setup(game) {
    new PromoAnnouncer(game);
  },
});
