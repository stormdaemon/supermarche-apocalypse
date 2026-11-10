import * as THREE from 'three';
import { Entity } from '../../core/ecs';
import type { Game } from '../../core/game';
import { Groups, groups, RAPIER } from '../../core/physics';
import { GILBERT } from './config';
import { buildCartVisual } from './visuals';

const CART = GILBERT.cart;

/**
 * held: Gilbert pushes the cart. runaway: the cart is a free prop that hurts what it hits.
 * removed: the cart and its body are gone.
 */
type CartState = 'held' | 'runaway' | 'removed';

/**
 * Keeps track of the runaway carts of one game. They outlive the enemy that released them:
 * a feature system ticks them (lifetime) and the reset event clears them.
 */
export class RunawayCarts {
  private readonly carts = new Set<PushCart>();

  constructor(private readonly game: Game) {}

  add(cart: PushCart): void {
    this.carts.add(cart);
  }

  delete(cart: PushCart): void {
    this.carts.delete(cart);
  }

  /** Removes the runaway carts whose lifetime is over. */
  tick(): void {
    const now = this.game.time.elapsed;
    for (const cart of [...this.carts]) {
      if (cart.expired(now)) cart.remove();
    }
  }

  /** Removes every runaway cart (game restart). */
  clear(): void {
    for (const cart of [...this.carts]) cart.remove();
  }
}

const trackers = new WeakMap<Game, RunawayCarts>();

/** Returns the runaway cart tracker of a game, creating it on first use. */
export function runawayCartsOf(game: Game): RunawayCarts {
  let tracker = trackers.get(game);
  if (!tracker) {
    tracker = new RunawayCarts(game);
    trackers.set(game, tracker);
  }
  return tracker;
}

/**
 * Shopping cart of Tonton Gilbert. While held, it is a dynamic box steered in front of him
 * by a velocity spring. When it bumps something hard or when he lets go, it becomes a free
 * runaway cart: it rolls on and damages the player and enemies it crosses, once per pass.
 */
export class PushCart {
  readonly entity = new Entity('pere-caddie:cart');
  private readonly body: RAPIER.RigidBody;
  private readonly object: THREE.Group;
  private state: CartState = 'held';
  /** Last heading (rad) Gilbert gave to the cart while he held it. */
  private heading: number;
  private releasedAt = 0;
  private stallTime = 0;
  /** Simulated time until which a target cannot be hit by this cart again. */
  private readonly cooldowns = new Map<Entity, number>();
  private readonly linvel = { x: 0, y: 0, z: 0 };
  private readonly rotation = { x: 0, y: 0, z: 0, w: 1 };
  private readonly force = new THREE.Vector3();

