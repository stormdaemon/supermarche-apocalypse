import * as THREE from 'three';
import type { Entity } from './ecs';
import type { EventBus } from './events';
import type { GameTime } from './loop';
import { Groups, groups, type Physics, PhysicsBodyC } from './physics';
import { type HitInfo, type Hittable, HittableC, PlayerTag } from './types';

export interface MeleeSweep {
  origin: THREE.Vector3;
  /** Horizontal facing direction (unit vector). */
  direction: THREE.Vector3;
  range: number;
  /** Full cone angle in radians (Math.PI * 2 = all around). */
  arc: number;
  info: HitInfo;
  /** Entity never hit by the sweep (usually the attacker). */
  exclude?: Entity | null;
  /** Restricts the sweep to enemies (default) or also hits the player. */
  hitPlayer?: boolean;
}

/** Central damage pipeline: every hit, sweep and explosion goes through here. */
export class Combat {
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly physics: Physics,
    private readonly events: EventBus,
    private readonly time: GameTime,
  ) {}

  hittableOf(entity: Entity | undefined): Hittable | null {
    return entity?.get(HittableC) ?? null;
  }

  /** Damages a target, applies its physical reaction and emits hit/death events. */
  hit(target: Hittable, info: HitInfo): boolean {
    const health = target.health;
    if (health.dead || this.time.elapsed < health.invulnerableUntil) return false;
    health.current = Math.max(0, health.current - info.damage);
    target.applyHit(info);
    const point = info.point ?? target.position.clone().setY(target.position.y + 1);
    this.events.emit('hit', {
      target: target.entity,
      source: info.source ?? null,
      damage: info.damage,
      force: info.force,
      point,
      kind: info.kind ?? 'generic',
    });
    if (health.current <= 0 && !health.dead) {
      health.dead = true;
      this.events.emit('death', {
        entity: target.entity,
        killer: info.source ?? null,
        position: target.position.clone(),
      });
    }
    return true;
  }

  /** Hits every target inside a horizontal cone in front of the origin. */
  meleeSweep(sweep: MeleeSweep): Hittable[] {
    const mask = sweep.hitPlayer ? Groups.ENEMY | Groups.PLAYER : Groups.ENEMY;
    const center = sweep.origin;
    const candidates = this.physics.entitiesInSphere(center, sweep.range, groups(Groups.ALL, mask));
    const hits: Hittable[] = [];
    const halfArc = sweep.arc / 2;
    for (const entity of candidates) {
      if (entity === sweep.exclude) continue;
      if (!sweep.hitPlayer && entity.tags.has(PlayerTag)) continue;
      const target = this.hittableOf(entity);
      if (!target || target.health.dead) continue;
      this.tmp.copy(target.position).sub(center).setY(0);
      if (this.tmp.lengthSq() > 0.0001 && halfArc < Math.PI) {
        const angle = this.tmp.normalize().angleTo(sweep.direction);
        if (angle > halfArc) continue;
      }
      const force = sweep.info.force.clone();
      if (this.hit(target, { ...sweep.info, force })) hits.push(target);
    }
    return hits;
  }

  /**
   * Radial blast: pushes every dynamic body in range, damages hittables with falloff,
   * and emits an explosion event.
   */
  explode(
    position: THREE.Vector3,
    radius: number,
    force: number,
    damage: number,
    source: Entity | null = null,
  ): void {
    const touched = new Set<Entity>();
    for (const collider of this.physics.overlapSphere(position, radius)) {
      const body = collider.parent();
      const owner = this.physics.ownerOf(collider);
      if (owner && touched.has(owner)) continue;
      if (owner) touched.add(owner);
      const target = this.hittableOf(owner);
      const t = body ? body.translation() : collider.translation();
      const dir = this.tmp.set(t.x - position.x, t.y - position.y + 0.5, t.z - position.z);
      const distance = Math.max(dir.length(), 0.3);
      const falloff = 1 - Math.min(distance / radius, 1);
      dir.normalize().multiplyScalar(force * falloff);
      if (target) {
        if (owner === source) continue;
        this.hit(target, {
          damage: damage * falloff,
          force: dir.clone(),
          source,
          kind: 'explosion',
          stun: 0.8,
        });
      } else if (body && body.isDynamic()) {
        body.applyImpulse(dir, true);
      }
    }
    this.events.emit('explosion', { position: position.clone(), radius, force });
  }

  /** Pushes a dynamic body owned by an entity, if any. */
  push(entity: Entity, impulse: THREE.Vector3): void {
    const body = entity.get(PhysicsBodyC)?.body;
    if (body && body.isDynamic()) body.applyImpulse(impulse, true);
  }
}
