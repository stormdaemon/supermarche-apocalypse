import * as THREE from 'three';
import type { Entity } from '../../core/ecs';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import type { Enemy } from '../../core/types';
import type { Attractor } from '../../core/world-services';
import { TELE_CONFIG as CFG, type ToneNote } from './config';
import { buildMarker, buildStand, buildTelevision } from './models';

/**
 * Where the television is in its story:
 * onStand: resting on its stand, an enemy reaching it can grab it.
 * carried: a thief runs with it toward the exit door.
 * escaped: the thief reached the door; the game over follows after a short delay.
 * over: the game over has been sent.
 * falling: dropped by the thief, dropping onto the floor next to him.
 * fallen: lying on the floor, waiting before it flies back.
 * returning: flying back onto the stand.
 */
type TvPhase = 'onStand' | 'carried' | 'escaped' | 'over' | 'falling' | 'fallen' | 'returning';

/** Smooth start and smooth stop curve in [0, 1]. */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Keeps a value inside [-limit, limit]. */
function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Game objective: the last giant TV must survive. Enemies are attracted to the stand,
 * one of them grabs the TV and runs with it to the nearest exit. Hitting the thief makes
 * him drop it; if he reaches the door, the game is over.
 *
 * The thief stays a regular enemy. While he carries the TV the feature takes over his
 * movement and visuals (visualOverride), and sets his velocity after his own AI step.
 */
class StolenTelevision {
  private readonly tv: THREE.Group;
  private readonly screen: THREE.MeshBasicMaterial;
  private readonly marker: THREE.Group;
  private readonly standCenter = new THREE.Vector3(CFG.stand.position.x, 0, CFG.stand.position.z);
  /** Where the TV rests on its stand. */
  private readonly restPosition = new THREE.Vector3(
    CFG.stand.position.x,
    CFG.stand.height + CFG.tv.height / 2,
    CFG.stand.position.z,
  );
  /** Floor spot where a dropped TV lands, reused between drops. */
  private readonly landing = new THREE.Vector3();
  /** Start and end of the current fall or flight, reused between tweens. */
  private readonly tweenFrom = new THREE.Vector3();
  private readonly tweenTo = new THREE.Vector3();
  /** Exit door the thief runs to, chosen when he grabs the TV. */
  private readonly doorTarget = new THREE.Vector3();
  /** Horizontal direction the thief runs in, reused every step. */
  private readonly carryDir = new THREE.Vector3(0, 0, 1);
  private phase: TvPhase = 'onStand';
  private carrier: Enemy | null = null;
  private attractor: Attractor | null = null;
  private tweenRotation = 0;
  private tweenTime = 0;
  private tweenLength = 0;
  /** Seconds left in the current hold: the TV lying on the floor, or the escape delay. */
  private timer = 0;
  private sparkleTimer = 0;

  constructor(private readonly game: Game) {
    game.scene.add(buildStand());
    // Static collider so enemies and the player cannot walk through the stand.
    game.physics.addStaticBox(
      new THREE.Vector3(CFG.stand.position.x, CFG.stand.height / 2, CFG.stand.position.z),
      new THREE.Vector3(CFG.stand.width / 2, CFG.stand.height / 2, CFG.stand.depth / 2),
    );
    const model = buildTelevision();
    this.tv = model.root;
    this.screen = model.screen;
    this.marker = buildMarker();
    game.scene.add(this.tv, this.marker);
    this.placeOnStand();
    this.attractor = game.ai.addAttractor(this.standCenter, Infinity, CFG.attractor.pull);

    game.events.on('hit', ({ target }) => this.dropIfCarrier(target));
    game.events.on('death', ({ entity }) => this.dropIfCarrier(entity));
    game.events.on('knockout', ({ entity }) => this.dropIfCarrier(entity));
    game.events.on('reset', () => this.reset());
    game.addSystem({
      name: 'objective-tele',
      priority: 150,
      fixedUpdate: () => this.fixedUpdate(),
      update: (dt) => this.update(dt),
    });
  }

  /** Physics step: grabs, steers the thief and detects the escape. Runs after the enemy AI. */
  private fixedUpdate(): void {
    if (this.phase === 'onStand') this.findThief();
    else if (this.phase === 'carried') this.steerThief();
    else if (this.phase === 'escaped' || this.phase === 'over') this.holdThief();
  }

