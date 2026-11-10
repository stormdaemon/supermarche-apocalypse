import * as THREE from 'three';
import type { CharacterOptions } from '../../core/characterFactory';
import { BaseEnemy, DEFAULT_ENEMY_STATS } from '../../core/enemies';
import type { Game } from '../../core/game';
import { PALETTE, prim } from '../../core/materials';
import { Groups, groups } from '../../core/physics';
import type { Entity } from '../../core/ecs';
import type { HitInfo } from '../../core/types';
import { BOSS_CONFIG, VIGILE_NAME } from './config';
import { BossHealthBar } from './hud';
import { buildTalkie } from './models';
import { runtimeOf, type BossRuntime } from './runtime';

const TAU = Math.PI * 2;

/** Look of the boss: navy security uniform, black cap and a big torso. The mask is added below. */
const VIGILE_LOOK: CharacterOptions = {
  skin: PALETTE.skin[3],
  shirt: 0x1d3557,
  pants: PALETTE.black,
  shoes: PALETTE.black,
  hairStyle: 'none',
  accessories: ['cap', 'badge'],
  accessoryColor: PALETTE.black,
  girth: 1.6,
};

/** Wrestling mask made of primitives: a red band over the forehead and two cheek plates, eyes left free. */
function buildWrestlingMask(): THREE.Group {
  const mask = new THREE.Group();
  const band = prim.box(0.44, 0.12, 0.44, PALETTE.red);
  band.position.y = 0.37;
  mask.add(band);
  for (const side of [-1, 1]) {
    const cheek = prim.box(0.08, 0.22, 0.05, PALETTE.red);
    cheek.position.set(0.19 * side, 0.2, 0.2);
    mask.add(cheek);
  }
  return mask;
}

/**
 * Mohamed Le Mur, the mini-boss. Chases the player like any enemy, uses the tourniquet
 * grab when close, calls caissières on his walkie-talkie, panics once the talkie is
 * stolen, and runs to the nearest door when defeated.
 */
export class VigileBoss extends BaseEnemy {
  private readonly runtime: BossRuntime;
  private readonly bar: BossHealthBar;
  private readonly hint: HTMLDivElement;
  /** Distance between the body center and the feet, used to convert physics positions. */
  private readonly bodyOffset: number;
  private readonly scratchA = new THREE.Vector3();
  private readonly scratchB = new THREE.Vector3();
  private readonly fleeTarget = new THREE.Vector3();
  /** Walkie-talkie held in the right hand, or null once it has been stolen. */
  private talkie: THREE.Group | null;
  private panicking = false;
  private callTimer: number = BOSS_CONFIG.talkie.firstCallDelay;
  private grabCooldown: number = BOSS_CONFIG.grab.cooldown;
  /** Active tourniquet: remaining spin time and current spin angle. */
  private grab: { timer: number; angle: number } | null = null;
  private fleeing = false;
  /** Slowly turning yaw of the boss. Hits from behind are judged against it. */
  private heading = 0;

  constructor(game: Game, spawn: THREE.Vector3) {
    super(
      game,
      'vigile',
      VIGILE_NAME,
      spawn,
      { ...DEFAULT_ENEMY_STATS, ...BOSS_CONFIG.vigile.stats },
      VIGILE_LOOK,
    );
    this.runtime = runtimeOf(game);
    this.bodyOffset = (this.stats.halfHeight + this.stats.radius) * this.stats.scale;
    // The bar carries his name, so the overhead name tag is hidden.
    this.nameTag.visible = false;
    this.rig.parts.head.add(buildWrestlingMask());
    const talkie = buildTalkie();
    talkie.position.set(0, -0.12, 0.1);
    this.rig.parts.handR.add(talkie);
    this.talkie = talkie;
    this.bar = new BossHealthBar(game.ui, VIGILE_NAME);
    this.hint = game.ui.add('bottom-center', 'interact-hint', BOSS_CONFIG.texts.stealHint);
    this.hint.style.display = 'none';
    this.heading = this.facing;
  }

