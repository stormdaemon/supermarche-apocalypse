import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { RAPIER } from '../../core/physics';
import { BaseWeapon } from '../../core/weapons';
import type { Hittable, WeaponContext } from '../../core/types';
import { EXTINGUISHER_CONFIG } from './config';

const ARC_RADIANS = (EXTINGUISHER_CONFIG.push.arcDegrees * Math.PI) / 180;
const SMOKE_COLORS: THREE.ColorRepresentation[] = [...EXTINGUISHER_CONFIG.smoke.colors];

/**
 * Builds the low-poly extinguisher: red tank, black head, white band and a grey nozzle
 * pointing along +Z (the player's forward axis once held).
 */
function buildModel(): THREE.Group {
  const root = new THREE.Group();
  const tank = prim.cylinder(0.16, 0.16, 0.6, PALETTE.red, 10);
  const band = prim.cylinder(0.165, 0.165, 0.06, PALETTE.white, 10);
  band.position.y = 0.05;
  const head = prim.cylinder(0.1, 0.1, 0.12, PALETTE.black, 8);
  head.position.y = 0.36;
  const nozzle = prim.cylinder(0.03, 0.03, 0.35, PALETTE.darkGrey, 6);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.set(0, 0.3, 0.18);
  root.add(tank, band, head, nozzle);
  // The model moves with the player, so it must not cast a static shadow.
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = false;
  });
  return root;
}

/**
 * Hold attack to spray: a cone pushes enemies back, a grey cloud comes out and the
 * recoil slides the player backwards. The tank empties after a few seconds.
 * Throwing an empty extinguisher makes it burst.
 */
class Extincteur extends BaseWeapon {
  private charge: number = EXTINGUISHER_CONFIG.charge.capacity;
  private emptyAnnounced = false;
  private blastSpent = false;
  private sweepCooldown = 0;
  private readonly recoilVelocity = new THREE.Vector3();
  private readonly pushForce = new THREE.Vector3();
  private readonly sprayOrigin = new THREE.Vector3();
  private readonly blastPosition = new THREE.Vector3();

  constructor(game: Game, position: THREE.Vector3) {
    super(game, position, {
      id: 'extincteur',
      displayName: 'Extincteur',
      object: buildModel(),
      colliders: [RAPIER.ColliderDesc.cylinder(0.3, 0.16)],
      mass: EXTINGUISHER_CONFIG.mass,
      holdMode: 'hand',
      holdOffset: new THREE.Vector3(0, -0.05, 0.05),
    });
  }

  /** A press does nothing: spraying is continuous and handled in heldUpdate(). */
  override attack(_ctx: WeaponContext): void {}

  override onEquip(): void {
    // A thrown extinguisher may explode once per throw, not once per bounce.
    this.blastSpent = false;
  }

  override heldUpdate(ctx: WeaponContext, dt: number): void {
    if (!ctx.attackHeld || !ctx.player.canControl) {
      this.sweepCooldown = 0;
      return;
    }
    if (this.charge <= 0) return;

    const { game, player, aimDir } = ctx;
    const smoke = EXTINGUISHER_CONFIG.smoke;
    this.charge = Math.max(0, this.charge - dt);

    // Face the spray direction, then slide backwards from the recoil.
    player.facing = Math.atan2(aimDir.x, aimDir.z);
    this.recoilVelocity.copy(aimDir).multiplyScalar(-EXTINGUISHER_CONFIG.recoil.speed);
    player.addFrameVelocity(this.recoilVelocity);

    this.sprayOrigin.set(
      player.position.x + aimDir.x * smoke.originDistance,
      player.position.y + smoke.originHeight,
      player.position.z + aimDir.z * smoke.originDistance,
    );
    game.fx.burst({
      position: this.sprayOrigin,
      color: SMOKE_COLORS,
      count: smoke.particlesPerStep,
      speed: smoke.speed,
      size: smoke.size,
      life: smoke.life,
      gravity: smoke.gravity,
      direction: aimDir,
      spread: smoke.spread,
      shape: 'ico',
    });

    this.sweepCooldown -= dt;
    if (this.sweepCooldown <= 0) {
      this.sweepCooldown = EXTINGUISHER_CONFIG.push.interval;
      this.pushEnemies(ctx);
    }

    if (this.charge <= 0) this.announceEmpty(ctx);
  }

  /** Pushes every enemy inside the cone in front of the player. */
  private pushEnemies(ctx: WeaponContext): void {
    const push = EXTINGUISHER_CONFIG.push;
    this.pushForce.copy(ctx.aimDir).multiplyScalar(push.force);
    ctx.game.combat.meleeSweep({
      origin: ctx.player.position,
      direction: ctx.aimDir,
      range: push.range,
      arc: ARC_RADIANS,
      info: {
        damage: push.damage,
        force: this.pushForce,
        source: this.entity,
        kind: 'extincteur',
        stun: push.stun,
      },
      exclude: ctx.player.entity,
    });
  }

  /** Puffs once and warns the player the first time the tank runs dry. */
  private announceEmpty(ctx: WeaponContext): void {
    if (this.emptyAnnounced) return;
    this.emptyAnnounced = true;
    const puff = EXTINGUISHER_CONFIG.puff;
    ctx.game.fx.burst({
      position: this.sprayOrigin,
      color: SMOKE_COLORS,
      count: puff.count,
      speed: puff.speed,
      size: puff.size,
      life: puff.life,
      gravity: puff.gravity,
      direction: ctx.aimDir,
      spread: puff.spread,
      shape: 'ico',
    });
    ctx.game.ui.toast('Extincteur vide !', 1.5);
  }

  /** While it has charge, a thrown extinguisher behaves as usual; once empty it bursts. */
  override onThrownImpact(game: Game, target: Hittable | null, speed: number): void {
    if (this.charge > 0) {
      super.onThrownImpact(game, target, speed);
      return;
    }
    if (this.blastSpent) return;
    this.blastSpent = true;

    const blast = EXTINGUISHER_CONFIG.emptyBlast;
    const t = this.body.translation();
    this.blastPosition.set(t.x, t.y, t.z);
    game.fx.burst({
      position: this.blastPosition,
      color: SMOKE_COLORS,
      count: blast.count,
      speed: blast.speed,
      size: blast.size,
      life: blast.life,
      gravity: blast.gravity,
      shape: 'ico',
    });
    game.combat.explode(this.blastPosition, blast.radius, blast.force, blast.damage, this.entity);
  }
}

export default defineFeature({
  id: 'weapon-extincteur',
  register(registry) {
    registry.registerWeapon({
      id: 'extincteur',
      displayName: 'Extincteur',
      create: (game, position) => new Extincteur(game, position),
    });
  },
});
