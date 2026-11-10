import * as THREE from 'three';
import { CORE_CONFIG } from '../../core/config';
import { defineFeature } from '../../core/feature';
import { Entity } from '../../core/ecs';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { Groups, groups, RAPIER } from '../../core/physics';
import type { WeaponContext } from '../../core/types';
import { BaseWeapon } from '../../core/weapons';
import { WEAPON_PACK_EAU_CONFIG as CFG } from './config';

const GRAVITY: number = CORE_CONFIG.physics.gravity;
/** Height of the chest, where a throw leaves the player (matches WeaponSystem.drop). */
const CHEST_HEIGHT = 1.3;
/** Distance in front of the chest where a throw starts when nothing blocks it. */
const LAUNCH_DISTANCE = 0.8;
const GUIDE_COLOR = 0xffd60a;
const BOTTLE_COLOR = 0x9fe3ff;
const SPLASH_COLORS: number[] = [0x4cc9f0, 0x1982c4, 0xffffff];

/** Shared translucent material of the plastic film around the pack. */
const filmMaterial = new THREE.MeshLambertMaterial({
  color: 0xbfe9ff,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

/** Moving meshes must not cast shadows: the shadow map is static. */
function disableShadows(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.castShadow = false;
  });
}

/** One water bottle with its cap, centred on its origin. */
function buildBottle(): THREE.Group {
  const bottle = new THREE.Group();
  const { halfHeight, radius } = CFG.bottles;
  bottle.add(prim.cylinder(radius, radius, halfHeight * 2, BOTTLE_COLOR));
  const cap = prim.cylinder(0.03, 0.03, 0.05, PALETTE.blue);
  cap.position.y = halfHeight + 0.025;
  bottle.add(cap);
  disableShadows(bottle);
  return bottle;
}

/** The pack: 2 by 3 bottles standing on their base, wrapped in a translucent film. */
function buildPackMesh(): THREE.Group {
  const pack = new THREE.Group();
  const bottleBase = CFG.bottles.halfHeight;
  for (const x of [-0.075, 0.075]) {
    for (const z of [-0.15, 0, 0.15]) {
      const bottle = buildBottle();
      bottle.position.set(x, bottleBase, z);
      pack.add(bottle);
    }
  }
  const film = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.48), filmMaterial);
  film.position.y = 0.17;
  pack.add(film);
  disableShadows(pack);
  return pack;
}

/**
 * Computes the launch velocity of a ballistic throw from start to the aimed ground point,
 * under the world gravity. The horizontal reach is capped at maxRange. Returns the flight time.
 */
function solveThrow(start: THREE.Vector3, aim: THREE.Vector3, outVelocity: THREE.Vector3): number {
  let dx = aim.x - start.x;
  let dz = aim.z - start.z;
  const horizontal = Math.hypot(dx, dz);
  if (horizontal > CFG.maxRange) {
    const scale = CFG.maxRange / horizontal;
    dx *= scale;
    dz *= scale;
  }
  const reach = Math.min(horizontal, CFG.maxRange);
  const flightTime =
    CFG.flightTimeMin + (CFG.flightTimeMax - CFG.flightTimeMin) * (reach / CFG.maxRange);
  const targetY = aim.y + CFG.landingHeight;
  // Solves y(t) = start.y + vy * t + GRAVITY / 2 * t^2 = targetY at t = flightTime.
  const vy = (targetY - start.y - 0.5 * GRAVITY * flightTime * flightTime) / flightTime;
  outVelocity.set(dx / flightTime, vy, dz / flightTime);
  return flightTime;
}

/** Point where a throw leaves the player, ignoring walls (preview only). */
function launchPoint(ctx: WeaponContext, out: THREE.Vector3): THREE.Vector3 {
  out.copy(ctx.player.position);
  out.y += CHEST_HEIGHT;
  return out.addScaledVector(ctx.aimDir, LAUNCH_DISTANCE);
}

