import * as THREE from 'three';
import { PALETTE, pick, prim } from './materials';

export type HairStyle = 'none' | 'short' | 'long' | 'bun' | 'mohawk';
export type Accessory =
  | 'cap'
  | 'helmet'
  | 'hat'
  | 'glasses'
  | 'sunglasses'
  | 'beard'
  | 'mustache'
  | 'apron'
  | 'bag'
  | 'headphones'
  | 'badge';

export interface CharacterOptions {
  skin?: number;
  shirt: number;
  pants: number;
  shoes?: number;
  hair?: number;
  hairStyle?: HairStyle;
  accessories?: Accessory[];
  /** Accessory main color (cap, bag, apron...). */
  accessoryColor?: number;
  /** Uniform scale of the whole character. */
  scale?: number;
  /** Torso width multiplier (1 = normal, 1.4 = big belly). */
  girth?: number;
}

/** Procedural one-shot animations layered over the walk cycle. */
export type RigAction =
  'punchLeft' | 'punchRight' | 'uppercut' | 'swing' | 'throw' | 'attack' | 'hurt' | 'cheer';

export interface RigParts {
  body: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  handL: THREE.Group;
  handR: THREE.Group;
}

const BLOB_GEOMETRY = new THREE.CircleGeometry(0.5, 12);
const BLOB_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x000000,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

/** Hierarchy of pivots (shoulders, hips, neck) so limbs rotate around their joints. */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly parts: RigParts;
  /** Standing height in world units. */
  readonly height: number;
  private phase = Math.random() * Math.PI * 2;
  private action: RigAction | null = null;
  private actionTime = 0;
  private actionDuration = 0;

  constructor(parts: RigParts, height: number) {
    this.parts = parts;
    this.height = height;
    this.root.add(parts.body);
    const blob = new THREE.Mesh(BLOB_GEOMETRY, BLOB_MATERIAL);
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.03;
    blob.scale.setScalar(height / 1.95);
    blob.renderOrder = 1;
    this.root.add(blob);
  }

  /** Starts a one-shot action animation. */
  trigger(action: RigAction, duration = 0.3): void {
    this.action = action;
    this.actionTime = 0;
    this.actionDuration = duration;
  }

  /** Advances the procedural animation. speed is the horizontal speed in m/s. */
  animate(dt: number, speed: number): void {
    const p = this.parts;
    const moving = Math.min(speed / 6, 1.5);
    this.phase += dt * (4 + speed * 1.6);
    const swing = Math.sin(this.phase) * 0.9 * moving;
    p.legL.rotation.x = swing;
    p.legR.rotation.x = -swing;
    p.armL.rotation.x = -swing * 1.2;
    p.armR.rotation.x = swing * 1.2;
    p.armL.rotation.z = 0.1 + moving * 0.25;
    p.armR.rotation.z = -0.1 - moving * 0.25;
    p.body.position.y = Math.abs(Math.sin(this.phase)) * 0.12 * moving;
    p.torso.rotation.z = Math.sin(this.phase) * 0.08 * moving;
    p.head.rotation.x = 0;
    p.torso.rotation.x = moving * 0.15;

    if (!this.action) return;
    this.actionTime += dt;
    const t = Math.min(this.actionTime / this.actionDuration, 1);
    const k = Math.sin(t * Math.PI);
    switch (this.action) {
      case 'punchLeft':
        p.armL.rotation.x = (-Math.PI / 2) * k - (1 - k) * swing;
        p.torso.rotation.y = 0.5 * k;
        break;
      case 'punchRight':
        p.armR.rotation.x = (-Math.PI / 2) * k;
        p.torso.rotation.y = -0.5 * k;
        break;
      case 'uppercut':
        p.armR.rotation.x = -Math.PI * 0.95 * k;
        p.body.position.y += 0.25 * k;
        p.torso.rotation.x = -0.3 * k;
        break;
      case 'swing':
        p.armR.rotation.x = -Math.PI / 2;
        p.armR.rotation.z = -1.4 + 2.8 * t;
        p.torso.rotation.y = 1 - 2 * t;
        break;
      case 'throw':
        p.armR.rotation.x = -Math.PI * (1.2 - 1.2 * t);
        p.torso.rotation.x = -0.3 + 0.6 * t;
        break;
      case 'attack':
        p.armL.rotation.x = -Math.PI * 0.7 * k;
        p.armR.rotation.x = -Math.PI * 0.7 * k;
        p.torso.rotation.x = 0.4 * k;
        break;
      case 'hurt':
        p.torso.rotation.x = -0.5 * k;
        p.head.rotation.x = -0.6 * k;
        p.armL.rotation.z = 1.2 * k;
        p.armR.rotation.z = -1.2 * k;
        break;
      case 'cheer':
        p.armL.rotation.x = -Math.PI * k;
        p.armR.rotation.x = -Math.PI * k;
        p.body.position.y += 0.3 * k;
        break;
    }
    if (t >= 1) {
      this.action = null;
      p.torso.rotation.y = 0;
    }
  }
}