  override fixedUpdate(dt: number): void {
    if (this.state === 'dead') {
      this.fleeStep(dt);
      return;
    }
    this.bar.setRatio(this.health.ratio);

    // The steal prompt and the E press are handled here, before the AI runs.
    const canSteal = this.canSteal();
    this.hint.style.display = canSteal ? '' : 'none';
    if (canSteal && this.game.input.pressed('interact')) {
      this.stealTalkie(null);
      this.hint.style.display = 'none';
    }

    if (this.grab) {
      this.grabStep(dt);
      return;
    }
    this.grabCooldown -= dt;
    if (this.talkie && this.state === 'active') {
      this.callTimer -= dt;
      if (this.callTimer <= 0) this.callReinforcements();
    }
    super.fixedUpdate(dt);
    this.turnTowardsPlayer(dt);
  }

  override update(dt: number): void {
    if (this.fleeing && !this.visualOverride) {
      // Running away upright; the body is locked in rotation so only its position matters.
      const t = this.body.translation();
      this.rig.root.position.set(t.x, t.y - this.bodyOffset, t.z);
      this.rig.root.rotation.y = this.facing;
      this.rig.animate(dt, BOSS_CONFIG.flee.speed);
      return;
    }
    super.update(dt);
  }

  override applyHit(info: HitInfo): void {
    super.applyHit(info);
    if (this.state === 'dead' || !this.talkie) return;
    if (this.isPlayerAttack(info.source) && this.playerIsBehind()) this.stealTalkie(info.force);
  }

  override dispose(): void {
    this.bar.remove();
    this.hint.remove();
    super.dispose();
  }

  /** Chasing, or erratic wandering once he panics (he then chases the player only sometimes). */
  protected override think(): void {
    if (!this.panicking) {
      super.think();
      return;
    }
    const cfg = BOSS_CONFIG.panic;
    if (Math.random() < cfg.chaseChance) {
      this.goal.copy(this.game.player.position);
      this.chasingPlayer = true;
      return;
    }
    const angle = Math.random() * TAU;
    this.goal.set(
      this.position.x + Math.sin(angle) * cfg.wanderRadius,
      0,
      this.position.z + Math.cos(angle) * cfg.wanderRadius,
    );
    this.chasingPlayer = false;
  }

  /** Grabs the player with the tourniquet when close and the grab cooldown is over; otherwise a normal punch. */
  protected override performAttack(): void {
    const player = this.game.player;
    const close = this.position.distanceTo(player.position) <= this.stats.attackRange + 0.4;
    if (this.grabCooldown <= 0 && close && !player.health.dead) {
      this.startGrab();
      return;
    }
    super.performAttack();
  }

  /** Cartoon defeat replaced by a retreat: the boss runs to the nearest door and vanishes there. */
  protected override die(): void {
    if (this.state === 'dead') return;
    this.releaseGrab(false);
    this.state = 'dead';
    this.fleeing = true;
    this.deathTimer = BOSS_CONFIG.flee.maxDuration;
    this.fleeTarget.copy(this.runtime.nearestDoor(this.position));
    this.collider.setCollisionGroups(groups(Groups.RAGDOLL, Groups.STATIC | Groups.PROP));
    this.bar.remove();
    this.hint.style.display = 'none';
    this.rig.trigger('hurt', 0.4);
    this.game.ui.toast(BOSS_CONFIG.texts.returns, 2.5);
  }

  /** Turns the boss slowly towards the player; the result is the facing used by the rig and the back check. */
  private turnTowardsPlayer(dt: number): void {
    const p = this.game.player.position;
    const dx = p.x - this.position.x;
    const dz = p.z - this.position.z;
    if (dx * dx + dz * dz > 0.01) {
      let delta = Math.atan2(dx, dz) - this.heading;
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      const step = BOSS_CONFIG.vigile.turnSpeed * dt;
      this.heading += Math.max(-step, Math.min(step, delta));
    }
    this.facing = this.heading;
  }

