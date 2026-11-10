import * as THREE from 'three';
import { CORE_CONFIG } from './config';
import { Entity } from './ecs';
import { PALETTE, flatMaterial, pick, prim } from './materials';
import { createTextSprite } from './nameTag';
import { Groups, groups, RAPIER, type Physics } from './physics';
import type { Game } from './game';

/** Description of one shelf unit, handed to the 'shelf' provider. */
export interface ShelfSpec {
  /** Aisle number shown on the sign ("RAYON 1"...). */
  aisleNumber: number;
  /** Floor-level center of the shelf. */
  position: THREE.Vector3;
  rotationY: number;
  length: number;
  depth: number;
  height: number;
  levels: number;
}

/** Builds one shelf unit. The core default is static; features may provide dynamic ones. */
export type ShelfBuilder = (game: Game, spec: ShelfSpec) => void;

export interface AisleInfo {
  number: number;
  shelf: ShelfSpec;
  /** Floor point in the walkway right next to the shelf (promo target...). */
  walkway: THREE.Vector3;
}

export interface CheckoutInfo {
  /** Floor-level center of the checkout counter. */
  position: THREE.Vector3;
  /** Counter length, along Z. */
  length: number;
}

/** Named spots features use to place things without hard-coding coordinates. */
export interface ArenaLayout {
  playerSpawn: THREE.Vector3;
  /** Spawn points just inside the automatic doors. */
  doors: THREE.Vector3[];
  weaponSpawns: THREE.Vector3[];
  trapSpots: THREE.Vector3[];
  aisles: AisleInfo[];
  checkouts: CheckoutInfo[];
  /** Half extents of the walkable floor. */
  halfWidth: number;
  halfDepth: number;
}

const { width, depth, wallHeight, tileSize } = CORE_CONFIG.arena;

/** The supermarket: tiled floor, walls, shelves, checkouts, entrance crates and neon lights. */
export class Arena {
  readonly layout: ArenaLayout;
  private readonly alarms: THREE.PointLight[] = [];
  private readonly flickering: THREE.MeshBasicMaterial[] = [];

  constructor(private readonly game: Game) {
    const hw = width / 2;
    const hd = depth / 2;
    const shelfXs = [-13.5, -4.5, 4.5, 13.5];
    const aisles: AisleInfo[] = shelfXs.map((x, i) => {
      const shelf: ShelfSpec = {
        aisleNumber: i + 1,
        position: new THREE.Vector3(x, 0, -9),
        rotationY: 0,
        length: 28,
        depth: 1.6,
        height: 2.6,
        levels: 3,
      };
      return { number: i + 1, shelf, walkway: new THREE.Vector3(x + 2.6, 0, -9) };
    });
    this.layout = {
      playerSpawn: new THREE.Vector3(0, 0, 18),
      doors: [
        new THREE.Vector3(-2, 0, hd - 3),
        new THREE.Vector3(0, 0, hd - 3),
        new THREE.Vector3(2, 0, hd - 3),
      ],
      weaponSpawns: [
        new THREE.Vector3(0, 0, 10),
        new THREE.Vector3(-9, 0, -26),
        new THREE.Vector3(9, 0, -26),
        new THREE.Vector3(-18.5, 0, 8),
        new THREE.Vector3(18.5, 0, 8),
        new THREE.Vector3(0, 0, -26),
      ],
      trapSpots: [
        new THREE.Vector3(-18, 0, -26),
        new THREE.Vector3(18, 0, -26),
        new THREE.Vector3(0, 0, 12),
      ],
      aisles,
      checkouts: [-16, -10, 10, 16].map((x) => ({
        position: new THREE.Vector3(x, 0, 16),
        length: 4,
      })),
      halfWidth: hw,
      halfDepth: hd,
    };
  }

