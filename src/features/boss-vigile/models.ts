import * as THREE from 'three';
import { PALETTE, prim } from '../../core/materials';

/** Half extents of the walkie-talkie body, used for its physics box when it is stolen. */
export const TALKIE_HALF_EXTENTS = { x: 0.06, y: 0.13, z: 0.04 } as const;
/** Radius of a receipt roll. */
export const RECEIPT_RADIUS = 0.09;
/** Half height of a receipt roll. */
export const RECEIPT_HALF_HEIGHT = 0.15;

/** Walkie-talkie built from primitives: black body, antenna and a red LED. Origin at the body center. */
export function buildTalkie(): THREE.Group {
  const group = new THREE.Group();
  const body = prim.box(
    TALKIE_HALF_EXTENTS.x * 2,
    TALKIE_HALF_EXTENTS.y * 2,
    TALKIE_HALF_EXTENTS.z * 2,
    PALETTE.black,
  );
  const antenna = prim.cylinder(0.012, 0.012, 0.38, PALETTE.black, 4);
  antenna.position.set(0.03, 0.32, -0.02);
  const led = prim.box(0.03, 0.03, 0.01, PALETTE.red);
  led.position.set(0, 0.07, TALKIE_HALF_EXTENTS.z + 0.005);
  group.add(body, antenna, led);
  return group;
}

/** Receipt roll: a small white cylinder. Origin at its center. */
export function buildReceipt(): THREE.Mesh {
  return prim.cylinder(RECEIPT_RADIUS, RECEIPT_RADIUS, RECEIPT_HALF_HEIGHT * 2, PALETTE.white, 6);
}