  constructor(
    private readonly game: Game,
    private readonly owner: Entity,
    anchor: THREE.Vector3,
    heading: number,
  ) {
    this.heading = heading;
    const hold = CART.holdDistance;
    this.body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(
          anchor.x + Math.sin(heading) * hold,
          anchor.y + CART.halfHeight,
          anchor.z + Math.cos(heading) * hold,
        )
        .lockRotations()
        .setLinearDamping(CART.linearDamping)
        .setCcdEnabled(true),
      [
        RAPIER.ColliderDesc.cuboid(CART.halfWidth, CART.halfHeight, CART.halfLength)
          .setMass(CART.mass)
          .setFriction(CART.friction)
          .setRestitution(CART.restitution)
          .setCollisionGroups(groups(Groups.PROP)),
      ],
      this.entity,
    );
    this.object = buildCartVisual();
    game.scene.add(this.object);
    game.world.add(this.entity);
    game.physics.bind(this.entity, this.body, this.object);
    game.physics.onContact(this.body.collider(0), (other, started) =>
      this.handleContact(other, started),
    );
  }

  /** Steers the held cart to the point in front of Gilbert. Called every fixed step. */
  follow(
    anchor: THREE.Vector3,
    anchorVelocity: { x: number; y: number; z: number },
    heading: number,
    dt: number,
  ): void {
    if (this.state !== 'held') return;
    this.heading = heading;
    const targetX = anchor.x + Math.sin(heading) * CART.holdDistance;
    const targetY = anchor.y + CART.halfHeight;
    const targetZ = anchor.z + Math.cos(heading) * CART.holdDistance;
    const current = this.body.translation();
    const ex = targetX - current.x;
    const ey = targetY - current.y;
    const ez = targetZ - current.z;

    // Spring towards the target, plus Gilbert's own velocity so the cart keeps pace with him.
    let vx = ex * CART.followGain + anchorVelocity.x;
    let vz = ez * CART.followGain + anchorVelocity.z;
    const speed = Math.hypot(vx, vz);
    if (speed > CART.maxFollowSpeed) {
      const k = CART.maxFollowSpeed / speed;
      vx *= k;
      vz *= k;
    }
    this.linvel.x = vx;
    this.linvel.y = ey * CART.followGain;
    this.linvel.z = vz;
    this.body.setLinvel(this.linvel, true);

    // Rotation around Y so that the cart points where Gilbert walks.
    this.rotation.y = Math.sin(heading / 2);
    this.rotation.w = Math.cos(heading / 2);
    this.body.setRotation(this.rotation, true);

    // A cart that stays far behind for a while is pinned against something: he lets go.
    const lag = Math.hypot(ex, ez);
    this.stallTime = lag > CART.stallDistance ? this.stallTime + dt : 0;
    if (this.stallTime >= CART.stallSeconds) this.release(heading);
  }

  /** Lets go of the cart: it becomes a free runaway prop launched along the heading. */
  release(heading: number): void {
    if (this.state !== 'held') return;
    this.state = 'runaway';
    const now = this.game.time.elapsed;
    this.releasedAt = now;
    this.stallTime = 0;
    this.cooldowns.clear();
    // Gilbert is spared by his own cart for a short moment, then it can hit him again.
    this.cooldowns.set(this.owner, now + CART.selfImmunity);
    runawayCartsOf(this.game).add(this);
    const dx = Math.sin(heading);
    const dz = Math.cos(heading);
    this.body.lockRotations(false, true);
    this.body.setLinvel({ x: dx * CART.runawaySpeed, y: 0, z: dz * CART.runawaySpeed }, true);
    // Spin around the axis a rolling box would turn around, so it tumbles along its path.
    this.body.setAngvel({ x: dz * 2, y: 0, z: -dx * 2 }, true);
  }

  /** True for a runaway cart whose lifetime is over at the given simulated time. */
  expired(now: number): boolean {
    return this.state === 'runaway' && now - this.releasedAt >= CART.lifetime;
  }

  /**
   * Called when Gilbert is disposed. A held cart goes with him; a runaway cart keeps
   * rolling and hurting until its own lifetime ends (or the reset event).
   */
  detach(): void {
    if (this.state === 'held') this.remove();
  }

  /** Removes the cart body, its mesh and its contact handler. */
  remove(): void {
    if (this.state === 'removed') return;
    if (this.state === 'runaway') runawayCartsOf(this.game).delete(this);
    this.state = 'removed';
    this.game.world.remove(this.entity);
    this.object.removeFromParent();
  }

  private handleContact(other: RAPIER.Collider, started: boolean): void {
    if (!started) return;
    if (this.state === 'held') {
      // Only hard obstacles make him let go; people brushing the cart do not.
      if (!this.isHardBump(other)) return;
      const v = this.body.linvel();
      if (Math.hypot(v.x, v.z) >= CART.bumpMinSpeed) this.release(this.heading);
      return;
    }
    if (this.state === 'runaway') this.mow(this.game.physics.ownerOf(other));
  }

  /**
   * True when the collider is a wall, shelf, crate or the floor, and its top is above the
   * bottom of the cart. The floor's top is at the cart's bottom, so it never counts.
   */
  private isHardBump(other: RAPIER.Collider): boolean {
    const membership = (other.collisionGroups() >>> 16) & 0xffff;
    if ((membership & (Groups.STATIC | Groups.PROP)) === 0) return false;
    const half = other.halfExtents();
    if (!half) return true;
    const top = other.translation().y + half.y;
    const cartBottom = this.body.translation().y - CART.halfHeight;
    return top > cartBottom + CART.bumpGroundMargin;
  }

  /** Damages a player or enemy the runaway cart touches, at most once per cooldown. */
  private mow(owner: Entity | undefined): void {
    if (!owner) return;
    const target = this.game.combat.hittableOf(owner);
    if (!target) return;
    const v = this.body.linvel();
    const speed = Math.hypot(v.x, v.z);
    if (speed < CART.minHurtSpeed) return;
    const now = this.game.time.elapsed;
    if ((this.cooldowns.get(owner) ?? -Infinity) > now) return;
    this.cooldowns.set(owner, now + CART.hitCooldown);
    const k = CART.knockback / speed;
    this.force.set(v.x * k, CART.knockbackUp, v.z * k);
    this.game.combat.hit(target, {
      damage: CART.damage,
      force: this.force.clone(),
      source: this.owner,
      kind: 'caddie-gilbert',
      stun: CART.stun,
    });
  }
}