  build(shelfBuilder: ShelfBuilder): void {
    const { scene, physics } = this.game;
    const hw = width / 2;
    const hd = depth / 2;

    scene.background = new THREE.Color(0x120a14);
    scene.fog = new THREE.Fog(0x2a1020, 22, 60);

    // Floor: checkered tiles drawn on a canvas texture.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), this.floorMaterial());
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw + 2, 0.5, hd + 2)
        .setTranslation(0, -0.5, 0)
        .setCollisionGroups(groups(Groups.STATIC)),
    );

    // Walls (the south wall has a gap for the automatic doors).
    const wallColor = 0xe9e4d4;
    const doorHalf = 3;
    this.wall(
      new THREE.Vector3(0, wallHeight / 2, -hd),
      new THREE.Vector3(hw, wallHeight / 2, 0.3),
      wallColor,
    );
    this.wall(
      new THREE.Vector3(-hw, wallHeight / 2, 0),
      new THREE.Vector3(0.3, wallHeight / 2, hd),
      wallColor,
    );
    this.wall(
      new THREE.Vector3(hw, wallHeight / 2, 0),
      new THREE.Vector3(0.3, wallHeight / 2, hd),
      wallColor,
    );
    const sideLen = (hw - doorHalf) / 2;
    for (const side of [-1, 1]) {
      this.wall(
        new THREE.Vector3(side * (doorHalf + sideLen), wallHeight / 2, hd),
        new THREE.Vector3(sideLen, wallHeight / 2, 0.3),
        wallColor,
      );
    }
    // Lintel above the doors and an invisible barrier so nobody walks out.
    this.wall(
      new THREE.Vector3(0, wallHeight - 1, hd),
      new THREE.Vector3(doorHalf, 1, 0.3),
      wallColor,
    );
    physics.addStaticBox(new THREE.Vector3(0, 2, hd + 0.2), new THREE.Vector3(doorHalf, 2, 0.2));
    this.automaticDoors(hd, doorHalf);

    // Coloured stripe along the walls.
    for (const z of [-hd + 0.35]) {
      const stripe = prim.box(width - 1, 0.6, 0.05, PALETTE.red);
      stripe.position.set(0, 2.2, z);
      scene.add(stripe);
    }

    for (const aisle of this.layout.aisles) {
      shelfBuilder(this.game, aisle.shelf);
      const sign = createTextSprite(`RAYON ${aisle.number}`, {
        background: '#e63946',
        height: 0.8,
        fontSize: 64,
      });
      sign.position.set(
        aisle.shelf.position.x,
        aisle.shelf.height + 1.6,
        aisle.shelf.position.z + aisle.shelf.length / 2,
      );
      scene.add(sign);
    }

    for (const checkout of this.layout.checkouts) this.checkout(checkout);
    this.entranceCrates(hd);
    this.lights(hw, hd);

    const banner = createTextSprite('BLACK FRIDAY  -70% SUR TOUT', {
      color: '#ffe066',
      background: '#1b1b24',
      height: 1.4,
      fontSize: 72,
    });
    banner.position.set(0, wallHeight - 1.5, -hd + 0.6);
    scene.add(banner);
  }

  private floorMaterial(): THREE.MeshLambertMaterial {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#f2efe6';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#c9d6df';
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillRect(32, 32, 32, 32);
      ctx.strokeStyle = '#b8b2a6';
      ctx.strokeRect(0, 0, 64, 64);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.NearestFilter;
    texture.repeat.set(width / (tileSize * 2), depth / (tileSize * 2));
    return new THREE.MeshLambertMaterial({ map: texture });
  }

  private wall(center: THREE.Vector3, half: THREE.Vector3, color: number): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2),
      flatMaterial(color),
    );
    mesh.position.copy(center);
    mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    this.game.physics.addStaticBox(center, half);
  }

  private automaticDoors(hd: number, doorHalf: number): void {
    const glass = new THREE.MeshLambertMaterial({
      color: 0x9ad1f5,
      transparent: true,
      opacity: 0.35,
    });
    for (const side of [-1, 1]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(doorHalf, 4, 0.1), glass);
      panel.position.set(side * doorHalf * 1.1, 2, hd + 0.4);
      this.game.scene.add(panel);
    }
    const sign = createTextSprite('ENTRÉE', { background: '#2a9d8f', height: 0.6 });
    sign.position.set(0, wallHeight - 0.5, hd - 0.5);
    this.game.scene.add(sign);
  }

  private checkout(info: CheckoutInfo): void {
    const { scene, physics } = this.game;
    const counter = prim.box(1.2, 1, info.length, PALETTE.darkGrey);
    counter.position.copy(info.position).setY(0.5);
    const top = prim.box(1.3, 0.08, info.length + 0.1, PALETTE.grey);
    top.position.copy(info.position).setY(1.04);
    const register = prim.box(0.6, 0.5, 0.5, PALETTE.black);
    register.position.copy(info.position).add(new THREE.Vector3(0, 1.3, info.length / 2 - 0.4));
    const lamp = prim.cylinder(0.08, 0.08, 1.8, PALETTE.grey, 6);
    lamp.position.copy(info.position).add(new THREE.Vector3(-0.5, 1.9, info.length / 2));
    const lampTop = prim.box(0.4, 0.3, 0.1, PALETTE.green);
    lampTop.position.copy(info.position).add(new THREE.Vector3(-0.5, 2.9, info.length / 2));
    scene.add(counter, top, register, lamp, lampTop);
    physics.addStaticBox(
      info.position.clone().setY(0.55),
      new THREE.Vector3(0.6, 0.55, info.length / 2),
    );
  }

  private entranceCrates(hd: number): void {
    const { scene, physics, world } = this.game;
    const spots: [number, number, number][] = [
      [-7, 0.5, hd - 6],
      [-8.1, 0.5, hd - 6],
      [-7.5, 1.5, hd - 6],
      [7, 0.5, hd - 6],
      [8.1, 0.5, hd - 5.8],
      [7.6, 1.5, hd - 5.9],
      [-6, 0.5, hd - 9],
      [6.5, 0.5, hd - 9.5],
    ];
    for (const [x, y, z] of spots) {
      const entity = new Entity('crate');
      const crate = prim.box(1, 1, 1, PALETTE.brown);
      const band = prim.box(1.02, 0.15, 1.02, PALETTE.yellow);
      crate.add(band);
      scene.add(crate);
      const body = physics.createBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z),
        [
          RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)
            .setMass(15)
            .setCollisionGroups(groups(Groups.PROP)),
        ],
        entity,
      );
      physics.bind(entity, body, crate);
      world.add(entity);
    }
  }

  private lights(hw: number, hd: number): void {
    const scene = this.game.scene;
    scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x2a1830, 0.9));
    const moon = new THREE.DirectionalLight(0xffe2c4, 0.9);
    moon.position.set(8, 30, 12);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    const cam = moon.shadow.camera;
    cam.left = -hw - 4;
    cam.right = hw + 4;
    cam.top = hd + 4;
    cam.bottom = -hd - 4;
    cam.near = 1;
    cam.far = 80;
    moon.shadow.bias = -0.001;
    scene.add(moon, moon.target);

    // Red alarm beacons sweeping the store.
    for (const [x, z] of [
      [-hw + 1, -hd + 1],
      [hw - 1, hd - 4],
    ] as const) {
      const light = new THREE.PointLight(0xff2020, 0, 30, 1.2);
      light.position.set(x, wallHeight - 1, z);
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.3, 0.4, 8),
        new THREE.MeshBasicMaterial({ color: 0xff2020 }),
      );
      beacon.position.copy(light.position);
      scene.add(light, beacon);
      this.alarms.push(light);
    }

    // Neon tubes hanging above the aisles; some of them flicker.
    for (let x = -18; x <= 18; x += 9) {
      for (let z = -24; z <= 20; z += 8) {
        const tube = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, 0.12, 6),
          new THREE.MeshBasicMaterial({ color: 0xf8fbff }),
        );
        tube.position.set(x, wallHeight - 0.3, z);
        scene.add(tube);
        if (Math.random() < 0.35) this.flickering.push(tube.material);
      }
    }
    const neonColors = [PALETTE.pink, PALETTE.cyan, PALETTE.yellow];
    for (let i = 0; i < 6; i++) {
      const neon = new THREE.Mesh(
        new THREE.BoxGeometry(4, 0.15, 0.1),
        new THREE.MeshBasicMaterial({ color: pick(neonColors) }),
      );
      neon.position.set(-hw + 0.4, 4.5, -20 + i * 8);
      neon.rotation.y = Math.PI / 2;
      const neon2 = neon.clone();
      neon2.position.x = hw - 0.4;
      scene.add(neon, neon2);
    }
  }

  /** Animates the alarm beacons and flickering neons. */
  update(elapsed: number): void {
    const pulse = Math.max(0, Math.sin(elapsed * 4));
    for (const alarm of this.alarms) alarm.intensity = pulse * 60;
    for (const material of this.flickering) {
      const off = Math.random() < 0.04 || Math.sin(elapsed * 23 + material.id) > 0.97;
      material.color.setHex(off ? 0x2a2a33 : 0xf8fbff);
    }
  }
}

