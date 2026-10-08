/**
 * Lighting moods. The same store reads very differently at noon, at sunset
 * and on the night shift: sky HDR, sun, interior fixtures, street lamps and
 * the colour grade all change together.
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { StoreView } from './store';
import { assetUrl } from './assets';
import type { OutsideView } from './outside';
import type { Post } from './post';

import type { MoodId } from './moodIds';
export type { MoodId };

export interface MoodDef {
  id: MoodId;
  name: string;
  sub: string;
  hdr: string;
  skyIntensity: number;
  hemi: [string, string, number];
  ambient: number;
  sun: { color: string; intensity: number; pos: [number, number, number] };
  fixtures: number;
  fixtureColor: string;
  pools: number;
  points: { color: string; intensity: number };
  streetLamps: number;
  envIntensity: number;
  exposure: number;
  grade: { vignette: number; saturation: number; contrast: number; tint: string; bloom: number; bloomThreshold: number };
  fog: string;
  /** Brightness of the street outside. */
  daylight: number;
}

export const MOODS: Record<MoodId, MoodDef> = {
  day: {
    id: 'day',
    name: 'Öğle Telaşı',
    sub: 'Güneşli, ferah, cıvıl cıvıl',
    hdr: 'spruit_sunrise_1k.hdr',
    skyIntensity: 1.0,
    hemi: ['#fff6ea', '#c9b8ff', 1.25],
    ambient: 0.25,
    sun: { color: '#fff3dc', intensity: 2.4, pos: [12, 26, 18] },
    fixtures: 2.6,
    fixtureColor: '#fff4e0',
    pools: 0.07,
    points: { color: '#fff1dc', intensity: 0 },
    streetLamps: 0,
    envIntensity: 0.45,
    exposure: 1.0,
    grade: { vignette: 0.22, saturation: 1.12, contrast: 1.04, tint: '#ffffff', bloom: 0.28, bloomThreshold: 2.3 },
    fog: '#cfe3f2',
    daylight: 1,
  },
  sunset: {
    id: 'sunset',
    name: 'Gün Batımı',
    sub: 'Altın saat, sıcak tonlar',
    hdr: 'venice_sunset_1k.hdr',
    skyIntensity: 0.9,
    hemi: ['#ffd9b0', '#7a5a4a', 0.95],
    ambient: 0.25,
    sun: { color: '#ffb36b', intensity: 3.4, pos: [-28, 9, 30] },
    fixtures: 3.0,
    fixtureColor: '#ffe7c4',
    pools: 0.1,
    points: { color: '#ffcf99', intensity: 3 },
    streetLamps: 1.5,
    envIntensity: 0.45,
    exposure: 1.0,
    grade: { vignette: 0.38, saturation: 1.18, contrast: 1.06, tint: '#fff1e2', bloom: 0.4, bloomThreshold: 2.0 },
    fog: '#e8b996',
    daylight: 0.8,
  },
  night: {
    id: 'night',
    name: 'Gece Vardiyası',
    sub: 'Neon, sokak lambaları, sessizlik',
    hdr: 'moonless_golf_1k.hdr',
    skyIntensity: 0.6,
    hemi: ['#a9c3ff', '#1d2233', 0.35],
    ambient: 0.12,
    sun: { color: '#9db8ff', intensity: 0.35, pos: [8, 25, 20] },
    fixtures: 4.2,
    fixtureColor: '#e8f1ff',
    pools: 0.2,
    points: { color: '#fff0d8', intensity: 9 },
    streetLamps: 4,
    envIntensity: 0.3,
    exposure: 1.1,
    grade: { vignette: 0.5, saturation: 1.2, contrast: 1.1, tint: '#eef3ff', bloom: 0.45, bloomThreshold: 2.2 },
    fog: '#0b1020',
    daylight: 0.22,
  },
};

