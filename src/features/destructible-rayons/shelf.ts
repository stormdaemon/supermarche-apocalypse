import * as THREE from 'three';
import { buildShelfVisual, type ShelfSpec } from '../../core/arena';
import { Entity } from '../../core/ecs';
import type { Game } from '../../core/game';
import { pick, prim } from '../../core/materials';
import { Groups, groups, PhysicsBodyC, RAPIER } from '../../core/physics';
import type { Enemy } from '../../core/types';
import { PRODUCT_THEMES, RAYONS_CONFIG, type ProductTheme } from './config';

/**
 * Life cycle of one shelf unit.
 * - stable: locked dynamic body, the shelf behaves like a wall.
 * - wobbling: sways sideways under a controlled tilt; it may end up tipping or settling.
 * - hesitating: leans to the side it has picked and holds there for a moment.
 * - pushing: a controlled push takes the shelf past its balance point.
 * - falling: free physics, the shelf topples and crushes what lies under it.
 * - fallen: locked on the floor until the next wave or reset.
 * - recovering: sway ended without tipping, the shelf returns upright.
 */
type ShelfState =
  'stable' | 'wobbling' | 'hesitating' | 'pushing' | 'falling' | 'fallen' | 'recovering';

interface Shelf {
  readonly aisle: number;
  readonly theme: ProductTheme;
  readonly entity: Entity;
  readonly body: RAPIER.RigidBody;
  /** Half of the shelf depth (along X), the axis it tips over. */
  readonly halfWidth: number;
  /** Half of the shelf height (along Y). */
  readonly halfHeight: number;
  /** Half of the shelf length (along Z). */
  readonly halfLength: number;
  /** Body centre when the shelf stands upright in its original place. */
  readonly baseCenter: THREE.Vector3;
  state: ShelfState;
  /** Seconds spent in the current state. */
  timer: number;
  /** Seconds the shelf has been lying still on its side. */
  settleTimer: number;
  /** Length of the current sway, in seconds. */
  duration: number;
  /** Random phases of the two sway components. */
  phaseA: number;
  phaseB: number;
  /** Decided at the start of the sway, revealed only at its end. */
  tips: boolean;
  /** Side the shelf goes to when it tips (+1 or -1 around the X axis). */
  side: 1 | -1;
  /** Enemies already hit by the current fall. */
  readonly crushed: Set<Enemy>;
  /** Where the arena puts this shelf's "RAYON n" sign, found once the arena is built. */
  readonly signAnchor: THREE.Vector3;
  /** The sign sprite, hidden while the shelf lies down. Null if it was not found. */
  sign: THREE.Object3D | null;
}

interface Product {
  readonly entity: Entity;
  readonly mesh: THREE.Mesh;
  life: number;
}

