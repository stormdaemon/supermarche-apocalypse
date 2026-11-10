import * as THREE from 'three';
import { CORE_CONFIG } from '../../core/config';
import { defineFeature } from '../../core/feature';
import type { Game } from '../../core/game';
import { Entity } from '../../core/ecs';
import { PALETTE, prim } from '../../core/materials';
import { createTextSprite } from '../../core/nameTag';
import { Groups, groups, RAPIER } from '../../core/physics';
import { EnemyC, PlayerTag, type Hittable, type Trap, type TrapDefinition } from '../../core/types';
import { PYRAMID_CONFIG } from './config';

const JAR = PYRAMID_CONFIG.jar;
const JAR_TAG = 'pyramid-jar';
const GLASS_TINT = 0xbff0cc;
const LID_COLOR = 0xc9a227;
const PICKLE_COLOR = 0x4f9d2d;
const SHARD_COLORS = [0xd8fff0, 0x9be5b0, PICKLE_COLOR];
const SPARKLE_COLORS = [0xfff3a0, 0xffffff, 0x9bff9b];
/** Pickle positions inside a jar: x, z and a yaw so they do not look copy-pasted. */
const PICKLE_SPOTS: readonly [number, number, number][] = [
  [-0.09, 0.04, 0.3],
  [0.1, -0.05, -0.4],
];

