import * as THREE from 'three';

/** Creates a camera-facing text label (canvas sprite), e.g. enemy names or aisle signs. */
export function createTextSprite(
  text: string,
  options: { color?: string; background?: string; height?: number; fontSize?: number } = {},
): THREE.Sprite {
  const fontSize = options.fontSize ?? 48;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const font = `bold ${fontSize}px "Trebuchet MS", "Arial Rounded MT Bold", sans-serif`;
  ctx.font = font;
  const padding = fontSize * 0.4;
  canvas.width = Math.ceil(ctx.measureText(text).width + padding * 2);
  canvas.height = Math.ceil(fontSize * 1.5);
  ctx.font = font;
  if (options.background) {
    ctx.fillStyle = options.background;
    const r = canvas.height / 2;
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, r);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = fontSize * 0.14;
  ctx.strokeStyle = '#1b1b24';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = options.color ?? '#ffffff';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  const height = options.height ?? 0.35;
  sprite.scale.set((height * canvas.width) / canvas.height, height, 1);
  sprite.renderOrder = 10;
  return sprite;
}

const nameTagCache = new Map<string, THREE.Sprite>();

/** Floating name label placed above a character's head. Textures are shared per name. */
export function createNameTag(name: string, color = '#ffe066'): THREE.Sprite {
  const key = `${name}|${color}`;
  let template = nameTagCache.get(key);
  if (!template) {
    template = createTextSprite(name, { color, height: 0.32 });
    nameTagCache.set(key, template);
  }
  return template.clone();
}
