import * as THREE from 'three';

/** Bright cartoon palette shared by every generated model. */
export const PALETTE = {
  white: 0xf4f1ea,
  black: 0x24242c,
  red: 0xe63946,
  orange: 0xf77f00,
  yellow: 0xfcbf49,
  green: 0x2a9d8f,
  lime: 0x8ac926,
  blue: 0x1982c4,
  cyan: 0x4cc9f0,
  purple: 0x6a4c93,
  pink: 0xff70a6,
  brown: 0x8d5524,
  grey: 0x8d99ae,
  darkGrey: 0x4a4e69,
  skin: [0xffdbac, 0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524],
  hair: [0x2b1d0e, 0x6f4e37, 0xd4a017, 0xb7410e, 0xdcdcdc, 0x1c1c1c],
} as const;

const cache = new Map<string, THREE.MeshLambertMaterial>();

/** Returns a cached flat-shaded material for the given color. */
export function flatMaterial(
  color: THREE.ColorRepresentation,
  emissive = 0,
): THREE.MeshLambertMaterial {
  const key = `${new THREE.Color(color).getHexString()}-${emissive}`;
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color, flatShading: true });
    if (emissive > 0) {
      material.emissive = new THREE.Color(color);
      material.emissiveIntensity = emissive;
    }
    cache.set(key, material);
  }
  return material;
}

const geometryCache = new Map<string, THREE.BufferGeometry>();

function cachedGeometry(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geometry = geometryCache.get(key);
  if (!geometry) {
    geometry = build();
    geometryCache.set(key, geometry);
  }
  return geometry;
}

/** Primitive mesh helpers: every model in the game is built from these. */
export const prim = {
  box(w: number, h: number, d: number, color: THREE.ColorRepresentation): THREE.Mesh {
    const geometry = cachedGeometry(`box${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
    return shadowed(new THREE.Mesh(geometry, flatMaterial(color)));
  },
  cylinder(
    rTop: number,
    rBottom: number,
    h: number,
    color: THREE.ColorRepresentation,
    segments = 8,
  ): THREE.Mesh {
    const geometry = cachedGeometry(
      `cyl${rTop}:${rBottom}:${h}:${segments}`,
      () => new THREE.CylinderGeometry(rTop, rBottom, h, segments),
    );
    return shadowed(new THREE.Mesh(geometry, flatMaterial(color)));
  },
  cone(r: number, h: number, color: THREE.ColorRepresentation, segments = 8): THREE.Mesh {
    const geometry = cachedGeometry(
      `cone${r}:${h}:${segments}`,
      () => new THREE.ConeGeometry(r, h, segments),
    );
    return shadowed(new THREE.Mesh(geometry, flatMaterial(color)));
  },
  ico(r: number, color: THREE.ColorRepresentation, detail = 0): THREE.Mesh {
    const geometry = cachedGeometry(
      `ico${r}:${detail}`,
      () => new THREE.IcosahedronGeometry(r, detail),
    );
    return shadowed(new THREE.Mesh(geometry, flatMaterial(color)));
  },
};

function shadowed(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Picks a random element of a readonly list. */
export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}
