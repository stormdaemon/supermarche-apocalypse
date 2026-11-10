import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { Entity } from './ecs';
import { Groups, groups, RAPIER } from './physics';
import type { Hittable, Weapon, WeaponContext } from './types';
import type { Game } from './game';

export interface BaseWeaponOptions {
  id: string;
  displayName: string;
  object: THREE.Object3D;
  /** Colliders of the dropped/thrown body, relative to the body origin. */
  colliders: RAPIER.ColliderDesc[];
  mass?: number;
  holdMode?: 'hand' | 'front';
  /** Local transform of the object once attached (hand or player root). */
  holdOffset?: THREE.Vector3;
  holdRotation?: THREE.Euler;
}

/**
 * Common weapon behaviour: physics body on the ground, attachment while held,
 * default thrown-impact damage. Subclasses implement attack().
 */
export abstract class BaseWeapon implements Weapon {
  readonly id: string;
  readonly displayName: string;
  readonly entity: Entity;
  readonly object: THREE.Object3D;
  readonly body: RAPIER.RigidBody;
  readonly holdMode: 'hand' | 'front';
  readonly holdOffset: THREE.Vector3;
  readonly holdRotation: THREE.Euler;
  broken = false;

  constructor(
    protected readonly game: Game,
    position: THREE.Vector3,
    options: BaseWeaponOptions,
  ) {
    this.id = options.id;
    this.displayName = options.displayName;
    this.object = options.object;
    this.holdMode = options.holdMode ?? 'hand';
    this.holdOffset = options.holdOffset ?? new THREE.Vector3();
    this.holdRotation = options.holdRotation ?? new THREE.Euler();
    this.entity = new Entity(`weapon:${options.id}`);
    this.entity.tags.add('weapon');
    const colliders = options.colliders.map((desc) =>
      desc.setCollisionGroups(
        groups(Groups.WEAPON, Groups.STATIC | Groups.ENEMY | Groups.PROP | Groups.WEAPON),
      ),
    );
    if (options.mass !== undefined) {
      const share = options.mass / colliders.length;
      for (const desc of colliders) desc.setMass(share);
    }
    this.body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setCcdEnabled(true),
      colliders,
      this.entity,
    );
    game.physics.bind(this.entity, this.body, this.object);
    game.scene.add(this.object);
    game.world.add(this.entity);
  }

  abstract attack(ctx: WeaponContext): void;

  onEquip(_ctx: WeaponContext): void {}

  onDrop(_ctx: WeaponContext, _thrown: boolean): void {}

  heldUpdate(_ctx: WeaponContext, _dt: number): void {}

  onThrownImpact(game: Game, target: Hittable | null, speed: number): void {
    if (!target) return;
    const v = this.body.linvel();
    const force = new THREE.Vector3(v.x, 2, v.z).multiplyScalar(0.6);
    game.combat.hit(target, {
      damage: speed * CORE_CONFIG.weapon.throwDamagePerSpeed,
      force,
      source: this.entity,
      kind: `throw:${this.id}`,
    });
  }

  dispose(game: Game): void {
    this.object.removeFromParent();
    game.world.remove(this.entity);
  }
}

/**
 * Pick up with E, one weapon at a time, attack with left click, throw with right click.
 * Weapons registered in the registry are spawned once each at the arena weapon spots.
 */
export class WeaponSystem {
  private readonly items = new Set<Weapon>();
  private readonly thrownUntil = new Map<Weapon, number>();
  held: Weapon | null = null;
  /** Weapon the player would pick up with E right now. */
  nearest: Weapon | null = null;
  private readonly hint: HTMLDivElement;

  constructor(private readonly game: Game) {
    this.hint = game.ui.add('bottom-center', 'interact-hint');
    this.hint.style.display = 'none';
  }

  get all(): readonly Weapon[] {
    return [...this.items];
  }

  spawn(id: string, position: THREE.Vector3): Weapon | null {
    const def = this.game.registry.weapons.get(id);
    if (!def) return null;
    const weapon = def.create(this.game, position);
    this.items.add(weapon);
    for (let i = 0; i < weapon.body.numColliders(); i++) {
      this.game.physics.onContact(weapon.body.collider(i), (other, started) => {
        if (started) this.onWeaponContact(weapon, other);
      });
    }
    return weapon;
  }

  /** Places one of each registered weapon on the arena weapon spots. */
  spawnDefaults(): void {
    const spots = this.game.arena.layout.weaponSpawns;
    let i = 0;
    for (const id of this.game.registry.weapons.keys()) {
      const spot = spots[i % spots.length];
      if (spot) this.spawn(id, spot.clone().setY(1));
      i++;
    }
  }

  private context(): WeaponContext {
    const game = this.game;
    return {
      game,
      player: game.player,
      attackHeld: game.input.isDown('attack'),
      aimPoint: game.aim.point,
      aimDir: game.aim.direction,
    };
  }

