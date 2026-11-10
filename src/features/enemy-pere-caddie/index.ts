import * as THREE from 'three';
import { BaseEnemy, DEFAULT_ENEMY_STATS, type EnemyStats } from '../../core/enemies';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { createTextSprite } from '../../core/nameTag';
import type { HitInfo } from '../../core/types';
import { PushCart, runawayCartsOf } from './cart';
import { GILBERT } from './config';
import { addBigMoustache, gilbertLook } from './visuals';

/** Stats of one Gilbert. Copied per instance because his speed changes with his mood. */
function gilbertStats(): EnemyStats {
  return { ...DEFAULT_ENEMY_STATS, ...GILBERT.stats, speed: GILBERT.ai.wanderSpeed };
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Tonton Gilbert: a fragile barbecue dad who pushes a shopping cart. When the player gets
 * close he panics, zigzags through the aisles and shouts. Hitting him makes him let go of
 * the cart, which then rolls on as a runaway that hurts whoever it crosses.
 */
class TontonGilbert extends BaseEnemy {
  /** Spawn point, used as the centre of his calm wandering. */
  private readonly home: THREE.Vector3;
  private readonly cart: PushCart;
  private readonly bubble: THREE.Sprite;
  private panicking = false;
  /** Side of the zigzag: +1 or -1, flipped often. */
  private zigzagSide = 1;
  /** Simulated time before which he cannot shout again. */
  private nextShoutAt = 0;
  /** Simulated time until which the speech bubble is visible. */
  private bubbleUntil = -1;

  constructor(game: Game, spawn: THREE.Vector3) {
    super(game, GILBERT.id, GILBERT.displayName, spawn, gilbertStats(), gilbertLook());
    addBigMoustache(this.rig.parts.head);
    this.home = spawn.clone();
    this.cart = new PushCart(game, this.entity, spawn, this.facing);

    this.bubble = createTextSprite(GILBERT.shout.text, {
      background: '#e63946',
      height: 0.5,
      fontSize: 56,
    });
    this.bubble.position.set(0, this.rig.height + GILBERT.shout.offset, 0);
    this.bubble.visible = false;
    this.rig.root.add(this.bubble);
  }

  override fixedUpdate(dt: number): void {
    super.fixedUpdate(dt);
    // The cart follows him only while he is active; any other state (dead, stunned) lets go.
    if (this.state === 'active') {
      this.cart.follow(this.position, this.body.linvel(), this.facing, dt);
    } else {
      this.cart.release(this.facing);
    }
  }

  override update(dt: number): void {
    super.update(dt);
    this.bubble.visible = this.state !== 'dead' && this.game.time.elapsed < this.bubbleUntil;
  }

  /** Being hit makes him let go of the cart before the normal hit reaction. */
  override applyHit(info: HitInfo): void {
    this.cart.release(this.facing);
    super.applyHit(info);
  }

  /**
   * Picks his next goal. Panicking: a zigzag point to the side, away from the player.
   * Calm: a random point around his spawn. Cornered panic: he swings at the player.
   */
  protected override think(): void {
    const ai = GILBERT.ai;
    const player = this.game.player;
    const now = this.game.time.elapsed;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const panicking = !player.health.dead && distance < ai.panicRadius;
    this.thinkTimer = randomBetween(ai.thinkMin, ai.thinkMax);

    if (!panicking) {
      this.panicking = false;
      this.stats.speed = ai.wanderSpeed;
      this.chasingPlayer = false;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * ai.wanderRadius;
      this.goal.set(
        this.home.x + Math.cos(angle) * radius,
        0,
        this.home.z + Math.sin(angle) * radius,
      );
      this.clampGoal();
      return;
    }

    const justStarted = !this.panicking;
    this.panicking = true;
    if (now >= this.nextShoutAt && (justStarted || Math.random() < GILBERT.shout.chance)) {
      this.shout(now);
    }

    this.stats.speed = ai.panicSpeed;
    if (Math.random() < ai.flipChance) this.zigzagSide = -this.zigzagSide;
    // Unit vector pointing away from the player (random direction if he stands on them).
    const angle = distance > 0.01 ? Math.atan2(-dz, -dx) : Math.random() * Math.PI * 2;
    const awayX = Math.cos(angle);
    const awayZ = Math.sin(angle);
    const forward = Math.random() * ai.zigzagForward;
    const side = this.zigzagSide * randomBetween(ai.zigzagSideMin, ai.zigzagSideMax);
    // The lateral direction is perpendicular to the away direction: he weaves across the aisle.
    this.goal.set(
      this.position.x + awayX * forward - awayZ * side,
      0,
      this.position.z + awayZ * forward + awayX * side,
    );
    this.clampGoal();
    this.chasingPlayer = distance < ai.cornerRange;
  }

  /**
   * A held cart is removed with him. A runaway cart is left to roll on its own until its
   * lifetime ends or the reset event clears it.
   */
  override dispose(): void {
    this.cart.detach();
    this.bubble.material.map?.dispose();
    this.bubble.material.dispose();
    super.dispose();
  }

  /** Starts the speech bubble and the synthesized shout, then waits for the cooldown. */
  private shout(now: number): void {
    this.nextShoutAt = now + GILBERT.shout.cooldown;
    this.bubbleUntil = now + GILBERT.shout.duration;
    this.game.audio.tone({
      freq: GILBERT.shout.pitch,
      endFreq: GILBERT.shout.pitch * 0.6,
      type: 'triangle',
      duration: 0.3,
      volume: 0.25,
    });
  }

  /** Keeps the goal inside the arena, away from the walls. */
  private clampGoal(): void {
    const { halfWidth, halfDepth } = this.game.arena.layout;
    const margin = GILBERT.ai.arenaMargin;
    this.goal.x = clamp(this.goal.x, -halfWidth + margin, halfWidth - margin);
    this.goal.z = clamp(this.goal.z, -halfDepth + margin, halfDepth - margin);
  }
}

export default defineFeature({
  id: 'enemy-pere-caddie',
  register(registry) {
    registry.registerEnemy({
      id: GILBERT.id,
      displayName: GILBERT.displayName,
      points: GILBERT.points,
      create: (game, position) => new TontonGilbert(game, position),
    });
  },
  setup(game) {
    // Runaway carts outlive their enemy, so they are ticked here, not by the enemy.
    const runaway = runawayCartsOf(game);
    game.addSystem({
      name: 'pere-caddie:runaway-carts',
      priority: 100,
      fixedUpdate: () => runaway.tick(),
    });
    game.events.on('reset', () => runaway.clear());
  },
});
