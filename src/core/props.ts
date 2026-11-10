import type * as THREE from 'three';
import type { Pickup, Trap } from './types';
import type { Game } from './game';

/** Spawns traps from the registry and keeps them updated. */
export class TrapManager {
  private traps: Trap[] = [];

  constructor(private readonly game: Game) {}

  get all(): readonly Trap[] {
    return this.traps;
  }

  spawn(id: string, position: THREE.Vector3, rotationY = 0): Trap | null {
    const def = this.game.registry.traps.get(id);
    if (!def) return null;
    const trap = def.spawn(this.game, position, rotationY);
    this.traps.push(trap);
    return trap;
  }

  spawnDefaults(): void {
    for (const def of this.game.registry.traps.values()) {
      this.traps.push(...(def.spawnDefault?.(this.game) ?? []));
    }
  }

  fixedUpdate(dt: number): void {
    for (const trap of this.traps) trap.fixedUpdate?.(dt);
  }

  update(dt: number): void {
    for (const trap of this.traps) trap.update?.(dt);
  }

  reset(): void {
    for (const trap of this.traps) trap.dispose(this.game);
    this.traps = [];
    this.spawnDefaults();
  }
}

/** Spawns pickups and collects them when the player walks over them. */
export class PickupManager {
  private pickups: Pickup[] = [];

  constructor(private readonly game: Game) {}

  get all(): readonly Pickup[] {
    return this.pickups;
  }

  spawn(id: string, position: THREE.Vector3): Pickup | null {
    const def = this.game.registry.pickups.get(id);
    if (!def) return null;
    const pickup = def.spawn(this.game, position);
    this.pickups.push(pickup);
    return pickup;
  }

  fixedUpdate(): void {
    const player = this.game.player;
    if (player.health.dead) return;
    this.pickups = this.pickups.filter((pickup) => {
      const dx = pickup.position.x - player.position.x;
      const dz = pickup.position.z - player.position.z;
      if (dx * dx + dz * dz > pickup.radius * pickup.radius) return true;
      if (!pickup.collect(this.game)) return true;
      this.game.events.emit('pickup', { itemId: pickup.entity.name, by: player.entity });
      pickup.dispose(this.game);
      return false;
    });
  }

  update(dt: number): void {
    for (const pickup of this.pickups) pickup.update?.(dt);
  }

  clear(): void {
    for (const pickup of this.pickups) pickup.dispose(this.game);
    this.pickups = [];
  }
}
