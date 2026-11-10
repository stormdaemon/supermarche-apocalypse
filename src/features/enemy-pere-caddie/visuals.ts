import * as THREE from 'three';
import type { CharacterOptions } from '../../core/characterFactory';
import { PALETTE, pick, prim } from '../../core/materials';
import { GILBERT } from './config';

/** Look of Tonton Gilbert: blue shirt, grey hair, red barbecue apron over a big belly. */
export function gilbertLook(): CharacterOptions {
  return {
    skin: PALETTE.skin[2],
    shirt: PALETTE.blue,
    pants: PALETTE.darkGrey,
    hair: PALETTE.hair[4],
    hairStyle: 'short',
    accessories: ['apron'],
    accessoryColor: PALETTE.red,
    girth: 1.3,
  };
}

/** Adds a big grey moustache with curled tips to a character head (head-local space). */
export function addBigMoustache(head: THREE.Group): void {
  const color = PALETTE.hair[4];
  const bar = prim.box(0.4, 0.085, 0.06, color);
  bar.position.set(0, 0.11, 0.235);
  head.add(bar);
  for (const side of [-1, 1]) {
    const tip = prim.box(0.1, 0.06, 0.06, color);
    tip.position.set(0.2 * side, 0.15, 0.23);
    tip.rotation.z = -0.5 * side;
    head.add(tip);
  }
}

/**
 * Builds the shopping cart from primitives. The origin is the centre of the cart
 * collider, so the floor sits below it, the handle is at the back (-Z, toward Gilbert)
 * and the cart points forward along +Z. Groceries are heaped to the brim and above.
 */
export function buildCartVisual(): THREE.Group {
  const { halfWidth: w, halfHeight: h, halfLength: l } = GILBERT.cart;
  const group = new THREE.Group();
  const frame = PALETTE.darkGrey;
  const metal = PALETTE.grey;
  const floorY = -h + 0.14;
  const wallHeight = 2 * h - 0.14;
  const wallY = floorY + wallHeight / 2;

  group.add(at(prim.box(2 * w, 0.04, 2 * l, metal), 0, floorY, 0));
  for (const side of [-1, 1]) {
    group.add(at(prim.box(0.05, wallHeight, 2 * l, frame), side * w, wallY, 0));
    group.add(at(prim.box(2 * w, wallHeight, 0.05, frame), 0, wallY, side * l));
  }

  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      const wheel = prim.cylinder(0.09, 0.09, 0.06, PALETTE.black, 8);
      wheel.rotation.z = Math.PI / 2;
      group.add(at(wheel, sideX * (w - 0.08), -h + 0.09, sideZ * (l - 0.12)));
    }
  }

  // Push handle at the back of the cart.
  for (const side of [-1, 1]) {
    group.add(at(prim.box(0.05, 0.5, 0.05, frame), side * (w - 0.05), h + 0.25, -l));
  }
  group.add(at(prim.box(2 * w, 0.06, 0.08, PALETTE.red), 0, h + 0.5, -l));

  addGroceries(group, w, h, l, floorY);

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
  return group;
}

/** Heaps watermelons, baguettes and cans at random spots inside the basket. */
function addGroceries(
  group: THREE.Group,
  halfWidth: number,
  halfHeight: number,
  halfLength: number,
  floorY: number,
): void {
  const { watermelons, baguettes, cans } = GILBERT.groceries;
  const heapBottom = floorY + 0.1;
  const heapTop = halfHeight + 0.35;
  const spotX = (): number => (Math.random() * 2 - 1) * (halfWidth - 0.2);
  const spotZ = (): number => (Math.random() * 2 - 1) * (halfLength - 0.2);
  const spotY = (): number => heapBottom + Math.random() * (heapTop - heapBottom);

  for (let i = 0; i < watermelons; i++) {
    const melon = prim.ico(0.17, pick([PALETTE.green, PALETTE.lime]));
    melon.scale.set(1, 0.8, 1);
    melon.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(at(melon, spotX(), spotY(), spotZ()));
  }
  for (let i = 0; i < baguettes; i++) {
    // Cylinders are upright by default: tip them over, then turn them randomly around Y.
    const baguette = prim.cylinder(0.035, 0.035, 0.6, 0xd9a05b, 6);
    baguette.rotation.set(0, Math.random() * Math.PI, Math.PI / 2);
    group.add(at(baguette, spotX(), spotY(), spotZ()));
  }
  for (let i = 0; i < cans; i++) {
    const can = prim.cylinder(
      0.055,
      0.055,
      0.13,
      pick([PALETTE.red, PALETTE.blue, PALETTE.yellow, PALETTE.lime, PALETTE.white]),
      8,
    );
    group.add(at(can, spotX(), spotY(), spotZ()));
  }
}

/** Sets the position of a mesh and returns it, to keep the builders short. */
function at(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  mesh.position.set(x, y, z);
  return mesh;
}
