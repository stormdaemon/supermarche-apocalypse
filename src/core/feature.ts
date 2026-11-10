import type { Game } from './game';
import type { PlayerMotor } from './player';
import type { ShelfBuilder } from './arena';
import type { EnemyDefinition, PickupDefinition, TrapDefinition, WeaponDefinition } from './types';

/**
 * Replaceable core behaviours. The core registers defaults with priority 0;
 * a feature can override one by providing a higher priority.
 */
export interface ProviderMap {
  /** Creates the motor that moves the player each fixed step. */
  playerMotor: () => PlayerMotor;
  /** Builds one shelf unit of the arena. */
  shelf: ShelfBuilder;
}

/** A self-contained gameplay module living in src/features/<name>/index.ts. */
export interface FeatureModule {
  /** Unique id, usually the folder name. */
  id: string;
  /** Runs before the world is built: register definitions and providers here. */
  register?(registry: Registry): void;
  /** Runs once the world is built: add systems, UI and event listeners here. */
  setup?(game: Game): void;
}

/** Identity helper giving type inference to feature modules. */
export function defineFeature(feature: FeatureModule): FeatureModule {
  return feature;
}

/** Catalog of everything features contribute. */
export class Registry {
  readonly weapons = new Map<string, WeaponDefinition>();
  readonly enemies = new Map<string, EnemyDefinition>();
  readonly traps = new Map<string, TrapDefinition>();
  readonly pickups = new Map<string, PickupDefinition>();
  readonly features: string[] = [];
  private readonly providers = new Map<keyof ProviderMap, { value: unknown; priority: number }>();

  registerWeapon(def: WeaponDefinition): void {
    this.weapons.set(def.id, def);
  }

  registerEnemy(def: EnemyDefinition): void {
    this.enemies.set(def.id, def);
  }

  registerTrap(def: TrapDefinition): void {
    this.traps.set(def.id, def);
  }

  registerPickup(def: PickupDefinition): void {
    this.pickups.set(def.id, def);
  }

  /** Registers a provider; the highest priority wins. */
  provide<K extends keyof ProviderMap>(key: K, value: ProviderMap[K], priority = 1): void {
    const current = this.providers.get(key);
    if (!current || priority >= current.priority) this.providers.set(key, { value, priority });
  }

  get<K extends keyof ProviderMap>(key: K): ProviderMap[K] {
    const entry = this.providers.get(key);
    if (!entry) throw new Error(`No provider registered for "${key}"`);
    return entry.value as ProviderMap[K];
  }
}
