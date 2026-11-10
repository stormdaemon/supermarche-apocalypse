import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import { BaseEnemy, DEFAULT_ENEMY_STATS } from '../../core/enemies';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { createTextSprite } from '../../core/nameTag';
import { Groups, groups } from '../../core/physics';
import { ADO_TROTTINETTE_CONFIG as CFG } from './config';

type Phase = 'circling' | 'charging';

const SHIRT = PALETTE.orange;
const WHEEL_RADIUS = 0.1;
const WHEEL_Z = 0.36;
const DECK_Y = 0.12;

let bubbleTemplate: THREE.Sprite | null = null;

/** Speech bubble shown after a crash. The texture is built once and cloned for each use. */
function crashBubble(): THREE.Sprite {
  bubbleTemplate ??= createTextSprite(CFG.bubbleText, {
    color: '#e63946',
    background: '#ffffff',
    height: 0.42,
    fontSize: 56,
  });
  return bubbleTemplate.clone();
}

/** Low-poly kick scooter: deck, two wheels, steering column and handlebar. The nose points along +Z. */
function buildScooter(): THREE.Group {
  const scooter = new THREE.Group();
  const deck = prim.box(0.2, 0.04, 0.9, PALETTE.lime);
  deck.position.y = DECK_Y;
  const column = prim.box(0.04, 0.9, 0.04, PALETTE.grey);
  column.position.set(0, 0.55, WHEEL_Z);
  const bar = prim.box(0.5, 0.05, 0.05, PALETTE.grey);
  bar.position.set(0, 1.0, WHEEL_Z);
  scooter.add(deck, column, bar);
  for (const z of [-WHEEL_Z, WHEEL_Z]) {
    const wheel = prim.cylinder(WHEEL_RADIUS, WHEEL_RADIUS, 0.05, PALETTE.black, 8);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, WHEEL_RADIUS, z);
    scooter.add(wheel);
  }
  return scooter;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Teenager on a kick scooter. Circles the player at a fixed distance, then charges in a
 * straight line. A wall on the way makes the scooter crash and the rider fall off.
 * The base class only handles stagger, knockout, death and falls off the map.
 */
class AdoTrottinette extends BaseEnemy {
  private readonly scooter = buildScooter();
  private readonly chargeDir = new THREE.Vector3(0, 0, 1);
  private readonly probeOrigin = new THREE.Vector3();
  /** Distance from the feet to the body centre, used to recover the feet position. */
  private readonly centerDrop: number;
  private phase: Phase = 'circling';
  private phaseTimer = 0;
  private orbitSign = 1;
  /** True while the scooter lies on the ground, detached from the rider. */
  private wrecked = false;
  private wreckGrounded = false;
  private wreckGround = 0;
  private wreckVelocityY = 0;
  private bubble: THREE.Sprite | null = null;
  private bubbleTimer = 0;
  /** False while the enemy was stunned, knocked out or dead since the last active step. */
  private wasActive = true;

  constructor(game: Game, spawn: THREE.Vector3) {
    super(
      game,
      CFG.typeId,
      CFG.displayName,
      spawn,
      { ...DEFAULT_ENEMY_STATS, ...CFG.stats },
      {
        skin: PALETTE.skin[1],
        shirt: SHIRT,
        pants: PALETTE.blue,
        hair: PALETTE.hair[0],
        hairStyle: 'none',
        accessories: ['cap', 'headphones'],
        accessoryColor: PALETTE.red,
      },
    );
    this.centerDrop = (this.stats.halfHeight + this.stats.radius) * this.stats.scale;

    const parts = this.rig.parts;
    // Hood: a block behind the head, in the sweatshirt colour.
    const hood = prim.box(0.48, 0.42, 0.12, SHIRT);
    hood.position.set(0, 0.2, -0.24);
    parts.head.add(hood);
    // Backwards cap: the visor built on the front of the cap is moved to the back.
    for (const child of parts.head.children) {
      if (child.position.y === 0.45 && child.position.z === 0.3) child.position.z = -0.3;
    }
    // The rider stands on the deck: the character is lifted onto it.
    this.rig.root.remove(parts.body);
    const seat = new THREE.Group();
    seat.position.y = CFG.deckHeight;
    seat.add(parts.body);
    this.rig.root.add(seat, this.scooter);

    this.startCircling();
  }

