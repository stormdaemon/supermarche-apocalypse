import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import type { EventBus } from './events';
import type { GameTime } from './loop';
import { EnemyC } from './types';

// ---------------------------------------------------------------------------
// Surfaces: ground zones that change how characters move (puddles, conveyors).
// ---------------------------------------------------------------------------

export type SurfaceTarget = 'all' | 'player' | 'enemies';

export interface SurfaceZone {
  /** Returns true when the ground position is inside the zone. */
  contains(position: THREE.Vector3): boolean;
  /** Steering control multiplier: 1 = normal grip, 0.1 = ice. */
  control?: number;
  /** Velocity added to anything standing in the zone (conveyor belts), in m/s. */
  velocity?: THREE.Vector3;
  affects?: SurfaceTarget;
  /** Simulated time at which the zone disappears. Omit for permanent zones. */
  until?: number;
}

export interface SurfaceSample {
  control: number;
  velocity: THREE.Vector3;
}

export class Surfaces {
  private zones: SurfaceZone[] = [];
  private readonly sampleOut: SurfaceSample = { control: 1, velocity: new THREE.Vector3() };

  constructor(private readonly time: GameTime) {}

  add(zone: SurfaceZone): () => void {
    this.zones.push(zone);
    return () => this.remove(zone);
  }

  remove(zone: SurfaceZone): void {
    this.zones = this.zones.filter((z) => z !== zone);
  }

  /** Combines every zone under the position. The returned object is reused between calls. */
  sample(position: THREE.Vector3, who: 'player' | 'enemies'): SurfaceSample {
    const out = this.sampleOut;
    out.control = 1;
    out.velocity.set(0, 0, 0);
    const now = this.time.elapsed;
    this.zones = this.zones.filter((z) => z.until === undefined || z.until > now);
    for (const zone of this.zones) {
      const affects = zone.affects ?? 'all';
      if (affects !== 'all' && affects !== who) continue;
      if (!zone.contains(position)) continue;
      if (zone.control !== undefined) out.control = Math.min(out.control, zone.control);
      if (zone.velocity) out.velocity.add(zone.velocity);
    }
    return out;
  }

  clear(): void {
    this.zones = [];
  }
}

// ---------------------------------------------------------------------------
// AI director: points of interest that pull enemies away from the player.
// ---------------------------------------------------------------------------

export interface Attractor {
  position: THREE.Vector3;
  /** Probability in [0, 1] that an enemy picks this attractor over the player. */
  pull: number;
  /** Simulated time at which the attractor expires. */
  until: number;
}

export class AiDirector {
  private attractors: Attractor[] = [];

  constructor(private readonly time: GameTime) {}

  /** Adds a point of interest for a duration in seconds. */
  addAttractor(position: THREE.Vector3, duration: number, pull = 0.8): Attractor {
    const attractor = { position: position.clone(), pull, until: this.time.elapsed + duration };
    this.attractors.push(attractor);
    return attractor;
  }

  removeAttractor(attractor: Attractor): void {
    this.attractors = this.attractors.filter((a) => a !== attractor);
  }

  /** Returns an active attractor the given enemy should go to, or null to chase the player. */
  pickAttractor(roll: number): Attractor | null {
    const now = this.time.elapsed;
    this.attractors = this.attractors.filter((a) => a.until > now);
    for (const attractor of this.attractors) {
      if (roll < attractor.pull) return attractor;
    }
    return null;
  }

  clear(): void {
    this.attractors = [];
  }
}

// ---------------------------------------------------------------------------
// Score and combos.
// ---------------------------------------------------------------------------

export class Score {
  value = 0;
  combo = 0;
  best = 0;
  private lastKill = -Infinity;

  constructor(
    private readonly events: EventBus,
    private readonly time: GameTime,
    pointsFor: (typeId: string) => number,
  ) {
    events.on('death', ({ entity }) => {
      const enemy = entity.get(EnemyC);
      if (!enemy) return;
      const now = this.time.elapsed;
      this.combo = now - this.lastKill <= CORE_CONFIG.score.comboWindow ? this.combo + 1 : 1;
      this.lastKill = now;
      this.add(pointsFor(enemy.typeId) * this.combo);
    });
  }

  /** Adds points (already multiplied) and notifies listeners. */
  add(delta: number): void {
    this.value += delta;
    this.best = Math.max(this.best, this.value);
    this.events.emit('scoreChange', { score: this.value, delta, combo: this.combo });
  }

  /** Combo expires when no kill happens during the combo window. */
  update(): void {
    if (this.combo > 0 && this.time.elapsed - this.lastKill > CORE_CONFIG.score.comboWindow) {
      this.combo = 0;
      this.events.emit('scoreChange', { score: this.value, delta: 0, combo: 0 });
    }
  }

  reset(): void {
    this.value = 0;
    this.combo = 0;
    this.lastKill = -Infinity;
    this.events.emit('scoreChange', { score: 0, delta: 0, combo: 0 });
  }
}
