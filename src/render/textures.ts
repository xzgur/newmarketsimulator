/** Canvas-generated textures: product labels, signs, posters, floor, ceiling. */
import * as THREE from 'three';
import type { LabelIcon, ProductDef } from '../data/products';

export const DISPLAY_FONT = '"Baloo 2", "Trebuchet MS", system-ui, sans-serif';
export const INK = '#1b1730';
export const BODY_FONT = '"Nunito", "Trebuchet MS", system-ui, sans-serif';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, family: string, weight: string, maxW: number, start: number, min = 8): number {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (ctx.measureText(text).width > maxW && size > min) {
    size -= 1;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = c.getHSL({ h: 0, s: 0, l: 0 });
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function isLight(hex: string): boolean {
  const c = new THREE.Color(hex);
  return c.r * 0.3 + c.g * 0.59 + c.b * 0.11 > 0.6;
}

/** Simple vector icons for product labels. */
export function drawIcon(ctx: CanvasRenderingContext2D, icon: LabelIcon, cx: number, cy: number, r: number, color: string, bg: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const circle = (x: number, y: number, rr: number) => {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  };
  switch (icon) {
    case 'cow': {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.95, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      circle(-r * 0.35, -r * 0.25, r * 0.28);
      circle(r * 0.4, r * 0.2, r * 0.22);
      circle(r * 0.1, -r * 0.55, r * 0.12);
      ctx.fillStyle = '#f9a8d4';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.42, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      circle(-r * 0.15, r * 0.45, r * 0.06);
      circle(r * 0.15, r * 0.45, r * 0.06);
      break;
    }
    case 'drop':
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.1, r * 0.8, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.9, -r * 0.1, 0, -r);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.25, r * 0.25, r * 0.14, r * 0.28, -0.4, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'egg':
      for (const [x, s] of [
        [-r * 0.45, 0.75],
        [r * 0.45, 0.75],
        [0, 0.9],
      ] as const) {
        ctx.fillStyle = '#fff7ed';
        ctx.beginPath();
        ctx.ellipse(x, r * 0.05, r * 0.42 * s, r * 0.58 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = r * 0.05;
        ctx.stroke();
      }
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, r * 0.8);
      ctx.quadraticCurveTo(-r * 0.9, -r * 0.9, r * 0.85, -r * 0.85);
      ctx.quadraticCurveTo(r * 0.9, r * 0.9, -r * 0.8, r * 0.8);
      ctx.fill();
      ctx.strokeStyle = bg;
      ctx.lineWidth = r * 0.08;
      ctx.beginPath();
      ctx.moveTo(-r * 0.75, r * 0.75);
      ctx.lineTo(r * 0.55, -r * 0.55);
      ctx.stroke();
      break;
    case 'flame':
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 0.8, r * 0.9, 0, r * 0.9);
      ctx.bezierCurveTo(-r * 0.8, r * 0.9, -r * 0.9, 0, -r * 0.2, -r * 0.3);
      ctx.bezierCurveTo(-r * 0.1, -r * 0.1, r * 0.1, -r * 0.5, 0, -r);
      ctx.fill();
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.45, r * 0.32, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bubbles':
      ctx.globalAlpha = 0.9;
      circle(-r * 0.3, r * 0.2, r * 0.55);
      circle(r * 0.45, -r * 0.35, r * 0.38);
      circle(r * 0.5, r * 0.55, r * 0.22);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      circle(-r * 0.5, 0, r * 0.15);
      break;
    case 'star':
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      break;
    case 'sun':
      circle(0, 0, r * 0.5);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.65, Math.sin(a) * r * 0.65);
        ctx.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
        ctx.stroke();
      }
      break;
    case 'wheat':
      ctx.beginPath();
      ctx.moveTo(0, r);
      ctx.lineTo(0, -r * 0.9);
      ctx.stroke();
      for (let i = 0; i < 4; i++) {
        const y = -r * 0.7 + i * r * 0.38;
        for (const s of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(s * r * 0.22, y, r * 0.16, r * 0.3, s * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    case 'bean':
      for (const [x, y, a] of [
        [-r * 0.35, -r * 0.2, 0.6],
        [r * 0.35, -r * 0.1, -0.4],
        [0, r * 0.45, 0.1],
      ] as const) {
        ctx.beginPath();
        ctx.ellipse(x, y, r * 0.38, r * 0.25, a, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'cup':
      roundRect(ctx, -r * 0.6, -r * 0.3, r * 1.0, r * 1.0, r * 0.2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(r * 0.45, r * 0.2, r * 0.28, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      ctx.lineWidth = r * 0.09;
      for (const x of [-r * 0.3, 0, r * 0.3]) {
        ctx.beginPath();
        ctx.moveTo(x - r * 0.1, -r * 0.45);
        ctx.quadraticCurveTo(x + r * 0.12, -r * 0.65, x - r * 0.05, -r * 0.95);
        ctx.stroke();
      }
      break;
    case 'fruit':
      circle(0, r * 0.15, r * 0.75);
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(r * 0.25, -r * 0.65, r * 0.32, r * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      circle(-r * 0.3, -r * 0.1, r * 0.18);
      break;
    case 'fish':
      ctx.beginPath();
      ctx.ellipse(-r * 0.1, 0, r * 0.7, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(r * 0.5, 0);
      ctx.lineTo(r * 0.95, -r * 0.4);
      ctx.lineTo(r * 0.95, r * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = bg;
      circle(-r * 0.45, -r * 0.1, r * 0.09);
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, r * 0.85);
      ctx.bezierCurveTo(-r * 1.2, 0, -r * 0.6, -r * 1.0, 0, -r * 0.4);
      ctx.bezierCurveTo(r * 0.6, -r * 1.0, r * 1.2, 0, 0, r * 0.85);
      ctx.fill();
      break;
    case 'tooth':
      ctx.beginPath();
      ctx.moveTo(-r * 0.7, -r * 0.5);
      ctx.quadraticCurveTo(-r * 0.7, -r * 0.95, 0, -r * 0.7);
      ctx.quadraticCurveTo(r * 0.7, -r * 0.95, r * 0.7, -r * 0.5);
      ctx.quadraticCurveTo(r * 0.75, r * 0.2, r * 0.4, r * 0.9);
      ctx.quadraticCurveTo(r * 0.15, r * 0.3, 0, r * 0.3);
      ctx.quadraticCurveTo(-r * 0.15, r * 0.3, -r * 0.4, r * 0.9);
      ctx.quadraticCurveTo(-r * 0.75, r * 0.2, -r * 0.7, -r * 0.5);
      ctx.fill();
      break;
    case 'cloud':
      circle(-r * 0.4, r * 0.15, r * 0.42);
      circle(r * 0.05, -r * 0.15, r * 0.52);
      circle(r * 0.5, r * 0.15, r * 0.4);
      ctx.fillRect(-r * 0.4, r * 0.15, r * 0.9, r * 0.42);
      break;
    default:
      break;
  }
  ctx.restore();
}

const labelCache = new Map<string, THREE.CanvasTexture>();

/**
 * Product label. `aspect` = width / height of the face it is printed on;
 * `repeat` draws the design several times side by side (for cylinders).
 */
export function productLabel(p: ProductDef, aspect: number, repeat = 1): THREE.CanvasTexture {
  const key = `${p.id}|${aspect.toFixed(2)}|${repeat}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const H = 256;
  const W = Math.round(Math.max(96, Math.min(1024, H * aspect)));
  const [c, ctx] = canvas(W, H);
  const tile = W / repeat;
  for (let k = 0; k < repeat; k++) {
    ctx.save();
    ctx.translate(k * tile, 0);
    drawLabelDesign(ctx, p, tile, H);
    ctx.restore();
  }
  const t = toTexture(c);
  labelCache.set(key, t);
  return t;
}

function drawLabelDesign(ctx: CanvasRenderingContext2D, p: ProductDef, W: number, H: number) {
  const bg = p.color;
  const ac = p.accent;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(bg, 0.06));
  g.addColorStop(1, shade(bg, -0.08));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const textOnBg = isLight(bg) ? '#1f2937' : '#ffffff';
  const textOnAc = isLight(ac) ? '#1f2937' : '#ffffff';
  const narrow = W < H * 0.75;
  if (p.brand) {
    ctx.fillStyle = ac;
    const bh = H * 0.2;
    roundRect(ctx, W * 0.06, H * 0.05, W * 0.88, bh, bh * 0.45);
    ctx.fill();
    ctx.fillStyle = textOnAc;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitFont(ctx, p.brand, DISPLAY_FONT, '800', W * 0.8, Math.round(bh * 0.72));
    ctx.fillText(p.brand, W / 2, H * 0.05 + bh / 2 + 1);
  }
  const iconY = H * 0.47;
  const iconX = narrow ? W / 2 : W * 0.24;
  const iconR = Math.min(W * (narrow ? 0.3 : 0.17), H * 0.17);
  ctx.fillStyle = shade(ac, isLight(bg) ? 0.42 : 0.25);
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(iconX, iconY, iconR * 1.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  if (p.icon && p.icon !== 'none') drawIcon(ctx, p.icon, iconX, iconY, iconR, ac, bg);
  const label = p.label ?? p.name.toLocaleUpperCase('tr-TR');
  ctx.fillStyle = textOnBg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (narrow) {
    fitFont(ctx, label, DISPLAY_FONT, '800', W * 0.9, Math.round(H * 0.13));
    ctx.fillText(label, W / 2, H * 0.74);
  } else {
    ctx.font = `800 ${Math.round(H * 0.17)}px ${DISPLAY_FONT}`;
    const words = label.split(' ');
    const lines =
      words.length > 1 && ctx.measureText(label).width > W * 0.5
        ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
        : [label];
    const size = Math.min(...lines.map((l) => fitFont(ctx, l, DISPLAY_FONT, '800', W * 0.52, Math.round(H * 0.17))));
    ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
    lines.forEach((l, i) => ctx.fillText(l, W * 0.69, iconY + (i - (lines.length - 1) / 2) * size * 1.05));
  }
  if (p.sub) {
    ctx.font = `800 ${Math.round(H * 0.085)}px ${BODY_FONT}`;
    const tw = ctx.measureText(p.sub).width + H * 0.08;
    ctx.fillStyle = ac;
    roundRect(ctx, W / 2 - tw / 2, H * 0.84, tw, H * 0.12, H * 0.06);
    ctx.fill();
    ctx.fillStyle = textOnAc;
    ctx.fillText(p.sub, W / 2, H * 0.9 + 1);
  }
  const sh = ctx.createLinearGradient(0, 0, W, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  sh.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = sh;
  ctx.fillRect(0, 0, W, H);
}

/** Cartoon sticker sign: ink outline, 3D lip, aisle badge, icon and outlined text. */
export function aisleSignTexture(name: string, color: string, aisle: number, icon: LabelIcon = 'star'): THREE.CanvasTexture {
  const W = 1024;
  const H = 288;
  const [c, ctx] = canvas(W, H);
  const lip = 26;
  // body with a darker lip underneath (reads as a chunky 3D slab)
  ctx.fillStyle = INK;
  roundRect(ctx, 6, 6, W - 12, H - 12, 70);
  ctx.fill();
  ctx.fillStyle = shade(color, -0.16);
  roundRect(ctx, 18, 18, W - 36, H - 36, 60);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, 18, 18, W - 36, H - 36 - lip, 60);
  ctx.fill();
  // glossy band
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  roundRect(ctx, 46, 30, W - 92, 46, 23);
  ctx.fill();
  let x = 70;
  if (aisle > 0) {
    const cx = 140;
    const cy = (H - lip) / 2 + 4;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(cx, cy, 84, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFD23F';
    ctx.beginPath();
    ctx.arc(cx, cy, 72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = `800 118px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(aisle), cx, cy + 10);
    x = 250;
  } else {
    const cx = 128;
    const cy = (H - lip) / 2 + 4;
    ctx.fillStyle = '#FFF4DC';
    ctx.beginPath();
    ctx.arc(cx, cy, 74, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.stroke();
    drawIcon(ctx, icon, cx, cy, 50, shade(color, -0.1), '#FFF4DC');
    x = 230;
  }
  const text = name.toUpperCase();
  const maxW = W - x - 60;
  const size = fitFont(ctx, text, DISPLAY_FONT, '800', maxW, 124, 40);
  ctx.font = `800 ${size}px ${DISPLAY_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const ty = (H - lip) / 2 + size * 0.1;
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(10, size * 0.16);
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.fillText(text, x + 4, ty + 9);
  ctx.strokeText(text, x, ty);
  ctx.fillStyle = '#FFF4DC';
  ctx.fillText(text, x, ty);
  return toTexture(c);
}

export interface TagAtlas {
  texture: THREE.CanvasTexture;
  uv: Map<string, [number, number, number, number]>;
}

/** All shelf-edge price tags packed into one texture. */
export function priceTagAtlas(entries: { key: string; name: string; price: string; color: string; promo?: boolean }[]): TagAtlas {
  const tw = 512;
  const th = 128;
  const cols = 4;
  const rows = Math.ceil(entries.length / cols);
  const [c, ctx] = canvas(tw * cols, th * rows);
  const uv = new Map<string, [number, number, number, number]>();
  entries.forEach((e, i) => {
    const x = (i % cols) * tw;
    const y = Math.floor(i / cols) * th;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = e.promo ? '#fde047' : '#fffdf5';
    ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = e.color;
    ctx.fillRect(0, 0, tw, 18);
    ctx.fillStyle = '#1f2937';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    fitFont(ctx, e.name, BODY_FONT, '800', 300, 40, 18);
    ctx.fillText(e.name, 18, 62);
    ctx.font = `600 22px ${BODY_FONT}`;
    ctx.fillStyle = '#6b7280';
    ctx.fillText(e.promo ? 'SALE' : 'Unit price', 18, 102);
    ctx.textAlign = 'right';
    ctx.fillStyle = e.promo ? '#dc2626' : '#111827';
    fitFont(ctx, e.price, DISPLAY_FONT, '800', 170, 50, 20);
    ctx.fillText(e.price, tw - 16, 72);
    ctx.restore();
    uv.set(e.key, [x / c.width, 1 - (y + th) / c.height, (x + tw) / c.width, 1 - y / c.height]);
  });
  return { texture: toTexture(c), uv };
}

export function floorTexture(): THREE.CanvasTexture {
  const S = 1024;
  const [c, ctx] = canvas(S, S);
  const tiles = 4;
  const s = S / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const dark = (i + j) % 2 === 1;
      const base = dark ? [246, 214, 168] : [255, 243, 222];
      const jit = ((i * 7 + j * 13) % 5) - 2;
      const g = ctx.createLinearGradient(i * s, j * s, (i + 1) * s, (j + 1) * s);
      g.addColorStop(0, `rgb(${base[0] + jit + 3},${base[1] + jit + 3},${base[2] + jit + 3})`);
      g.addColorStop(1, `rgb(${base[0] + jit - 3},${base[1] + jit - 3},${base[2] + jit - 3})`);
      ctx.fillStyle = g;
      ctx.fillRect(i * s, j * s, s, s);
    }
  }
  ctx.strokeStyle = 'rgba(120,90,60,0.28)';
  ctx.lineWidth = 5;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * s, 0);
    ctx.lineTo(i * s, S);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * s);
    ctx.lineTo(S, i * s);
    ctx.stroke();
  }
  for (let k = 0; k < 2500; k++) {
    ctx.fillStyle = `rgba(90,80,60,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 2, 2);
  }
  return toTexture(c, [36 / 2.4, 30 / 2.4]);
}

export function ceilingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#fffaf0';
  ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 2500; k++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  ctx.strokeStyle = '#c9c4b8';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 256);
  return toTexture(c, [30, 25]);
}

export function wallTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  ctx.fillStyle = '#fff6e4';
  ctx.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 3000; k++) {
    ctx.fillStyle = `rgba(150,120,80,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
  }
  return toTexture(c, [8, 1]);
}

/** Lower wall tiles (wainscot). */
export function wainscotTexture(color: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  for (let x = -64; x <= 256; x += 64) {
    for (let y = 0; y <= 128; y += 32) ctx.strokeRect(x + ((y / 32) % 2) * 32, y, 64, 32);
  }
  return toTexture(c, [24, 1]);
}

export function asphaltTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#4a4d52';
  ctx.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 4000; k++) {
    const g = 60 + Math.random() * 40;
    ctx.fillStyle = `rgba(${g},${g},${g + 4},0.5)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return toTexture(c, [20, 6]);
}

export function pavementTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = '#c9c2b4';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#a99f8e';
  ctx.lineWidth = 3;
  for (let y = 0; y < 256; y += 32) {
    for (let x = -32; x < 256; x += 64) ctx.strokeRect(x + ((y / 32) % 2) * 32, y, 64, 32);
  }
  return toTexture(c, [40, 3]);
}

/** Promo poster. */
export function posterTexture(title: string, sub: string, bg: string, fg = '#ffffff', icon: LabelIcon = 'star'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 720);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 720);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.moveTo(256, 300);
    const a0 = (i / 9) * Math.PI * 2;
    ctx.arc(256, 300, 600, a0, a0 + Math.PI / 9);
    ctx.closePath();
    ctx.fill();
  }
  drawIcon(ctx, icon, 256, 290, 150, fg, bg);
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, title, DISPLAY_FONT, '800', 460, 120);
  ctx.fillText(title, 256, 540);
  fitFont(ctx, sub, BODY_FONT, '800', 460, 46);
  ctx.fillText(sub, 256, 640);
  return toTexture(c);
}

