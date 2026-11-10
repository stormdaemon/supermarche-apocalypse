import * as THREE from 'three';
import type { Game } from '../../core/game';
import { pick } from '../../core/materials';
import { Entity } from '../../core/ecs';
import { Groups, groups, RAPIER } from '../../core/physics';
import { BOSS_CONFIG } from './config';
import {
  buildReceipt,
  buildTalkie,
  RECEIPT_HALF_HEIGHT,
  RECEIPT_RADIUS,
  TALKIE_HALF_EXTENTS,
} from './models';

const TAU = Math.PI * 2;

/** A receipt roll in flight. It is removed once it touches something or its lifetime ends. */
interface Roll {
  entity: Entity;
  mesh: THREE.Object3D;
  age: number;
  /** Set by the contact handler; the roll is removed on the next fixed step. */
  done: boolean;
}

/** A stolen walkie-talkie lying on the floor as a physics prop. */
interface LooseTalkie {
  entity: Entity;
  mesh: THREE.Object3D;
  age: number;
}

/**
 * Per-game state of the feature: the receipt rolls and the stolen talkies. The boss itself is
 * spawned by wave-system. Everything created here is removed by clear(), on the reset event.
 */
export class BossRuntime {
  private rolls: Roll[] = [];
  private talkies: LooseTalkie[] = [];

  constructor(private readonly game: Game) {}

  /** Removes finished rolls and talkies. Called every fixed step. */
  fixedUpdate(dt: number): void {
    for (let i = this.rolls.length - 1; i >= 0; i--) {
      const roll = this.rolls[i];
      if (!roll) continue;
      roll.age += dt;
      if (roll.done || roll.age > BOSS_CONFIG.caissiere.rollLifetime) {
        this.removeEntity(roll.entity, roll.mesh);
        this.rolls.splice(i, 1);
      }
    }
    for (let i = this.talkies.length - 1; i >= 0; i--) {
      const talkie = this.talkies[i];
      if (!talkie) continue;
      talkie.age += dt;
      if (talkie.age > BOSS_CONFIG.talkie.propLifetime) {
        this.removeEntity(talkie.entity, talkie.mesh);
        this.talkies.splice(i, 1);
      }
    }
  }

  /** Removes every roll and stolen talkie. */
  clear(): void {
    for (const roll of this.rolls) this.removeEntity(roll.entity, roll.mesh);
    for (const talkie of this.talkies) this.removeEntity(talkie.entity, talkie.mesh);
    this.rolls = [];
    this.talkies = [];
  }

  /** Returns the door closest to a point, as a copy. */
  nearestDoor(from: THREE.Vector3): THREE.Vector3 {
    let best = from.clone();
    let bestDistance = Infinity;
    for (const door of this.game.arena.layout.doors) {
      const distance = door.distanceToSquared(from);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = door.clone();
      }
    }
    return best;
  }

  /** Spawns up to `count` caissières around a random door, respecting the alive cap. Returns how many spawned. */
  callReinforcements(count: number): number {
    const cfg = BOSS_CONFIG.talkie;
    const room = cfg.maxCaissieres - this.countCaissieres();
    const amount = Math.max(0, Math.min(count, room));
    for (let i = 0; i < amount; i++) {
      const door = pick(this.game.arena.layout.doors);
      const angle = Math.random() * TAU;
      const radius = Math.random() * cfg.doorSpread;
      const position = new THREE.Vector3(
        door.x + Math.cos(angle) * radius,
        0,
        door.z + Math.sin(angle) * radius,
      );
      this.game.enemies.spawn('caissiere', position);
    }
    return amount;
  }

  /** Throws a receipt roll from origin with the given launch velocity (m/s). */
  spawnRoll(origin: THREE.Vector3, velocity: THREE.Vector3, owner: Entity): void {
    const { physics, world, scene, combat, player } = this.game;
    const cfg = BOSS_CONFIG.caissiere;
    const entity = new Entity('receipt');
    const mesh = buildReceipt();
    const body = physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setCcdEnabled(true),
      [
        RAPIER.ColliderDesc.cylinder(RECEIPT_HALF_HEIGHT, RECEIPT_RADIUS)
          .setMass(0.1)
          .setCollisionGroups(groups(Groups.PROP, Groups.STATIC | Groups.PLAYER | Groups.PROP)),
      ],
      entity,
    );
    const roll: Roll = { entity, mesh, age: 0, done: false };
    // Push direction, precomputed so the contact handler does not allocate per frame.
    const push = new THREE.Vector3(velocity.x, 0, velocity.z)
      .normalize()
      .multiplyScalar(cfg.rollPush);
    physics.bind(entity, body, mesh, { syncRotation: true });
    physics.onContact(body.collider(0), (other, started) => {
      if (!started || roll.done) return;
      roll.done = true;
      if (physics.ownerOf(other) !== player.entity) return;
      combat.hit(player, {
        damage: cfg.rollDamage,
        force: push.clone(),
        source: owner,
        kind: 'receipt',
        stun: 0.2,
      });
    });
    scene.add(mesh);
    world.add(entity);
    this.rolls.push(roll);
  }

  /** Drops a stolen walkie-talkie on the floor as a physics prop, kicked with the given impulse. */
  spawnTalkieProp(origin: THREE.Vector3, impulse: THREE.Vector3): void {
    const { physics, world, scene } = this.game;
    const entity = new Entity('talkie');
    const mesh = buildTalkie();
    const body = physics.createBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setAngularDamping(0.8),
      [
        RAPIER.ColliderDesc.cuboid(
          TALKIE_HALF_EXTENTS.x,
          TALKIE_HALF_EXTENTS.y,
          TALKIE_HALF_EXTENTS.z,
        )
          .setMass(1.5)
          .setFriction(0.6)
          .setCollisionGroups(groups(Groups.PROP)),
      ],
      entity,
    );
    body.applyImpulse(impulse, true);
    body.applyTorqueImpulse(
      { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 },
      true,
    );
    physics.bind(entity, body, mesh, { syncRotation: true });
    scene.add(mesh);
    world.add(entity);
    this.talkies.push({ entity, mesh, age: 0 });
  }

  /** Number of caissières still able to fight. */
  private countCaissieres(): number {
    return this.game.enemies.alive.filter((e) => e.typeId === 'caissiere' && e.state !== 'dead')
      .length;
  }

  /** Detaches a mesh and removes its entity, which also removes the physics body. */
  private removeEntity(entity: Entity, mesh: THREE.Object3D): void {
    mesh.removeFromParent();
    this.game.world.remove(entity);
  }
}

const runtimes = new WeakMap<Game, BossRuntime>();

/** Creates the runtime of a game and makes it reachable from the enemies built for that game. */
export function createRuntime(game: Game): BossRuntime {
  const runtime = new BossRuntime(game);
  runtimes.set(game, runtime);
  return runtime;
}

/** Returns the runtime of a game. Throws if the feature was not set up for that game. */
export function runtimeOf(game: Game): BossRuntime {
  const runtime = runtimes.get(game);
  if (!runtime) throw new Error('boss-vigile runtime is not set up');
  return runtime;
}
