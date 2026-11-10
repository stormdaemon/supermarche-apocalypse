import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { Entity } from '../../core/ecs';
import { PALETTE, flatMaterial, prim } from '../../core/materials';
import type { Player } from '../../core/player';
import type { RAPIER } from '../../core/physics';
import type { Hittable, Trap } from '../../core/types';
import { TAPIS_CONFIG as TAPIS } from './config';

/**
 * Checkout conveyor belts. Each belt is a floor strip sitting against a checkout counter.
 * Its speed changes on its own (slow, fast or reversed). The belt is a velocity zone that
 * carries the player and the enemies standing on it. A body that reaches the counter
 * side while the belt runs towards the counter is launched over the counter.
 */

type BeltMode = keyof typeof TAPIS.modes;
const MODES = Object.keys(TAPIS.modes) as BeltMode[];
const COUNTER_HALF_WIDTH = TAPIS.counter.width / 2;
/** Tolerance for bodies pressed against the counter face (m). */
const FACE_TOLERANCE = 0.5;

/** Last simulated time at which a body was launched. Keeps one launch per body. */
const launchedAt = new WeakMap<Hittable, number>();
/** Reused for every launch impulse. */
const launch = new THREE.Vector3();

interface Counter {
  group: THREE.Group;
  collider: RAPIER.Collider;
}

/** Builds a checkout counter with its own static collider (used for the extra checkouts). */
function buildCounter(game: Game, x: number, z: number, length: number): Counter {
  const { width, height } = TAPIS.counter;
  const group = new THREE.Group();
  const body = prim.box(width, height, length, PALETTE.darkGrey);
  body.position.y = height / 2;
  const top = prim.box(width + 0.1, 0.08, length + 0.1, PALETTE.grey);
  top.position.y = height + 0.04;
  const register = prim.box(0.6, 0.5, 0.5, PALETTE.black);
  register.position.set(0, height + 0.3, length / 2 - 0.4);
  group.add(body, top, register);
  group.position.set(x, 0, z);
  game.scene.add(group);
  const collider = game.physics.addStaticBox(
    new THREE.Vector3(x, height / 2, z),
    new THREE.Vector3(width / 2, height / 2, length / 2),
  );
  return { group, collider };
}

/** Wraps a value into [0, period). */
function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** One conveyor belt beside a checkout counter. The counter is on the store centre side. */
class ConveyorBelt implements Trap {
  readonly entity = new Entity('tapis-caisse');
  private readonly group = new THREE.Group();
  private readonly stripes: { mesh: THREE.Mesh; base: number }[] = [];
  private readonly statusLight: THREE.Mesh;
  /** Velocity of the surface zone (m/s), updated every fixed step. */
  private readonly flow = new THREE.Vector3();
  private readonly removeZone: () => void;
  private readonly counter: Counter | null;
  private readonly z: number;
  private readonly halfLength: number;
  /** -1 when the belt is west of its counter, 1 when east. */
  private readonly side: number;
  /** Unit direction of the belt towards its counter, along X. */
  private readonly towardsCounter: number;
  /** X of the counter face the belt feeds. */
  private readonly faceX: number;
  private readonly minX: number;
  private readonly maxX: number;
  /** Current signed speed (m/s): positive towards the counter, negative when reversed. */
  private speed = 0;
  private target = 0;
  private switchTimer = 0;
  /** Distance travelled by the stripes, wrapped into the belt width. */
  private offset = 0;

  constructor(
    private readonly game: Game,
    x: number,
    z: number,
    length: number,
    withCounter: boolean,
  ) {
    const { belt, colors } = TAPIS;
    this.z = z;
    this.halfLength = length / 2;
    this.side = x < 0 ? -1 : 1;
    this.towardsCounter = -this.side;
    this.faceX = x + this.side * COUNTER_HALF_WIDTH;
    const width = belt.width;
    const centreX = this.faceX + (this.side * width) / 2;
    this.minX = Math.min(this.faceX, this.faceX + this.side * width);
    this.maxX = Math.max(this.faceX, this.faceX + this.side * width);
    this.counter = withCounter ? buildCounter(game, x, z, length) : null;

    this.group.position.set(centreX, 0, z);
    const base = prim.box(width, 0.06, length, colors.base);
    base.position.y = 0.03;
    this.group.add(base);
    for (const edge of [-1, 1]) {
      const rail = prim.box(width, 0.14, 0.1, colors.rail);
      rail.position.set(0, 0.07, edge * (this.halfLength - 0.05));
      this.group.add(rail);
    }
    // Status light on the counter side: its colour shows the current mode.
    this.statusLight = prim.box(0.1, 0.1, length - 0.6, colors.stripe);
    this.statusLight.position.set(-this.side * (width / 2 - 0.08), 0.13, 0);
    this.group.add(this.statusLight);
    for (let i = 0; i < belt.stripeCount; i++) {
      const mesh = prim.box(belt.stripeWidth, 0.02, length - 0.3, colors.stripe);
      mesh.position.y = 0.065;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.stripes.push({ mesh, base: (i / belt.stripeCount) * width });
    }
    game.scene.add(this.group);

    this.removeZone = game.surfaces.add({
      contains: (p) => p.x >= this.minX && p.x <= this.maxX && Math.abs(p.z - z) <= this.halfLength,
      velocity: this.flow,
    });
    this.pickMode();
    this.speed = this.target;
  }

