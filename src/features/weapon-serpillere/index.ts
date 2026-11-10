import * as THREE from 'three';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { Groups, groups, RAPIER } from '../../core/physics';
import type { Player } from '../../core/player';
import type { Enemy, WeaponContext } from '../../core/types';
import { BaseWeapon } from '../../core/weapons';
import { SERPILLIERE_CONFIG as CFG } from './config';

/** Rotation around X of the held mop: the handle points forward and down. */
const HOLD_ANGLE = 2.2;

/** Builds the mop: a wooden handle, a grey head and blue fringes. Shadows are off since it moves. */
function buildMop(): THREE.Group {
  const mop = new THREE.Group();
  const handle = prim.cylinder(0.03, 0.03, 1.3, PALETTE.brown, 6);
  handle.position.y = 0.55;
  mop.add(handle);
  const head = prim.box(0.42, 0.12, 0.2, PALETTE.grey);
  head.position.y = 1.24;
  mop.add(head);
  for (let i = 0; i < 6; i++) {
    const even = i % 2 === 0;
    const strand = prim.box(0.05, 0.22, 0.05, even ? PALETTE.white : PALETTE.blue);
    strand.position.set(-0.17 + i * 0.068, 1.22, even ? -0.05 : 0.05);
    mop.add(strand);
  }
  mop.traverse((child) => {
    child.castShadow = false;
  });
  return mop;
}

interface Puddle {
  /** Centre of the puddle on the ground (x, z). */
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  /** Simulated time at which the puddle disappears. */
  readonly expiresAt: number;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  /** Unregisters the surface zone that makes the ground slippery. */
  readonly removeZone: () => void;
}

/**
 * Per-game state shared by every mop: the puddles, the spin animation and the slip checks.
 * Created once per game and cleaned up on the reset event.
 */
class MopState {
  private readonly puddles: Puddle[] = [];
  private readonly puddleGeometry = new THREE.CircleGeometry(1, 24);
  private readonly origin = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private slipTimer = 0;
  private spinTimer = 0;
  private lastToastAt = -Infinity;

  constructor(private readonly game: Game) {
    game.addSystem({
      name: 'weapon-serpillere',
      priority: 110,
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      update: (dt) => this.update(dt),
    });
    game.events.on('reset', () => this.clear());
  }

  /** Starts the full-turn spin of the player's body. */
  startSpin(): void {
    this.spinTimer = CFG.spinDuration;
  }

  /** Pushes and damages every enemy in range; the push points away from the player. */
  sweep(player: Player): void {
    const game = this.game;
    this.origin.copy(player.position).setY(player.position.y + CFG.sweepHeight);
    const found = game.physics.entitiesInSphere(
      this.origin,
      CFG.range,
      groups(Groups.ALL, Groups.ENEMY),
    );
    for (const entity of found) {
      if (entity === player.entity) continue;
      const target = game.combat.hittableOf(entity);
      if (!target || target.health.dead) continue;
      this.direction.copy(target.position).sub(player.position).setY(0);
      const distanceSq = this.direction.lengthSq();
      if (distanceSq > CFG.range * CFG.range) continue;
      if (distanceSq > 1e-6) this.direction.normalize();
      else this.direction.copy(player.forward(this.forward));
      game.combat.hit(target, {
        damage: CFG.damage,
        force: this.direction.clone().multiplyScalar(CFG.force).setY(CFG.lift),
        source: player.entity,
        kind: 'serpillere',
        stun: CFG.stun,
      });
    }
  }

  /** Leaves a slippery puddle at the given feet position, evicting the oldest if needed. */
  spawnPuddle(position: THREE.Vector3): void {
    while (this.puddles.length >= CFG.puddle.maxCount) this.removePuddleAt(0);
    const x = position.x;
    const z = position.z;
    const radius = CFG.puddle.radius;
    const expiresAt = this.game.time.elapsed + CFG.puddle.duration;
    const removeZone = this.game.surfaces.add({
      contains: (p) => Math.hypot(p.x - x, p.z - z) < radius,
      control: CFG.puddle.control,
      affects: 'enemies',
      until: expiresAt,
    });
    const material = new THREE.MeshBasicMaterial({
      color: CFG.puddle.color,
      transparent: true,
      opacity: CFG.puddle.opacity,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.puddleGeometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    mesh.scale.setScalar(radius);
    this.game.scene.add(mesh);
    this.puddles.push({ x, z, radius, expiresAt, mesh, material, removeZone });
  }

  private fixedUpdate(dt: number): void {
    this.slipTimer += dt;
    if (this.slipTimer < CFG.slip.interval) return;
    this.slipTimer = 0;
    if (this.puddles.length === 0) return;
    for (const enemy of this.game.enemies.alive) {
      if (enemy.state !== 'active') continue;
      const puddle = this.puddleAt(enemy.position);
      if (!puddle || Math.random() >= CFG.slip.chance) continue;
      this.slip(enemy, puddle);
    }
  }

  private update(dt: number): void {
    this.updateSpin(dt);
    const now = this.game.time.elapsed;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i];
      if (!puddle) continue;
      const remaining = puddle.expiresAt - now;
      if (remaining <= 0) {
        this.removePuddleAt(i);
      } else if (remaining < CFG.puddle.fadeDuration) {
        puddle.material.opacity = CFG.puddle.opacity * (remaining / CFG.puddle.fadeDuration);
      }
    }
  }