/** Storefront / generic text panel. */
export function bannerTexture(text: string, sub: string, bg: string, fg = '#ffffff', w = 1024, h = 256): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, w, h, h * 0.18);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, text, DISPLAY_FONT, '800', w * 0.9, Math.round(h * (sub ? 0.5 : 0.62)));
  ctx.fillText(text, w / 2, sub ? h * 0.4 : h * 0.52);
  if (sub) {
    fitFont(ctx, sub, BODY_FONT, '800', w * 0.85, Math.round(h * 0.2));
    ctx.fillText(sub, w / 2, h * 0.78);
  }
  return toTexture(c);
}

/** Speech bubble for sprites. */
export function bubbleTexture(text: string, bg = '#ffffff', fg = '#1f2937'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 192);
  ctx.font = `800 64px ${DISPLAY_FONT}`;
  const tw = Math.min(480, ctx.measureText(text).width + 70);
  const x = 256 - tw / 2;
  ctx.fillStyle = bg;
  ctx.lineWidth = 8;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(236, 128);
  ctx.lineTo(256, 172);
  ctx.lineTo(282, 128);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  roundRect(ctx, x, 14, tw, 120, 50);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fitFont(ctx, text, DISPLAY_FONT, '800', tw - 50, 64);
  ctx.fillText(text, 256, 78);
  return toTexture(c);
}

/** Soft radial glow (fake light pools / halos). */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c);
}
