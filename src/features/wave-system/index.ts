import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { type Range, WAVE_CONFIG } from './config';

/** One enemy scheduled in the rush of a wave. */
interface ScheduledSpawn {
  typeId: string;
  /** Seconds after the start of the rush. */
  at: number;
  boss: boolean;
}

/** Enemy type that can be picked for a normal wave, with its relative weight. */
interface WeightedType {
  id: string;
  weight: number;
}

/**
 * intermission: the store lights crackle until the next wave.
 * rush: the doors open and the wave pours in.
 * fight: every enemy is in; the wave ends when the last one is down.
 */
type Phase = 'intermission' | 'rush' | 'fight';

/** A light of the store and its normal intensity, restored after each crackle. */
interface LightState {
  light: THREE.Light;
  base: number;
}

function randomBetween(range: Range): number {
  return range.min + Math.random() * (range.max - range.min);
}

function randomSigned(amplitude: number): number {
  return (Math.random() * 2 - 1) * amplitude;
}

/** Runs the endless cycle of waves: intermission, rush, fight, intermission... */
class WaveManager {
  private wave = 0;
  private phase: Phase = 'intermission';
  /** Seconds left in the current intermission. */
  private timer: number = WAVE_CONFIG.firstWaveDelay;
  /** Seconds elapsed since the start of the rush. */
  private rushTime = 0;
  private queue: ScheduledSpawn[] = [];
  private nextSpawn = 0;
  /** Set after an easy wave: the next wave is the huge one. */
  private hugeNext = false;
  private flickerTimer = 0;
  private readonly lights: LightState[] = [];
  private readonly doorOffset = new THREE.Vector3();

  constructor(private readonly game: Game) {
    game.scene.traverse((object) => {
      // Point lights are the alarm beacons, which the arena drives every frame: they are left alone.
      if (object instanceof THREE.Light && !(object instanceof THREE.PointLight)) {
        this.lights.push({ light: object, base: object.intensity });
      }
    });

    game.events.on('reset', () => this.reset());
    // The loop stops stepping while paused and the player is down: never leave a light crackled.
    game.events.on('pause', () => this.restoreLights());
    game.events.on('playerDeath', () => this.restoreLights());
  }

