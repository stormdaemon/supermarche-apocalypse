import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { Entity } from './ecs';
import { createCharacter, type CharacterRig } from './characterFactory';
import { PALETTE } from './materials';
import { Groups, groups, RAPIER, type Physics } from './physics';
import { Health, type HitInfo, type Hittable, HittableC, PlayerTag } from './types';
import type { Game } from './game';

/** Moves the player every fixed step. Replaceable through the 'playerMotor' provider. */
export interface PlayerMotor {
  fixedUpdate(player: Player, game: Game, dt: number): void;
  /** Called by game.restart() so the motor can clear its own state. */
  reset?(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The player character: kinematic capsule driven by Rapier's character controller.
 * The motor decides the desired velocity; Player integrates it with gravity,
 * external pushes (knockback, recoil) and surface velocities.
 */
export class Player implements Hittable {
  readonly entity = new Entity('player');
  readonly health = new Health(CORE_CONFIG.player.maxHealth);
  readonly rig: CharacterRig;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  /** Feet position, updated after every move. */
  readonly position = new THREE.Vector3();
  /** Velocity driven by the motor (m/s). y is vertical speed. */
  readonly velocity = new THREE.Vector3();
  /** Decaying velocity from knockback, recoil or dashes (m/s). */
  readonly externalVelocity = new THREE.Vector3();
  /** Velocity added for the current step only (conveyors). Cleared after each move. */
  readonly frameVelocity = new THREE.Vector3();
  /** Yaw in radians; 0 faces +Z. */
  facing = Math.PI;
  grounded = false;
  speedMultiplier = 1;
  /** Gravity multiplier; motors can lower it for floaty jumps. */
  gravityScale = 1;
  /** Damping rate of externalVelocity per second. */
  externalDamping = 6;
  private controlLockedUntil = 0;
  private readonly spawn = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  readonly centerOffset = CORE_CONFIG.player.halfHeight + CORE_CONFIG.player.radius;

  constructor(
    private readonly game: Game,
    physics: Physics,
    spawn: THREE.Vector3,
  ) {
    this.spawn.copy(spawn);
    this.entity.tags.add(PlayerTag);
    this.entity.add(HittableC, this);
    // Intern security guard: slightly too small for his oversized uniform.
    this.rig = createCharacter({
      skin: PALETTE.skin[1],
      shirt: 0x1d3557,
      pants: PALETTE.black,
      hair: PALETTE.hair[1],
      hairStyle: 'short',
      accessories: ['cap', 'apron', 'badge'],
      accessoryColor: 0xd4ff3a,
      girth: 1.25,
      scale: 0.92,
    });
    game.scene.add(this.rig.root);

    const { radius, halfHeight } = CORE_CONFIG.player;
    this.body = physics.createBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + this.centerOffset,
        spawn.z,
      ),
      [],
    );
    this.collider = physics.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius).setCollisionGroups(
        groups(Groups.PLAYER, Groups.STATIC | Groups.ENEMY | Groups.PROP | Groups.RAGDOLL),
      ),
      this.body,
    );
    physics.bind(this.entity, this.body, this.rig.root, {
      offset: new THREE.Vector3(0, -this.centerOffset, 0),
      syncRotation: false,
    });

    this.controller = physics.world.createCharacterController(0.02);
    this.controller.setUp(UP);
    this.controller.enableAutostep(0.35, 0.2, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(80);
    this.position.copy(spawn);
  }

  /** False while dead, stunned or grabbed. */
  get canControl(): boolean {
    return !this.health.dead && this.game.time.elapsed >= this.controlLockedUntil;
  }

  get invulnerable(): boolean {
    return this.game.time.elapsed < this.health.invulnerableUntil;
  }

  /** Prevents the motor from steering for a duration in seconds. */
  lockControl(duration: number): void {
    this.controlLockedUntil = Math.max(this.controlLockedUntil, this.game.time.elapsed + duration);
  }

  /** Makes the player ignore damage for a duration in seconds. */
  setInvulnerable(duration: number): void {
    this.health.invulnerableUntil = Math.max(
      this.health.invulnerableUntil,
      this.game.time.elapsed + duration,
    );
  }

  /** Adds a decaying push (m/s). */
  applyImpulse(velocity: THREE.Vector3): void {
    this.externalVelocity.x += velocity.x;
    this.externalVelocity.z += velocity.z;
    if (velocity.y > 0) this.velocity.y = Math.max(this.velocity.y, velocity.y);
  }

  /** Adds a velocity for the current fixed step only (m/s). */
  addFrameVelocity(velocity: THREE.Vector3): void {
    this.frameVelocity.add(velocity);
  }

  /** Smoothly turns the player towards a world point. */
  faceTowards(
    point: THREE.Vector3,
    dt: number,
    sharpness = CORE_CONFIG.player.turnSharpness,
  ): void {
    const dx = point.x - this.position.x;
    const dz = point.z - this.position.z;
    if (dx * dx + dz * dz < 0.0001) return;
    this.faceAngle(Math.atan2(dx, dz), dt, sharpness);
  }

  faceAngle(target: number, dt: number, sharpness = CORE_CONFIG.player.turnSharpness): void {
    let delta = target - this.facing;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.facing += delta * (1 - Math.exp(-sharpness * dt));
  }

  /** Horizontal unit vector the player is facing. */
  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /**
   * Integrates velocity, gravity, pushes and surfaces through the character controller.
   * Motors call this once per fixed step after setting velocity.
   */
  integrate(dt: number): void {
    if (this.grounded && this.velocity.y < 0) this.velocity.y = -1;
    this.velocity.y += CORE_CONFIG.physics.gravity * this.gravityScale * dt;
    const surface = this.game.surfaces.sample(this.position, 'player');
    this.desired
      .copy(this.velocity)
      .add(this.externalVelocity)
      .add(this.frameVelocity)
      .add(surface.velocity)
      .multiplyScalar(dt);
    this.controller.computeColliderMovement(
      this.collider,
      this.desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      groups(Groups.PLAYER, Groups.STATIC | Groups.ENEMY | Groups.PROP | Groups.RAGDOLL),
    );
    const move = this.controller.computedMovement();
    const t = this.body.translation();
    const next = { x: t.x + move.x, y: t.y + move.y, z: t.z + move.z };
    if (next.y < -10) {
      this.teleport(this.spawn);
      return;
    }
    this.body.setNextKinematicTranslation(next);
    this.grounded = this.controller.computedGrounded();
    if (this.grounded && this.velocity.y < 0) this.velocity.y = 0;
    if (!this.grounded && move.y > -0.0001 && this.desired.y > 0 && move.y < this.desired.y * 0.5) {
      this.velocity.y = 0; // Head bumped into a ceiling.
    }
    this.position.set(next.x, next.y - this.centerOffset, next.z);
    this.externalVelocity.multiplyScalar(Math.exp(-this.externalDamping * dt));
    if (this.externalVelocity.lengthSq() < 0.01) this.externalVelocity.set(0, 0, 0);
    this.frameVelocity.set(0, 0, 0);
  }

  teleport(feet: THREE.Vector3): void {
    this.body.setTranslation({ x: feet.x, y: feet.y + this.centerOffset, z: feet.z }, true);
    this.body.setNextKinematicTranslation({ x: feet.x, y: feet.y + this.centerOffset, z: feet.z });
    this.position.copy(feet);
    this.velocity.set(0, 0, 0);
    this.externalVelocity.set(0, 0, 0);
  }

  applyHit(info: HitInfo): void {
    this.applyImpulse(info.force.clone().multiplyScalar(0.15));
    this.lockControl(Math.min(info.stun ?? 0.15, 0.4));
    this.rig.trigger('hurt', 0.3);
  }

  /** Restores health and position. */
  respawn(): void {
    this.health.reset();
    this.controlLockedUntil = 0;
    this.speedMultiplier = 1;
    this.gravityScale = 1;
    this.facing = Math.PI;
    this.teleport(this.spawn);
  }

  /** Render-time visuals: facing and walk animation. */
  update(dt: number): void {
    this.rig.root.rotation.y = this.facing;
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.rig.animate(dt, this.grounded ? speed : speed * 0.3);
  }
}

/** Core motor: arcade walking relative to the screen, facing the cursor. No jump. */
export class DefaultPlayerMotor implements PlayerMotor {
  fixedUpdate(player: Player, game: Game, dt: number): void {
    const axes = game.input.moveAxes();
    const speed = CORE_CONFIG.player.walkSpeed * player.speedMultiplier;
    const control = game.surfaces.sample(player.position, 'player').control;
    const targetX = player.canControl ? axes.x * speed : 0;
    const targetZ = player.canControl ? -axes.y * speed : 0;
    const blend = 1 - Math.exp(-20 * control * dt);
    player.velocity.x += (targetX - player.velocity.x) * blend;
    player.velocity.z += (targetZ - player.velocity.z) * blend;
    if (player.canControl) player.faceTowards(game.aim.point, dt);
    player.integrate(dt);
  }
}