interface Bottle {
  readonly entity: Entity;
  readonly body: RAPIER.RigidBody;
  readonly group: THREE.Group;
  readonly source: Entity;
  /** Seconds left before the bottle disappears. */
  life: number;
  /** Set once the bottle has stunned an enemy: one hit per bottle. */
  hit: boolean;
}

/** Owns the bottles launched by the pack explosions of one game. */
class BottleField {
  private readonly bottles = new Set<Bottle>();

  constructor(private readonly game: Game) {
    game.addSystem({
      name: 'weapon-pack-eau:bottles',
      priority: 110,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
    });
    game.events.on('reset', () => this.clear());
  }

  /** Launches the bottles in every direction around the origin. */
  launch(origin: THREE.Vector3, source: Entity): void {
    const { count, speed, upward } = CFG.bottles;
    const phase = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = phase + (i / count) * Math.PI * 2;
      this.spawn(origin, source, Math.cos(angle) * speed, upward, Math.sin(angle) * speed);
    }
  }

  private spawn(origin: THREE.Vector3, source: Entity, vx: number, vy: number, vz: number): void {
    const game = this.game;
    const entity = new Entity('bottle');
    const collider = RAPIER.ColliderDesc.cylinder(CFG.bottles.halfHeight, CFG.bottles.radius)
      .setMass(CFG.bottles.mass)
      .setRestitution(0.5)
      .setCollisionGroups(
        groups(Groups.WEAPON, Groups.STATIC | Groups.ENEMY | Groups.PROP | Groups.WEAPON),
      );
    const body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(vx, vy, vz)
        .setAngvel({ x: Math.random() * 12 - 6, y: Math.random() * 12 - 6, z: 6 })
        .setCcdEnabled(true),
      [collider],
      entity,
    );
    const group = buildBottle();
    const bottle: Bottle = { entity, body, group, source, life: CFG.bottles.lifetime, hit: false };
    game.world.add(entity);
    game.physics.bind(entity, body, group);
    game.scene.add(group);
    game.physics.onContact(body.collider(0), (other, started) => {
      if (started) this.onBottleContact(bottle, other);
    });
    this.bottles.add(bottle);
  }

  private onBottleContact(bottle: Bottle, other: RAPIER.Collider): void {
    if (bottle.hit) return;
    const v = bottle.body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    if (speed < CFG.bottles.hitMinSpeed) return;
    const target = this.game.combat.hittableOf(this.game.physics.ownerOf(other));
    if (!target || target === this.game.player) return;
    bottle.hit = true;
    this.game.combat.hit(target, {
      damage: CFG.bottles.damage,
      force: new THREE.Vector3(v.x, 1, v.z).multiplyScalar(0.5),
      source: bottle.source,
      kind: 'bottle',
      stun: CFG.bottles.stunTime,
    });
  }

  private remove(bottle: Bottle): void {
    this.bottles.delete(bottle);
    bottle.group.removeFromParent();
    // Removing the entity also removes its Rapier body (see Physics constructor).
    this.game.world.remove(bottle.entity);
  }

  private fixedUpdate(dt: number): void {
    for (const bottle of this.bottles) {
      bottle.life -= dt;
      if (bottle.life <= 0) this.remove(bottle);
    }
  }

  clear(): void {
    for (const bottle of [...this.bottles]) this.remove(bottle);
  }
}

const fields = new WeakMap<Game, BottleField>();

function bottleFieldOf(game: Game): BottleField {
  let field = fields.get(game);
  if (!field) {
    field = new BottleField(game);
    fields.set(game, field);
  }
  return field;
}

/**
 * Heavy pack of water. Thrown in a lob towards the cursor, it explodes on its first
 * impact and launches bottles that stun the enemies they hit.
 */
class WeaponPackEau extends BaseWeapon {
  private readonly guide: THREE.Line;
  private readonly guideGeometry: THREE.BufferGeometry;
  private readonly guideMaterial: THREE.LineDashedMaterial;
  private readonly guidePositions = new Float32Array(CFG.guidePoints * 3);
  private readonly tmpStart = new THREE.Vector3();
  private readonly tmpVelocity = new THREE.Vector3();
  private exploded = false;