export class Lighting {
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#888888', 1);
  readonly ambient = new THREE.AmbientLight('#ffffff', 0.3);
  readonly sun = new THREE.DirectionalLight('#ffffff', 2);
  private points: THREE.PointLight[] = [];
  private streetPoints: THREE.PointLight[] = [];
  private hdrCache = new Map<string, THREE.Texture>();
  private roomEnv: THREE.Texture;
  mood: MoodDef = MOODS.day;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    shadows: boolean,
  ) {
    scene.add(this.hemi, this.ambient, this.sun, this.sun.target);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -24;
    s.right = 24;
    s.top = 24;
    s.bottom = -24;
    s.near = 1;
    s.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = this.roomEnv;
  }

  /** Real point lights at a few fixture spots (warm pools; strongest at night). */
  placePoints(store: StoreView, outside: OutsideView) {
    for (const l of [...this.points, ...this.streetPoints]) l.removeFromParent();
    this.points = [];
    this.streetPoints = [];
    const spots = store.lightSpots.filter((_, i) => i % 3 === 0).slice(0, 8);
    for (const p of spots) {
      const l = new THREE.PointLight('#fff0d8', 0, 12, 1.6);
      l.position.copy(p);
      this.scene.add(l);
      this.points.push(l);
    }
    for (const p of outside.lampSpots.slice(0, 4)) {
      const l = new THREE.PointLight('#ffcf7a', 0, 14, 1.5);
      l.position.copy(p);
      this.scene.add(l);
      this.streetPoints.push(l);
    }
  }

  async loadSky(def: MoodDef): Promise<THREE.Texture> {
    const hit = this.hdrCache.get(def.hdr);
    if (hit) return hit;
    const tex = await new HDRLoader().loadAsync(assetUrl(`hdr/${def.hdr}`));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    this.hdrCache.set(def.hdr, tex);
    return tex;
  }

  /** Loads every sky up front so the time of day can change without stalls. */
  async preloadSkies() {
    await Promise.all(Object.values(MOODS).map((m) => this.loadSky(m).catch(() => null)));
  }

  /** A fixed mood (settings override, menus). */
  async apply(id: MoodId, store: StoreView, outside: OutsideView, post: Post) {
    await this.loadSky(MOODS[id]).catch(() => null);
    this.mix(MOODS[id], MOODS[id], 0, store, outside, post);
  }

  /**
   * Time of day over a work day: k = 0 at opening, 1 at closing.
   * Day until mid-afternoon, a slow golden-hour blend, then dusk into night.
   */
  setTimeOfDay(k: number, store: StoreView, outside: OutsideView, post: Post) {
    const { day, sunset, night } = MOODS;
    const ease = (x: number) => x * x * (3 - 2 * x);
    if (k < 0.45) this.mix(day, day, 0, store, outside, post);
    else if (k < 0.68) this.mix(day, sunset, ease((k - 0.45) / 0.23), store, outside, post);
    else if (k < 0.8) this.mix(sunset, sunset, 0, store, outside, post);
    else this.mix(sunset, night, ease(Math.min(1, (k - 0.8) / 0.2)), store, outside, post);
  }

  private fog = new THREE.Fog('#ffffff', 60, 160);

  /** Blends two moods (t = 0 → a, 1 → b). */
  mix(a: MoodDef, b: MoodDef, t: number, store: StoreView, outside: OutsideView, post: Post) {
    const n = (x: number, y: number) => x + (y - x) * t;
    const c = (x: string, y: string) => this.tmpA.set(x).lerp(this.tmpB.set(y), t);
    this.mood = t < 0.5 ? a : b;
    // skies can't cross-fade: swap at the midpoint while the sky is dimmed
    const sky = this.hdrCache.get((t < 0.5 ? a : b).hdr);
    const dip = a === b ? 1 : 0.35 + 0.65 * Math.abs(t - 0.5) * 2;
    if (sky) {
      this.scene.background = sky;
      this.scene.backgroundIntensity = n(a.skyIntensity, b.skyIntensity) * dip;
    } else this.scene.background = c(a.fog, b.fog).clone();
    this.scene.environmentIntensity = n(a.envIntensity, b.envIntensity);
    this.fog.color.copy(c(a.fog, b.fog));
    this.scene.fog = this.fog;
    this.hemi.color.copy(c(a.hemi[0], b.hemi[0]));
    this.hemi.groundColor.copy(c(a.hemi[1], b.hemi[1]));
    this.hemi.intensity = n(a.hemi[2], b.hemi[2]);
    this.ambient.intensity = n(a.ambient, b.ambient);
    this.sun.color.copy(c(a.sun.color, b.sun.color));
    this.sun.intensity = n(a.sun.intensity, b.sun.intensity);
    this.sun.position.set(n(a.sun.pos[0], b.sun.pos[0]), n(a.sun.pos[1], b.sun.pos[1]), n(a.sun.pos[2], b.sun.pos[2]));
    this.sun.target.position.set(0, 0, 4);
    const fixture = c(a.fixtureColor, b.fixtureColor);
    for (const f of store.fixtureMaterials) {
      f.emissive.copy(fixture);
      f.emissiveIntensity = n(a.fixtures, b.fixtures);
    }
    for (const g of store.glowMaterials) g.opacity = n(a.pools, b.pools);
    const pc = c(a.points.color, b.points.color);
    for (const p of this.points) {
      p.color.copy(pc);
      p.intensity = n(a.points.intensity, b.points.intensity);
    }
    for (const p of this.streetPoints) p.intensity = n(a.streetLamps, b.streetLamps) * 6;
    for (const l of outside.streetLampMaterials) l.emissiveIntensity = n(a.streetLamps, b.streetLamps);
    outside.setDaylight(n(a.daylight, b.daylight));
    const neon = (m: MoodDef) => (m.id === 'night' ? 4 : 2);
    for (const nm of store.neonMaterials) nm.emissiveIntensity = n(neon(a), neon(b));
    this.renderer.toneMappingExposure = n(a.exposure, b.exposure);
    post.setGrade({
      vignette: n(a.grade.vignette, b.grade.vignette),
      saturation: n(a.grade.saturation, b.grade.saturation),
      contrast: n(a.grade.contrast, b.grade.contrast),
      tint: `#${c(a.grade.tint, b.grade.tint).getHexString()}`,
      bloom: n(a.grade.bloom, b.grade.bloom),
      bloomThreshold: n(a.grade.bloomThreshold, b.grade.bloomThreshold),
    });
  }

  private tmpA = new THREE.Color();
  private tmpB = new THREE.Color();
}
