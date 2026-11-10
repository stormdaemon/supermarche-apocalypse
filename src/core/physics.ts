import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { defineComponent, type Entity, type World } from './ecs';

export { RAPIER };

/** Collision group bits. A collider collides with another when each one's filter contains the other's membership. */
export const Groups = {
  STATIC: 1 << 0,
  PLAYER: 1 << 1,
  ENEMY: 1 << 2,
  PROP: 1 << 3,
  WEAPON: 1 << 4,
  RAGDOLL: 1 << 5,
  SENSOR: 1 << 6,
  ALL: 0xffff,
} as const;

/** Packs membership and filter masks into a Rapier interaction group. */
export function groups(membership: number, filter: number = Groups.ALL): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

/** Links a rigid body to a rendered object, with interpolation between physics steps. */
export interface PhysicsBody {
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  prevPosition: THREE.Vector3;
  prevRotation: THREE.Quaternion;
  /** Offset applied to the object relative to the body origin. */
  offset: THREE.Vector3;
  syncRotation: boolean;
}
export const PhysicsBodyC = defineComponent<PhysicsBody>('physicsBody');

type ContactHandler = (other: RAPIER.Collider, started: boolean) => void;

/** Thin wrapper around the Rapier world: creation, stepping, mesh sync and queries. */
export class Physics {
  readonly world: RAPIER.World;
  readonly eventQueue = new RAPIER.EventQueue(true);
  private readonly colliderOwners = new Map<number, Entity>();
  private readonly contactHandlers = new Map<number, ContactHandler>();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpRot = new THREE.Quaternion();

  constructor(private readonly ecs: World) {
    this.world = new RAPIER.World({ x: 0, y: CORE_CONFIG.physics.gravity, z: 0 });
    this.world.timestep = 1 / CORE_CONFIG.physics.fixedHz;
    ecs.onRemove((entity) => {
      const pb = entity.get(PhysicsBodyC);
      if (pb && this.world.getRigidBody(pb.body.handle)) this.removeBody(pb.body);
    });
  }

  static async init(): Promise<void> {
    await RAPIER.init();
  }

