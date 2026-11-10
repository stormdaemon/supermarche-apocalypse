import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { Entity } from './ecs';
import { createCharacter, type CharacterOptions, type CharacterRig } from './characterFactory';
import { createNameTag } from './nameTag';
import { Groups, groups, RAPIER } from './physics';
import {
  type Enemy,
  EnemyC,
  type EnemyDefinition,
  type EnemyState,
  EnemyTag,
  Health,
  type HitInfo,
  HittableC,
} from './types';
import type { Game } from './game';

/** Balancing values shared by every enemy built on BaseEnemy. */
export interface EnemyStats {
  maxHealth: number;
  /** Run speed in m/s. */
  speed: number;
  /** How fast the enemy reaches its run speed (1/s). */
  acceleration: number;
  damage: number;
  attackRange: number;
  /** Seconds between two attacks. */
  attackCooldown: number;
  /** Seconds between the attack animation start and the actual hit. */
  attackWindup: number;
  /** Impulse given to the player on hit. */
  attackForce: number;
  mass: number;
  radius: number;
  halfHeight: number;
  /** Visual scale of the character. */
  scale: number;
  /** Divides incoming knockback (1 = normal, 3 = very sturdy). */
  sturdiness: number;
}

export const DEFAULT_ENEMY_STATS: EnemyStats = {
  maxHealth: 30,
  speed: 3.5,
  acceleration: 8,
  damage: 8,
  attackRange: 1.3,
  attackCooldown: 1.2,
  attackWindup: 0.3,
  attackForce: 8,
  mass: 70,
  radius: 0.38,
  halfHeight: 0.5,
  scale: 1,
  sturdiness: 1,
};

const DEATH_DURATION = 2.2;

/**
 * Ready-made enemy: dynamic capsule with locked rotations, chase/attack AI,
 * stagger on hit, cartoon death, floating name tag. Subclasses tweak stats and
 * override think()/performAttack() for special behaviours.
 */
export class BaseEnemy implements Enemy {
  readonly entity: Entity;
  readonly health: Health;
  readonly rig: CharacterRig;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly position = new THREE.Vector3();
  readonly nameTag: THREE.Sprite;
  state: EnemyState = 'active';
  /** Where the enemy currently wants to go. */
  protected readonly goal = new THREE.Vector3();
  protected facing = 0;
  protected stunTimer = 0;
  protected attackTimer = 0;
  protected windupTimer = -1;
  protected thinkTimer = Math.random() * CORE_CONFIG.enemy.thinkInterval;
  protected deathTimer = 0;
  /** True when the current goal is the player (attacks only happen then). */
  protected chasingPlayer = true;
  private readonly centerOffset: number;
  private readonly tmp = new THREE.Vector3();

