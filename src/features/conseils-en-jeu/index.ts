import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { CONSEILS_CONFIG as C } from './config';
import './tips.css';

/**
 * Every tip, in priority order: when several are eligible, the first one in this list is shown.
 * The dodge tip comes first because it is urgent.
 */
const TIP_IDS = [
  'dodge',
  'objective',
  'controls',
  'attack',
  'pickup',
  'throw',
  'intermission',
] as const;

type TipId = (typeof TIP_IDS)[number];

/** Tips shown at the start of a run, in this order, once the doors are open. */
const START_TIPS: readonly TipId[] = ['objective', 'controls'];

/** Selector of the first-launch tutorial panel (see features/tutorial). */
const TUTORIAL_PANEL_SELECTOR = '.tuto-panel';

function emptyCounts(): Record<TipId, number> {
  return {
    dodge: 0,
    objective: 0,
    controls: 0,
    attack: 0,
    pickup: 0,
    throw: 0,
    intermission: 0,
  };
}

/** Reads how many times each tip was shown; falls back to zero when storage is unavailable. */
function readCounts(): Record<TipId, number> {
  const counts = emptyCounts();
  try {
    const raw = window.localStorage.getItem(C.storageKey);
    if (raw === null) return counts;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return counts;
    for (const id of TIP_IDS) {
      const value: unknown = Reflect.get(data, id);
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        counts[id] = Math.floor(value);
      }
    }
  } catch {
    // Storage is unavailable or the value is corrupt: the tips may show again.
  }
  return counts;
}

/** Saves the show counts; silently ignored when storage is unavailable. */
function writeCounts(counts: Record<TipId, number>): void {
  try {
    window.localStorage.setItem(C.storageKey, JSON.stringify(counts));
  } catch {
    // Storage is unavailable: the counts only live for this page session.
  }
}

/**
 * Small contextual tips shown one at a time in a bubble at the bottom of the screen.
 * Tips only use generic signals (player state, held weapon, waves, events) and never
 * show while the game is paused, the player is down, or the tutorial panel is visible.
 */
class Tips {
  private readonly bubble: HTMLDivElement;
  private readonly counts = readCounts();
  /** Tips whose condition is currently met and that were already shown for it. */
  private readonly done = new Set<TipId>();
  private startQueue: TipId[] = [];
  private pendingRunStart = true;
  /** True from the first open frame of a run until its start tips are queued. */
  private awaitingStart = false;
  /** True when the tutorial panel was on screen during the current run. */
  private tutorialRanThisRun = false;
  /** Simulated seconds since the run started. */
  private runAge = 0;
  private hitLanded = false;
  private betweenWaves = false;
  /** Simulated seconds the current weapon has been held without being thrown. */
  private holdTime = 0;
  /** Simulated seconds the player has stood next to a weapon without holding one. */
  private pickupTimer = 0;
  private visible: TipId | null = null;
  private visibleLeft = 0;
  private cooldown = 0;

  constructor(private readonly game: Game) {
    this.bubble = game.ui.add('bottom-center', 'conseil-bubble');
    this.bubble.style.display = 'none';

    game.events.on('hit', ({ source }) => {
      // Bare hands and weapons both leave the player's side: any of them counts as a landed hit.
      if (source && (source === game.player.entity || source.tags.has('weapon'))) {
        this.hitLanded = true;
      }
    });
    game.events.on('waveEnd', () => {
      this.betweenWaves = true;
    });
    game.events.on('waveStart', () => {
      this.betweenWaves = false;
    });
    game.events.on('reset', () => this.onReset());

    game.addSystem({
      name: 'conseils-en-jeu',
      priority: 120,
      update: (dt) => this.update(dt),
    });
  }

  private onReset(): void {
    this.pendingRunStart = true;
    this.runAge = 0;
    this.startQueue = [];
    this.hitLanded = false;
    this.betweenWaves = false;
    this.holdTime = 0;
    this.pickupTimer = 0;
    this.done.clear();
    this.hide();
  }

  /** True while the first-launch tutorial panel is on screen: the tutorial speaks instead. */
  private tutorialRunning(): boolean {
    const panel = this.game.ui
      .slot('bottom-center')
      .querySelector<HTMLElement>(TUTORIAL_PANEL_SELECTOR);
    return panel !== null && panel.style.display !== 'none';
  }

