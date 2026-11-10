import './menus.css';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { EnemyC } from '../../core/types';
import { MENUS_CONFIG, MENUS_TEXT } from './config';

/** Where the run currently is, as seen by the menus. */
type Phase = 'title' | 'playing' | 'paused' | 'dying' | 'gameover';

const SKIN_TONES = ['#f2c7a5', '#c68a5b', '#8d5a3b', '#e8b48a'];

/** Creates an element with a class name and optional text. */
function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

function makeButton(label: string, className: string): HTMLButtonElement {
  const node = element('button', className, label);
  node.type = 'button';
  return node;
}

/** Deterministic pseudo random value in [0, 1), used to vary the crowd between shoppers. */
function noise(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function formatEuros(value: number): string {
  return `${Math.round(value).toLocaleString('fr-FR')} €`;
}

/** Reads the best score; falls back to 0 when storage is missing or blocked. */
function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(MENUS_CONFIG.bestScoreKey);
    const value = raw === null ? 0 : Number(raw);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
  } catch {
    // Storage is unavailable (private mode, blocked site data): the score is kept in memory only.
    return 0;
  }
}

/** Saves the best score; silently ignored when storage is unavailable. */
function writeBestScore(value: number): void {
  try {
    window.localStorage.setItem(MENUS_CONFIG.bestScoreKey, String(value));
  } catch {
    // Storage is unavailable: the best score still lives in memory for this session.
  }
}

/** Builds the crowd of shoppers pressed against the glass of the automatic doors. */
function buildCrowd(): HTMLDivElement {
  const crowd = element('div', 'menus-crowd');
  const count = MENUS_CONFIG.title.crowdSize;
  for (let i = 0; i < count; i++) {
    const person = element('div', 'menus-person');
    const spread = count > 1 ? i / (count - 1) : 0;
    person.style.setProperty('--x', `${(spread * 88 + (noise(i, 1) - 0.5) * 3).toFixed(2)}%`);
    person.style.setProperty('--h', `${Math.round(200 + noise(i, 2) * 30)}px`);
    person.style.setProperty('--shirt', `hsl(${Math.round(noise(i, 3) * 360)} 50% 42%)`);
    person.style.setProperty('--skin', SKIN_TONES[Math.floor(noise(i, 4) * SKIN_TONES.length)]);
    person.style.setProperty('--delay', `${(-noise(i, 5) * 0.55).toFixed(2)}s`);
    person.style.setProperty('--mouth', `${(3 + noise(i, 6) * 9).toFixed(1)}px`);

    const head = element('div', 'menus-head');
    head.append(
      element('span', 'menus-eye menus-eye-left'),
      element('span', 'menus-eye menus-eye-right'),
      element('span', 'menus-mouth'),
    );
    person.append(
      element('div', 'menus-body'),
      head,
      element('div', 'menus-hand menus-hand-left'),
      element('div', 'menus-hand menus-hand-right'),
    );
    crowd.append(person);
  }
  return crowd;
}

function buildDoor(side: 'left' | 'right'): HTMLDivElement {
  const door = element('div', `menus-door menus-door-${side}`);
  door.append(element('span', `menus-handle menus-handle-${side}`));
  return door;
}

function receiptRow(label: string, value: string): HTMLDivElement {
  const row = element('div', 'menus-line menus-receipt-row');
  row.append(element('span', '', label), element('span', 'menus-receipt-value', value));
  return row;
}

function receiptSeparator(): HTMLDivElement {
  return element('div', 'menus-line menus-receipt-sep');
}

/** Owns the title screen, the pause screen and the game over receipt. */
class MenuController {
  private phase: Phase = 'title';
  private bestScore = readBestScore();
  private wavesSurvived = 0;
  private enemiesKilled = 0;
  private readonly timers = new Set<number>();
  private readonly titleLayer: HTMLDivElement;
  private readonly facade: HTMLDivElement;
  private readonly openButton: HTMLButtonElement;
  private readonly bestLabel: HTMLParagraphElement;
  private readonly pauseLayer: HTMLDivElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly receiptLayer: HTMLDivElement;
  private readonly receiptPaper: HTMLDivElement;