  private onWeaponContact(weapon: Weapon, other: RAPIER.Collider): void {
    const until = this.thrownUntil.get(weapon);
    if (until === undefined || this.game.time.elapsed > until) return;
    const v = weapon.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < CORE_CONFIG.weapon.minThrowImpactSpeed) return;
    const target = this.game.combat.hittableOf(this.game.physics.ownerOf(other));
    if (target === this.game.player) return;
    weapon.onThrownImpact(this.game, target, speed);
    if (target) this.thrownUntil.delete(weapon);
  }

  equip(weapon: Weapon): void {
    if (this.held) this.drop(false);
    const ctx = this.context();
    weapon.body.setEnabled(false);
    const player = this.game.player;
    const parent = weapon.holdMode === 'hand' ? player.rig.parts.handR : player.rig.root;
    parent.add(weapon.object);
    if (weapon instanceof BaseWeapon) {
      weapon.object.position.copy(weapon.holdOffset);
      weapon.object.rotation.copy(weapon.holdRotation);
    } else {
      weapon.object.position.set(0, 0, 0);
      weapon.object.rotation.set(0, 0, 0);
    }
    this.held = weapon;
    this.thrownUntil.delete(weapon);
    weapon.onEquip(ctx);
    this.game.events.emit('weaponEquip', { weaponId: weapon.id });
    this.game.events.emit('pickup', { itemId: weapon.id, by: player.entity });
  }

  /** Releases the held weapon; thrown sends it flying towards the cursor. */
  drop(thrown: boolean): void {
    const weapon = this.held;
    if (!weapon) return;
    const ctx = this.context();
    this.held = null;
    const worldPos = new THREE.Vector3();
    const worldQuat = new THREE.Quaternion();
    weapon.object.getWorldPosition(worldPos);
    weapon.object.getWorldQuaternion(worldQuat);
    this.game.scene.add(weapon.object);
    const player = this.game.player;
    const start = worldPos;
    if (thrown) {
      // Start in front of the chest, but never inside a wall or shelf.
      const chest = player.position.clone().setY(player.position.y + 1.3);
      const wall = this.game.physics.raycast(
        chest,
        ctx.aimDir,
        0.9,
        groups(Groups.ALL, Groups.STATIC),
      );
      start.copy(chest).addScaledVector(ctx.aimDir, wall ? Math.max(0, wall.distance - 0.3) : 0.8);
    }
    weapon.body.setTranslation(start, true);
    weapon.body.setRotation(worldQuat, true);
    weapon.body.setEnabled(true);
    if (thrown) {
      const { throwSpeed, throwUpward } = CORE_CONFIG.weapon;
      weapon.body.setLinvel(
        { x: ctx.aimDir.x * throwSpeed, y: throwUpward, z: ctx.aimDir.z * throwSpeed },
        true,
      );
      weapon.body.setAngvel({ x: Math.random() * 10 - 5, y: Math.random() * 10 - 5, z: 8 }, true);
      this.thrownUntil.set(weapon, this.game.time.elapsed + 1.5);
      player.rig.trigger('throw', 0.3);
    } else {
      weapon.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    }
    weapon.onDrop(ctx, thrown);
    this.game.events.emit('weaponDrop', { weaponId: weapon.id, thrown });
  }

  remove(weapon: Weapon): void {
    if (this.held === weapon) {
      this.held = null;
      weapon.onDrop(this.context(), false);
      this.game.events.emit('weaponDrop', { weaponId: weapon.id, thrown: false });
    }
    this.items.delete(weapon);
    this.thrownUntil.delete(weapon);
    weapon.dispose(this.game);
  }

  fixedUpdate(dt: number): void {
    const game = this.game;
    const player = game.player;
    const input = game.input;
    this.nearest = null;
    if (!this.held) {
      let best: number = CORE_CONFIG.player.interactRange;
      for (const weapon of this.items) {
        const t = weapon.body.translation();
        const d = Math.hypot(t.x - player.position.x, t.z - player.position.z);
        if (d < best && Math.abs(t.y - player.position.y) < 2) {
          best = d;
          this.nearest = weapon;
        }
      }
    }
    if (player.canControl) {
      if (input.pressed('interact')) {
        if (this.held) this.drop(false);
        else if (this.nearest) this.equip(this.nearest);
      } else if (this.held && input.pressed('throw')) {
        this.drop(true);
      } else if (this.held && input.pressed('attack')) {
        this.held.attack(this.context());
      }
    } else if (player.health.dead && this.held) {
      this.drop(false);
    }
    if (this.held) this.held.heldUpdate(this.context(), dt);
    for (const weapon of [...this.items]) {
      if (!weapon.broken) continue;
      const t = weapon.object.getWorldPosition(new THREE.Vector3());
      game.events.emit('weaponBreak', { weaponId: weapon.id, position: t });
      this.remove(weapon);
    }
  }

  update(): void {
    const show = this.nearest !== null && !this.held && !this.game.player.health.dead;
    this.hint.style.display = show ? '' : 'none';
    if (show && this.nearest) this.hint.textContent = `E : ramasser ${this.nearest.displayName}`;
  }

  reset(): void {
    for (const weapon of [...this.items]) this.remove(weapon);
    this.held = null;
    this.spawnDefaults();
  }
}
