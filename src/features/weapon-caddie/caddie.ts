import * as THREE from 'three';
import { CORE_CONFIG } from '../../core/config';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { Groups, groups, RAPIER } from '../../core/physics';
import type { Hittable, WeaponContext } from '../../core/types';
import { BaseWeapon } from '../../core/weapons';
import { CADDIE_CONFIG as CFG } from './config';

/** Height of the basket floor's centre, relative to the cart origin (wheel axles sit at y = 0). */
const FLOOR_Y = 0.12;
const FLOOR_THICKNESS = 0.04;
/** Height of the bottom of the walls. */
const WALL_BASE_Y = FLOOR_Y + FLOOR_THICKNESS / 2;
const WALL_THICKNESS = 0.03;
const HANDLE_POST_HEIGHT = 0.12;

/**
 * Builds the low-poly cart with its origin at the wheel axles' level, centred on the basket.
 * The handle is at the back (-Z), the front (+Z) faces the direction of the push.
 */
function buildCartMesh(): THREE.Group {
  const { width, length, wheelRadius, wheelX, wheelZ, wallHeight } = CFG.body;
  const root = new THREE.Group();
  root.name = 'caddie';
  const wallCenterY = WALL_BASE_Y + wallHeight / 2;
  const wallTop = WALL_BASE_Y + wallHeight;
  const handleZ = -(length / 2 + WALL_THICKNESS);
  const place = (mesh: THREE.Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z);
    root.add(mesh);
  };

  place(prim.box(width, FLOOR_THICKNESS, length, PALETTE.darkGrey), 0, FLOOR_Y, 0);
  place(
    prim.box(width, wallHeight, WALL_THICKNESS, PALETTE.grey),
    0,
    wallCenterY,
    length / 2 - WALL_THICKNESS / 2,
  );
  place(
    prim.box(width, wallHeight, WALL_THICKNESS, PALETTE.grey),
    0,
    wallCenterY,
    -(length / 2 - WALL_THICKNESS / 2),
  );
  for (const side of [-1, 1]) {
    place(
      prim.box(WALL_THICKNESS, wallHeight, length, PALETTE.grey),
      side * (width / 2 - WALL_THICKNESS / 2),
      wallCenterY,
      0,
    );
  }

  // Red handle: two posts rising from the back wall and a crossbar.
  const postCenterY = wallTop + HANDLE_POST_HEIGHT / 2;
  for (const side of [-1, 1]) {
    place(
      prim.box(0.05, HANDLE_POST_HEIGHT, 0.05, PALETTE.red),
      side * (width / 2 - 0.04),
      postCenterY,
      handleZ,
    );
  }
  place(prim.box(width + 0.06, 0.05, 0.08, PALETTE.red), 0, wallTop + HANDLE_POST_HEIGHT, handleZ);

  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wheel = prim.cylinder(wheelRadius, wheelRadius, 0.06, PALETTE.black, 10);
      wheel.rotation.z = Math.PI / 2;
      place(wheel, sx * wheelX, 0, sz * wheelZ);
    }
  }

  // The cart moves, so it must not cast into the static shadow map.
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = false;
  });
  return root;
}

/** Physical cart: one cuboid for the basket and four small spheres for the wheels. */
function buildCartColliders(): RAPIER.ColliderDesc[] {
  const { width, length, wheelRadius, wheelX, wheelZ, wallHeight, friction } = CFG.body;
  const bottom = FLOOR_Y - FLOOR_THICKNESS / 2;
  const top = WALL_BASE_Y + wallHeight;
  const halfHeight = (top - bottom) / 2;
  const descs = [
    RAPIER.ColliderDesc.cuboid(width / 2, halfHeight, length / 2).setTranslation(
      0,
      bottom + halfHeight,
      0,
    ),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      descs.push(RAPIER.ColliderDesc.ball(wheelRadius).setTranslation(sx * wheelX, 0, sz * wheelZ));
    }
  }
  for (const desc of descs) desc.setFriction(friction);
  return descs;
}

/**
 * Shopping cart. Held in front of the player it slows him down; the attack button starts a
 * charge that pushes him forward and knocks over the enemies lying in the path.
 */
export class CaddieWeapon extends BaseWeapon {
  private charging = false;
  private chargeLeft = 0;
  private cooldownLeft = 0;
  private sparkTimer = 0;
  /** Entity ids already hit during the current charge, so each enemy is hit once per charge. */
  private readonly hitIds = new Set<number>();
  private readonly sweepOrigin = new THREE.Vector3();
  private readonly sparkPosition = new THREE.Vector3();
  private readonly pushVelocity = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();