  constructor(game: Game, position: THREE.Vector3) {
    super(game, position, {
      id: 'pack-eau',
      displayName: "Pack d'eau",
      object: buildPackMesh(),
      // Body origin sits on the bottom of the pack.
      colliders: [
        RAPIER.ColliderDesc.cuboid(0.17, 0.17, 0.24).setTranslation(0, 0.17, 0).setRestitution(0.1),
      ],
      mass: CFG.mass,
      holdMode: 'hand',
      holdOffset: new THREE.Vector3(0, -0.05, 0.1),
    });
    this.guideGeometry = new THREE.BufferGeometry();
    this.guideGeometry.setAttribute('position', new THREE.BufferAttribute(this.guidePositions, 3));
    this.guideMaterial = new THREE.LineDashedMaterial({
      color: GUIDE_COLOR,
      dashSize: 0.25,
      gapSize: 0.15,
    });
    this.guide = new THREE.Line(this.guideGeometry, this.guideMaterial);
    this.guide.frustumCulled = false;
    this.guide.visible = false;
    game.scene.add(this.guide);
  }

  attack(ctx: WeaponContext): void {
    ctx.game.weapons.drop(true);
  }

  override onDrop(ctx: WeaponContext, thrown: boolean): void {
    this.guide.visible = false;
    if (!thrown || this.exploded) return;
    // The core already set a flat throw velocity; replace it by the ballistic one.
    const t = this.body.translation();
    this.tmpStart.set(t.x, t.y, t.z);
    solveThrow(this.tmpStart, ctx.aimPoint, this.tmpVelocity);
    this.body.setLinvel(
      { x: this.tmpVelocity.x, y: this.tmpVelocity.y, z: this.tmpVelocity.z },
      true,
    );
  }

  override heldUpdate(ctx: WeaponContext): void {
    this.updateGuide(ctx);
  }

  /** Redraws the dotted curve from the throw point to the aimed point. */
  private updateGuide(ctx: WeaponContext): void {
    const start = launchPoint(ctx, this.tmpStart);
    const flightTime = solveThrow(start, ctx.aimPoint, this.tmpVelocity);
    const n = CFG.guidePoints;
    const v = this.tmpVelocity;
    for (let i = 0; i < n; i++) {
      const time = (flightTime * i) / (n - 1);
      this.guidePositions[i * 3] = start.x + v.x * time;
      this.guidePositions[i * 3 + 1] = start.y + v.y * time + 0.5 * GRAVITY * time * time;
      this.guidePositions[i * 3 + 2] = start.z + v.z * time;
    }
    this.guideGeometry.getAttribute('position').needsUpdate = true;
    this.guide.computeLineDistances();
    this.guide.visible = true;
  }

  override onThrownImpact(game: Game): void {
    if (this.exploded) return;
    this.exploded = true;
    const t = this.body.translation();
    const position = new THREE.Vector3(t.x, t.y, t.z);
    game.combat.explode(
      position,
      CFG.explosion.radius,
      CFG.explosion.force,
      CFG.explosion.damage,
      this.entity,
    );
    game.fx.burst({
      position,
      color: SPLASH_COLORS,
      count: 40,
      speed: 6,
      life: 0.9,
      gravity: -14,
      shape: 'ico',
    });
    bottleFieldOf(game).launch(position, this.entity);
    this.object.visible = false;
    this.broken = true;
  }

  override dispose(game: Game): void {
    super.dispose(game);
    this.guide.removeFromParent();
    this.guideGeometry.dispose();
    this.guideMaterial.dispose();
  }
}

export default defineFeature({
  id: 'weapon-pack-eau',
  register(registry) {
    registry.registerWeapon({
      id: 'pack-eau',
      displayName: "Pack d'eau",
      create: (game, position) => new WeaponPackEau(game, position),
    });
  },
  setup(game) {
    bottleFieldOf(game);
  },
});