  /** Changes the belt behaviour at random once its timer runs out. */
  private pickMode(): void {
    const total = MODES.reduce((sum, key) => sum + TAPIS.modes[key].weight, 0);
    let roll = Math.random() * total;
    let chosen: BeltMode = 'slow';
    for (const key of MODES) {
      roll -= TAPIS.modes[key].weight;
      if (roll < 0) {
        chosen = key;
        break;
      }
    }
    const def = TAPIS.modes[chosen];
    const { min, max } = def.speed;
    this.target = min + Math.random() * (max - min);
    const interval = TAPIS.belt.switchInterval;
    this.switchTimer = interval.min + Math.random() * (interval.max - interval.min);
    this.statusLight.material = flatMaterial(def.color, 0.6);
  }

  fixedUpdate(dt: number): void {
    this.switchTimer -= dt;
    if (this.switchTimer <= 0) this.pickMode();
    const blend = 1 - Math.exp(-TAPIS.belt.speedSharpness * dt);
    this.speed += (this.target - this.speed) * blend;
    this.flow.set(this.towardsCounter * this.speed, 0, 0);
    this.launchCarried();
  }

  update(dt: number): void {
    // Stripes follow the current flow, so they run backwards when the belt is reversed.
    const width = TAPIS.belt.width;
    this.offset = wrap(this.offset + this.flow.x * dt, width);
    for (const stripe of this.stripes) {
      stripe.mesh.position.x = wrap(stripe.base + this.offset, width) - width / 2;
    }
  }

  /** Launches the player and the enemies that reached the counter side of the belt. */
  private launchCarried(): void {
    if (this.speed < TAPIS.eject.minSpeed) return;
    const { player } = this.game;
    if (!player.health.dead && this.claim(player)) this.launchPlayer(player);
    for (const enemy of this.game.enemies.alive) {
      if (enemy.state !== 'dead' && this.claim(enemy)) {
        const cfg = TAPIS.eject.enemy;
        const mass = enemy.body.mass();
        enemy.body.applyImpulse(
          { x: this.towardsCounter * cfg.forward * mass, y: cfg.up * mass, z: 0 },
          true,
        );
        enemy.knockOut(cfg.stun);
        this.burst(enemy.position);
      }
    }
  }

  /**
   * True when the body stands on the counter side of this belt and was not launched recently.
   * Starts the launch cooldown when it returns true.
   */
  private claim(target: Hittable): boolean {
    const p = target.position;
    const distanceToFace = this.side * (p.x - this.faceX);
    if (distanceToFace < -FACE_TOLERANCE || distanceToFace > TAPIS.eject.catchDistance) {
      return false;
    }
    if (Math.abs(p.z - this.z) > this.halfLength) return false;
    const now = this.game.time.elapsed;
    if ((launchedAt.get(target) ?? -Infinity) > now) return false;
    launchedAt.set(target, now + TAPIS.eject.cooldown);
    return true;
  }

  private launchPlayer(player: Player): void {
    const cfg = TAPIS.eject.player;
    launch.set(this.towardsCounter * cfg.forward, cfg.up, 0);
    player.applyImpulse(launch);
    player.lockControl(cfg.stun);
    this.burst(player.position);
  }

  /** Small puff of particles at the launch point. */
  private burst(position: THREE.Vector3): void {
    const fx = TAPIS.eject.fx;
    this.game.fx.burst({
      position: position.clone().setY(0.8),
      color: [...fx.color],
      count: fx.count,
      size: fx.size,
      speed: fx.speed,
      gravity: fx.gravity,
      shape: 'ico',
    });
  }

  dispose(game: Game): void {
    this.removeZone();
    this.group.removeFromParent();
    if (this.counter) {
      this.counter.group.removeFromParent();
      game.physics.world.removeCollider(this.counter.collider, true);
    }
  }
}

/** One belt per arena checkout (the arena already builds the counters), plus the extra checkouts. */
function spawnDefaultBelts(game: Game): Trap[] {
  const traps: Trap[] = [];
  for (const checkout of game.arena.layout.checkouts) {
    traps.push(
      new ConveyorBelt(game, checkout.position.x, checkout.position.z, checkout.length, false),
    );
  }
  for (const extra of TAPIS.extraCheckouts) {
    traps.push(new ConveyorBelt(game, extra.x, extra.z, TAPIS.counter.length, true));
  }
  return traps;
}

export default defineFeature({
  id: 'trap-tapis-caisse',
  register(registry) {
    registry.registerTrap({
      id: 'tapis-caisse',
      displayName: 'Tapis de caisse',
      spawnDefault: spawnDefaultBelts,
      spawn: (game, position, _rotationY) =>
        new ConveyorBelt(game, position.x, position.z, TAPIS.counter.length, true),
    });
  },
});
