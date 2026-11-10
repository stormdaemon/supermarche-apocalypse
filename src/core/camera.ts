import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { Groups, groups, type Physics } from './physics';
import type { Input } from './input';

/** Cursor aim projected on the player's ground plane. */
export interface Aim {
  point: THREE.Vector3;
  /** Horizontal unit vector from the player to the aim point. */
  direction: THREE.Vector3;
}

/**
 * High follow camera (brawler style): fixed angle, smooth follow, pulled closer when a
 * wall stands between it and the player, with trauma-based screen shake.
 */
export class FollowCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Offset from the player's feet to the camera. */
  readonly offset = new THREE.Vector3(0, 14, 10);
  private readonly focus = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly ndc = new THREE.Vector2();
  private trauma = 0;
  private distanceScale = 1;

  constructor(
    private readonly physics: Physics,
    aspect: number,
  ) {
    this.camera = new THREE.PerspectiveCamera(CORE_CONFIG.camera.fov, aspect, 0.1, 200);
  }

  /** Adds screen shake; trauma decays over time and is clamped to 1. */
  addTrauma(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapTo(target: THREE.Vector3): void {
    this.focus.copy(target);
    this.camera.position.copy(target).add(this.offset);
    this.camera.lookAt(target.x, target.y + 1, target.z);
  }

  update(dt: number, target: THREE.Vector3): void {
    const k = 1 - Math.exp(-CORE_CONFIG.camera.followSharpness * dt);
    this.focus.lerp(target, k);

    // Pull the camera in when a wall blocks the view of the player.
    const head = this.focus.clone().setY(this.focus.y + 1.5);
    const toCam = this.offset.clone();
    const length = toCam.length();
    toCam.divideScalar(length);
    const hit = this.physics.raycast(head, toCam, length, groups(Groups.ALL, Groups.STATIC));
    const wanted = hit
      ? Math.max(CORE_CONFIG.camera.minDistance / length, (hit.distance - 0.4) / length)
      : 1;
    this.distanceScale += (wanted - this.distanceScale) * (1 - Math.exp(-8 * dt));

    this.desired.copy(this.focus).addScaledVector(this.offset, this.distanceScale);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.focus.x, this.focus.y + 1, this.focus.z);

    if (this.trauma > 0) {
      const shake = this.trauma * this.trauma;
      this.camera.position.x += (Math.random() * 2 - 1) * shake * 0.6;
      this.camera.position.y += (Math.random() * 2 - 1) * shake * 0.6;
      this.camera.rotation.z += (Math.random() * 2 - 1) * shake * 0.05;
      this.trauma = Math.max(0, this.trauma - dt * 1.5);
    }
  }

  /** Projects the cursor on the horizontal plane at the player's height. */
  updateAim(input: Input, player: THREE.Vector3, facing: THREE.Vector3, out: Aim): void {
    this.ndc.set(input.pointer.x, input.pointer.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -(player.y + 0.9);
    const hit = this.raycaster.ray.intersectPlane(this.plane, out.point);
    if (!hit) out.point.copy(player).add(facing);
    out.point.y = player.y;
    out.direction.copy(out.point).sub(player).setY(0);
    if (out.direction.lengthSq() < 0.0001) out.direction.copy(facing);
    out.direction.normalize();
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
