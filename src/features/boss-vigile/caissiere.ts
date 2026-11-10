import * as THREE from 'three';
import { CORE_CONFIG } from '../../core/config';
import type { CharacterOptions } from '../../core/characterFactory';
import { BaseEnemy, DEFAULT_ENEMY_STATS } from '../../core/enemies';
import type { Game } from '../../core/game';
import { PALETTE } from '../../core/materials';
import { BOSS_CONFIG, CAISSIERE_NAME } from './config';
import { runtimeOf, type BossRuntime } from './runtime';

/** Uniform look shared by every caissière: white blouse, red apron and cap, black trousers. */
const CAISSIERE_LOOK: CharacterOptions = {
  shirt: PALETTE.white,
  pants: PALETTE.black,
  hair: PALETTE.hair[1],
  hairStyle: 'bun',
  accessories: ['cap', 'apron'],
  accessoryColor: PALETTE.red,
};

/**
 * Caissière furieuse: keeps a distance from the player and throws receipt rolls at him.
 * Her throws are ballistic, aimed at the player's chest with a little random error.
 */
export class Caissiere extends BaseEnemy {
  private readonly runtime: BossRuntime;
  /** Distance between the body center and the feet. */
  private readonly bodyOffset: number;
  private readonly scratchA = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  /** Seconds left before the throw is released; negative when not throwing. */
  private throwWindup = -1;
  /** Seconds since she came in; she leaves on her own after the lifetime. */
  private age = 0;

  constructor(game: Game, spawn: THREE.Vector3) {
    super(
      game,
      'caissiere',
      CAISSIERE_NAME,
      spawn,
      { ...DEFAULT_ENEMY_STATS, ...BOSS_CONFIG.caissiere.stats },
      CAISSIERE_LOOK,
    );
    this.runtime = runtimeOf(game);
    this.bodyOffset = (this.stats.halfHeight + this.stats.radius) * this.stats.scale;
  }

  /**
   * While alive and active she runs her own movement: approach when far, back off when too
   * close, and throw when in range. Stunned, knocked out, dead or fallen ones use the base logic.
   */
  override fixedUpdate(dt: number): void {
    const t = this.body.translation();
    if (this.state !== 'active' || t.y < -10) {
      super.fixedUpdate(dt);
      return;
    }
    const cfg = BOSS_CONFIG.caissiere;
    this.position.set(t.x, t.y - this.bodyOffset, t.z);
    this.age += dt;
    if (this.age >= cfg.lifetime) {
      // Leaves on her own: no death event, so no score and no wave impact. The manager removes her.
      this.state = 'dead';
      this.deathTimer = 0;
      return;
    }
    const player = this.game.player;

    const toPlayer = this.scratchA.copy(player.position).sub(this.position).setY(0);
    const distance = toPlayer.length();
    let speed = 0;
    if (distance > cfg.preferredRange + cfg.rangeTolerance) speed = this.stats.speed;
    else if (distance < cfg.preferredRange - cfg.rangeTolerance)
      speed = -this.stats.speed * cfg.backOffFactor;
    const desiredX = distance > 0.01 ? (toPlayer.x / distance) * speed : 0;
    const desiredZ = distance > 0.01 ? (toPlayer.z / distance) * speed : 0;
    const v = this.body.linvel();
    const blend = 1 - Math.exp(-this.stats.acceleration * dt);
    this.body.setLinvel(
      { x: v.x + (desiredX - v.x) * blend, y: v.y, z: v.z + (desiredZ - v.z) * blend },
      true,
    );
    if (distance > 0.1) this.facing = Math.atan2(toPlayer.x, toPlayer.z);

    this.attackTimer -= dt;
    if (this.throwWindup >= 0) {
      this.throwWindup -= dt;
      if (this.throwWindup < 0) this.throwRoll();
    } else if (this.attackTimer <= 0 && distance <= cfg.throwRange && !player.health.dead) {
      this.attackTimer = cfg.throwCooldown;
      this.throwWindup = cfg.throwWindup;
      this.rig.trigger('throw', cfg.throwWindup + 0.2);
    }
  }

  /** Launches a receipt roll on a ballistic arc that reaches the player's chest. */
  private throwRoll(): void {
    const cfg = BOSS_CONFIG.caissiere;
    this.throwWindup = -1;
    const player = this.game.player;
    const origin = this.scratchA.set(
      this.position.x + Math.sin(this.facing) * 0.4,
      this.position.y + cfg.throwHeight,
      this.position.z + Math.cos(this.facing) * 0.4,
    );
    const aim = this.scratchB.set(
      player.position.x + (Math.random() - 0.5) * cfg.aimError,
      player.position.y + cfg.targetHeight,
      player.position.z + (Math.random() - 0.5) * cfg.aimError,
    );
    const dx = aim.x - origin.x;
    const dz = aim.z - origin.z;
    const time = Math.max(Math.hypot(dx, dz) / cfg.rollSpeed, 0.2);
    // Vertical speed that brings the roll to the aim point after `time` seconds under gravity.
    const gravity = CORE_CONFIG.physics.gravity;
    const vy = (aim.y - origin.y - 0.5 * gravity * time * time) / time;
    const velocity = new THREE.Vector3(dx / time, vy, dz / time);
    this.runtime.spawnRoll(origin, velocity, this.entity);
  }
}
