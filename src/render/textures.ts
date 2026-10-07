import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, repeat?: [number, number]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

const cache = new Map<string, THREE.CanvasTexture>();

/** Product label: coloured background, accent stripe and short text. */
export function labelTexture(bg: string, accent: string, text: string): THREE.CanvasTexture {
  const key = `label|${bg}|${accent}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(256, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 34, 256, 60);
  ctx.fillStyle = bg;
  ctx.font = 'bold 34px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 34;
  while (ctx.measureText(text).width > 236 && size > 14) {
    size -= 2;
    ctx.font = `bold ${size}px "Trebuchet MS", Arial, sans-serif`;
  }
  ctx.fillText(text, 128, 65);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

/** Large aisle sign with section name. */
export function signTexture(text: string, color: string, sub?: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(1024, 256);
  ctx.fillStyle = color;
  roundRect(ctx, 0, 0, 1024, 256, 40);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, 14, 14, 996, 110, 30);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 120;
  ctx.font = `900 ${size}px "Trebuchet MS", Arial, sans-serif`;
  while (ctx.measureText(text).width > 940) {
    size -= 6;
    ctx.font = `900 ${size}px "Trebuchet MS", Arial, sans-serif`;
  }
  ctx.fillText(text, 512, sub ? 112 : 132);
  if (sub) {
    ctx.font = 'bold 54px "Trebuchet MS", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(sub, 512, 205);
  }
  return toTexture(c);
}

/** Shelf-edge price strip with the product name. */
export function priceTagTexture(name: string, price: string, color: string): THREE.CanvasTexture {
  const key = `tag|${name}|${price}|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = '#fffef6';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 14, 96);
  ctx.fillStyle = '#222';
  ctx.font = 'bold 40px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  let size = 40;
  while (ctx.measureText(name).width > 330 && size > 20) {
    size -= 2;
    ctx.font = `bold ${size}px Arial, sans-serif`;
  }
  ctx.fillText(name, 26, 48);
  ctx.fillStyle = '#d62828';
  ctx.font = '900 44px Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(price, 500, 50);
  const t = toTexture(c);
  cache.set(key, t);
  return t;
}

export function floorTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 512);
  const tiles = 4;
  const s = 512 / tiles;
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      const v = (i + j) % 2 === 0 ? 236 : 226;
      const jitter = ((i * 7 + j * 13) % 5) - 2;
      ctx.fillStyle = `rgb(${v + jitter},${v + jitter},${v - 4 + jitter})`;
      ctx.fillRect(i * s, j * s, s, s);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 3;
      ctx.strokeRect(i * s + 1.5, j * s + 1.5, s - 3, s - 3);
    }
  }
  // subtle speckles
  for (let k = 0; k < 1500; k++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  return toTexture(c, [18, 14]);
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

/** Text sprite texture for floating labels (e.g. "Teslimat Noktası"). */
export function textTexture(text: string, bg = 'rgba(20,24,33,0.85)', fg = '#fff'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = bg;
  roundRect(ctx, 4, 4, 504, 120, 40);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = 'bold 54px "Trebuchet MS", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  return toTexture(c);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface TagAtlas {
  texture: THREE.CanvasTexture;
  /** uv rect [u0, v0, u1, v1] per key */
  uv: Map<string, [number, number, number, number]>;
}

/** All shelf price tags packed into one texture (one draw call for every tag). */
export function priceTagAtlas(entries: { key: string; name: string; price: string; color: string }[]): TagAtlas {
  const tw = 512;
  const th = 96;
  const cols = 4;
  const rows = Math.ceil(entries.length / cols);
  const [c, ctx] = canvas(tw * cols, th * rows);
  const uv = new Map<string, [number, number, number, number]>();
  entries.forEach((e, i) => {
    const tile = priceTagTexture(e.name, e.price, e.color).image as HTMLCanvasElement;
    const x = (i % cols) * tw;
    const y = Math.floor(i / cols) * th;
    ctx.drawImage(tile, x, y);
    uv.set(e.key, [x / c.width, 1 - (y + th) / c.height, (x + tw) / c.width, 1 - y / c.height]);
  });
  const texture = toTexture(c);
  return { texture, uv };
}
