import * as THREE from 'three';
import type { Entity } from '../../core/ecs';
import type { GameEvents } from '../../core/events';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { PALETTE } from '../../core/materials';
import { Groups, groups, RAPIER } from '../../core/physics';
import { type Enemy, EnemyC } from '../../core/types';
import { RAGDOLL_CONFIG as CFG } from './config';

type LimbPart = 'armL' | 'armR' | 'legL' | 'legR';

/** Where a limb is joined to the enemy body, at scale 1. The limb hangs down from that point. */
interface LimbLayout {
  part: LimbPart;
  x: number;
  y: number;
  halfLength: number;
}

const LIMB_LAYOUT: readonly LimbLayout[] = [
  {
    part: 'armL',
    x: -CFG.anchors.shoulderX,
    y: CFG.anchors.shoulderY,
    halfLength: CFG.limbs.armHalfLength,
  },
  {
    part: 'armR',
    x: CFG.anchors.shoulderX,
    y: CFG.anchors.shoulderY,
    halfLength: CFG.limbs.armHalfLength,
  },
  { part: 'legL', x: -CFG.anchors.hipX, y: CFG.anchors.hipY, halfLength: CFG.limbs.legHalfLength },
  { part: 'legR', x: CFG.anchors.hipX, y: CFG.anchors.hipY, halfLength: CFG.limbs.legHalfLength },
];

/** A physical limb body joined to the enemy body, with the rig part it drives. */
interface Limb {
  part: THREE.Group;
  body: RAPIER.RigidBody;
  joint: RAPIER.ImpulseJoint;
}

/** An enemy currently in flight, with its simplified ragdoll. */
interface Ragdoll {
  entity: Entity;
  enemy: Enemy;
  /** Distance from the body center down to the rig root (feet), at this enemy's scale. */
  centerOffset: number;
  limbs: Limb[];
}

const UP = new THREE.Vector3(0, 1, 0);

/** Launches strong hits into a flight, runs a joint-based ragdoll and gets the enemy back up. */
class RagdollImpacts {
  private readonly ragdolls = new Map<Entity, Ragdoll>();
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpSpin = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpParentQuat = new THREE.Quaternion();

  constructor(private readonly game: Game) {
    game.events.on('hit', (hit) => this.onHit(hit));
    game.events.on('recover', ({ entity }) => {
      const ragdoll = this.ragdolls.get(entity);
      if (ragdoll) this.recover(ragdoll);
    });
    game.events.on('reset', () => this.clear());
  }

  /** Per-frame pose of every ragdoll, and teardown of the ones whose enemy died or vanished. */
  update(): void {
    for (const ragdoll of this.ragdolls.values()) {
      const { entity, enemy } = ragdoll;
      if (!entity.alive || !enemy.body.isValid()) {
        this.teardown(ragdoll);
      } else if (enemy.state === 'dead') {
        this.release(ragdoll);
      } else {
        this.pose(ragdoll);
      }
    }
  }

  private onHit(hit: GameEvents['hit']): void {
    const enemy = hit.target.get(EnemyC);
    if (!enemy || !hit.target.alive || enemy.state === 'dead') return;
    if (this.ragdolls.has(hit.target)) return;
    if (hit.force.length() < CFG.minImpactForce) return;
    this.launch(hit.target, enemy, hit.force);
  }

  private launch(entity: Entity, enemy: Enemy, force: THREE.Vector3): void {
    const body = enemy.body;
    const mass = body.mass();
    const scale = enemy.rig.height / CFG.baseHeight;

    // BaseEnemy.applyHit already applied the regular impulse (force / sturdiness * mass / 10).
    // Add the missing part of the multiplier on the same scale, plus a lift for a longer flight.
    this.tmpVec.copy(force).multiplyScalar(((CFG.knockbackMultiplier - 1) * mass) / 10);
    this.tmpVec.y += CFG.liftVelocity * mass;
    body.applyImpulse(this.tmpVec, true);

    enemy.knockOut(CFG.knockoutDuration);
    enemy.visualOverride = true;
    body.lockRotations(false, true);
    // Spin around the axis perpendicular to the blow (a flip). Vertical blows spin around X.
    this.tmpSpin.copy(force).cross(UP);
    if (this.tmpSpin.lengthSq() < 1e-6) this.tmpSpin.set(1, 0, 0);
    body.applyTorqueImpulse(this.tmpSpin.normalize().multiplyScalar(CFG.spinTorque), true);
    body.collider(0).setRestitution(CFG.bounce);

    // The torso and head start from upright, the arms and legs are posed every frame.
    const parts = enemy.rig.parts;
    parts.body.position.set(0, 0, 0);
    parts.torso.rotation.set(0, 0, 0);
    parts.head.rotation.set(0, 0, 0);

    const limbs = LIMB_LAYOUT.map((layout) => this.createLimb(enemy, layout, scale));
    this.ragdolls.set(entity, {
      entity,
      enemy,
      centerOffset: CFG.feetToCenter * scale,
      limbs,
    });
  }