  constructor(private readonly game: Game) {
    // The core would restart 3 seconds after a death; the receipt ends the run instead.
    game.autoRestartOnDeath = false;
    // Nothing is simulated behind the title screen: the loop renders but does not step.
    game.setPaused(true);

    this.titleLayer = game.ui.add('fullscreen', 'menus-layer menus-title');
    this.facade = element('div', 'menus-facade');
    this.facade.style.setProperty('--menus-door-ms', `${MENUS_CONFIG.title.doorOpenMs}ms`);
    this.facade.append(buildCrowd(), buildDoor('left'), buildDoor('right'));
    this.bestLabel = element('p', 'menus-best');
    this.openButton = makeButton(MENUS_TEXT.openDoors, 'menus-button');
    this.openButton.addEventListener('click', () => this.openDoors());
    this.titleLayer.append(
      element('h1', 'menus-sign', MENUS_TEXT.title),
      element('p', 'menus-tagline', MENUS_TEXT.tagline),
      this.facade,
      this.bestLabel,
      this.openButton,
    );
    this.refreshBestLabel();

    this.pauseLayer = game.ui.add('fullscreen', 'menus-layer menus-pause');
    this.pauseLayer.hidden = true;
    this.resumeButton = makeButton(MENUS_TEXT.resume, 'menus-button');
    const restartButton = makeButton(MENUS_TEXT.restart, 'menus-button menus-button-secondary');
    this.resumeButton.addEventListener('click', () => this.resumeGame());
    restartButton.addEventListener('click', () => this.restartRun());
    const actions = element('div', 'menus-actions');
    actions.append(this.resumeButton, restartButton);
    this.pauseLayer.append(
      element('h2', 'menus-heading', MENUS_TEXT.pauseTitle),
      element('p', 'menus-hint', MENUS_TEXT.pauseHint),
      actions,
    );

    this.receiptLayer = game.ui.add('fullscreen', 'menus-layer menus-receipt-layer');
    this.receiptLayer.hidden = true;
    this.receiptPaper = element('div', 'menus-receipt');
    this.receiptLayer.append(this.receiptPaper);

    game.input.onPress('pause', () => this.onPauseKey());
    game.events.on('playerDeath', () => this.onPlayerDeath());
    game.events.on('gameOver', () => {
      if (this.phase === 'playing' || this.phase === 'paused') this.showReceipt();
    });
    game.events.on('death', ({ entity }) => {
      if (entity.get(EnemyC)) this.enemiesKilled += 1;
    });
    game.events.on('waveEnd', () => {
      this.wavesSurvived += 1;
    });
    game.events.on('reset', () => {
      this.wavesSurvived = 0;
      this.enemiesKilled = 0;
    });

    this.openButton.focus();
  }

  private openDoors(): void {
    if (this.phase !== 'title' || this.openButton.disabled) return;
    this.openButton.disabled = true;
    this.facade.classList.add('is-open');
    this.later(MENUS_CONFIG.title.doorOpenMs, () => this.startGame());
  }

  private startGame(): void {
    this.phase = 'playing';
    this.titleLayer.hidden = true;
    this.game.setPaused(false);
  }

  private onPauseKey(): void {
    if (this.phase === 'playing') this.pauseGame();
    else if (this.phase === 'paused') this.resumeGame();
  }

  private pauseGame(): void {
    this.phase = 'paused';
    this.game.setPaused(true);
    this.setGrey(true);
    this.pauseLayer.hidden = false;
    this.resumeButton.focus();
  }

  private resumeGame(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.pauseLayer.hidden = true;
    this.setGrey(false);
    this.game.setPaused(false);
  }

  private onPlayerDeath(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'dying';
    this.later(MENUS_CONFIG.gameOver.deathDelayMs, () => this.showReceipt());
  }

  /** Prints the game over receipt line by line, then offers to reopen the store. */
  private showReceipt(): void {
    this.phase = 'gameover';
    this.game.setPaused(true);
    this.setGrey(true);
    this.pauseLayer.hidden = true;

    const score = Math.round(this.game.score.value);
    const isRecord = score > this.bestScore;
    if (isRecord) {
      this.bestScore = score;
      writeBestScore(score);
      this.refreshBestLabel();
    }

    const again = makeButton(MENUS_TEXT.reopen, 'menus-button menus-line');
    again.addEventListener('click', () => this.restartRun());

    const lines: HTMLElement[] = [
      element(
        'div',
        'menus-line menus-receipt-center menus-receipt-brand',
        MENUS_TEXT.receiptBrand,
      ),
      element('div', 'menus-line menus-receipt-center', MENUS_TEXT.receiptTitle),
      element('div', 'menus-line menus-receipt-center', new Date().toLocaleDateString('fr-FR')),
      receiptSeparator(),
      receiptRow(MENUS_TEXT.waves, String(this.wavesSurvived)),
      receiptRow(MENUS_TEXT.kills, String(this.enemiesKilled)),
      receiptRow(MENUS_TEXT.savings, formatEuros(score)),
      receiptSeparator(),
      receiptRow(MENUS_TEXT.bestScore, formatEuros(this.bestScore)),
    ];
    if (isRecord) lines.push(element('div', 'menus-line menus-stamp', MENUS_TEXT.newRecord));
    lines.push(
      receiptSeparator(),
      element('div', 'menus-line menus-receipt-center', MENUS_TEXT.thanks),
      again,
    );

    this.receiptPaper.replaceChildren(...lines, element('div', 'menus-tear'));
    this.receiptPaper.classList.remove('is-out');
    this.receiptLayer.hidden = false;
    this.later(MENUS_CONFIG.gameOver.paperOutMs, () => this.receiptPaper.classList.add('is-out'));
    lines.forEach((line, index) => {
      const delay = MENUS_CONFIG.gameOver.printStartMs + index * MENUS_CONFIG.gameOver.printStepMs;
      this.later(delay, () => {
        line.classList.add('is-printed');
        if (line === again) again.focus();
      });
    });
  }

  /** Starts a new run: the core clears the world on the next frame. */
  private restartRun(): void {
    this.clearTimers();
    this.phase = 'playing';
    this.pauseLayer.hidden = true;
    this.receiptLayer.hidden = true;
    this.setGrey(false);
    this.game.restart();
    this.game.setPaused(false);
  }

  private refreshBestLabel(): void {
    this.bestLabel.textContent = `${MENUS_TEXT.bestScore} : ${formatEuros(this.bestScore)}`;
  }

  private setGrey(on: boolean): void {
    document.body.classList.toggle('menus-grey', on);
  }

  private later(delayMs: number, callback: () => void): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      callback();
    }, delayMs);
    this.timers.add(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.clear();
  }
}

export default defineFeature({
  id: 'menus',
  setup(game) {
    new MenuController(game);
  },
});