  /** Turns the body one full revolution over spinDuration, then resets it to zero. */
  private updateSpin(dt: number): void {
    if (this.spinTimer <= 0) return;
    this.spinTimer = Math.max(0, this.spinTimer - dt);
    const body = this.game.player.rig.parts.body;
    body.rotation.y =
      this.spinTimer > 0 ? (1 - this.spinTimer / CFG.spinDuration) * Math.PI * 2 : 0;
  }

  /** Returns the first puddle covering the horizontal position, or null. */
  private puddleAt(position: THREE.Vector3): Puddle | null {
    for (const puddle of this.puddles) {
      if (Math.hypot(position.x - puddle.x, position.z - puddle.z) < puddle.radius) return puddle;
    }
    return null;
  }

  /** Knocks an enemy down and slides it away from the puddle centre. */
  private slip(enemy: Enemy, puddle: Puddle): void {
    const game = this.game;
    enemy.knockOut(CFG.slip.fallDuration);
    const dir = this.direction.set(enemy.position.x - puddle.x, 0, enemy.position.z - puddle.z);
    if (dir.lengthSq() > 1e-6) dir.normalize();
    else dir.set(1, 0, 0);
    enemy.body.applyImpulse(
      { x: dir.x * CFG.slip.slideImpulse, y: 0, z: dir.z * CFG.slip.slideImpulse },
      true,
    );
    game.fx.burst({
      position: enemy.position.clone().setY(enemy.position.y + 0.1),
      color: [...CFG.splash.colors],
      count: 6,
      shape: 'ico',
      size: CFG.splash.size,
      speed: CFG.splash.speed,
      life: CFG.splash.life,
    });
    const now = game.time.elapsed;
    if (now - this.lastToastAt >= CFG.slip.toastCooldown) {
      this.lastToastAt = now;
      game.ui.toast(CFG.slip.toastText, 1.2);
    }
  }

  private removePuddleAt(index: number): void {
    const [puddle] = this.puddles.splice(index, 1);
    if (puddle) this.disposePuddle(puddle);
  }

  private disposePuddle(puddle: Puddle): void {
    puddle.removeZone();
    puddle.mesh.removeFromParent();
    puddle.material.dispose();
  }

  /** Removes every puddle and stops the spin; called on game reset. */
  private clear(): void {
    for (const puddle of this.puddles.splice(0)) this.disposePuddle(puddle);
    this.spinTimer = 0;
    this.slipTimer = 0;
    this.game.player.rig.parts.body.rotation.y = 0;
  }
}

const mopStates = new WeakMap<Game, MopState>();

/** Returns the state of a game, creating it on first use. */
function mopStateOf(game: Game): MopState {
  const existing = mopStates.get(game);
  if (existing) return existing;
  const state = new MopState(game);
  mopStates.set(game, state);
  return state;
}

/** The mop: sweeps all around the player and leaves slippery puddles for enemies. */
class Serpillere extends BaseWeapon {
  private readyAt = 0;

  constructor(game: Game, position: THREE.Vector3) {
    super(game, position, {
      id: 'serpillere',
      displayName: 'Serpillière',
      object: buildMop(),
      colliders: [RAPIER.ColliderDesc.cuboid(0.14, 0.7, 0.14).setTranslation(0, 0.6, 0)],
      mass: CFG.mass,
      holdMode: 'hand',
      holdOffset: new THREE.Vector3(0, -0.05, 0.02),
      holdRotation: new THREE.Euler(HOLD_ANGLE, 0, 0),
    });
    mopStateOf(game);
  }

  /** Full-circle sweep on cooldown: hit, push, puddle, spin and splash. */
  attack(ctx: WeaponContext): void {
    const { game, player } = ctx;
    const now = game.time.elapsed;
    if (now < this.readyAt) return;
    this.readyAt = now + CFG.cooldown;
    const state = mopStateOf(game);
    state.sweep(player);
    state.spawnPuddle(player.position);
    state.startSpin();
    player.rig.trigger('swing', CFG.spinDuration);
    game.fx.burst({
      position: player.position.clone().setY(player.position.y + 0.5),
      color: [...CFG.splash.colors],
      count: CFG.splash.count,
      shape: 'ico',
      size: CFG.splash.size,
      speed: CFG.splash.speed,
      life: CFG.splash.life,
    });
  }
}

export default defineFeature({
  id: 'weapon-serpillere',
  register(registry) {
    registry.registerWeapon({
      id: 'serpillere',
      displayName: 'Serpillière',
      create: (game, position) => new Serpillere(game, position),
    });
  },
  setup(game) {
    mopStateOf(game);
  },
});