  override fixedUpdate(dt: number): void {
    if (this.state !== 'active') {
      // Stunned, knocked out or dead: the base class runs the timers and the recovery.
      this.wasActive = false;
      super.fixedUpdate(dt);
      return;
    }
    const t = this.body.translation();
    if (t.y < -10) {
      // Fell off the map: the base class kills the enemy.
      super.fixedUpdate(dt);
      return;
    }
    this.position.set(t.x, t.y - this.centerDrop, t.z);
    if (!this.wasActive) {
      this.wasActive = true;
      this.remount();
      this.startCircling();
    }
    if (this.game.player.health.dead) {
      const v = this.body.linvel();
      this.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
      return;
    }

    this.phaseTimer -= dt;
    if (this.phase === 'circling') {
      if (this.phaseTimer <= 0) this.startCharge();
      else this.orbit();
    }
    if (this.phase === 'charging') this.charge();
  }

  override update(dt: number): void {
    super.update(dt);
    this.updateWreck(dt);
    this.updateBubble(dt);
  }

  override dispose(): void {
    this.scooter.removeFromParent();
    this.bubble?.removeFromParent();
    super.dispose();
  }

  private startCircling(): void {
    const { minDuration, maxDuration } = CFG.orbit;
    this.phase = 'circling';
    this.phaseTimer = minDuration + Math.random() * (maxDuration - minDuration);
    this.orbitSign = Math.random() < 0.5 ? -1 : 1;
  }

  /** Locks the charge direction towards the player's current position. */
  private startCharge(): void {
    const target = this.game.player.position;
    this.chargeDir.set(target.x - this.position.x, 0, target.z - this.position.z);
    if (this.chargeDir.lengthSq() < 1e-4) {
      this.chargeDir.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    }
    this.chargeDir.normalize();
    this.phase = 'charging';
    this.phaseTimer = CFG.charge.duration;
  }

  /** Circles the player at the orbit radius while keeping the body's vertical velocity. */
  private orbit(): void {
    const { radius, radialGain, maxRadialSpeed } = CFG.orbit;
    const player = this.game.player.position;
    const dx = this.position.x - player.x;
    const dz = this.position.z - player.z;
    const dist = Math.hypot(dx, dz);
    // Outward radial unit vector (arbitrary when the enemy is exactly on the player).
    const nx = dist > 1e-3 ? dx / dist : 1;
    const nz = dist > 1e-3 ? dz / dist : 0;
    // Positive when too close: pushes the enemy outwards.
    const radial = clamp((radius - dist) * radialGain, -maxRadialSpeed, maxRadialSpeed);
    // Tangent direction of travel around the player.
    const tx = -nz * this.orbitSign;
    const tz = nx * this.orbitSign;
    const speed = this.stats.speed;
    const v = this.body.linvel();
    this.body.setLinvel({ x: tx * speed + nx * radial, y: v.y, z: tz * speed + nz * radial }, true);
    this.facing = Math.atan2(tx, tz);
  }

