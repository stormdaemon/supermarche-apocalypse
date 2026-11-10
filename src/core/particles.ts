import * as THREE from 'three';

export interface BurstOptions {
  position: THREE.Vector3;
  color: THREE.ColorRepresentation | THREE.ColorRepresentation[];
  count?: number;
  /** Initial speed in m/s. */
  speed?: number;
  size?: number;
  /** Lifetime in seconds. */
  life?: number;
  /** Vertical acceleration (negative falls). */
  gravity?: number;
  /** Main emission direction; particles spread around it. Omit for a sphere. */
  direction?: THREE.Vector3;
  /** Cone spread in [0, 1] around direction. */
  spread?: number;
  shape?: 'box' | 'ico';
}

interface Particle {
  alive: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Euler;
  spin: THREE.Vector3;
  size: number;
  life: number;
  maxLife: number;
  gravity: number;
}

const MAX_PARTICLES = 800;

/** Pooled low-poly particle bursts rendered with two instanced meshes. */
export class Particles {
  private readonly meshes: Record<'box' | 'ico', THREE.InstancedMesh>;
  private readonly pools: Record<'box' | 'ico', Particle[]>;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshLambertMaterial({ flatShading: true });
    this.meshes = {
      box: new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, MAX_PARTICLES),
      ico: new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0), material, MAX_PARTICLES),
    };
    this.pools = { box: [], ico: [] };
    for (const key of ['box', 'ico'] as const) {
      const mesh = this.meshes[key];
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.setColorAt(0, this.color.set(0xffffff));
      scene.add(mesh);
      for (let i = 0; i < MAX_PARTICLES; i++) {
        this.pools[key].push({
          alive: false,
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
          rotation: new THREE.Euler(),
          spin: new THREE.Vector3(),
          size: 0,
          life: 0,
          maxLife: 1,
          gravity: 0,
        });
      }
    }
  }

  burst(options: BurstOptions): void {
    const shape = options.shape ?? 'box';
    const pool = this.pools[shape];
    const mesh = this.meshes[shape];
    const colors = Array.isArray(options.color) ? options.color : [options.color];
    const count = options.count ?? 12;
    const speed = options.speed ?? 4;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      const p = pool[i];
      if (!p || p.alive) continue;
      p.alive = true;
      p.position.copy(options.position);
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
        Math.random() * 2 - 1,
      ).normalize();
      if (options.direction) {
        dir
          .multiplyScalar(options.spread ?? 0.4)
          .add(options.direction)
          .normalize();
      }
      p.velocity.copy(dir).multiplyScalar(speed * (0.5 + Math.random() * 0.8));
      p.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
      p.size = (options.size ?? 0.15) * (0.6 + Math.random() * 0.8);
      p.maxLife = (options.life ?? 0.8) * (0.7 + Math.random() * 0.6);
      p.life = p.maxLife;
      p.gravity = options.gravity ?? -12;
      mesh.setColorAt(i, this.color.set(colors[spawned % colors.length] ?? 0xffffff));
      spawned++;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number): void {
    for (const key of ['box', 'ico'] as const) {
      const mesh = this.meshes[key];
      const pool = this.pools[key];
      let highest = 0;
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!p) continue;
        if (p.alive) {
          p.life -= dt;
          if (p.life <= 0) p.alive = false;
        }
        if (!p.alive) {
          this.dummy.scale.setScalar(0);
          this.dummy.updateMatrix();
          mesh.setMatrixAt(i, this.dummy.matrix);
          continue;
        }
        highest = i + 1;
        p.velocity.y += p.gravity * dt;
        p.position.addScaledVector(p.velocity, dt);
        if (p.position.y < 0.05) {
          p.position.y = 0.05;
          p.velocity.set(p.velocity.x * 0.6, -p.velocity.y * 0.3, p.velocity.z * 0.6);
        }
        p.rotation.x += p.spin.x * dt;
        p.rotation.y += p.spin.y * dt;
        p.rotation.z += p.spin.z * dt;
        this.dummy.position.copy(p.position);
        this.dummy.rotation.copy(p.rotation);
        this.dummy.scale.setScalar(p.size * Math.min(1, (p.life / p.maxLife) * 2));
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
      }
      mesh.count = highest;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear(): void {
    for (const key of ['box', 'ico'] as const) {
      for (const p of this.pools[key]) p.alive = false;
    }
  }
}