  constructor(game: Game, position: THREE.Vector3) {
    super(game, position, {
      id: 'caddie',
      displayName: 'Caddie',
      object: buildCartMesh(),
      colliders: buildCartColliders(),
      mass: CFG.mass,
      holdMode: 'front',
      holdOffset: new THREE.Vector3(CFG.holdOffset.x, CFG.holdOffset.y, CFG.holdOffset.z),
    });
  }

  override onEquip(ctx: WeaponContext): void {
    ctx.player.speedMultiplier = CFG.carrySpeedMultiplier;
  }

  override onDrop(ctx: WeaponContext, _thrown: boolean): void {
    this.endCharge();
    ctx.player.speedMultiplier = 1;
  }

  /** Left click: starts a charge towards the aim direction, unless one is running or cooling down. */
  override attack(ctx: WeaponContext): void {
    if (this.charging || this.cooldownLeft > 0 || !ctx.player.canControl) return;
    this.charging = true;
    this.chargeLeft = CFG.charge.duration;
    this.sparkTimer = 0;
    this.hitIds.clear();
    ctx.player.rig.trigger('attack', CFG.charge.duration);
  }

  override heldUpdate(ctx: WeaponContext, dt: number): void {
    if (this.cooldownLeft > 0) this.cooldownLeft = Math.max(0, this.cooldownLeft - dt);
    if (!this.charging) return;
    // Being hit or knocked out interrupts the charge.
    if (!ctx.player.canControl) {
      this.endCharge();
      return;
    }
    this.chargeLeft -= dt;
    if (this.chargeLeft <= 0) {
      this.endCharge();
      return;
    }
    this.chargeStep(ctx, dt);
  }

  /** Thrown carts hit harder than the default throw and knock the target further. */
  override onThrownImpact(game: Game, target: Hittable | null, speed: number): void {
    if (!target) return;
    const v = this.body.linvel();
    const force = new THREE.Vector3(v.x, 3, v.z).multiplyScalar(CFG.throw.forceMultiplier);
    game.combat.hit(target, {
      damage: speed * CORE_CONFIG.weapon.throwDamagePerSpeed * CFG.throw.damageMultiplier,
      force,
      source: this.entity,
      kind: `throw:${this.id}`,
      stun: CFG.throw.stun,
    });
  }

  private chargeStep(ctx: WeaponContext, dt: number): void {
    const { game, player, aimDir } = ctx;
    // Frame velocity is consumed by the next fixed step's movement integration.
    this.pushVelocity.copy(aimDir).multiplyScalar(CFG.charge.pushSpeed);
    player.addFrameVelocity(this.pushVelocity);
    player.facing = Math.atan2(aimDir.x, aimDir.z);

    this.sweepOrigin.copy(player.position).addScaledVector(aimDir, CFG.charge.reach);
    this.sweepOrigin.y += 0.5;
    this.sweep(game, aimDir);

    this.sparkTimer -= dt;
    if (this.sparkTimer <= 0) {
      this.sparkTimer = CFG.sparks.interval;
      this.emitSparks(game, aimDir);
    }
  }

  /**
   * Hits the enemies inside the cone in front of the cart. Enemies already hit during this
   * charge are skipped; an enemy only counts as hit when combat accepted the hit.
   */
  private sweep(game: Game, dir: THREE.Vector3): void {
    const { damage, force, lift, stun, radius, arc } = CFG.charge;
    const halfArc = arc / 2;
    const candidates = game.physics.entitiesInSphere(
      this.sweepOrigin,
      radius,
      groups(Groups.ALL, Groups.ENEMY),
    );
    for (const entity of candidates) {
      if (this.hitIds.has(entity.id)) continue;
      const target = game.combat.hittableOf(entity);
      if (!target || target.health.dead) continue;
      const offset = this.toTarget.copy(target.position).sub(this.sweepOrigin).setY(0);
      if (offset.lengthSq() > 0.0001 && offset.normalize().angleTo(dir) > halfArc) continue;
      const impulse = dir.clone().multiplyScalar(force);
      impulse.y = lift;
      const hit = game.combat.hit(target, {
        damage,
        force: impulse,
        source: this.entity,
        kind: 'caddie',
        stun,
      });
      if (hit) this.hitIds.add(entity.id);
    }
  }

  private emitSparks(game: Game, dir: THREE.Vector3): void {
    this.sparkPosition.copy(this.sweepOrigin).setY(0.15);
    game.fx.burst({
      position: this.sparkPosition,
      color: [PALETTE.yellow, PALETTE.orange, PALETTE.white],
      count: CFG.sparks.count,
      speed: 3,
      size: CFG.sparks.size,
      life: CFG.sparks.life,
      gravity: -10,
      direction: dir,
      spread: 0.6,
    });
  }

  private endCharge(): void {
    if (!this.charging) return;
    this.charging = false;
    this.chargeLeft = 0;
    this.hitIds.clear();
    this.cooldownLeft = CFG.charge.cooldown;
  }
}