  /** True when a hit comes from the player: the player itself or the weapon he holds. */
  private isPlayerAttack(source: Entity | null | undefined): boolean {
    if (!source) return false;
    if (source === this.game.player.entity) return true;
    const held = this.game.weapons.held;
    return held !== null && source === held.entity;
  }

  /** True when the player stands behind the boss, relative to where he is turned. */
  private playerIsBehind(): boolean {
    const p = this.game.player.position;
    const toPlayer = this.scratchA.set(p.x - this.position.x, 0, p.z - this.position.z);
    if (toPlayer.lengthSq() < 1e-6) return false;
    toPlayer.normalize();
    const forward = this.scratchB.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    return forward.dot(toPlayer) < BOSS_CONFIG.vigile.behindThreshold;
  }

  /** The talkie can be stolen when the player is close, with no weapon in reach (E is shared with pickups). */
  private canSteal(): boolean {
    if (!this.talkie || this.grab || this.state === 'dead') return false;
    const weapons = this.game.weapons;
    if (weapons.held || weapons.nearest) return false;
    const player = this.game.player;
    if (player.health.dead) return false;
    const dx = player.position.x - this.position.x;
    const dz = player.position.z - this.position.z;
    const reach = BOSS_CONFIG.talkie.reach;
    return dx * dx + dz * dz < reach * reach;
  }

  /** Knocks the talkie off his hand as a physics prop and starts the panic. */
  private stealTalkie(push: THREE.Vector3 | null): void {
    const talkie = this.talkie;
    if (!talkie) return;
    const cfg = BOSS_CONFIG.talkie;
    const origin = talkie.getWorldPosition(new THREE.Vector3());
    talkie.removeFromParent();
    this.talkie = null;

    const angle = push ? Math.atan2(push.x, push.z) : Math.random() * TAU;
    const impulse = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(
      cfg.kickSpeed,
    );
    impulse.y = cfg.kickLift;
    this.runtime.spawnTalkieProp(origin, impulse);

    this.panicking = true;
    this.stats.speed = BOSS_CONFIG.vigile.stats.speed * BOSS_CONFIG.panic.speedFactor;
    this.stats.attackCooldown =
      BOSS_CONFIG.vigile.stats.attackCooldown * BOSS_CONFIG.panic.attackCooldownFactor;
    this.rig.trigger('hurt', 0.4);
    this.game.fx.burst({
      position: origin,
      color: [PALETTE.black, PALETTE.red],
      count: 10,
      speed: 3,
      size: 0.12,
      shape: 'ico',
    });
    this.game.audio.tone({ freq: 880, endFreq: 260, type: 'square', duration: 0.3 });
    this.game.ui.toast(BOSS_CONFIG.texts.talkieLost, 2.2);
  }

  /** Calls caissières on the walkie-talkie. Only happens while he still holds it. */
  private callReinforcements(): void {
    const cfg = BOSS_CONFIG.talkie;
    this.callTimer = cfg.callCooldown;
    const count = cfg.callMin + Math.floor(Math.random() * (cfg.callMax - cfg.callMin + 1));
    this.runtime.callReinforcements(count);
    this.rig.trigger('cheer', 0.8);
    this.game.audio.tone({ freq: 1500, endFreq: 1700, type: 'square', duration: 0.1 });
    this.game.audio.tone({ freq: 1500, endFreq: 1700, type: 'square', duration: 0.1, delay: 0.15 });
    this.game.ui.toast(BOSS_CONFIG.texts.reinforcements, 2.2);
  }

  /** Starts the tourniquet: the player is caught and will spin around the boss. */
  private startGrab(): void {
    const cfg = BOSS_CONFIG.grab;
    this.grab = { timer: cfg.spinDuration, angle: this.heading };
    this.rig.trigger('cheer', cfg.rampDuration);
    this.game.ui.toast(BOSS_CONFIG.texts.grabShout, cfg.spinDuration);
    this.game.audio.tone({ freq: 160, endFreq: 90, type: 'sawtooth', duration: 0.3 });
    this.game.audio.noise({ duration: 0.25, volume: 0.5, filterFreq: 800 });
  }