  step(): void {
    for (const entity of this.ecs.query(PhysicsBodyC)) {
      const pb = entity.require(PhysicsBodyC);
      const t = pb.body.translation();
      const r = pb.body.rotation();
      pb.prevPosition.set(t.x, t.y, t.z);
      pb.prevRotation.set(r.x, r.y, r.z, r.w);
    }
    this.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      this.dispatchContact(h1, h2, started);
      this.dispatchContact(h2, h1, started);
    });
  }

  private dispatchContact(self: number, other: number, started: boolean): void {
    const handler = this.contactHandlers.get(self);
    if (!handler) return;
    const otherCollider = this.world.getCollider(other);
    if (otherCollider) handler(otherCollider, started);
  }

  /** Copies interpolated body transforms onto their rendered objects. */
  sync(alpha: number): void {
    for (const entity of this.ecs.query(PhysicsBodyC)) {
      const pb = entity.require(PhysicsBodyC);
      if (!pb.body.isEnabled()) continue;
      const t = pb.body.translation();
      const r = pb.body.rotation();
      this.tmpPos.set(t.x, t.y, t.z);
      pb.object.position.lerpVectors(pb.prevPosition, this.tmpPos, alpha).add(pb.offset);
      if (pb.syncRotation) {
        this.tmpRot.set(r.x, r.y, r.z, r.w);
        pb.object.quaternion.slerpQuaternions(pb.prevRotation, this.tmpRot, alpha);
      }
    }
  }

  /** Attaches a body to an entity so its object follows the simulation. */
  bind(
    entity: Entity,
    body: RAPIER.RigidBody,
    object: THREE.Object3D,
    options: { offset?: THREE.Vector3; syncRotation?: boolean } = {},
  ): PhysicsBody {
    const t = body.translation();
    const r = body.rotation();
    const pb: PhysicsBody = {
      body,
      object,
      prevPosition: new THREE.Vector3(t.x, t.y, t.z),
      prevRotation: new THREE.Quaternion(r.x, r.y, r.z, r.w),
      offset: options.offset ?? new THREE.Vector3(),
      syncRotation: options.syncRotation ?? true,
    };
    entity.add(PhysicsBodyC, pb);
    for (let i = 0; i < body.numColliders(); i++) this.setOwner(body.collider(i), entity);
    return pb;
  }

  createBody(
    desc: RAPIER.RigidBodyDesc,
    colliders: RAPIER.ColliderDesc[],
    owner?: Entity,
  ): RAPIER.RigidBody {
    const body = this.world.createRigidBody(desc);
    for (const colliderDesc of colliders) {
      const collider = this.world.createCollider(colliderDesc, body);
      if (owner) this.setOwner(collider, owner);
    }
    return body;
  }

  /** Static axis-aligned (optionally Y-rotated) box collider. */
  addStaticBox(
    position: THREE.Vector3,
    halfExtents: THREE.Vector3,
    rotationY = 0,
  ): RAPIER.Collider {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationY);
    const desc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(position.x, position.y, position.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setCollisionGroups(groups(Groups.STATIC));
    return this.world.createCollider(desc);
  }

  removeBody(body: RAPIER.RigidBody): void {
    for (let i = 0; i < body.numColliders(); i++) {
      const handle = body.collider(i).handle;
      this.colliderOwners.delete(handle);
      this.contactHandlers.delete(handle);
    }
    this.world.removeRigidBody(body);
  }

  setOwner(collider: RAPIER.Collider, entity: Entity): void {
    this.colliderOwners.set(collider.handle, entity);
  }

  ownerOf(collider: RAPIER.Collider): Entity | undefined {
    return this.colliderOwners.get(collider.handle);
  }

  /** Calls the handler when the collider starts/stops touching another (needs COLLISION_EVENTS). */
  onContact(collider: RAPIER.Collider, handler: ContactHandler): void {
    collider.setActiveEvents(collider.activeEvents() | RAPIER.ActiveEvents.COLLISION_EVENTS);
    this.contactHandlers.set(collider.handle, handler);
  }

  raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance: number,
    filterGroups?: number,
    exclude?: RAPIER.RigidBody,
  ): { distance: number; collider: RAPIER.Collider; point: THREE.Vector3 } | null {
    const ray = new RAPIER.Ray(origin, direction);
    const hit = this.world.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      filterGroups,
      undefined,
      exclude,
    );
    if (!hit) return null;
    const point = origin.clone().addScaledVector(direction, hit.timeOfImpact);
    return { distance: hit.timeOfImpact, collider: hit.collider, point };
  }

  /** Lists the colliders overlapping a sphere. */
  overlapSphere(center: THREE.Vector3, radius: number, filterGroups?: number): RAPIER.Collider[] {
    const found: RAPIER.Collider[] = [];
    this.world.intersectionsWithShape(
      center,
      { x: 0, y: 0, z: 0, w: 1 },
      new RAPIER.Ball(radius),
      (collider) => {
        found.push(collider);
        return true;
      },
      undefined,
      filterGroups,
    );
    return found;
  }

  /** Lists the distinct entities overlapping a sphere. */
  entitiesInSphere(center: THREE.Vector3, radius: number, filterGroups?: number): Entity[] {
    const set = new Set<Entity>();
    for (const collider of this.overlapSphere(center, radius, filterGroups)) {
      const owner = this.ownerOf(collider);
      if (owner) set.add(owner);
    }
    return [...set];
  }

  get bodyCount(): number {
    return this.world.bodies.len();
  }

  get colliderCount(): number {
    return this.world.colliders.len();
  }
}

/** Converts a Rapier vector to a three.js vector. */
export function toVec3(
  v: { x: number; y: number; z: number },
  out = new THREE.Vector3(),
): THREE.Vector3 {
  return out.set(v.x, v.y, v.z);
}