  /** Frame update: moves the TV and the marker, runs the fall, flight and escape timers. */
  private update(dt: number): void {
    this.animateScreen();
    switch (this.phase) {
      case 'onStand':
        break;
      case 'carried':
        this.followCarrier(dt, CFG.carry.speed);
        break;
      case 'escaped':
        this.followCarrier(dt, 0);
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'over';
          this.game.gameOver();
        }
        break;
      case 'over':
        this.followCarrier(dt, 0);
        break;
      case 'falling':
        this.updateFall(dt);
        break;
      case 'fallen':
        this.timer -= dt;
        if (this.timer <= 0) this.startTween('returning', this.restPosition, CFG.flight.duration);
        break;
      case 'returning':
        this.updateFlight(dt);
        break;
    }
    if (this.marker.visible) this.updateMarker();
  }

  /** Looks for an enemy close enough to the stand to grab the TV. */
  private findThief(): void {
    const radiusSq = CFG.grab.radius * CFG.grab.radius;
    for (const enemy of this.game.enemies.alive) {
      if (enemy.state !== 'active' || CFG.grab.excludedTypeIds.includes(enemy.typeId)) continue;
      const dx = enemy.position.x - this.standCenter.x;
      const dz = enemy.position.z - this.standCenter.z;
      if (dx * dx + dz * dz > radiusSq) continue;
      this.grab(enemy);
      return;
    }
  }

  private grab(enemy: Enemy): void {
    const door = this.nearestDoor(enemy.position);
    if (!door) return;
    this.doorTarget.copy(door);
    this.carrier = enemy;
    this.phase = 'carried';
    // From now on the feature poses the thief and drives his velocity.
    enemy.visualOverride = true;
    this.marker.visible = true;
    this.game.ui.toast(CFG.texts.thiefAlert, CFG.alert.duration);
    playNotes(this.game, CFG.audio.grab);
  }

  /** Sets the thief's horizontal velocity toward the door, overriding his own AI for this step. */
  private steerThief(): void {
    const carrier = this.carrier;
    if (!carrier) return;
    if (carrier.state === 'dead') {
      this.drop();
      return;
    }
    const t = carrier.body.translation();
    const v = carrier.body.linvel();
    const dx = this.doorTarget.x - t.x;
    const dz = this.doorTarget.z - t.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= CFG.exit.radius) {
      this.escape(carrier);
      return;
    }
    this.carryDir.set(dx / distance, 0, dz / distance);
    carrier.body.setLinvel(
      { x: this.carryDir.x * CFG.carry.speed, y: v.y, z: this.carryDir.z * CFG.carry.speed },
      true,
    );
  }

  private escape(carrier: Enemy): void {
    this.phase = 'escaped';
    this.timer = CFG.exit.endingDelay;
    this.game.ui.toast(CFG.texts.escaped, CFG.exit.endingDelay);
    this.game.audio.noise(CFG.audio.escapeNoise);
    this.holdThiefAt(carrier);
  }

  /** Stops the thief in place while he is at the door (the game over is pending). */
  private holdThief(): void {
    const carrier = this.carrier;
    if (carrier && carrier.state !== 'dead') this.holdThiefAt(carrier);
  }

  private holdThiefAt(carrier: Enemy): void {
    const v = carrier.body.linvel();
    carrier.body.setLinvel({ x: 0, y: v.y, z: 0 }, true);
  }

  /** The thief is hit or knocked out or dies: he lets go of the TV. */
  private dropIfCarrier(entity: Entity): void {
    if (this.carrier && entity === this.carrier.entity) this.drop();
  }

  private drop(): void {
    const carrier = this.carrier;
    if (this.phase !== 'carried' || !carrier) return;
    // Hands the thief back to his own AI.
    carrier.visualOverride = false;
    this.carrier = null;
    this.marker.visible = false;

    const { halfWidth, halfDepth } = this.game.arena.layout;
    const margin = CFG.landingMargin;
    this.landing.set(
      clamp(carrier.position.x + CFG.drop.sideOffset, halfWidth - margin),
      CFG.tv.height / 2,
      clamp(carrier.position.z, halfDepth - margin),
    );
    this.startTween('falling', this.landing, CFG.drop.fallDuration);
    this.sparkle(CFG.sparkle.dropCount, carrier.position);
    playNotes(this.game, CFG.audio.drop);
  }

  /** Keeps the TV above the head of the thief and poses him while he carries it. */
  private followCarrier(dt: number, speed: number): void {
    const carrier = this.carrier;
    if (!carrier) return;
    const rig = carrier.rig;
    const root = rig.root;
    if (carrier.state === 'dead') {
      // Let the death animation play out.
      carrier.visualOverride = false;
    } else {
      root.rotation.set(0, Math.atan2(this.carryDir.x, this.carryDir.z), 0);
      rig.animate(dt, speed);
      rig.parts.armL.rotation.set(-2.6, 0, 0.35);
      rig.parts.armR.rotation.set(-2.6, 0, -0.35);
    }
    this.tv.position.set(
      root.position.x,
      root.position.y + rig.height + CFG.carry.gap + CFG.tv.height / 2,
      root.position.z,
    );
    this.tv.rotation.y = root.rotation.y + Math.PI;
  }

  /** Advances the fall: the TV accelerates down to the floor. */
  private updateFall(dt: number): void {
    const p = this.advance(dt);
    this.tv.position.lerpVectors(this.tweenFrom, this.tweenTo, p * p);
    this.tv.rotation.y = this.tweenRotation * (1 - p);
    if (p >= 1) {
      this.phase = 'fallen';
      this.timer = CFG.drop.delay;
    }
  }

  /** Advances the flight back to the stand along a parabola, with sparkles. */
  private updateFlight(dt: number): void {
    const p = this.advance(dt);
    const s = smoothstep(p);
    this.tv.position.lerpVectors(this.tweenFrom, this.tweenTo, s);
    this.tv.position.y += Math.sin(Math.PI * p) * CFG.flight.arcHeight;
    this.tv.rotation.y = this.tweenRotation * (1 - s);

    this.sparkleTimer -= dt;
    if (this.sparkleTimer <= 0) {
      this.sparkleTimer = CFG.flight.sparkleInterval;
      this.sparkle(CFG.sparkle.dropCount / 2, this.tv.position);
    }
    if (p >= 1) {
      this.placeOnStand();
      this.phase = 'onStand';
      this.sparkle(CFG.sparkle.dropCount * 2, this.tv.position);
      this.game.ui.toast(CFG.texts.returned, CFG.alert.duration);
      playNotes(this.game, CFG.audio.returned);
    }
  }

  /** Starts a tween from the current TV transform. */
  private startTween(phase: TvPhase, to: THREE.Vector3, length: number): void {
    this.phase = phase;
    this.tweenFrom.copy(this.tv.position);
    this.tweenTo.copy(to);
    this.tweenRotation = this.tv.rotation.y;
    this.tweenTime = 0;
    this.tweenLength = length;
  }

  /** Advances the running tween and returns its progress in [0, 1]. */
  private advance(dt: number): number {
    this.tweenTime = Math.min(this.tweenTime + dt, this.tweenLength);
    return this.tweenLength > 0 ? this.tweenTime / this.tweenLength : 1;
  }

  private placeOnStand(): void {
    this.tv.position.copy(this.restPosition);
    this.tv.rotation.set(0, 0, 0);
  }

  /** Red marker bobbing above the TV while it is carried. */
  private updateMarker(): void {
    const bob =
      Math.sin(this.game.time.realElapsed * CFG.carry.markerBobSpeed) * CFG.carry.markerBob;
    this.marker.position.set(
      this.tv.position.x,
      this.tv.position.y + CFG.tv.height / 2 + CFG.carry.markerGap + bob,
      this.tv.position.z,
    );
  }

  /** Cycles the hue of the glowing screen with real time, so it keeps moving while paused. */
  private animateScreen(): void {
    const hue = (this.game.time.realElapsed * CFG.tv.hueSpeed) % 1;
    this.screen.color.setHSL(hue, 1, CFG.tv.screenLightness);
  }

  private sparkle(count: number, position: THREE.Vector3): void {
    this.game.fx.burst({
      position,
      color: [...CFG.sparkle.colors],
      count,
      speed: CFG.sparkle.speed,
      size: CFG.sparkle.size,
      life: CFG.sparkle.life,
      gravity: CFG.sparkle.gravity,
      shape: 'ico',
    });
  }

  /** Closest exit door to the given position, or null when the arena has no door. */
  private nearestDoor(from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDistanceSq = Infinity;
    for (const door of this.game.arena.layout.doors) {
      const dx = door.x - from.x;
      const dz = door.z - from.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq < bestDistanceSq) {
        bestDistanceSq = distanceSq;
        best = door;
      }
    }
    return best;
  }

  /** Back to the start of a run: TV on its stand, no thief, attractor re-added. */
  private reset(): void {
    if (this.carrier) this.carrier.visualOverride = false;
    this.carrier = null;
    this.phase = 'onStand';
    this.timer = 0;
    this.tweenTime = 0;
    this.sparkleTimer = 0;
    this.marker.visible = false;
    this.placeOnStand();
    // The core clears the AI director before this event, so the old attractor is only a safety.
    if (this.attractor) this.game.ai.removeAttractor(this.attractor);
    this.attractor = this.game.ai.addAttractor(this.standCenter, Infinity, CFG.attractor.pull);
  }
}

/** Plays a sequence of synthesized notes. */
function playNotes(game: Game, notes: readonly ToneNote[]): void {
  for (const note of notes) game.audio.tone(note);
}

export default defineFeature({
  id: 'objective-tele',
  setup(game) {
    new StolenTelevision(game);
  },
});
