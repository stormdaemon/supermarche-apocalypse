import * as THREE from 'three';
import type { Game } from '../../core/game';
import type { Player, PlayerMotor } from '../../core/player';
import { PLAYER_CONTROLLER_CONFIG as CFG } from './config';

/**
 * Arcade motor: snappy acceleration, jump with coyote time and input buffer,
 * heavier fall, and a belly dive on Shift that bowls enemies over.
 */
export class ArcadeMotor implements PlayerMotor {
  /** Seconds left in the current dive (0 when not diving). */
  diveTime = 0;
  /** Seconds left getting back up after a dive. */
  getUpTime = 0;
  /** Simulated time of the last landing, for squash animation. */
  landedAt = -Infinity;
  private diveCooldown = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private wasGrounded = true;
  private readonly diveDir = new THREE.Vector3();
  private readonly hitDuringDive = new Set<number>();

  get diving(): boolean {
    return this.diveTime > 0;
  }

  fixedUpdate(player: Player, game: Game, dt: number): void {
    const input = game.input;
    this.diveCooldown -= dt;
    this.coyote = player.grounded ? CFG.jump.coyoteTime : this.coyote - dt;
    this.jumpBuffer = input.pressed('jump') ? CFG.jump.bufferTime : this.jumpBuffer - dt;

    if (this.diveTime > 0) {
      this.updateDive(player, game, dt);
    } else if (this.getUpTime > 0) {
      this.getUpTime -= dt;
      this.brake(player, dt, CFG.move.groundAcceleration);
    } else {
      this.walk(player, game, dt);
    }

    player.gravityScale = player.velocity.y > 0 ? CFG.jump.riseGravity : CFG.jump.fallGravity;
    player.integrate(dt);
    if (player.grounded && !this.wasGrounded) this.landedAt = game.time.elapsed;
    this.wasGrounded = player.grounded;
  }

  private walk(player: Player, game: Game, dt: number): void {
    const input = game.input;
    const axes = input.moveAxes();
    const control = game.surfaces.sample(player.position, 'player').control;
    const canControl = player.canControl;
    const speed = CFG.move.runSpeed * player.speedMultiplier;
    const targetX = canControl ? axes.x * speed : 0;
    const targetZ = canControl ? -axes.y * speed : 0;
    const accel = player.grounded ? CFG.move.groundAcceleration : CFG.move.airAcceleration;
    const blend = 1 - Math.exp(-accel * control * dt);
    player.velocity.x += (targetX - player.velocity.x) * blend;
    player.velocity.z += (targetZ - player.velocity.z) * blend;
    if (!canControl) return;
    player.faceTowards(game.aim.point, dt);

    if (this.jumpBuffer > 0 && this.coyote > 0) {
      player.velocity.y = CFG.jump.velocity;
      this.jumpBuffer = 0;
      this.coyote = 0;
      game.events.emit('playerJump', {});
    }

    if (input.pressed('dodge') && this.diveCooldown <= 0 && player.grounded) {
      this.startDive(player, game, axes);
    }
  }

  private startDive(player: Player, game: Game, axes: { x: number; y: number }): void {
    if (Math.abs(axes.x) + Math.abs(axes.y) > 0.01)
      this.diveDir.set(axes.x, 0, -axes.y).normalize();
    else player.forward(this.diveDir);
    this.diveTime = CFG.dive.duration;
    this.diveCooldown = CFG.dive.cooldown;
    this.hitDuringDive.clear();
    player.facing = Math.atan2(this.diveDir.x, this.diveDir.z);
    player.velocity.set(this.diveDir.x * CFG.dive.speed, 2.5, this.diveDir.z * CFG.dive.speed);
    player.setInvulnerable(CFG.dive.invulnerability);
    game.events.emit('playerDodge', {});
  }

  private updateDive(player: Player, game: Game, dt: number): void {
    this.diveTime -= dt;
    const decay = Math.exp(-CFG.dive.friction * dt);
    player.velocity.x *= decay;
    player.velocity.z *= decay;

    // Bowl over every enemy the sliding body touches (each one once per dive).
    const center = player.position.clone().setY(player.position.y + 0.4);
    const speed = Math.hypot(player.velocity.x, player.velocity.z);
    for (const entity of game.physics.entitiesInSphere(center, CFG.dive.hitRadius)) {
      if (entity === player.entity || this.hitDuringDive.has(entity.id)) continue;
      const target = game.combat.hittableOf(entity);
      if (!target) continue;
      this.hitDuringDive.add(entity.id);
      const force = this.diveDir
        .clone()
        .multiplyScalar(CFG.dive.hitForce * Math.max(0.5, speed / CFG.dive.speed))
        .setY(CFG.dive.hitForce * 0.6);
      game.combat.hit(target, {
        damage: CFG.dive.hitDamage,
        force,
        source: player.entity,
        kind: 'dive',
        stun: CFG.dive.hitStun,
      });
    }

    if (this.diveTime <= 0) {
      this.diveTime = 0;
      this.getUpTime = CFG.dive.getUp;
    }
  }

  private brake(player: Player, dt: number, accel: number): void {
    const blend = 1 - Math.exp(-accel * dt);
    player.velocity.x -= player.velocity.x * blend;
    player.velocity.z -= player.velocity.z * blend;
  }

  reset(): void {
    this.diveTime = 0;
    this.getUpTime = 0;
    this.diveCooldown = 0;
    this.jumpBuffer = 0;
    this.landedAt = -Infinity;
  }
}
