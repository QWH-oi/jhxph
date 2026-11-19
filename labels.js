import * as THREE from 'three';

const FONT_STACK = '"Bahnschrift", "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
const MONO_STACK = '"Cascadia Code", "SFMono-Regular", "Consolas", monospace';

function colorToRgba(color, alpha = 1) {
  const c = new THREE.Color(color);
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${alpha})`;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * 高清 Canvas 文本精灵。返回的 sprite 带有 update(text, opts) 方法。
 */
export function makeTextSprite(text, options = {}) {
  const {
    fontSize = 34,
    color = '#dffaff',
    background = false,
    border = false,
    height = 0.3,
    weight = 500,
    mono = false,
    padding = 18,
    radius = 12,
    opacity = 1,
    depthTest = false,
    lineGap = 8,
    align = 'center',
  } = options;

  const sprite = new THREE.Sprite();
  sprite.renderOrder = 40;
  sprite.userData.isLabel = true;

  const draw = (labelText, nextOptions = {}) => {
    const opts = { ...options, ...nextOptions };
    const dpr = 2;
    const lines = String(labelText).split('\n');
    const fontFamily = opts.mono ? MONO_STACK : FONT_STACK;
    const px = (opts.fontSize ?? fontSize) * dpr;
    const pad = (opts.padding ?? padding) * dpr;
    const gap = (opts.lineGap ?? lineGap) * dpr;

    const measureCanvas = document.createElement('canvas');
    const mctx = measureCanvas.getContext('2d');
    mctx.font = `${opts.weight ?? weight} ${px}px ${fontFamily}`;
    const widths = lines.map((line) => mctx.measureText(line).width);
    const maxWidth = Math.max(...widths, px * 0.8);
    const lineHeight = px * 1.2;
    const totalTextHeight = lines.length * lineHeight + (lines.length - 1) * gap;
    const w = Math.ceil(maxWidth + pad * 2 + 8);
    const h = Math.ceil(totalTextHeight + pad * 2);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);

    if (opts.background) {
      roundedRect(ctx, 1, 1, w - 2, h - 2, (opts.radius ?? radius) * dpr);
      ctx.fillStyle = 'rgba(4, 13, 23, 0.82)';
      ctx.fill();
      if (opts.border) {
        ctx.strokeStyle = colorToRgba(opts.color ?? color, 0.28);
        ctx.lineWidth = 1.1 * dpr;
        ctx.stroke();
      }
    }

    ctx.font = `${opts.weight ?? weight} ${px}px ${fontFamily}`;
    ctx.textAlign = opts.align === 'left' ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = opts.color ?? color;
    ctx.shadowColor = colorToRgba(opts.color ?? color, 0.5);
    ctx.shadowBlur = 10 * dpr;

    const startX = opts.align === 'left' ? pad : w / 2;
    const startY = pad + lineHeight / 2;
    lines.forEach((line, index) => {
      ctx.fillText(line, startX, startY + index * (lineHeight + gap));
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    if (sprite.material.map) sprite.material.map.dispose();
    sprite.material.map = texture;
    sprite.material.opacity = opts.opacity ?? opacity;
    sprite.material.depthTest = opts.depthTest ?? depthTest;
    sprite.material.transparent = true;
    sprite.material.needsUpdate = true;
    const worldHeight = opts.height ?? height;
    sprite.scale.set((worldHeight * w) / h, worldHeight, 1);
    sprite.userData.text = labelText;
  };

  draw(text, options);
  sprite.userData.update = draw;
  return sprite;
}

export function makeGlowSprite(color = '#67e8f9', size = 0.9, opacity = 0.65) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, colorToRgba('#ffffff', 0.94));
  gradient.addColorStop(0.16, colorToRgba(color, 0.8));
  gradient.addColorStop(0.46, colorToRgba(color, 0.24));
  gradient.addColorStop(1, colorToRgba(color, 0));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 30;
  return sprite;
}

export function makeRingSprite(color = '#67e8f9', size = 0.8, opacity = 0.75) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = colorToRgba(color, 0.9);
  ctx.lineWidth = 2.4;
  ctx.shadowColor = colorToRgba(color, 1);
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  sprite.renderOrder = 31;
  return sprite;
}

export function createLine(points, color = '#67e8f9', opacity = 0.5, dashed = false, dashSize = 0.12, gapSize = 0.08) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  let material;
  if (dashed) {
    material = new THREE.LineDashedMaterial({
      color,
      transparent: true,
      opacity,
      dashSize,
      gapSize,
      depthWrite: false,
      toneMapped: false,
    });
  } else {
    material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      toneMapped: false,
    });
  }
  const line = new THREE.Line(geometry, material);
  if (dashed) line.computeLineDistances();
  return line;
}

export function createTube(points, color, radius = 0.022, opacity = 0.9) {
  if (points.length < 2) return new THREE.Group();
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, Math.max(24, points.length * 2), radius, 6, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  return new THREE.Mesh(geometry, material);
}

export function disposeObject(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });
}

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