  /** Advances the cycle. Called every rendered frame with the simulated delta (0 while paused). */
  update(dt: number): void {
    const { game } = this;
    if (game.paused || game.player.health.dead) return;

    if (this.phase === 'intermission') {
      this.flicker(dt);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.restoreLights();
        this.startWave();
      }
    } else if (this.phase === 'rush') {
      this.rushTime += dt;
      this.spawnDue();
      if (this.nextSpawn >= this.queue.length) this.phase = 'fight';
    } else if (game.enemies.count === 0) {
      this.endWave();
    }
  }

  private startWave(): void {
    this.wave++;
    const count = this.enemyCount(this.rollMultiplier());
    this.queue = this.buildQueue(count);
    this.nextSpawn = 0;
    this.rushTime = 0;
    this.phase = 'rush';

    this.game.events.emit('waveStart', { wave: this.wave, enemyCount: this.queue.length });
    const lines = WAVE_CONFIG.announcement.waveLines;
    const line = lines[Math.floor(Math.random() * lines.length)] ?? '';
    this.announce(line.replace('{wave}', String(this.wave)));
    for (const note of WAVE_CONFIG.chime) {
      this.game.audio.tone({
        freq: note.freq,
        type: 'triangle',
        duration: note.duration,
        delay: note.delay,
        volume: 0.18,
      });
    }
  }

  private endWave(): void {
    this.game.events.emit('waveEnd', { wave: this.wave });
    this.queue = [];
    this.nextSpawn = 0;
    this.phase = 'intermission';
    this.timer = WAVE_CONFIG.pauseDuration;
    this.flickerTimer = 0;
  }

  /** Enemy count of the current wave: the trend, scaled by the surprise multiplier. */
  private enemyCount(multiplier: number): number {
    const trend = WAVE_CONFIG.baseCount + WAVE_CONFIG.countPerWave * (this.wave - 1);
    return Math.min(WAVE_CONFIG.maxCountPerWave, Math.max(1, Math.round(trend * multiplier)));
  }

  /** Easy waves are sometimes followed by a huge one; otherwise the multiplier is neutral. */
  private rollMultiplier(): number {
    const { surprise } = WAVE_CONFIG;
    if (this.hugeNext) {
      this.hugeNext = false;
      return randomBetween(surprise.hugeMultiplier);
    }
    if (this.wave >= 2 && Math.random() < surprise.easyChance) {
      this.hugeNext = true;
      return randomBetween(surprise.easyMultiplier);
    }
    return 1;
  }

  /** Plans the rush: normal enemies in bursts, plus maybe the boss at a random moment. */
  private buildQueue(count: number): ScheduledSpawn[] {
    const { rush, boss } = WAVE_CONFIG;
    const queue: ScheduledSpawn[] = [];
    const types = this.pickableTypes();
    if (types.length > 0) {
      for (let i = 0; i < count; i++) {
        queue.push({
          typeId: this.pickType(types),
          at: Math.floor(i / rush.perBurst) * rush.burstInterval,
          boss: false,
        });
      }
    }
    if (this.game.registry.enemies.has(boss.typeId) && Math.random() < boss.chancePerWave) {
      queue.push({ typeId: boss.typeId, at: randomBetween(boss.spawnDelay), boss: true });
    }
    return queue.sort((a, b) => a.at - b.at);
  }

  /** Registered enemy types allowed in normal waves, with their weights. */
  private pickableTypes(): WeightedType[] {
    const excluded = new Set<string>(WAVE_CONFIG.excludedTypeIds);
    const types: WeightedType[] = [];
    for (const id of this.game.registry.enemies.keys()) {
      if (excluded.has(id)) continue;
      const weight = WAVE_CONFIG.enemyWeights[id] ?? WAVE_CONFIG.defaultWeight;
      if (weight > 0) types.push({ id, weight });
    }
    return types;
  }

  private pickType(types: readonly WeightedType[]): string {
    const total = types.reduce((sum, type) => sum + type.weight, 0);
    let roll = Math.random() * total;
    for (const type of types) {
      roll -= type.weight;
      if (roll < 0) return type.id;
    }
    return types.at(-1)?.id ?? '';
  }

  /** Spawns every enemy of the queue whose time has come. */
  private spawnDue(): void {
    while (this.nextSpawn < this.queue.length) {
      const index = this.nextSpawn;
      const entry = this.queue[index];
      if (!entry || entry.at > this.rushTime) break;
      this.nextSpawn++;
      this.spawnEntry(entry, index);
    }
  }

  private spawnEntry(entry: ScheduledSpawn, index: number): void {
    const { game } = this;
    const { rush } = WAVE_CONFIG;
    // Only one boss at a time: a leftover from an earlier wave blocks the new one.
    if (entry.boss && this.bossAlive()) return;

    const doors = game.arena.layout.doors;
    const burst = Math.floor(index / rush.perBurst);
    const door = doors.length > 0 ? doors[burst % doors.length] : undefined;
    if (!door) return;

    this.doorOffset.set(randomSigned(rush.offsetX), 0, randomSigned(rush.offsetZ));
    const position = door.clone().add(this.doorOffset);
    position.y = rush.spawnY;
    const enemy = game.enemies.spawn(entry.typeId, position);

    if (index % rush.perBurst === 0) {
      game.fx.burst({
        position: door.clone().setY(0.8),
        color: [...rush.dustColors],
        count: 14,
        shape: 'box',
        size: 0.2,
        speed: 2.5,
        life: 0.6,
        gravity: -1,
      });
    }
    if (index === 0) {
      game.audio.noise({
        duration: rush.whoosh.duration,
        volume: rush.whoosh.volume,
        filterFreq: rush.whoosh.filterFreq,
      });
    }
    if (entry.boss && enemy) this.announce(WAVE_CONFIG.announcement.bossLine);
  }

  private bossAlive(): boolean {
    const typeId = WAVE_CONFIG.boss.typeId;
    return this.game.enemies.alive.some(
      (enemy) => enemy.typeId === typeId && enemy.state !== 'dead',
    );
  }

  /** Crackles the store lights at random: short dips, sometimes a full blackout. */
  private flicker(dt: number): void {
    if (this.lights.length === 0) return;
    this.flickerTimer -= dt;
    if (this.flickerTimer > 0) return;
    const { lights } = WAVE_CONFIG;
    this.flickerTimer = randomBetween(lights.flickerInterval);
    const blackout = Math.random() < lights.blackoutChance;
    for (const state of this.lights) {
      const level = blackout ? 0 : randomBetween(lights.flickerLevel);
      state.light.intensity = state.base * level;
    }
    if (blackout) this.game.audio.noise({ duration: 0.12, volume: 0.1, filterFreq: 3000 });
  }

  private restoreLights(): void {
    for (const state of this.lights) state.light.intensity = state.base;
  }

  /** Emits the announcement event and shows this store-voice line on screen. */
  private announce(text: string): void {
    const duration = WAVE_CONFIG.announcement.duration;
    this.game.events.emit('announcement', { text, duration, position: null });
    this.game.ui.toast(text, duration);
  }

  /** Back to the start of the run: wave 1 comes after the first delay. */
  private reset(): void {
    this.wave = 0;
    this.phase = 'intermission';
    this.timer = WAVE_CONFIG.firstWaveDelay;
    this.rushTime = 0;
    this.queue = [];
    this.nextSpawn = 0;
    this.hugeNext = false;
    this.flickerTimer = 0;
    this.restoreLights();
  }
}

export default defineFeature({
  id: 'wave-system',
  setup(game) {
    const waves = new WaveManager(game);
    game.addSystem({
      name: 'wave-system',
      priority: 100,
      update: (dt) => waves.update(dt),
    });
  },
});
