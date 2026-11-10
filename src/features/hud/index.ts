import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { HUD_CONFIG } from './config';
import './hud.css';

/** Non-breaking space: keeps "1 250 €" on one line. */
const NBSP = ' ';

/** Formats a number the French way: spaces between thousands, comma as decimal separator. */
function formatFrench(value: number, decimals = 0): string {
  const [intPart = '0', fracPart] = value.toFixed(decimals).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return fracPart === undefined ? grouped : `${grouped},${fracPart}`;
}

type HeartState = 'full' | 'half' | 'empty';

/** State of one heart: a heart holds healthPerHeart points, shown in half-heart steps. */
function heartStateFor(health: number, index: number): HeartState {
  const perHeart = HUD_CONFIG.hearts.healthPerHeart;
  const fraction = Math.min(1, Math.max(0, (health - index * perHeart) / perHeart));
  const halves = Math.round(fraction * 2);
  if (halves >= 2) return 'full';
  if (halves === 1) return 'half';
  return 'empty';
}

/** Row of hearts. Polled every frame, but the DOM is only written when a heart changes state. */
class HealthWidget {
  private readonly block: HTMLDivElement;
  private readonly hearts: HTMLSpanElement[] = [];
  private readonly states: (HeartState | null)[] = [];
  private shake: Animation | undefined;

  constructor(private readonly game: Game) {
    const count = Math.ceil(game.player.health.max / HUD_CONFIG.hearts.healthPerHeart);
    this.block = game.ui.add('top-left', 'hud-block hud-hearts');
    for (let i = 0; i < count; i++) {
      const heart = document.createElement('span');
      heart.className = 'hud-heart';
      heart.textContent = '♥';
      this.block.append(heart);
      this.hearts.push(heart);
      this.states.push(null);
    }
  }

  /** Updates the hearts that changed since the last call. */
  sync(): void {
    const health = this.game.player.health.current;
    this.hearts.forEach((heart, i) => {
      const state = heartStateFor(health, i);
      if (state === this.states[i]) return;
      this.states[i] = state;
      heart.className = `hud-heart hud-heart--${state}`;
    });
  }

  /** Shakes and flashes the hearts when the player takes a hit. */
  onHit(): void {
    const px = HUD_CONFIG.hearts.hitShakePx;
    this.shake?.cancel();
    this.shake = this.block.animate(
      [
        { transform: 'translateX(0)', filter: 'brightness(1)' },
        { transform: `translateX(${-px}px)`, filter: 'brightness(1.6)' },
        { transform: `translateX(${px}px)`, filter: 'brightness(1.3)' },
        { transform: `translateX(${-px / 2}px)`, filter: 'brightness(1.1)' },
        { transform: 'translateX(0)', filter: 'brightness(1)' },
      ],
      { duration: HUD_CONFIG.hearts.hitShakeMs, easing: 'ease-out' },
    );
  }

  reset(): void {
    this.shake?.cancel();
    this.shake = undefined;
    this.sync();
  }
}

/** Euros saved, with a pop animation when the score goes up. */
class ScoreWidget {
  private readonly el: HTMLDivElement;
  private shown: number | null = null;

  constructor(game: Game) {
    this.el = game.ui.add('top-left', 'hud-block hud-score');
    this.set(game.score.value, 0);
    game.events.on('scoreChange', ({ score, delta }) => this.set(score, delta));
  }

  set(score: number, delta: number): void {
    if (score !== this.shown) {
      this.shown = score;
      const euros = Math.round(score * HUD_CONFIG.score.euroPerPoint);
      this.el.textContent = `${formatFrench(euros)}${NBSP}€ économisés !`;
    }
    if (delta > 0) this.pop();
  }

  private pop(): void {
    const scale = HUD_CONFIG.score.popScale;
    this.el.animate(
      [
        { transform: 'scale(1)' },
        { transform: `scale(${scale})`, offset: 0.4 },
        { transform: 'scale(1)' },
      ],
      { duration: HUD_CONFIG.score.popMs, easing: 'ease-out' },
    );
  }

  reset(): void {
    this.set(0, 0);
  }
}

