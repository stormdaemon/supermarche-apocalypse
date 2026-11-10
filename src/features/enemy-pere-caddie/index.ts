import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import { BaseEnemy, DEFAULT_ENEMY_STATS, type EnemyStats } from '../../core/enemies';
import type { CharacterOptions } from '../../core/characterFactory';
import { Entity } from '../../core/ecs';
import { Groups, groups, RAPIER } from '../../core/physics';
import { PALETTE, prim } from '../../core/materials';
import type { Game } from '../../core/game';
import { PERE_CADDIE_CONFIG as CFG } from './config';

const ENEMY_ID = 'pere-caddie';
const DISPLAY_NAME = 'Papa Caddie';
const POINTS = 25;
/** Id of the optional cart weapon provided by another feature. */
const CART_WEAPON_ID = 'caddie';

const LOOK: CharacterOptions = {
  skin: PALETTE.skin[2],
  shirt: PALETTE.lime,
  pants: PALETTE.orange,
  shoes: PALETTE.white,
  hair: PALETTE.hair[1],
  hairStyle: 'short',
  accessories: ['mustache'],
  girth: 1.3,
};

const PRODUCT_COLORS = [
  PALETTE.red,
  PALETTE.yellow,
  PALETTE.cyan,
  PALETTE.pink,
  PALETTE.orange,
  PALETTE.lime,
  PALETTE.purple,
  PALETTE.white,
] as const;

/** A cart abandoned by its owner: it stays as decoration until the next reset. */
interface LoosePiece {
  entity: Entity;
  mesh: THREE.Object3D;
}
const loosePieces = new Set<LoosePiece>();

/**
 * Builds the shopping cart mesh. The origin is the floor point under its centre,
 * the handle sits at -Z and the cart rolls towards +Z.
 */
function buildCartMesh(): THREE.Group {
  const cart = new THREE.Group();

  const frame = prim.box(0.95, 0.06, 1.25, PALETTE.darkGrey);
  frame.position.y = 0.3;
  const basket = prim.box(0.9, 0.55, 1.2, PALETTE.grey);
  basket.position.y = 0.62;
  const handle = prim.box(0.95, 0.06, 0.08, PALETTE.darkGrey);
  handle.position.set(0, 1.1, -0.62);
  cart.add(frame, basket, handle);

  for (const side of [-1, 1]) {
    const post = prim.box(0.06, 0.8, 0.06, PALETTE.darkGrey);
    post.position.set(0.44 * side, 0.7, -0.62);
    cart.add(post);
  }

  for (const x of [-0.42, 0.42]) {
    for (const z of [-0.5, 0.5]) {
      const wheel = prim.cylinder(0.1, 0.1, 0.08, PALETTE.black, 8);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.1, z);
      cart.add(wheel);
    }
  }

  // Produce piled up to the rim, with a second layer overflowing the basket.
  const size = CFG.produceBoxSize;
  let colorIndex = 0;
  const addProduct = (x: number, y: number, z: number): void => {
    const color = PRODUCT_COLORS[colorIndex % PRODUCT_COLORS.length] ?? PALETTE.white;
    const box = prim.box(size, size, size, color);
    box.position.set(x, y, z);
    cart.add(box);
    colorIndex++;
  };
  for (const x of [-0.27, 0, 0.27]) {
    for (const z of [-0.36, 0, 0.36]) addProduct(x, 1.0, z);
  }
  for (const x of [-0.14, 0.14]) {
    for (const z of [-0.18, 0.18]) addProduct(x, 1.22, z);
  }

  // Carts are decor for the shadow map's sake: they never cast real shadows.
  cart.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
  return cart;
}

/**
 * Papa Caddie: a slow, sturdy shopper who pushes a kinematic cart in front of him.
 * The cart blocks the aisles and shoves everything it touches. Once his cart is taken
 * (knocked out, or half his health lost) it detaches and he walks like a normal client.
 */
class PereCaddie extends BaseEnemy {
  /** Kinematic body of the cart, null once the cart is gone. */
  private cartBody: RAPIER.RigidBody | null = null;
  private cartMesh: THREE.Group | null = null;
  private sweepTimer: number = CFG.sweep.interval;
  /** Alternates the lateral push of successive shoves. */
  private sweepSide = 1;
  private readonly cartCenter = new THREE.Vector3();
  private readonly sweepOrigin = new THREE.Vector3();
  private readonly sweepDirection = new THREE.Vector3();
  private readonly sweepForce = new THREE.Vector3();

  constructor(game: Game, spawn: THREE.Vector3) {
    // A private copy of the stats: the speed changes once the cart is lost.
    const stats: EnemyStats = { ...DEFAULT_ENEMY_STATS, ...CFG.stats };
    super(game, ENEMY_ID, DISPLAY_NAME, spawn, stats, LOOK);
    this.spawnCart();
  }

  override fixedUpdate(dt: number): void {
    if (
      this.cartBody &&
      (this.state === 'knockedOut' || this.health.ratio <= CFG.loss.healthRatio)
    ) {
      this.loseCart();
    }
    super.fixedUpdate(dt);
    if (!this.cartBody || this.state === 'dead') return;
    this.placeCart();
    if (this.state === 'active') this.updateSweep(dt);
  }

  override update(dt: number): void {
    // The cart mesh follows its body every frame, even while the enemy is posed by another feature.
    if (this.cartBody && this.cartMesh) {
      const t = this.cartBody.translation();
      this.cartMesh.position.set(t.x, t.y - CFG.cart.height / 2, t.z);
      this.cartMesh.rotation.y = this.facing;
    }
    super.update(dt);
  }

