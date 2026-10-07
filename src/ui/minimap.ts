import type { StoreLayout } from '../data/layout';
import { SECTIONS } from '../data/products';

export interface MinimapMarker {
  x: number;
  z: number;
  color: string;
  pulse?: boolean;
  label?: string;
}

/** Top-down store map with section colours, cart arrow and objective markers. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement;
  private scale: number;
  private ox: number;
  private oz: number;
  private time = 0;

  constructor(private layout: StoreLayout, width = 230) {
    const b = layout.bounds;
    const pad = 8;
    this.scale = (width - pad * 2) / (b.maxX - b.minX);
    const height = Math.round((b.maxZ - b.minZ + 3) * this.scale + pad * 2);
    this.ox = pad - b.minX * this.scale;
    this.oz = pad - b.minZ * this.scale;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas = document.createElement('canvas');
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.base = document.createElement('canvas');
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    const bctx = this.base.getContext('2d')!;
    bctx.scale(dpr, dpr);
    this.drawBase(bctx, width, height);
  }

  private px(x: number) {
    return this.ox + x * this.scale;
  }
  private pz(z: number) {
    return this.oz + z * this.scale;
  }

  private drawBase(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const b = this.layout.bounds;
    ctx.fillStyle = 'rgba(15,20,30,0.0)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#eef1f5';
    ctx.fillRect(this.px(b.minX), this.pz(b.minZ), (b.maxX - b.minX) * this.scale, (b.maxZ - b.minZ) * this.scale);
    ctx.strokeStyle = '#2b3a55';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.px(b.minX), this.pz(b.minZ), (b.maxX - b.minX) * this.scale, (b.maxZ - b.minZ) * this.scale);
    // door gap
    const d = this.layout.door;
    ctx.strokeStyle = '#eef1f5';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.px(d.minX), this.pz(d.z));
    ctx.lineTo(this.px(d.maxX), this.pz(d.z));
    ctx.stroke();
    // outside (street)
    ctx.fillStyle = '#5b5f66';
    ctx.fillRect(this.px(b.minX), this.pz(b.maxZ) + 3, (b.maxX - b.minX) * this.scale, 2 * this.scale);

    for (const f of this.layout.furniture) {
      ctx.fillStyle = f.section ? SECTIONS[f.section].color : '#9aa3ad';
      const x = this.px(f.box.minX);
      const z = this.pz(f.box.minZ);
      ctx.fillRect(x, z, (f.box.maxX - f.box.minX) * this.scale, (f.box.maxZ - f.box.minZ) * this.scale);
    }
    // section labels
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const seen = new Set<string>();
    for (const f of this.layout.furniture) {
      if (!f.section || seen.has(f.section)) continue;
      seen.add(f.section);
      const sec = SECTIONS[f.section];
      let cx = (f.box.minX + f.box.maxX) / 2;
      let cz = (f.box.minZ + f.box.maxZ) / 2;
      let rotate = false;
      if (f.kind === 'gondola') rotate = true;
      if (f.kind === 'wallShelf') {
        rotate = true;
        cx += cx < 0 ? 1.4 : -1.4;
      }
      if (f.kind === 'fridge') cz += 1.4;
      if (f.kind === 'produceIsland') cz += 2.2;
      ctx.save();
      ctx.translate(this.px(cx), this.pz(cz));
      if (rotate) ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = '#1b2333';
      ctx.fillText(sec.name, 0, 0);
      ctx.restore();
    }
  }

  draw(cart: { x: number; z: number; heading: number }, markers: MinimapMarker[], dt: number) {
    this.time += dt;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.base, 0, 0);
    ctx.restore();
    for (const m of markers) {
      const r = m.pulse ? 5 + Math.sin(this.time * 6) * 2 : 4;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(this.px(m.x), this.pz(m.z), r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (m.label) {
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.fillStyle = '#1b2333';
        ctx.textAlign = 'center';
        ctx.fillText(m.label, this.px(m.x), this.pz(m.z) - 9);
      }
    }
    // cart arrow
    ctx.save();
    ctx.translate(this.px(cart.x), this.pz(cart.z));
    ctx.rotate(-cart.heading + Math.PI);
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#1b2333';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
