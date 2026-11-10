import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import { Entity } from '../../core/ecs';
import type { Game } from '../../core/game';
import { prim } from '../../core/materials';
import { BaseWeapon } from '../../core/weapons';
import { Groups, groups, RAPIER } from '../../core/physics';
import type { WeaponContext } from '../../core/types';
import { BAGUETTE_CONFIG as CFG } from './config';

const UP = new THREE.Vector3(0, 1, 0);
const CRUMB_COLORS: number[] = [...CFG.crumbs.colors];
const ARC_RADIANS = THREE.MathUtils.degToRad(CFG.attack.arcDegrees);

/** Disables shadow casting: the baguette moves with the hand, the shadow map is static. */
function noShadow(object: THREE.Object3D): void {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
}

/** Builds the baguette along the Y axis: a golden cylinder with lighter notches. */
function buildBaguette(): THREE.Group {
  const { length, radius, notches } = CFG.model;
  const group = new THREE.Group();
  group.add(prim.cylinder(radius, radius, length, CFG.colors.wood));
  for (let i = 0; i < notches; i++) {
    const notch = prim.box(radius * 2.4, 0.035, radius * 2.4, CFG.colors.notch);
    notch.position.y = -length / 2 + ((i + 1) / (notches + 1)) * length;
    group.add(notch);
  }
  noShadow(group);
  return group;
}

/** A broken half of the baguette, simulated as a small dynamic body. */
interface Piece {
  entity: Entity;
  mesh: THREE.Mesh;
  expiresAt: number;
}

/**
 * Owns the broken pieces of every baguette of one game. Pieces outlive the weapon
 * that broke, so they are tracked here rather than in the weapon, and cleared on reset.
 */
class Debris {
  private readonly pieces = new Set<Piece>();
  private readonly tmpAxis = new THREE.Vector3();
  private readonly tmpCenter = new THREE.Vector3();
  private readonly tmpImpulse = new THREE.Vector3();

  constructor(private readonly game: Game) {
    game.addSystem({
      name: 'baguette-debris',
      priority: 110,
      fixedUpdate: () => this.expire(),
    });
    game.events.on('reset', () => this.clear());
  }

  /** Spawns the two halves of a baguette centred on the given pose, pushed away from the player. */
  breakInto(position: THREE.Vector3, rotation: THREE.Quaternion, outward: THREE.Vector3): void {
    const halfLength = CFG.model.length / 4;
    const axis = this.tmpAxis.set(0, 1, 0).applyQuaternion(rotation);
    for (const sign of [-1, 1]) {
      const center = this.tmpCenter.copy(position).addScaledVector(axis, sign * halfLength);
      const impulse = this.tmpImpulse
        .copy(outward)
        .multiplyScalar(CFG.fragments.impulse)
        .addScaledVector(axis, sign * CFG.fragments.impulse * 0.5);
      impulse.y += CFG.fragments.upwardImpulse;
      this.spawnPiece(center, rotation, halfLength, impulse);
    }
  }

  private spawnPiece(
    center: THREE.Vector3,
    rotation: THREE.Quaternion,
    halfLength: number,
    impulse: THREE.Vector3,
  ): void {
    const { colliderHalfWidth, radius } = CFG.model;
    const { mass, spin } = CFG.fragments;
    const entity = new Entity('baguette-piece');
    entity.tags.add('debris');
    const collider = RAPIER.ColliderDesc.cuboid(colliderHalfWidth, halfLength, colliderHalfWidth)
      .setMass(mass)
      .setCollisionGroups(groups(Groups.WEAPON, Groups.STATIC | Groups.PROP | Groups.ENEMY));
    const body = this.game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation(rotation)
        .setCcdEnabled(true),
      [collider],
      entity,
    );
    const mesh = prim.cylinder(radius, radius, halfLength * 2, CFG.colors.wood);
    noShadow(mesh);
    this.game.scene.add(mesh);
    this.game.world.add(entity);
    this.game.physics.bind(entity, body, mesh);
    body.applyImpulse(impulse, true);
    body.setAngvel(
      {
        x: (Math.random() - 0.5) * spin,
        y: (Math.random() - 0.5) * spin,
        z: (Math.random() - 0.5) * spin,
      },
      true,
    );
    this.pieces.add({
      entity,
      mesh,
      expiresAt: this.game.time.elapsed + CFG.fragments.lifetime,
    });
  }

  private expire(): void {
    const now = this.game.time.elapsed;
    for (const piece of this.pieces) {
      if (now >= piece.expiresAt) this.removePiece(piece);
    }
  }

  private removePiece(piece: Piece): void {
    this.pieces.delete(piece);
    piece.mesh.removeFromParent();
    // Removing the entity also removes its Rapier body through the physics hook.
    this.game.world.remove(piece.entity);
  }

  private clear(): void {
    for (const piece of [...this.pieces]) this.removePiece(piece);
  }
}