/** Row of stars, one per combo step. */
class ComboWidget {
  private readonly stars: HTMLSpanElement[] = [];
  private lit = -1;

  constructor(game: Game) {
    const block = game.ui.add('top-left', 'hud-block hud-combo');
    for (let i = 0; i < HUD_CONFIG.combo.maxStars; i++) {
      const star = document.createElement('span');
      star.className = 'hud-star';
      star.textContent = '★';
      block.append(star);
      this.stars.push(star);
    }
    this.set(0);
    game.events.on('scoreChange', ({ combo }) => this.set(combo));
  }

  set(combo: number): void {
    const lit = Math.min(Math.max(combo, 0), HUD_CONFIG.combo.maxStars);
    if (lit === this.lit) return;
    this.lit = lit;
    this.stars.forEach((star, i) => star.classList.toggle('hud-star--on', i < lit));
  }
}

/** Wave number on a red store sign. Shown from the first waveStart of a run. */
class WaveWidget {
  private readonly el: HTMLDivElement;
  private wave: number | null = null;

  constructor(game: Game) {
    this.el = game.ui.add('top-right', 'hud-sign hud-wave');
    this.el.hidden = true;
    game.events.on('waveStart', ({ wave }) => this.set(wave));
  }

  set(wave: number): void {
    if (wave === this.wave) return;
    this.wave = wave;
    this.el.textContent = `Vague ${wave}`;
    this.el.hidden = false;
  }

  reset(): void {
    this.wave = null;
    this.el.hidden = true;
  }
}

/** Yellow price tag of the equipped weapon, hidden when the player holds nothing. */
class WeaponTagWidget {
  private readonly wrap: HTMLDivElement;
  private readonly text: HTMLSpanElement;
  private shownId: string | null = null;

  constructor(private readonly game: Game) {
    this.wrap = game.ui.add('bottom-right', 'hud-weapon');
    this.wrap.hidden = true;
    const tag = document.createElement('div');
    tag.className = 'hud-tag';
    this.text = document.createElement('span');
    tag.append(this.text);
    this.wrap.append(tag);

    game.events.on('weaponEquip', ({ weaponId }) => this.show(weaponId));
    game.events.on('weaponDrop', () => this.hide());
    game.events.on('weaponBreak', ({ weaponId }) => {
      if (weaponId === this.shownId) this.hide();
    });
  }

  private show(weaponId: string): void {
    if (weaponId === this.shownId) return;
    this.shownId = weaponId;
    const prices: Readonly<Record<string, number>> = HUD_CONFIG.weapons.prices;
    const name = this.game.registry.weapons.get(weaponId)?.displayName ?? weaponId;
    const price = prices[weaponId] ?? HUD_CONFIG.weapons.defaultPrice;
    this.text.textContent = `${name} — ${formatFrench(price, 2)}${NBSP}€`;
    this.wrap.hidden = false;
  }

  private hide(): void {
    this.shownId = null;
    this.wrap.hidden = true;
  }

  reset(): void {
    this.hide();
  }
}

/** Sets the font sizes from config.ts as CSS variables. */
function applySizes(): void {
  const style = document.documentElement.style;
  const { sizes } = HUD_CONFIG;
  style.setProperty('--hud-heart-size', `${sizes.heartPx}px`);
  style.setProperty('--hud-star-size', `${sizes.starPx}px`);
  style.setProperty('--hud-score-size', `${sizes.scorePx}px`);
  style.setProperty('--hud-wave-size', `${sizes.wavePx}px`);
  style.setProperty('--hud-tag-size', `${sizes.tagPx}px`);
}

export default defineFeature({
  id: 'hud',
  setup(game) {
    applySizes();
    const health = new HealthWidget(game);
    const score = new ScoreWidget(game);
    new ComboWidget(game);
    const wave = new WaveWidget(game);
    const weapon = new WeaponTagWidget(game);

    game.addSystem({ name: 'hud-health', priority: 200, update: () => health.sync() });
    game.events.on('hit', ({ target }) => {
      if (target === game.player.entity) health.onHit();
    });
    game.events.on('reset', () => {
      health.reset();
      score.reset();
      wave.reset();
      weapon.reset();
    });
  },
});
