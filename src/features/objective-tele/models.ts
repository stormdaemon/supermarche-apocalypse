import * as THREE from 'three';
import { PALETTE, prim } from '../../core/materials';
import { createTextSprite } from '../../core/nameTag';
import { TELE_CONFIG as CFG } from './config';

/** The giant TV and the material of its glowing screen (animated every frame). */
export interface TelevisionModel {
  root: THREE.Group;
  screen: THREE.MeshBasicMaterial;
}

/** Wide grey display cabinet the TV rests on. Its origin is the center of the stand on the floor. */
export function buildStand(): THREE.Group {
  const { stand } = CFG;
  const group = new THREE.Group();
  const cabinet = prim.box(stand.width, stand.height, stand.depth, stand.color);
  cabinet.position.y = stand.height / 2;
  const trim = prim.box(stand.width + 0.1, 0.08, stand.depth + 0.1, PALETTE.black);
  trim.position.y = stand.height;
  group.add(cabinet, trim);
  group.position.set(stand.position.x, 0, stand.position.z);
  return group;
}

/**
 * Huge flat-screen TV: black box with a glowing screen facing +Z, a red "-90 %" price
 * sign above it and a floating label. The origin is the center of the box.
 * The TV never casts shadows: it moves, and the shadow map is only rendered on demand.
 */
export function buildTelevision(): TelevisionModel {
  const { tv, labels, texts } = CFG;
  const root = new THREE.Group();
  const body = prim.box(tv.width, tv.height, tv.depth, tv.bodyColor);
  const screen = new THREE.MeshBasicMaterial({ color: tv.screenColor });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(tv.width - 0.3, tv.height - 0.3), screen);
  glass.position.z = tv.depth / 2 + 0.01;

  const sign = createTextSprite(texts.priceSign, {
    background: '#e63946',
    color: '#ffe066',
    height: labels.priceSignHeight,
    fontSize: 96,
  });
  sign.position.y = tv.height / 2 + labels.priceSignOffset;
  const label = createTextSprite(texts.label, {
    background: '#1b1b24',
    color: '#ffffff',
    height: labels.labelHeight,
    fontSize: 56,
  });
  label.position.y = tv.height / 2 + labels.labelOffset;

  root.add(body, glass, sign, label);
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
  return { root, screen };
}

/** Red arrow pointing down with a "VOLEUR !" tag, shown above the thief. Origin: tip of the arrow. */
export function buildMarker(): THREE.Group {
  const group = new THREE.Group();
  const arrow = prim.cone(0.4, 0.8, PALETTE.red, 4);
  arrow.rotation.x = Math.PI;
  arrow.position.y = 0.4;
  arrow.castShadow = false;
  const tag = createTextSprite(CFG.texts.thiefMarker, {
    background: '#e63946',
    color: '#ffffff',
    height: 0.45,
    fontSize: 64,
  });
  tag.position.y = 1;
  group.add(arrow, tag);
  group.visible = false;
  return group;
}