  constructor(
    protected readonly game: Game,
    readonly typeId: string,
    readonly displayName: string,
    spawn: THREE.Vector3,
    readonly stats: EnemyStats,
    look: CharacterOptions,
  ) {
    this.entity = new Entity(typeId);
    this.entity.tags.add(EnemyTag);
    this.health = new Health(stats.maxHealth);
    this.rig = createCharacter({ ...look, scale: stats.scale });
    this.nameTag = createNameTag(displayName);
    this.nameTag.position.y = this.rig.height / stats.scale + 0.35;
    this.rig.parts.body.add(this.nameTag);
    game.scene.add(this.rig.root);

    this.centerOffset = (stats.halfHeight + stats.radius) * stats.scale;
    this.body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y + this.centerOffset, spawn.z)
        .lockRotations()
        .setLinearDamping(0.5),
      [],
    );
    this.collider = game.physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(stats.halfHeight * stats.scale, stats.radius * stats.scale)
        .setMass(stats.mass)
        .setFriction(0.1)
        .setCollisionGroups(groups(Groups.ENEMY)),
      this.body,
    );
    game.physics.bind(this.entity, this.body, this.rig.root, {
      offset: new THREE.Vector3(0, -this.centerOffset, 0),
      syncRotation: false,
    });
    this.entity.add(HittableC, this).add(EnemyC, this);
    game.world.add(this.entity);
    this.position.copy(spawn);
    this.goal.copy(game.player.position);
  }

  knockOut(duration: number): void {
    if (this.state === 'dead') return;
    this.state = 'knockedOut';
    this.stunTimer = Math.max(this.stunTimer, duration);
    this.windupTimer = -1;
    this.game.events.emit('knockout', { entity: this.entity, duration });
  }

  applyHit(info: HitInfo): void {
    const impulse = info.force.clone().divideScalar(this.stats.sturdiness);
    this.body.applyImpulse(impulse.multiplyScalar(this.stats.mass / 10), true);
    if (this.state === 'active') this.state = 'stunned';
    this.stunTimer = Math.max(this.stunTimer, info.stun ?? CORE_CONFIG.enemy.staggerTime);
    this.windupTimer = -1;
    this.rig.trigger('hurt', 0.35);
    if (this.health.current <= 0) this.die(info);
  }

  /** Cartoon death: the body tumbles away, then the enemy disappears in a puff. */
  protected die(info: HitInfo): void {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deathTimer = DEATH_DURATION;
    this.body.lockRotations(false, true);
    this.body.applyImpulse({ x: 0, y: this.stats.mass * 4, z: 0 }, true);
    const spin = info.force
      .clone()
      .cross(new THREE.Vector3(0, 1, 0))
      .normalize();
    this.body.applyTorqueImpulse(spin.multiplyScalar(-this.stats.mass * 0.6), true);
    this.collider.setCollisionGroups(groups(Groups.RAGDOLL, Groups.STATIC | Groups.PROP));
    this.nameTag.visible = false;
  }

  /** Chooses the current goal: an AI attractor (promo...) or the player. */
  protected think(): void {
    const attractor = this.game.ai.pickAttractor(Math.random());
    if (attractor) {
      this.goal.copy(attractor.position);
      this.chasingPlayer = false;
    } else {
      this.goal.copy(this.game.player.position);
      this.chasingPlayer = true;
    }
  }

  /** Deals the attack damage once the windup ends. Override for special attacks. */
  protected performAttack(): void {
    const player = this.game.player;
    if (this.position.distanceTo(player.position) > this.stats.attackRange + 0.4) return;
    const dir = this.tmp.copy(player.position).sub(this.position).setY(0).normalize();
    this.game.combat.hit(player, {
      damage: this.stats.damage,
      force: dir.multiplyScalar(this.stats.attackForce).setY(this.stats.attackForce * 0.3),
      source: this.entity,
      kind: this.typeId,
    });
  }

  fixedUpdate(dt: number): void {
    const t = this.body.translation();
    this.position.set(t.x, t.y - this.centerOffset, t.z);
    if (t.y < -10) this.health.dead = true;

    if (this.state === 'dead') {
      this.deathTimer -= dt;
      return;
    }
    if (this.state === 'stunned' || this.state === 'knockedOut') {
      this.stunTimer -= dt;
      if (this.stunTimer <= 0) this.state = 'active';
      return;
    }

    this.thinkTimer -= dt;
    if (this.thinkTimer <= 0) {
      this.thinkTimer = CORE_CONFIG.enemy.thinkInterval;
      this.think();
    }
    if (this.chasingPlayer) this.goal.copy(this.game.player.position);

    this.attackTimer -= dt;
    const toGoal = this.tmp.copy(this.goal).sub(this.position).setY(0);
    const distance = toGoal.length();
    const playerAlive = !this.game.player.health.dead;
    const inRange = this.chasingPlayer && playerAlive && distance < this.stats.attackRange;

    if (this.windupTimer >= 0) {
      this.windupTimer -= dt;
      if (this.windupTimer < 0) this.performAttack();
    } else if (inRange && this.attackTimer <= 0) {
      this.attackTimer = this.stats.attackCooldown;
      this.windupTimer = this.stats.attackWindup;
      this.rig.trigger('attack', this.stats.attackWindup + 0.2);
    }

    const surface = this.game.surfaces.sample(this.position, 'enemies');
    const stopDistance = this.chasingPlayer ? this.stats.attackRange * 0.8 : 1.5;
    const wantMove = distance > stopDistance && (playerAlive || !this.chasingPlayer);
    const desired = wantMove
      ? toGoal.normalize().multiplyScalar(this.stats.speed)
      : toGoal.set(0, 0, 0);
    const v = this.body.linvel();
    const blend = 1 - Math.exp(-this.stats.acceleration * surface.control * dt);
    const vx = v.x + (desired.x - v.x) * blend + surface.velocity.x * blend;
    const vz = v.z + (desired.z - v.z) * blend + surface.velocity.z * blend;
    this.body.setLinvel({ x: vx, y: v.y, z: vz }, true);
    if (distance > 0.1)
      this.facing = Math.atan2(this.goal.x - this.position.x, this.goal.z - this.position.z);
  }

  update(dt: number): void {
    if (this.state === 'dead') {
      const r = this.body.rotation();
      this.rig.root.quaternion.set(r.x, r.y, r.z, r.w);
      this.rig.animate(dt, 0);
      return;
    }
    let delta = this.facing - this.rig.root.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.rig.root.rotation.set(0, this.rig.root.rotation.y + delta * (1 - Math.exp(-10 * dt)), 0);
    const v = this.body.linvel();
    this.rig.animate(dt, this.state === 'active' ? Math.hypot(v.x, v.z) : 0);
  }

  /** True once the death animation is over and the enemy can be removed. */
  get finished(): boolean {
    return this.state === 'dead' ? this.deathTimer <= 0 : this.health.dead && this.position.y < -10;
  }

  dispose(): void {
    this.rig.root.removeFromParent();
    this.game.world.remove(this.entity);
  }
}

/** Spawns, updates and removes enemies. */
export class EnemyManager {
  private readonly list: Enemy[] = [];

  constructor(private readonly game: Game) {}

  get alive(): readonly Enemy[] {
    return this.list;
  }

  /** Enemies still able to fight (not dead). */
  get count(): number {
    return this.list.filter((e) => e.state !== 'dead').length;
  }

  spawn(typeId: string, position: THREE.Vector3): Enemy | null {
    const def: EnemyDefinition | undefined = this.game.registry.enemies.get(typeId);
    if (!def) return null;
    const enemy = def.create(this.game, position);
    this.list.push(enemy);
    this.game.events.emit('enemySpawn', { entity: enemy.entity, typeId });
    return enemy;
  }

  fixedUpdate(dt: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const enemy = this.list[i];
      if (!enemy) continue;
      enemy.fixedUpdate(dt);
      const finished =
        enemy instanceof BaseEnemy ? enemy.finished : enemy.health.dead && enemy.state === 'dead';
      if (finished) {
        this.game.fx.burst({
          position: enemy.position.clone().setY(enemy.position.y + 0.8),
          color: [0xffffff, 0xdddddd],
          count: 14,
          shape: 'ico',
          size: 0.35,
          speed: 3,
          gravity: 2,
        });
        enemy.dispose();
        this.list.splice(i, 1);
      }
    }
  }

  update(dt: number): void {
    for (const enemy of this.list) enemy.update(dt);
  }

  clear(): void {
    for (const enemy of this.list) enemy.dispose();
    this.list.length = 0;
  }
}