const PRODUCT_COLORS = [
  PALETTE.red,
  PALETTE.orange,
  PALETTE.yellow,
  PALETTE.green,
  PALETTE.lime,
  PALETTE.blue,
  PALETTE.cyan,
  PALETTE.purple,
  PALETTE.pink,
  PALETTE.white,
];

/** Fills a shelf with colourful products using one instanced mesh. Returns the mesh. */
export function buildShelfVisual(spec: ShelfSpec): THREE.Group {
  const group = new THREE.Group();
  const frameColor = 0x5c6b80;
  const back = prim.box(0.15, spec.height, spec.length, frameColor);
  back.position.y = spec.height / 2;
  group.add(back);
  for (const side of [-1, 1]) {
    const post = prim.box(spec.depth, spec.height, 0.12, frameColor);
    post.position.set(0, spec.height / 2, (side * spec.length) / 2);
    group.add(post);
  }
  const productsPerLevel = Math.floor(spec.length / 0.55);
  const count = productsPerLevel * spec.levels * 2;
  const products = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    flatMaterial(0xffffff),
    count,
  );
  products.castShadow = true;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let index = 0;
  for (let level = 0; level < spec.levels; level++) {
    const y = 0.25 + (level * (spec.height - 0.4)) / spec.levels;
    const plank = prim.box(spec.depth, 0.06, spec.length, 0xd9dde3);
    plank.position.y = y;
    group.add(plank);
    for (const side of [-1, 1]) {
      for (let i = 0; i < productsPerLevel; i++) {
        const h = 0.3 + Math.random() * 0.35;
        dummy.position.set(
          side * spec.depth * 0.3,
          y + h / 2 + 0.03,
          -spec.length / 2 + 0.4 + i * 0.55,
        );
        dummy.scale.set(0.4, h, 0.38);
        dummy.rotation.y = (Math.random() - 0.5) * 0.3;
        dummy.updateMatrix();
        products.setMatrixAt(index, dummy.matrix);
        products.setColorAt(index, color.set(pick(PRODUCT_COLORS)));
        index++;
      }
    }
  }
  group.add(products);
  group.position.copy(spec.position);
  group.rotation.y = spec.rotationY;
  return group;
}

/** Core shelf: static collider plus the instanced visual. */
export const staticShelfBuilder: ShelfBuilder = (game, spec) => {
  game.scene.add(buildShelfVisual(spec));
  addShelfCollider(game.physics, spec);
};

function addShelfCollider(physics: Physics, spec: ShelfSpec): void {
  physics.addStaticBox(
    spec.position.clone().setY(spec.height / 2),
    new THREE.Vector3(spec.depth / 2, spec.height / 2, spec.length / 2),
    spec.rotationY,
  );
}
