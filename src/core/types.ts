import type * as THREE from 'three';
import type { RAPIER } from './physics';
import { defineComponent, type Entity } from './ecs';
import type { CharacterRig } from './characterFactory';
import type { Game } from './game';
import type { Player } from './player';

/** Hit points of anything that can be damaged. */
export class Health {
  dead = false;
  /** Simulated time (game.time.elapsed) until which damage is ignored. */
  invulnerableUntil = 0;
  constructor(
    public max: number,
    public current = max,
  ) {}

  get ratio(): number {
    return this.max > 0 ? this.current / this.max : 0;
  }

  reset(): void {
    this.current = this.max;
    this.dead = false;
    this.invulnerableUntil = 0;
  }
}

/** Describes one hit dealt through game.combat.hit(). */
export interface HitInfo {
  damage: number;
  /** Impulse applied to the target, in world space. */
  force: THREE.Vector3;
  point?: THREE.Vector3;
  source?: Entity | null;
  /** Free-form tag for features (e.g. 'punch', 'baguette', 'explosion'). */
  kind?: string;
  /** Seconds during which the target loses control (defaults to the core stagger time). */
  stun?: number;
}

/** Anything combat can damage: the player, enemies, breakable props. */
export interface Hittable {
  readonly entity: Entity;
  readonly health: Health;
  /** World position used for distance checks (feet level). */
  readonly position: THREE.Vector3;
  /** Applies the physical reaction to a hit. Damage is handled by game.combat. */
  applyHit(info: HitInfo): void;
}

export const HittableC = defineComponent<Hittable>('hittable');
export const PlayerTag = 'player';
export const EnemyTag = 'enemy';

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export type EnemyState = 'active' | 'stunned' | 'knockedOut' | 'dead';

export interface Enemy extends Hittable {
  readonly typeId: string;
  readonly displayName: string;
  readonly rig: CharacterRig;
  readonly body: RAPIER.RigidBody;
  readonly state: EnemyState;
  /** Disables AI and locomotion for a duration (ragdolls, grabs, traps). */
  knockOut(duration: number): void;
  /**
   * While true the enemy stops driving its rig transform and animation, so a feature
   * (ragdoll, grab) can pose it freely.
   */
  visualOverride: boolean;
  /** True once the enemy can be removed from the game (death animation over). */
  readonly finished: boolean;
  fixedUpdate(dt: number): void;
  update(dt: number): void;
  dispose(): void;
}

export const EnemyC = defineComponent<Enemy>('enemy');

export interface EnemyDefinition {
  id: string;
  displayName: string;
  /** Score awarded on death, before combo multiplier. */
  points: number;
  create(game: Game, position: THREE.Vector3): Enemy;
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

/** Everything a held weapon can read during a fixed step. */
export interface WeaponContext {
  game: Game;
  player: Player;
  /** True while the attack button is held. */
  attackHeld: boolean;
  /** Point under the cursor on the player's ground plane. */
  aimPoint: THREE.Vector3;
  /** Horizontal unit vector from the player towards the aim point. */
  aimDir: THREE.Vector3;
}

export interface Weapon {
  readonly id: string;
  readonly displayName: string;
  readonly entity: Entity;
  readonly object: THREE.Object3D;
  /** Dynamic body used while the weapon lies on the ground or flies after a throw. */
  readonly body: RAPIER.RigidBody;
  /** 'hand': attached to the right hand. 'front': pushed in front of the player (caddie). */
  readonly holdMode: 'hand' | 'front';
  /** When true the weapon system removes the weapon. */
  readonly broken: boolean;
  onEquip(ctx: WeaponContext): void;
  onDrop(ctx: WeaponContext, thrown: boolean): void;
  /** Called on the fixed step where the attack button is pressed while held. */
  attack(ctx: WeaponContext): void;
  /** Called every fixed step while held. */
  heldUpdate(ctx: WeaponContext, dt: number): void;
  /** Called when the thrown weapon touches something at speed. */
  onThrownImpact(game: Game, target: Hittable | null, speed: number): void;
  dispose(game: Game): void;
}

export interface WeaponDefinition {
  id: string;
  displayName: string;
  create(game: Game, position: THREE.Vector3): Weapon;
}

// ---------------------------------------------------------------------------
// Traps and pickups
// ---------------------------------------------------------------------------

export interface Trap {
  readonly entity: Entity;
  fixedUpdate?(dt: number): void;
  update?(dt: number): void;
  dispose(game: Game): void;
}

export interface TrapDefinition {
  id: string;
  displayName: string;
  /** Places the trap at its default spots in the arena (called at start and on reset). */
  spawnDefault?(game: Game): Trap[];
  spawn(game: Game, position: THREE.Vector3, rotationY: number): Trap;
}

export interface Pickup {
  readonly entity: Entity;
  readonly position: THREE.Vector3;
  readonly radius: number;
  /** Called when the player touches the pickup. Return true to consume it. */
  collect(game: Game): boolean;
  update?(dt: number): void;
  dispose(game: Game): void;
}

export interface PickupDefinition {
  id: string;
  displayName: string;
  spawn(game: Game, position: THREE.Vector3): Pickup;
}