/** Builds a low-poly character from primitives. Every enemy and the player use this. */
export function createCharacter(options: CharacterOptions): CharacterRig {
  const scale = options.scale ?? 1;
  const girth = options.girth ?? 1;
  const skin = options.skin ?? pick(PALETTE.skin);
  const shoes = options.shoes ?? PALETTE.black;
  const hair = options.hair ?? pick(PALETTE.hair);
  const accColor = options.accessoryColor ?? PALETTE.red;
  const acc = new Set(options.accessories ?? []);

  const body = new THREE.Group();
  const hips = new THREE.Group();
  hips.position.y = 0.85;
  body.add(hips);

  // Legs pivot at the hips.
  const makeLeg = (side: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(0.14 * side * girth, 0, 0);
    const thigh = prim.box(0.22, 0.75, 0.24, options.pants);
    thigh.position.y = -0.4;
    const shoe = prim.box(0.24, 0.12, 0.34, shoes);
    shoe.position.set(0, -0.8, 0.05);
    leg.add(thigh, shoe);
    hips.add(leg);
    return leg;
  };
  const legL = makeLeg(-1);
  const legR = makeLeg(1);

  const torso = new THREE.Group();
  hips.add(torso);
  const chest = prim.box(0.56 * girth, 0.66, 0.36 * Math.max(1, girth * 0.9), options.shirt);
  chest.position.y = 0.33;
  torso.add(chest);

  // Arms pivot at the shoulders.
  const makeArm = (side: number): { arm: THREE.Group; hand: THREE.Group } => {
    const arm = new THREE.Group();
    arm.position.set((0.28 * girth + 0.1) * side, 0.6, 0);
    const sleeve = prim.box(0.17, 0.58, 0.17, options.shirt);
    sleeve.position.y = -0.27;
    const hand = new THREE.Group();
    hand.position.y = -0.62;
    hand.add(prim.ico(0.1, skin));
    arm.add(sleeve, hand);
    torso.add(arm);
    return { arm, hand };
  };
  const left = makeArm(-1);
  const right = makeArm(1);

  const head = new THREE.Group();
  head.position.y = 0.68;
  torso.add(head);
  const face = prim.box(0.4, 0.42, 0.4, skin);
  face.position.y = 0.22;
  head.add(face);
  for (const side of [-1, 1]) {
    const eye = prim.box(0.07, 0.09, 0.02, PALETTE.black);
    eye.position.set(0.09 * side, 0.27, 0.205);
    head.add(eye);
  }
  const nose = prim.box(0.07, 0.1, 0.08, skin);
  nose.position.set(0, 0.2, 0.22);
  head.add(nose);

  addHair(head, options.hairStyle ?? 'short', hair);
  addAccessories({ head, torso, hand: left.hand, girth, acc, accColor, hair });

  // Characters use a cheap blob shadow instead of real shadow casting (keeps 60 FPS).
  body.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
  body.scale.setScalar(scale);
  return new CharacterRig(
    {
      body,
      hips,
      torso,
      head,
      armL: left.arm,
      armR: right.arm,
      legL,
      legR,
      handL: left.hand,
      handR: right.hand,
    },
    1.95 * scale,
  );
}