  override dispose(): void {
    this.releaseCartBody();
    this.cartMesh?.removeFromParent();
    this.cartMesh = null;
    super.dispose();
  }

  /** Creates the kinematic cart body and its mesh in front of the enemy. */
  private spawnCart(): void {
    const center = this.computeCartCenter(this.cartCenter);
    this.cartBody = this.game.physics.createBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(center.x, center.y, center.z)
        .setRotation(yawQuaternion(this.facing)),
      [
        RAPIER.ColliderDesc.cuboid(CFG.cart.width / 2, CFG.cart.height / 2, CFG.cart.length / 2)
          .setFriction(0.2)
          .setCollisionGroups(groups(Groups.PROP)),
      ],
    );
    this.cartMesh = buildCartMesh();
    this.game.scene.add(this.cartMesh);
  }

  /** Writes the cart centre for the current feet position and walking direction into out. */
  private computeCartCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(
      this.position.x + Math.sin(this.facing) * CFG.cart.forwardOffset,
      this.position.y + CFG.cart.height / 2,
      this.position.z + Math.cos(this.facing) * CFG.cart.forwardOffset,
    );
  }

  /** Moves the kinematic cart to its next pose; Rapier applies it on the coming physics step. */
  private placeCart(): void {
    const body = this.cartBody;
    if (!body) return;
    this.computeCartCenter(this.cartCenter);
    body.setNextKinematicTranslation(this.cartCenter);
    body.setNextKinematicRotation(yawQuaternion(this.facing));
  }

  /** Periodically shoves everything in front of the cart. */
  private updateSweep(dt: number): void {
    this.sweepTimer -= dt;
    if (this.sweepTimer > 0) return;
    this.sweepTimer = CFG.sweep.interval;

    const sin = Math.sin(this.facing);
    const cos = Math.cos(this.facing);
    this.sweepDirection.set(sin, 0, cos);
    this.sweepOrigin.copy(this.cartCenter).addScaledVector(this.sweepDirection, 0.4);

    // Horizontal right-hand vector, perpendicular to the walking direction.
    this.sweepForce
      .copy(this.sweepDirection)
      .multiplyScalar(CFG.sweep.pushForce)
      .addScaledVector(new THREE.Vector3(cos, 0, -sin), CFG.sweep.lateralForce * this.sweepSide);
    this.sweepForce.y = CFG.sweep.liftForce;
    this.sweepSide = -this.sweepSide;

    this.game.combat.meleeSweep({
      origin: this.sweepOrigin,
      direction: this.sweepDirection,
      range: CFG.sweep.range,
      arc: CFG.sweep.arc,
      info: {
        damage: CFG.sweep.damage,
        force: this.sweepForce,
        source: this.entity,
        kind: ENEMY_ID,
      },
      exclude: this.entity,
      hitPlayer: true,
    });
  }

  /**
   * The cart is taken: its body is removed, and it becomes a cart weapon if the
   * caddie feature is loaded, otherwise a decorative rolling prop. From now on the
   * enemy walks at normal client speed.
   */
  private loseCart(): void {
    const center = this.computeCartCenter(new THREE.Vector3());
    const mesh = this.cartMesh;
    this.cartMesh = null;
    this.releaseCartBody();
    this.stats.speed = CFG.loss.speedAfterLoss;

    if (this.game.registry.weapons.has(CART_WEAPON_ID)) {
      mesh?.removeFromParent();
      this.game.weapons.spawn(CART_WEAPON_ID, center.setY(1));
    } else if (mesh) {
      this.dropLooseCart(center, mesh);
    }
  }

  /** Turns the cart mesh into a dynamic prop that rolls forward a little. */
  private dropLooseCart(center: THREE.Vector3, mesh: THREE.Group): void {
    const body = this.game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setRotation(yawQuaternion(this.facing))
        .setLinearDamping(0.6),
      [
        RAPIER.ColliderDesc.cuboid(CFG.cart.width / 2, CFG.cart.height / 2, CFG.cart.length / 2)
          .setMass(60)
          .setFriction(0.2)
          .setCollisionGroups(groups(Groups.PROP)),
      ],
    );
    const roll = CFG.loss.dropSpeed * 60;
    body.applyImpulse(
      { x: Math.sin(this.facing) * roll, y: 0, z: Math.cos(this.facing) * roll },
      true,
    );

    const entity = this.game.world.add(new Entity('caddie-prop'));
    this.game.physics.bind(entity, body, mesh, {
      offset: new THREE.Vector3(0, -CFG.cart.height / 2, 0),
      syncRotation: true,
    });
    loosePieces.add({ entity, mesh });
  }

  /** Removes the kinematic cart body if it still exists. Never touches a removed body. */
  private releaseCartBody(): void {
    const body = this.cartBody;
    this.cartBody = null;
    if (body && this.game.physics.world.getRigidBody(body.handle)) {
      this.game.physics.removeBody(body);
    }
  }
}

/** Rotation quaternion for a yaw angle around the vertical axis. */
function yawQuaternion(yaw: number): RAPIER.Rotation {
  const half = yaw / 2;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
}

export default defineFeature({
  id: 'enemy-pere-caddie',
  register(registry) {
    registry.registerEnemy({
      id: ENEMY_ID,
      displayName: DISPLAY_NAME,
      points: POINTS,
      create: (game, position) => new PereCaddie(game, position),
    });
  },
  setup(game) {
    // Abandoned carts are decor for one round only: clear them on every reset.
    game.events.on('reset', () => {
      for (const piece of loosePieces) {
        game.world.remove(piece.entity);
        piece.mesh.removeFromParent();
      }
      loosePieces.clear();
    });
  },
});