  /** Each fixed step while spinning: the player orbits in the air and the boss turns with him. */
  private grabStep(dt: number): void {
    const grab = this.grab;
    if (!grab) return;
    const cfg = BOSS_CONFIG.grab;
    const player = this.game.player;
    grab.timer -= dt;
    grab.angle += cfg.spinSpeed * dt;
    this.heading = grab.angle;
    this.facing = grab.angle;

    const t = this.body.translation();
    const feetY = t.y - this.bodyOffset;
    this.position.set(t.x, feetY, t.z);
    const ramp = Math.min(1, (cfg.spinDuration - grab.timer) / cfg.rampDuration);
    const lift = cfg.liftHeight * ramp;
    player.teleport(
      this.scratchA.set(
        t.x + Math.sin(grab.angle) * cfg.orbitRadius,
        feetY + lift,
        t.z + Math.cos(grab.angle) * cfg.orbitRadius,
      ),
    );
    player.lockControl(0.15);
    // The boss plants his feet while he spins.
    const v = this.body.linvel();
    this.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);

    if (grab.timer <= 0) this.releaseGrab(true);
  }

  /** Ends the tourniquet and throws the player in a random direction, with damage when hurt is true. */
  private releaseGrab(hurt: boolean): void {
    if (!this.grab) return;
    this.grab = null;
    const cfg = BOSS_CONFIG.grab;
    const player = this.game.player;
    this.grabCooldown = cfg.cooldown * (this.panicking ? cfg.panicCooldownFactor : 1);

    // Launch direction is random; the speed is a flying hit (m/s), see BOSS_CONFIG.grab.releaseSpeed.
    const angle = Math.random() * TAU;
    const launch = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(
      cfg.releaseSpeed,
    );
    launch.y = cfg.releaseLift;
    if (hurt && !player.health.dead) {
      const applied = this.game.combat.hit(player, {
        damage: cfg.damage,
        force: launch.clone(),
        source: this.entity,
        kind: 'tourniquet',
        stun: cfg.stun,
      });
      // The hit already gives the player its share of the force; top up the rest so the launch totals releaseSpeed.
      player.applyImpulse(launch.clone().multiplyScalar(applied ? 1 - cfg.playerHitShare : 1));
    } else {
      player.applyImpulse(launch.clone().multiplyScalar(0.4));
    }
    this.rig.trigger('attack', 0.3);
    this.game.fx.burst({
      position: player.position.clone().setY(player.position.y + 0.9),
      color: [PALETTE.yellow, PALETTE.white],
      count: 18,
      shape: 'ico',
      speed: 5,
    });
    this.game.cameraRig.addTrauma(0.5);
    this.game.audio.tone({ freq: 220, endFreq: 60, type: 'sawtooth', duration: 0.35 });
  }

  /** Each fixed step while fleeing: runs towards the door, then gives up the fight for good. */
  private fleeStep(dt: number): void {
    this.deathTimer -= dt;
    if (!this.fleeing) return;
    const t = this.body.translation();
    this.position.set(t.x, t.y - this.bodyOffset, t.z);
    const cfg = BOSS_CONFIG.flee;
    const toDoor = this.scratchA.copy(this.fleeTarget).sub(this.position).setY(0);
    const distance = toDoor.length();
    if (distance < cfg.arrivalDistance || this.deathTimer <= 0) {
      // Reached the door (or ran out of time): the enemy manager removes him now.
      this.deathTimer = 0;
      return;
    }
    toDoor.multiplyScalar(1 / distance);
    const v = this.body.linvel();
    this.body.setLinvel({ x: toDoor.x * cfg.speed, y: v.y, z: toDoor.z * cfg.speed }, true);
    this.heading = Math.atan2(toDoor.x, toDoor.z);
    this.facing = this.heading;
  }
}
