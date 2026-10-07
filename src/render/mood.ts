/**
 * Lighting moods. The same store reads very differently at noon, at sunset
 * and on the night shift: sky HDR, sun, interior fixtures, street lamps and
 * the colour grade all change together.
 */
import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { StoreView } from './store';
import type { OutsideView } from './outside';
import type { Post } from './post';

export type MoodId = 'day' | 'sunset' | 'night';

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
  grade: { vignette: number; saturation: number; contrast: number; tint: string; grain: number; bloom: number; bloomThreshold: number };
  fog: string;
}

export const MOODS: Record<MoodId, MoodDef> = {
  day: {
    id: 'day',
    name: 'Öğle Telaşı',
    sub: 'Güneşli, ferah, cıvıl cıvıl',
    hdr: 'spruit_sunrise_1k.hdr',
    skyIntensity: 1.0,
    hemi: ['#fff6e6', '#b9a284', 0.85],
    ambient: 0.12,
    sun: { color: '#fff0d2', intensity: 3.1, pos: [10, 22, 26] },
    fixtures: 2.6,
    fixtureColor: '#fff4e0',
    pools: 0.07,
    points: { color: '#fff1dc', intensity: 0 },
    streetLamps: 0,
    envIntensity: 0.45,
    exposure: 0.95,
    grade: { vignette: 0.3, saturation: 1.15, contrast: 1.08, tint: '#ffffff', grain: 0.02, bloom: 0.28, bloomThreshold: 2.3 },
    fog: '#cfe3f2',
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
    grade: { vignette: 0.38, saturation: 1.18, contrast: 1.06, tint: '#fff1e2', grain: 0.025, bloom: 0.4, bloomThreshold: 2.0 },
    fog: '#e8b996',
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
    grade: { vignette: 0.5, saturation: 1.2, contrast: 1.1, tint: '#eef3ff', grain: 0.035, bloom: 0.75, bloomThreshold: 1.4 },
    fog: '#0b1020',
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
    const tex = await new HDRLoader().loadAsync(`${import.meta.env.BASE_URL}hdr/${def.hdr}`);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    this.hdrCache.set(def.hdr, tex);
    return tex;
  }

  async apply(id: MoodId, store: StoreView, outside: OutsideView, post: Post) {
    const m = MOODS[id];
    this.mood = m;
    try {
      const sky = await this.loadSky(m);
      this.scene.background = sky;
      this.scene.backgroundIntensity = m.skyIntensity;
    } catch {
      this.scene.background = new THREE.Color(m.fog);
    }
    this.scene.environmentIntensity = m.envIntensity;
    this.scene.fog = new THREE.Fog(m.fog, 60, 160);
    this.hemi.color.set(m.hemi[0]);
    this.hemi.groundColor.set(m.hemi[1]);
    this.hemi.intensity = m.hemi[2];
    this.ambient.intensity = m.ambient;
    this.sun.color.set(m.sun.color);
    this.sun.intensity = m.sun.intensity;
    this.sun.position.set(...m.sun.pos);
    this.sun.target.position.set(0, 0, 4);
    for (const f of store.fixtureMaterials) {
      f.emissive.set(m.fixtureColor);
      f.emissiveIntensity = m.fixtures;
    }
    for (const g of store.glowMaterials) g.opacity = m.pools;
    for (const p of this.points) {
      p.color.set(m.points.color);
      p.intensity = m.points.intensity;
    }
    for (const p of this.streetPoints) p.intensity = m.streetLamps * 6;
    for (const l of outside.streetLampMaterials) l.emissiveIntensity = m.streetLamps;
    for (const n of store.neonMaterials) n.emissiveIntensity = id === 'night' ? 4 : 2;
    this.renderer.toneMappingExposure = m.exposure;
    post.setGrade(m.grade);
  }
}