function addHair(head: THREE.Group, style: HairStyle, color: number): void {
  switch (style) {
    case 'short': {
      const top = prim.box(0.44, 0.1, 0.44, color);
      top.position.y = 0.46;
      head.add(top);
      break;
    }
    case 'long': {
      const top = prim.box(0.44, 0.12, 0.44, color);
      top.position.y = 0.46;
      const back = prim.box(0.44, 0.5, 0.1, color);
      back.position.set(0, 0.22, -0.22);
      head.add(top, back);
      break;
    }
    case 'bun': {
      const top = prim.box(0.44, 0.1, 0.44, color);
      top.position.y = 0.46;
      const bun = prim.ico(0.14, color);
      bun.position.set(0, 0.6, -0.08);
      head.add(top, bun);
      break;
    }
    case 'mohawk': {
      const crest = prim.box(0.08, 0.25, 0.4, color);
      crest.position.y = 0.55;
      head.add(crest);
      break;
    }
    case 'none':
      break;
  }
}

function addAccessories(args: {
  head: THREE.Group;
  torso: THREE.Group;
  hand: THREE.Group;
  girth: number;
  acc: Set<Accessory>;
  accColor: number;
  hair: number;
}): void {
  const { head, torso, hand, girth, acc, accColor, hair } = args;
  if (acc.has('cap')) {
    const cap = prim.box(0.46, 0.12, 0.46, accColor);
    cap.position.y = 0.49;
    const visor = prim.box(0.4, 0.04, 0.22, accColor);
    visor.position.set(0, 0.45, 0.3);
    head.add(cap, visor);
  }
  if (acc.has('helmet')) {
    const helmet = prim.ico(0.3, accColor, 1);
    helmet.position.y = 0.42;
    helmet.scale.set(1, 0.7, 1);
    head.add(helmet);
  }
  if (acc.has('hat')) {
    const brim = prim.cylinder(0.4, 0.4, 0.04, accColor, 10);
    brim.position.y = 0.45;
    const crown = prim.cylinder(0.22, 0.24, 0.25, accColor, 10);
    crown.position.y = 0.58;
    head.add(brim, crown);
  }
  if (acc.has('glasses') || acc.has('sunglasses')) {
    const color = acc.has('sunglasses') ? PALETTE.black : PALETTE.cyan;
    for (const side of [-1, 1]) {
      const lens = prim.box(0.13, 0.1, 0.03, color);
      lens.position.set(0.1 * side, 0.27, 0.215);
      head.add(lens);
    }
  }
  if (acc.has('beard')) {
    const beard = prim.box(0.42, 0.2, 0.1, hair);
    beard.position.set(0, 0.06, 0.2);
    head.add(beard);
  }
  if (acc.has('mustache')) {
    const mustache = prim.box(0.24, 0.05, 0.05, hair);
    mustache.position.set(0, 0.13, 0.23);
    head.add(mustache);
  }
  if (acc.has('headphones')) {
    for (const side of [-1, 1]) {
      const ear = prim.cylinder(0.09, 0.09, 0.08, accColor, 8);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(0.23 * side, 0.24, 0);
      head.add(ear);
    }
    const band = prim.box(0.5, 0.05, 0.08, accColor);
    band.position.y = 0.48;
    head.add(band);
  }
  if (acc.has('apron')) {
    const apron = prim.box(0.5 * girth, 0.6, 0.04, accColor);
    apron.position.set(0, 0.25, 0.2 * Math.max(1, girth * 0.9));
    torso.add(apron);
  }
  if (acc.has('badge')) {
    const badge = prim.box(0.1, 0.12, 0.03, PALETTE.yellow);
    badge.position.set(0.15, 0.48, 0.19 * Math.max(1, girth * 0.9));
    torso.add(badge);
  }
  if (acc.has('bag')) {
    const bag = prim.box(0.32, 0.36, 0.16, accColor);
    bag.position.y = -0.22;
    const strap = prim.box(0.04, 0.2, 0.04, accColor);
    strap.position.y = -0.02;
    hand.add(bag, strap);
  }
}