const debrisByGame = new WeakMap<Game, Debris>();

function debrisOf(game: Game): Debris {
  let debris = debrisByGame.get(game);
  if (!debris) {
    debris = new Debris(game);
    debrisByGame.set(game, debris);
  }
  return debris;
}

/**
 * Fast, weak melee weapon held in the right hand. Each swing sweeps a cone in front
 * of the player and sheds crumbs; after enough swings touching enemies it breaks.
 */
class Baguette extends BaseWeapon {
  private touchingSwings = 0;
  private nextAttackAt = 0;
  private readonly tmpDir = new THREE.Vector3();
  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpForce = new THREE.Vector3();
  private readonly tmpPoint = new THREE.Vector3();

  constructor(game: Game, position: THREE.Vector3) {
    const { length, colliderHalfWidth, mass } = CFG.model;
    const { offsetX, offsetY, offsetZ, pitch } = CFG.hold;
    super(game, position, {
      id: 'baguette',
      displayName: 'Baguette',
      object: buildBaguette(),
      colliders: [RAPIER.ColliderDesc.cuboid(colliderHalfWidth, length / 2, colliderHalfWidth)],
      mass,
      holdMode: 'hand',
      holdOffset: new THREE.Vector3(offsetX, offsetY, offsetZ),
      holdRotation: new THREE.Euler(pitch, 0, 0),
    });
  }

  attack(ctx: WeaponContext): void {
    const game = ctx.game;
    const now = game.time.elapsed;
    if (now < this.nextAttackAt) return;
    this.nextAttackAt = now + CFG.attack.cooldown;

    const player = ctx.player;
    const dir = this.tmpDir.copy(ctx.aimDir);
    const origin = this.tmpOrigin.copy(player.position);
    origin.y += 1;
    player.rig.trigger('swing', CFG.attack.swingDuration);

    const hits = game.combat.meleeSweep({
      origin,
      direction: dir,
      range: CFG.attack.range,
      arc: ARC_RADIANS,
      info: {
        damage: CFG.attack.damage,
        force: this.tmpForce.copy(dir).multiplyScalar(CFG.attack.force),
        source: this.entity,
        kind: 'baguette',
      },
      exclude: player.entity,
    });

    // Crumbs fall at the first enemy hit, or in front of the player when the swing misses.
    const point = this.tmpPoint;
    const first = hits[0];
    if (first) {
      point.copy(first.position);
    } else {
      point.copy(player.position).addScaledVector(dir, 1.2);
    }
    point.y += 1;
    game.fx.burst({
      position: point,
      color: CRUMB_COLORS,
      count: CFG.crumbs.perHit,
      speed: CFG.crumbs.speed,
      size: CFG.crumbs.size,
      life: CFG.crumbs.life,
      gravity: CFG.crumbs.gravity,
      direction: UP,
      spread: CFG.crumbs.spread,
    });

    if (hits.length === 0) return;
    this.touchingSwings++;
    if (this.touchingSwings >= CFG.durability.hitsToBreak) this.breakBaguette(ctx);
  }

  /** Splits the baguette in two pieces and sprays a large cloud of crumbs. */
  private breakBaguette(ctx: WeaponContext): void {
    const game = ctx.game;
    const position = this.object.getWorldPosition(new THREE.Vector3());
    const rotation = this.object.getWorldQuaternion(new THREE.Quaternion());
    debrisOf(game).breakInto(position, rotation, ctx.aimDir);
    game.fx.burst({
      position,
      color: CRUMB_COLORS,
      count: CFG.crumbs.perBreak,
      speed: CFG.crumbs.speed * 1.6,
      size: CFG.crumbs.size,
      life: CFG.crumbs.life * 1.5,
      gravity: CFG.crumbs.gravity,
      shape: 'box',
    });
    // The weapon system removes the broken weapon on this same fixed step.
    this.broken = true;
  }
}

export default defineFeature({
  id: 'weapon-baguette',
  register(registry) {
    registry.registerWeapon({
      id: 'baguette',
      displayName: 'Baguette',
      create: (game, position) => new Baguette(game, position),
    });
  },
  setup(game) {
    debrisOf(game);
  },
});