// Shared geometry and materials: built once, reused by every jar and puddle, never disposed.
const glassGeometry = new THREE.CylinderGeometry(JAR.radius, JAR.radius, JAR.height, 12);
const glassMaterial = new THREE.MeshLambertMaterial({
  color: GLASS_TINT,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
const puddleGeometry = new THREE.CircleGeometry(1, 20);
const puddleMaterial = new THREE.MeshBasicMaterial({
  color: 0xa6f0d0,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
});

interface JarSlot {
  x: number;
  y: number;
  z: number;
}

/** Jar centres relative to the tower base, bottom layer first. Stacks up to the arena ceiling. */
function computeSlots(): JarSlot[] {
  const pitch = JAR.radius * 2 + JAR.gap;
  const layerHeight = JAR.height + JAR.gap;
  const layerCount = Math.max(
    1,
    Math.floor((CORE_CONFIG.arena.wallHeight - JAR.ceilingMargin) / layerHeight),
  );
  const slots: JarSlot[] = [];
  for (let layer = 0; layer < layerCount; layer++) {
    const side = Math.max(1, JAR.baseSide - Math.floor(layer / JAR.layersPerStep));
    const offset = (side - 1) / 2;
    const y = JAR.height / 2 + layer * layerHeight;
    for (let i = 0; i < side; i++) {
      for (let j = 0; j < side; j++) {
        slots.push({ x: (i - offset) * pitch, y, z: (j - offset) * pitch });
      }
    }
  }
  return slots;
}

const SLOTS = computeSlots();
const TOP_Y = Math.max(...SLOTS.map((slot) => slot.y));

/** One glass jar with its lid and pickles, as a group centred on the jar body. */
function buildJarMesh(): THREE.Group {
  const group = new THREE.Group();
  const glass = new THREE.Mesh(glassGeometry, glassMaterial);
  glass.castShadow = false;
  const lid = prim.cylinder(JAR.radius * 1.05, JAR.radius * 1.05, 0.08, LID_COLOR, 12);
  lid.position.y = JAR.height / 2 - 0.04;
  group.add(glass, lid);
  for (const [x, z, yaw] of PICKLE_SPOTS) {
    const pickle = prim.cylinder(0.07, 0.07, 0.24, PICKLE_COLOR, 6);
    pickle.position.set(x, -0.03, z);
    pickle.rotation.set(0.1, yaw, 0.1);
    group.add(pickle);
  }
  return group;
}

type TowerState = 'standing' | 'fallen';

interface Jar {
  entity: Entity;
  body: RAPIER.RigidBody;
  group: THREE.Group;
  /** Height of the jar in the untouched tower, used to shape the topple. */
  baseY: number;
}

interface Puddle {
  mesh: THREE.Mesh;
  until: number;
  release: () => void;
}

/**
 * A tower of glass pickle jars. Any impact makes it fall: the jars knock out everyone
 * underneath, shatter on hard impacts and leave slippery puddles. Later the jars are
 * re-stacked by magic.
 */
class PyramidTower implements Trap {
  readonly entity = new Entity('trap-pyramide-conserves');
  private readonly jars: Jar[] = [];
  private readonly puddles: Puddle[] = [];
  private readonly pendingBreaks: Jar[] = [];
  private readonly lastHitAt = new Map<Entity, number>();
  private readonly center = new THREE.Vector3();
  private readonly sign: THREE.Group;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private state: TowerState = 'standing';
  private rebuildTimer = 0;
  private shadowTimer = 0;
  private graceUntil: number;
  private lastShatterAt = -Infinity;

  constructor(
    private readonly game: Game,
    position: THREE.Vector3,
    rotationY: number,
  ) {
    this.center.set(position.x, 0, position.z);
    this.sign = this.buildSign(rotationY);
    this.spawnJars();
    this.graceUntil = game.time.elapsed + PYRAMID_CONFIG.collapse.rebuildGrace;
  }

  /** Breaks the jars flagged during the last physics step and ages the puddles. */
  fixedUpdate(dt: number): void {
    // Jars are removed here, never inside Rapier's contact dispatch.
    if (this.pendingBreaks.length > 0) {
      for (const jar of this.pendingBreaks.splice(0)) this.breakJar(jar);
    }
    this.updatePuddles();
    if (this.state === 'fallen') {
      // The fallen jars move, so the static shadow map is refreshed regularly.
      this.shadowTimer -= dt;
      if (this.shadowTimer <= 0) {
        this.shadowTimer = PYRAMID_CONFIG.collapse.shadowRefreshInterval;
        this.game.invalidateShadows();
      }
      this.rebuildTimer -= dt;
      if (this.rebuildTimer <= 0) this.rebuild();
    }
  }

  dispose(): void {
    for (const jar of this.jars) this.removeJar(jar);
    this.jars.length = 0;
    for (const puddle of this.puddles) {
      puddle.release();
      this.game.scene.remove(puddle.mesh);
    }
    this.puddles.length = 0;
    this.game.scene.remove(this.sign);
    this.pendingBreaks.length = 0;
    this.lastHitAt.clear();
  }

  private buildSign(rotationY: number): THREE.Group {
    const cfg = PYRAMID_CONFIG.sign;
    const sign = new THREE.Group();
    const post = prim.box(0.12, 1.6, 0.12, PALETTE.darkGrey);
    post.position.y = 0.8;
    const board = prim.box(cfg.boardWidth, 0.8, 0.1, PALETTE.black);
    board.position.y = 2;
    const label = createTextSprite(cfg.text, {
      color: '#ffe066',
      height: cfg.labelHeight,
      fontSize: 56,
    });
    label.position.set(0, 2, 0.12);
    sign.add(post, board, label);
    // The sign stands in front of the tower, on the side given by rotationY.
    sign.position.set(
      this.center.x + Math.sin(rotationY) * cfg.offset,
      0,
      this.center.z + Math.cos(rotationY) * cfg.offset,
    );
    sign.rotation.y = rotationY;
    this.game.scene.add(sign);
    return sign;
  }

  /** Creates one dynamic body per jar, in the stacked position. */
  private spawnJars(): void {
    const { physics, world, scene } = this.game;
    for (const slot of SLOTS) {
      const entity = new Entity('pyramid-jar');
      entity.tags.add(JAR_TAG);
      const x = this.center.x + slot.x;
      const z = this.center.z + slot.z;
      const body = physics.createBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, slot.y, z).setCcdEnabled(true),
        [
          RAPIER.ColliderDesc.cylinder(JAR.height / 2, JAR.radius)
            .setMass(JAR.mass)
            .setFriction(0.6)
            .setRestitution(0.05)
            .setCollisionGroups(groups(Groups.PROP)),
        ],
        entity,
      );
      const group = buildJarMesh();
      group.position.set(x, slot.y, z);
      scene.add(group);
      world.add(entity);
      physics.bind(entity, body, group);
      const jar: Jar = { entity, body, group, baseY: slot.y };
      physics.onContact(body.collider(0), (other, started) =>
        this.onJarContact(jar, other, started),
      );
      this.jars.push(jar);
    }
  }

  private removeJar(jar: Jar): void {
    this.game.world.remove(jar.entity);
    this.game.scene.remove(jar.group);
  }

  private onJarContact(jar: Jar, other: RAPIER.Collider, started: boolean): void {
    if (!started) return;
    const { game } = this;
    const owner = game.physics.ownerOf(other);
    const speed = this.impactSpeed(jar, other, owner);
    if (speed >= PYRAMID_CONFIG.impact.breakSpeed && !this.pendingBreaks.includes(jar)) {
      this.pendingBreaks.push(jar);
    }
    // Impacts between jars of the same tower never count as outside impacts.
    if (owner?.tags.has(JAR_TAG)) return;

    const target = owner ? game.combat.hittableOf(owner) : null;
    if (owner && target && speed >= PYRAMID_CONFIG.impact.minDamageSpeed) {
      this.hurtCharacter(owner, target, jar);
    }
    // Any outside impact (character, runaway cart, thrown object) makes the tower fall.
    if (this.state === 'standing' && owner && game.time.elapsed >= this.graceUntil) {
      const body = jar.body.translation();
      this.collapse(this.tmpA.set(body.x, body.y, body.z));
    }
  }

  /** Relative speed between a jar and whatever it touched. */
  private impactSpeed(jar: Jar, other: RAPIER.Collider, owner: Entity | undefined): number {
    const v = jar.body.linvel();
    this.tmpA.set(v.x, v.y, v.z);
    if (owner?.tags.has(PlayerTag)) {
      this.tmpB.copy(this.game.player.velocity);
    } else {
      const otherBody = other.parent();
      if (otherBody && otherBody.isDynamic()) {
        const w = otherBody.linvel();
        this.tmpB.set(w.x, w.y, w.z);
      } else {
        this.tmpB.set(0, 0, 0);
      }
    }
    return this.tmpA.sub(this.tmpB).length();
  }

  /** A falling jar hurts a character and knocks it out, at most once per cooldown. */
  private hurtCharacter(owner: Entity, target: Hittable, jar: Jar): void {
    const { game } = this;
    const now = game.time.elapsed;
    const cfg = PYRAMID_CONFIG.impact;
    if (target.health.dead || now - (this.lastHitAt.get(owner) ?? -Infinity) < cfg.targetCooldown) {
      return;
    }
    this.lastHitAt.set(owner, now);
    const body = jar.body.translation();
    const dir = this.tmpB.copy(target.position).sub(this.tmpA.set(body.x, body.y, body.z));
    dir.setY(0).normalize();
    const force = dir.multiplyScalar(cfg.knockback).setY(cfg.knockback * 0.5);
    game.combat.hit(target, {
      damage: cfg.damage,
      force,
      source: null,
      kind: 'pyramid-jar',
      stun: cfg.stun,
    });
    this.knockOutCharacter(owner);
  }

  /** Puts an enemy or the player out of action for the knockout duration. */
  private knockOutCharacter(entity: Entity): void {
    const duration = PYRAMID_CONFIG.collapse.knockoutDuration;
    if (entity.tags.has(PlayerTag)) {
      this.game.player.lockControl(duration);
    } else {
      entity.get(EnemyC)?.knockOut(duration);
    }
  }

  /** The tower falls away from the impact point. Everyone underneath is knocked out. */
  private collapse(impact: THREE.Vector3): void {
    const { game } = this;
    const cfg = PYRAMID_CONFIG.collapse;
    this.state = 'fallen';
    this.rebuildTimer = cfg.rebuildDelay;
    this.shadowTimer = 0;

    const dir = this.tmpB.copy(this.center).sub(impact).setY(0);
    if (dir.lengthSq() < 1e-4) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    dir.normalize();
    // The higher the jar, the faster it is pushed, so the stack shears and topples.
    for (const jar of this.jars) {
      const mass = jar.body.mass();
      const speed = cfg.toppleSpeed * (0.2 + jar.baseY / TOP_Y);
      const lateral = (Math.random() - 0.5) * 0.6;
      this.tmpA.set(
        (dir.x * speed + lateral) * mass,
        0.4 * mass * Math.random(),
        (dir.z * speed - lateral) * mass,
      );
      jar.body.applyImpulse(this.tmpA, true);
    }

    const center = this.tmpA.copy(this.center).setY(1);
    const mask = groups(Groups.ALL, Groups.ENEMY | Groups.PLAYER);
    for (const entity of game.physics.entitiesInSphere(center, cfg.crushRadius, mask)) {
      const target = game.combat.hittableOf(entity);
      if (!target || target.health.dead) continue;
      this.knockOutCharacter(entity);
    }

    game.invalidateShadows();
    game.audio.noise({ duration: 0.8, volume: 0.6, filterFreq: 1200 });
  }

  /** A jar shatters: shards, a slippery puddle and a short glass sound. */
  private breakJar(jar: Jar): void {
    const index = this.jars.indexOf(jar);
    if (index < 0) return;
    this.jars.splice(index, 1);
    const { game } = this;
    const t = jar.body.translation();
    const position = new THREE.Vector3(t.x, t.y, t.z);
    this.removeJar(jar);

    game.fx.burst({
      position,
      color: SHARD_COLORS,
      count: 10,
      size: 0.12,
      speed: 3.5,
      life: 0.9,
      gravity: -14,
    });
    this.addPuddle(position);
    const now = game.time.elapsed;
    if (now - this.lastShatterAt > 0.15) {
      this.lastShatterAt = now;
      game.audio.tone({ freq: 1800, endFreq: 700, type: 'triangle', duration: 0.18, volume: 0.12 });
    }
  }

  private addPuddle(position: THREE.Vector3): void {
    const { game } = this;
    const cfg = PYRAMID_CONFIG.puddle;
    const cx = position.x;
    const cz = position.z;
    const until = game.time.elapsed + cfg.duration;
    const release = game.surfaces.add({
      contains: (p) => (p.x - cx) ** 2 + (p.z - cz) ** 2 < cfg.radius * cfg.radius,
      control: cfg.control,
      until,
    });
    const mesh = new THREE.Mesh(puddleGeometry, puddleMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.02, cz);
    mesh.scale.setScalar(cfg.radius);
    game.scene.add(mesh);
    this.puddles.push({ mesh, until, release });
  }

  private updatePuddles(): void {
    const now = this.game.time.elapsed;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const puddle = this.puddles[i];
      if (!puddle || now < puddle.until) continue;
      puddle.release();
      this.game.scene.remove(puddle.mesh);
      this.puddles.splice(i, 1);
    }
  }

  /** Removes the remaining debris and re-stacks the whole tower with a sparkle. */
  private rebuild(): void {
    const { game } = this;
    for (const jar of this.jars) this.removeJar(jar);
    this.jars.length = 0;
    this.pendingBreaks.length = 0;
    this.lastHitAt.clear();
    this.spawnJars();
    this.state = 'standing';
    this.graceUntil = game.time.elapsed + PYRAMID_CONFIG.collapse.rebuildGrace;

    for (const height of [0.6, 2.2, 3.8, 5.4]) {
      game.fx.burst({
        position: new THREE.Vector3(this.center.x, height, this.center.z),
        color: SPARKLE_COLORS,
        count: 12,
        shape: 'ico',
        size: 0.14,
        speed: 2.5,
        life: 0.9,
        gravity: 0,
      });
    }
    game.invalidateShadows();
  }
}

const pyramidTrap: TrapDefinition = {
  id: 'trap-pyramide-conserves',
  displayName: 'Pyramide de conserves',
  spawnDefault(game: Game): Trap[] {
    const traps: Trap[] = [];
    for (const index of PYRAMID_CONFIG.spotIndices) {
      const spot = game.arena.layout.trapSpots[index];
      if (spot) traps.push(new PyramidTower(game, spot, 0));
    }
    return traps;
  },
  spawn(game: Game, position: THREE.Vector3, rotationY: number): Trap {
    return new PyramidTower(game, position, rotationY);
  },
};

export default defineFeature({
  id: 'trap-pyramide-conserves',
  register(registry) {
    registry.registerTrap(pyramidTrap);
  },
});