  /** Creates one limb body hanging from the enemy body, joined by a spherical joint. */
  private createLimb(enemy: Enemy, layout: LimbLayout, scale: number): Limb {
    const physics = this.game.physics;
    const translation = enemy.body.translation();
    const rotation = enemy.body.rotation();
    const bodyRotation = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
    const halfLength = layout.halfLength * scale;
    const halfThickness = CFG.limbs.halfThickness * scale;

    // The limb's top end sits on the joint anchor and its center hangs below it.
    const anchor = new THREE.Vector3(layout.x * scale, layout.y * scale, 0)
      .applyQuaternion(bodyRotation)
      .add(new THREE.Vector3(translation.x, translation.y, translation.z));
    const center = new THREE.Vector3(0, -halfLength, 0).applyQuaternion(bodyRotation).add(anchor);

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(center.x, center.y, center.z)
      .setRotation(rotation)
      .setLinearDamping(CFG.limbs.linearDamping)
      .setAngularDamping(CFG.limbs.angularDamping);
    // Limbs only touch the floor, the props and each other: never the enemies or the player.
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfThickness, halfLength, halfThickness)
      .setMass(CFG.limbs.mass)
      .setRestitution(CFG.limbs.restitution)
      .setFriction(CFG.limbs.friction)
      .setCollisionGroups(groups(Groups.RAGDOLL, Groups.STATIC | Groups.PROP | Groups.RAGDOLL));
    const body = physics.createBody(bodyDesc, [colliderDesc]);

    const joint = physics.world.createImpulseJoint(
      RAPIER.JointData.spherical(
        { x: layout.x * scale, y: layout.y * scale, z: 0 },
        { x: 0, y: halfLength, z: 0 },
      ),
      enemy.body,
      body,
      true,
    );
    return { part: enemy.rig.parts[layout.part], body, joint };
  }

  /** Puts the rig root on the body and turns each limb part to match its physical limb. */
  private pose(ragdoll: Ragdoll): void {
    const { enemy, centerOffset, limbs } = ragdoll;
    const root = enemy.rig.root;
    const t = enemy.body.translation();
    const r = enemy.body.rotation();
    root.quaternion.set(r.x, r.y, r.z, r.w);
    this.tmpVec.set(0, -centerOffset, 0).applyQuaternion(root.quaternion);
    root.position.set(t.x, t.y, t.z).add(this.tmpVec);

    for (const limb of limbs) {
      const lr = limb.body.rotation();
      this.tmpQuat.set(lr.x, lr.y, lr.z, lr.w);
      const parent = limb.part.parent;
      if (!parent) continue;
      // Local rotation = inverse(parent world rotation) * wanted world rotation.
      parent.getWorldQuaternion(this.tmpParentQuat);
      limb.part.quaternion.copy(this.tmpParentQuat.invert().multiply(this.tmpQuat));
    }
  }

  /** Ends a flight after the enemy got back up: restores the body and adds the little hop. */
  private recover(ragdoll: Ragdoll): void {
    const { enemy } = ragdoll;
    this.release(ragdoll);
    if (!enemy.body.isValid()) return;

    const body = enemy.body;
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.lockRotations(true, true);
    body.applyImpulse({ x: 0, y: body.mass() * CFG.recoverHop, z: 0 }, true);

    const sparkles = CFG.recoverSparkles;
    this.game.fx.burst({
      position: enemy.position.clone().setY(enemy.position.y + 0.8),
      color: [PALETTE.yellow, 0xffffff],
      count: sparkles.count,
      shape: 'ico',
      size: sparkles.size,
      speed: sparkles.speed,
      gravity: sparkles.gravity,
    });
  }

  /** Removes the ragdoll and hands the enemy back to the core visuals. */
  private release(ragdoll: Ragdoll): void {
    const { enemy } = ragdoll;
    this.teardown(ragdoll);
    enemy.visualOverride = false;
    if (enemy.body.isValid()) enemy.body.collider(0).setRestitution(0);
  }

  /** Removes the joints first, then the limb bodies. Each Rapier handle is checked before use. */
  private teardown(ragdoll: Ragdoll): void {
    const physics = this.game.physics;
    this.ragdolls.delete(ragdoll.entity);
    for (const limb of ragdoll.limbs) {
      if (limb.joint.isValid()) physics.world.removeImpulseJoint(limb.joint, true);
    }
    for (const limb of ragdoll.limbs) {
      if (limb.body.isValid()) physics.removeBody(limb.body);
    }
  }

  private clear(): void {
    for (const ragdoll of [...this.ragdolls.values()]) this.teardown(ragdoll);
  }
}

export default defineFeature({
  id: 'ragdoll-impacts',
  setup(game) {
    const impacts = new RagdollImpacts(game);
    game.addSystem({
      name: 'ragdoll-impacts',
      priority: 110,
      update: () => impacts.update(),
    });
  },
});