/** Reads the tilt angle around Z of a body that only rotates about Z. */
function tiltOf(body: RAPIER.RigidBody): number {
  const r = body.rotation();
  return 2 * Math.atan2(r.z, r.w);
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Owns every shelf of one game: the dynamic bodies, their wobble and fall, the products
 * they drop and the enemies they crush. Instances are created by the 'shelf' provider.
 *
 * Assumption: shelves are axis-aligned (rotationY = 0, as in the arena) so tipping happens
 * in the X/Y plane.
 */
export class DestructibleShelves {
  private readonly shelves: Shelf[] = [];
  private readonly products: Product[] = [];
  private attached = false;

  constructor(private readonly game: Game) {}

  /** Creates one dynamic shelf body with its visual, and registers it. */
  addShelf(spec: ShelfSpec): void {
    const { game } = this;
    const halfWidth = spec.depth / 2;
    const halfHeight = spec.height / 2;
    const halfLength = spec.length / 2;
    const baseCenter = spec.position.clone().setY(halfHeight);

    const entity = new Entity(`rayon-${spec.aisleNumber}`);
    const body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(baseCenter.x, baseCenter.y, baseCenter.z)
        .enabledTranslations(false, false, false)
        .enabledRotations(false, false, false),
      [
        RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfLength)
          .setMass(RAYONS_CONFIG.mass)
          .setFriction(RAYONS_CONFIG.friction)
          .setCollisionGroups(groups(Groups.STATIC)),
      ],
      entity,
    );

    // The visual is built around the floor centre; the wrapper follows the body, whose origin
    // is the centre of the box.
    const theme = pick(PRODUCT_THEMES);
    const visual = buildShelfVisual({ ...spec, position: new THREE.Vector3(), rotationY: 0 });
    visual.position.set(0, -halfHeight, 0);
    this.recolourProducts(visual, theme);
    const wrapper = new THREE.Group();
    wrapper.add(visual);
    game.scene.add(wrapper);
    game.physics.bind(entity, body, wrapper);
    game.world.add(entity);

    const shelf: Shelf = {
      aisle: spec.aisleNumber,
      theme,
      entity,
      body,
      halfWidth,
      halfHeight,
      halfLength,
      baseCenter,
      state: 'stable',
      timer: 0,
      settleTimer: 0,
      duration: 0,
      phaseA: 0,
      phaseB: 0,
      tips: false,
      side: 1,
      crushed: new Set(),
      // Same position as the sign created by Arena.build (above the shelf, at its far end).
      signAnchor: new THREE.Vector3(
        spec.position.x,
        spec.height + 1.6,
        spec.position.z + spec.length / 2,
      ),
      sign: null,
    };
    this.shelves.push(shelf);
    game.physics.onContact(body.collider(0), (other, started) =>
      this.onShelfContact(shelf, other, started),
    );
  }

  /** Subscribes to the game events and the fixed step. Called once from the feature setup. */
  attach(): void {
    if (this.attached) return;
    this.attached = true;
    const { events } = this.game;
    events.on('explosion', ({ position, radius, force }) => {
      if (force < RAYONS_CONFIG.impact.explosionForce) return;
      for (const shelf of this.shelves) {
        if (shelf.state === 'stable' && this.footprintDistance(shelf, position) <= radius) {
          this.trigger(shelf);
        }
      }
    });
    events.on('hit', ({ point, force }) => {
      if (force.length() < RAYONS_CONFIG.impact.hitForce) return;
      for (const shelf of this.shelves) {
        if (
          shelf.state === 'stable' &&
          this.footprintDistance(shelf, point) <= RAYONS_CONFIG.impact.hitReach
        ) {
          this.trigger(shelf);
        }
      }
    });
    events.on('waveStart', () => this.restoreAll());
    events.on('reset', () => this.restoreAll());
    // The arena creates the signs after the shelf provider runs, so they are looked up here.
    for (const shelf of this.shelves) shelf.sign = this.findSign(shelf.signAnchor);
    this.game.addSystem({
      name: 'destructible-rayons',
      priority: 150,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
    });
  }

  private fixedUpdate(dt: number): void {
    for (const shelf of this.shelves) this.stepShelf(shelf, dt);
    for (let i = this.products.length - 1; i >= 0; i--) {
      const product = this.products[i];
      if (!product) continue;
      product.life -= dt;
      if (product.life <= 0) this.removeProduct(i);
    }
  }

  private stepShelf(shelf: Shelf, dt: number): void {
    switch (shelf.state) {
      case 'wobbling':
        this.stepWobble(shelf, dt);
        break;
      case 'hesitating':
        this.stepHesitation(shelf, dt);
        break;
      case 'pushing':
        this.stepPush(shelf, dt);
        break;
      case 'falling':
        this.stepFall(shelf, dt);
        break;
      case 'recovering':
        this.stepRecovery(shelf, dt);
        break;
      default:
        break;
    }
  }

  /** Starts a sway. Ignored while the shelf is already moving or lying down. */
  private trigger(shelf: Shelf): void {
    if (shelf.state !== 'stable') return;
    shelf.state = 'wobbling';
    shelf.timer = 0;
    const { minDuration, maxDuration } = RAYONS_CONFIG.wobble;
    shelf.duration = minDuration + Math.random() * (maxDuration - minDuration);
    shelf.phaseA = Math.random() * Math.PI * 2;
    shelf.phaseB = Math.random() * Math.PI * 2;
    shelf.tips = Math.random() < RAYONS_CONFIG.wobble.tipChance;
    shelf.side = Math.random() < 0.5 ? 1 : -1;
    shelf.crushed.clear();
    // Only the height and the tilt around Z are free during the sway.
    shelf.body.setEnabledTranslations(false, true, false, true);
    shelf.body.setEnabledRotations(false, false, true, true);
    this.game.invalidateShadows();
    this.game.cameraRig.addTrauma(RAYONS_CONFIG.feedback.wobbleTrauma);
    this.game.audio.tone({
      freq: 160,
      endFreq: 70,
      type: 'sawtooth',
      duration: 0.6,
      volume: RAYONS_CONFIG.feedback.creakVolume,
    });
  }

  private stepWobble(shelf: Shelf, dt: number): void {
    shelf.timer += dt;
    const t = shelf.timer;
    const { amplitude, frequencies } = RAYONS_CONFIG.wobble;
    const w1 = 2 * Math.PI * frequencies[0];
    const w2 = 2 * Math.PI * frequencies[1];
    const a = w1 * t + shelf.phaseA;
    const b = w2 * t + shelf.phaseB;
    const target = (amplitude * (Math.sin(a) + 0.5 * Math.sin(b))) / 1.5;
    const rate = (amplitude * (w1 * Math.cos(a) + 0.5 * w2 * Math.cos(b))) / 1.5;
    this.drive(shelf, target, rate);
    if (t < shelf.duration) return;
    if (shelf.tips) {
      shelf.state = 'hesitating';
      shelf.timer = 0;
    } else {
      shelf.state = 'recovering';
      shelf.timer = 0;
    }
  }

  private stepHesitation(shelf: Shelf, dt: number): void {
    shelf.timer += dt;
    this.drive(shelf, shelf.side * RAYONS_CONFIG.hesitation.lean, 0);
    if (shelf.timer < RAYONS_CONFIG.hesitation.duration) return;
    this.beginPush(shelf);
  }

  private beginPush(shelf: Shelf): void {
    shelf.state = 'pushing';
    shelf.timer = 0;
    // X becomes free too, so the shelf can slide off its edge.
    shelf.body.setEnabledTranslations(true, true, false, true);
    // The sign is static in the arena: it is hidden while the shelf is down (see resetPose).
    if (shelf.sign) shelf.sign.visible = false;
    this.game.ui.toast(`Attention, le rayon ${shelf.aisle} bascule !`, 2);
    this.game.invalidateShadows();
    this.spawnProducts(shelf);
  }

  private stepPush(shelf: Shelf, dt: number): void {
    shelf.timer += dt;
    const { angularSpeed, releaseAngle } = RAYONS_CONFIG.push;
    this.drive(shelf, shelf.side * (Math.PI / 2), shelf.side * angularSpeed);
    this.crush(shelf);
    if (Math.abs(tiltOf(shelf.body)) < releaseAngle) return;
    // Past the balance point: the controller stops and the physics finishes the fall.
    shelf.state = 'falling';
    shelf.timer = 0;
    shelf.settleTimer = 0;
  }

  private stepFall(shelf: Shelf, dt: number): void {
    shelf.timer += dt;
    this.crush(shelf);
    const { settleAngle, settleSpeed, settleTime, timeout } = RAYONS_CONFIG.fall;
    const lying =
      Math.abs(tiltOf(shelf.body)) > settleAngle && Math.abs(shelf.body.angvel().z) < settleSpeed;
    shelf.settleTimer = lying ? shelf.settleTimer + dt : 0;
    if (shelf.settleTimer >= settleTime || shelf.timer >= timeout) this.land(shelf);
  }

  private land(shelf: Shelf): void {
    shelf.state = 'fallen';
    this.lockBody(shelf.body);
    this.game.invalidateShadows();
    this.game.cameraRig.addTrauma(RAYONS_CONFIG.feedback.landingTrauma);
    this.game.audio.noise({
      duration: 0.5,
      volume: RAYONS_CONFIG.feedback.thudVolume,
      filterFreq: 400,
    });
    const c = shelf.body.translation();
    this.game.fx.burst({
      position: new THREE.Vector3(c.x, c.y, c.z),
      color: [0xe8dcc4, shelf.theme.colors[0] ?? 0xffffff],
      count: 18,
      speed: 3.5,
      size: 0.2,
      life: 0.9,
      gravity: -10,
    });
  }

  private stepRecovery(shelf: Shelf, dt: number): void {
    shelf.timer += dt;
    this.drive(shelf, 0, 0);
    const upright = Math.abs(tiltOf(shelf.body)) < 0.01 && Math.abs(shelf.body.angvel().z) < 0.1;
    if (upright || shelf.timer > RAYONS_CONFIG.wobble.recoverTimeout) this.resetPose(shelf);
  }

  /** Commands an angular speed so that the tilt follows a target, like a simple P controller. */
  private drive(shelf: Shelf, target: number, rate: number): void {
    const { gain, maxAngularSpeed } = RAYONS_CONFIG.wobble;
    const command = clamp(gain * (target - tiltOf(shelf.body)) + rate, maxAngularSpeed);
    shelf.body.setAngvel({ x: 0, y: 0, z: command }, true);
  }

  /** Enemies under the falling shelf are crushed, once per fall, and bounce like on a trampoline. */
  private crush(shelf: Shelf): void {
    const { game } = this;
    const c = shelf.body.translation();
    const tilt = tiltOf(shelf.body);
    const reach =
      shelf.halfWidth * Math.abs(Math.cos(tilt)) +
      shelf.halfHeight * Math.abs(Math.sin(tilt)) +
      RAYONS_CONFIG.crush.margin;
    const zReach = shelf.halfLength + RAYONS_CONFIG.crush.margin;
    for (const enemy of game.enemies.alive) {
      if (enemy.state === 'dead' || shelf.crushed.has(enemy)) continue;
      const p = enemy.position;
      if (Math.abs(p.x - c.x) > reach || Math.abs(p.z - c.z) > zReach) continue;
      shelf.crushed.add(enemy);
      const { damage, bounceSpeed, sideSpeed, stun } = RAYONS_CONFIG.crush;
      game.combat.hit(enemy, {
        damage,
        force: new THREE.Vector3(),
        source: null,
        kind: 'shelf-crush',
        stun,
      });
      const away = p.x - c.x === 0 ? shelf.side : Math.sign(p.x - c.x);
      enemy.body.setLinvel(
        {
          x: away * sideSpeed,
          y: bounceSpeed,
          z: (Math.random() - 0.5) * sideSpeed,
        },
        true,
      );
    }
  }

  private onShelfContact(shelf: Shelf, other: RAPIER.Collider, started: boolean): void {
    if (!started || shelf.state !== 'stable') return;
    const body = other.parent();
    if (!body || !body.isDynamic()) return;
    const v = body.linvel();
    const speed = Math.hypot(v.x, v.y, v.z);
    const momentum = other.mass() * speed;
    const { contactSpeed, contactMomentum } = RAYONS_CONFIG.impact;
    if (speed >= contactSpeed && momentum >= contactMomentum) this.trigger(shelf);
  }

  /** Horizontal distance from a point to the upright footprint of a shelf. */
  private footprintDistance(shelf: Shelf, p: THREE.Vector3): number {
    const c = shelf.baseCenter;
    const dx = Math.max(0, Math.abs(p.x - c.x) - shelf.halfWidth);
    const dz = Math.max(0, Math.abs(p.z - c.z) - shelf.halfLength);
    return Math.hypot(dx, dz);
  }

  /** Makes the body a fixed obstacle again: no translation, no rotation, no speed. */
  private lockBody(body: RAPIER.RigidBody): void {
    body.setEnabledTranslations(false, false, false, true);
    body.setEnabledRotations(false, false, false, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  /** Puts a shelf back upright at its original place, locked and stable. */
  private resetPose(shelf: Shelf): void {
    const { body, baseCenter } = shelf;
    body.setTranslation(baseCenter, true);
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.lockBody(body);
    // Snap the interpolation so the shelf does not slide back visually.
    const pb = shelf.entity.require(PhysicsBodyC);
    pb.prevPosition.copy(baseCenter);
    pb.prevRotation.set(0, 0, 0, 1);
    shelf.state = 'stable';
    shelf.timer = 0;
    shelf.settleTimer = 0;
    shelf.crushed.clear();
    if (shelf.sign) shelf.sign.visible = true;
  }

  /** Finds the "RAYON n" sign sprite the arena placed at the given anchor, if any. */
  private findSign(anchor: THREE.Vector3): THREE.Object3D | null {
    for (const child of this.game.scene.children) {
      if (child instanceof THREE.Sprite && child.position.distanceTo(anchor) < 0.01) return child;
    }
    return null;
  }

  /** Puts every shelf back upright and removes the products (next wave or reset). */
  private restoreAll(): void {
    while (this.products.length > 0) this.removeProduct(this.products.length - 1);
    let moved = false;
    for (const shelf of this.shelves) {
      if (shelf.state !== 'stable') moved = true;
      this.resetPose(shelf);
    }
    if (moved) this.game.invalidateShadows();
  }

  /** Drops the products of a fallen shelf: some as physics bodies, the rest as particles. */
  private spawnProducts(shelf: Shelf): void {
    const { game } = this;
    const { theme } = shelf;
    const c = shelf.body.translation();
    const tilt = tiltOf(shelf.body);
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    const [w, , d] = theme.size;
    const radius = Math.max(w, d) / 2;
    const { bodiesPerShelf, particlesPerShelf } = RAYONS_CONFIG.products;
    for (let i = 0; i < bodiesPerShelf; i++) {
      // Products sit on the face that ends up on top when the shelf goes over.
      const lx = shelf.side * (shelf.halfWidth + radius + 0.05);
      const ly = (Math.random() * 2 - 1) * (shelf.halfHeight - 0.4);
      const lz = (Math.random() * 2 - 1) * (shelf.halfLength - 1);
      const position = new THREE.Vector3(
        c.x + cos * lx - sin * ly,
        c.y + sin * lx + cos * ly,
        c.z + lz,
      );
      const velocity = new THREE.Vector3(
        -shelf.side * 1.5,
        1 + Math.random(),
        (Math.random() - 0.5) * 1.5,
      );
      this.spawnProduct(theme, position, velocity);
    }
    game.fx.burst({
      position: new THREE.Vector3(c.x, c.y, c.z),
      color: [...theme.colors],
      count: particlesPerShelf,
      speed: 3,
      size: 0.18,
      life: 0.7,
      gravity: -14,
    });
  }

  private spawnProduct(
    theme: ProductTheme,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
  ): void {
    const { game } = this;
    if (this.products.length >= RAYONS_CONFIG.products.maxBodies) this.removeProduct(0);
    const [w, h, d] = theme.size;
    const color = pick(theme.colors);
    const mesh = buildProductMesh(theme, color);
    mesh.castShadow = false;

    const entity = new Entity(`produit-${theme.id}`);
    const shape =
      theme.shape === 'box'
        ? RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        : theme.shape === 'cylinder'
          ? RAPIER.ColliderDesc.cylinder(h / 2, w / 2)
          : RAPIER.ColliderDesc.ball(w / 2);
    const body = game.physics.createBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(position.x, position.y, position.z),
      [
        shape
          .setMass(RAYONS_CONFIG.products.mass)
          .setFriction(RAYONS_CONFIG.products.friction)
          .setRestitution(RAYONS_CONFIG.products.restitution)
          .setCollisionGroups(groups(Groups.PROP, Groups.STATIC | Groups.ENEMY | Groups.PROP)),
      ],
      entity,
    );
    body.setLinvel(velocity, true);
    body.setAngvel(
      { x: Math.random() * 6 - 3, y: Math.random() * 6 - 3, z: Math.random() * 6 - 3 },
      true,
    );
    game.physics.bind(entity, body, mesh);
    game.scene.add(mesh);
    game.world.add(entity);
    this.products.push({ entity, mesh, life: RAYONS_CONFIG.products.lifetime });
  }

  private removeProduct(index: number): void {
    const product = this.products[index];
    if (!product) return;
    this.products.splice(index, 1);
    this.game.world.remove(product.entity);
    product.mesh.removeFromParent();
  }

  /** Recolours the instanced products of a shelf so they match its product theme. */
  private recolourProducts(visual: THREE.Group, theme: ProductTheme): void {
    const instanced = visual.children.find(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh,
    );
    if (!instanced) return;
    const color = new THREE.Color();
    for (let i = 0; i < instanced.count; i++) {
      instanced.setColorAt(i, color.setHex(pick(theme.colors)));
    }
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true;
  }
}

/** Builds the visual of one product from primitives. */
function buildProductMesh(theme: ProductTheme, color: number): THREE.Mesh {
  const [w, h, d] = theme.size;
  switch (theme.shape) {
    case 'box':
      return prim.box(w, h, d, color);
    case 'cylinder':
      return prim.cylinder(w / 2, w / 2, h, color, 10);
    case 'ico':
      return prim.ico(w / 2, color, 0);
  }
}