  /** Straight charge: hits the player when close enough, crashes on walls, otherwise times out. */
  private charge(): void {
    const { speed, hitDistance, hitForceMultiplier, wallProbeDistance, wallProbeHeight } =
      CFG.charge;
    const dir = this.chargeDir;
    const v = this.body.linvel();
    this.body.setLinvel({ x: dir.x * speed, y: v.y, z: dir.z * speed }, true);
    this.facing = Math.atan2(dir.x, dir.z);

    const player = this.game.player;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    if (!player.health.dead && dx * dx + dz * dz < hitDistance * hitDistance) {
      const push = this.stats.attackForce * hitForceMultiplier;
      this.game.combat.hit(player, {
        damage: this.stats.damage,
        force: new THREE.Vector3(dir.x * push, push * 0.3, dir.z * push),
        source: this.entity,
        kind: this.typeId,
      });
      this.startCircling();
      return;
    }

    this.probeOrigin.set(this.position.x, this.position.y + wallProbeHeight, this.position.z);
    const wall = this.game.physics.raycast(
      this.probeOrigin,
      dir,
      wallProbeDistance,
      groups(Groups.ALL, Groups.STATIC),
    );
    if (wall) {
      this.crash();
      return;
    }
    if (this.phaseTimer <= 0) this.startCircling();
  }

  /** The scooter hits a wall: the rider is thrown off and knocked out for a moment. */
  private crash(): void {
    const { backSpeed, upSpeed, knockOutTime, bubbleTime, shake } = CFG.crash;
    const dir = this.chargeDir;
    this.body.setLinvel({ x: -dir.x * backSpeed, y: upSpeed, z: -dir.z * backSpeed }, true);
    this.dismount();
    this.rig.trigger('hurt', 0.5);
    this.knockOut(knockOutTime);
    this.showBubble(bubbleTime);
    this.game.cameraRig.addTrauma(shake);
    this.game.fx.burst({
      position: this.position.clone().setY(this.position.y + 0.8),
      color: [PALETTE.yellow, PALETTE.orange, PALETTE.white],
      count: 16,
      speed: 4,
      size: 0.15,
      shape: 'box',
    });
  }

  /** Detaches the scooter from the rider so it can fall to the ground. */
  private dismount(): void {
    const world = this.scooter.getWorldPosition(new THREE.Vector3());
    const quaternion = this.scooter.getWorldQuaternion(new THREE.Quaternion());
    this.game.scene.add(this.scooter);
    this.scooter.position.copy(world);
    this.scooter.quaternion.copy(quaternion);
    this.wreckGround = this.position.y;
    this.wreckVelocityY = 0;
    this.wreckGrounded = false;
    this.wrecked = true;
  }

  /** Puts the scooter back under the rider once the enemy gets up. */
  private remount(): void {
    if (!this.wrecked) return;
    this.wrecked = false;
    this.rig.root.add(this.scooter);
    this.scooter.position.set(0, 0, 0);
    this.scooter.rotation.set(0, 0, 0);
  }

  /** Makes the fallen scooter tumble down, then leaves it lying on its side. */
  private updateWreck(dt: number): void {
    if (!this.wrecked || this.wreckGrounded) return;
    const { wreckGravity, wreckSpin } = CFG.crash;
    this.wreckVelocityY -= wreckGravity * dt;
    this.scooter.position.y += this.wreckVelocityY * dt;
    this.scooter.rotateZ(wreckSpin * dt);
    if (this.scooter.position.y <= this.wreckGround) {
      this.scooter.position.y = this.wreckGround;
      this.scooter.rotation.set(0, 0, Math.PI / 2);
      this.wreckGrounded = true;
    }
  }

  private showBubble(duration: number): void {
    this.bubble?.removeFromParent();
    this.bubble = crashBubble();
    this.bubble.position.set(0, this.rig.height + CFG.deckHeight + 0.9, 0);
    this.rig.root.add(this.bubble);
    this.bubbleTimer = duration;
  }

  private updateBubble(dt: number): void {
    if (!this.bubble) return;
    this.bubbleTimer -= dt;
    if (this.bubbleTimer <= 0) {
      this.bubble.removeFromParent();
      this.bubble = null;
    }
  }
}

export default defineFeature({
  id: 'enemy-ado-trottinette',
  register(registry) {
    registry.registerEnemy({
      id: CFG.typeId,
      displayName: CFG.displayName,
      points: CFG.points,
      create: (game, position) => new AdoTrottinette(game, position),
    });
  },
});