  /** Runs every frame; dt is zero while the game is paused, so the timers freeze too. */
  private update(dt: number): void {
    const { game } = this;
    if (game.paused || game.player.health.dead) {
      this.hide();
      return;
    }

    if (this.pendingRunStart) {
      this.pendingRunStart = false;
      this.runAge = 0;
      this.awaitingStart = true;
      this.tutorialRanThisRun = false;
    }
    if (this.tutorialRunning()) {
      // The tutorial guides the player: the start tips wait until its panel is gone.
      this.tutorialRanThisRun = true;
      this.hide();
      return;
    }
    if (this.awaitingStart) {
      // The objective is always shown; the controls tip only if the tutorial did not teach them.
      this.awaitingStart = false;
      this.startQueue = this.tutorialRanThisRun ? ['objective'] : [...START_TIPS];
    }

    this.runAge += dt;
    const holding = game.weapons.held !== null;
    this.holdTime = holding ? this.holdTime + dt : 0;
    const nearWeapon = !holding && game.weapons.nearest !== null;
    this.pickupTimer = nearWeapon ? this.pickupTimer + dt : 0;

    if (this.visible !== null) {
      this.visibleLeft -= dt;
      if (this.visibleLeft <= 0) {
        this.hide();
        this.cooldown = C.cooldownSeconds;
      }
    } else if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
    }

    this.pickTip(this.conditions());
  }

  /** Tells, for every tip, whether its trigger is met right now. */
  private conditions(): Record<TipId, boolean> {
    const { game } = this;
    const holding = game.weapons.held !== null;
    return {
      dodge: game.player.health.ratio < C.lowHealthRatio,
      objective: this.startQueue.includes('objective') && this.runAge >= C.startDelay,
      controls: this.startQueue.includes('controls') && this.runAge >= C.startDelay,
      attack: !this.hitLanded && this.countNearbyEnemies() >= C.enemyNearCount,
      pickup: this.pickupTimer >= C.pickupDwell,
      throw: holding && this.holdTime >= C.holdSeconds,
      intermission: this.betweenWaves && !holding && game.weapons.all.length > 0,
    };
  }

  /** Shows the first eligible tip, if no tip is on screen and the cooldown is over. */
  private pickTip(conditions: Record<TipId, boolean>): void {
    // A tip can come back once its trigger has been released, so it does not repeat while held.
    for (const id of TIP_IDS) {
      if (!conditions[id]) this.done.delete(id);
    }
    if (this.visible !== null || this.cooldown > 0) return;
    const next = TIP_IDS.find(
      (id) => conditions[id] && !this.done.has(id) && this.counts[id] < C.maxShows[id],
    );
    if (next !== undefined) this.show(next);
  }

  private countNearbyEnemies(): number {
    const player = this.game.player;
    let count = 0;
    for (const enemy of this.game.enemies.alive) {
      if (enemy.state === 'dead') continue;
      if (enemy.position.distanceTo(player.position) <= C.enemyNearDistance) count += 1;
    }
    return count;
  }

  private show(id: TipId): void {
    this.counts[id] += 1;
    writeCounts(this.counts);
    this.done.add(id);
    this.startQueue = this.startQueue.filter((tip) => tip !== id);
    this.visible = id;
    this.visibleLeft = C.displaySeconds;
    this.bubble.textContent = this.textFor(id);
    this.bubble.style.display = '';
  }

  private hide(): void {
    if (this.visible === null) return;
    this.visible = null;
    this.bubble.style.display = 'none';
  }

  /** Text of a tip; the pickup tip names the weapon the player could take now. */
  private textFor(id: TipId): string {
    if (id !== 'pickup') return C.texts[id];
    const weapon = this.game.weapons.nearest;
    if (!weapon) return '';
    const article = C.weaponArticles[weapon.id] ?? '';
    const name = weapon.displayName.toLowerCase();
    return C.texts.pickup.replace('{article}', article).replace('{weapon}', name);
  }
}

export default defineFeature({
  id: 'conseils-en-jeu',
  setup(game) {
    new Tips(game);
  },
});
