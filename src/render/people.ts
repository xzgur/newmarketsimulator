/**
 * Living store: wandering customers (KayKit characters with recoloured
 * outfits) that browse shelves, carry baskets and react to the player, plus
 * cashiers at the tills.
 */
import * as THREE from 'three';
import { navPath, nearestNode, type Display, type StoreLayout } from '../data/layout';
import { createCharacter, type CharacterBase, type CharacterInstance, type Outfit } from './assets';
import { shoppingBasket } from './store';
import { bubbleTexture } from './textures';
import type { DynamicBlocker } from '../logic/player';
import { pick } from '../i18n';
import { toonify } from './toon';


export function attachToBone(ch: CharacterInstance, boneName: string, obj: THREE.Object3D, worldScale: number) {
  const bone = ch.bone(boneName);
  if (!bone) return;
  ch.root.updateMatrixWorld(true);
  const ws = new THREE.Vector3();
  bone.getWorldScale(ws);
  obj.scale.setScalar(worldScale / ws.x);
  bone.add(obj);
}

class Bubble {
  sprite: THREE.Sprite;
  private t = 0;
  constructor(parent: THREE.Object3D, y: number) {
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: true, depthWrite: false, transparent: true }));
    this.sprite.scale.set(1.1, 0.41, 1);
    this.sprite.position.y = y;
    this.sprite.visible = false;
    parent.add(this.sprite);
  }
  say(text: string, dur = 2.4) {
    const m = this.sprite.material as THREE.SpriteMaterial;
    m.map?.dispose();
    m.map = bubbleTexture(text);
    m.needsUpdate = true;
    this.sprite.visible = true;
    this.t = dur;
  }
  get active() {
    return this.t > 0;
  }
  update(dt: number) {
    if (this.t <= 0) return;
    this.t -= dt;
    const m = this.sprite.material as THREE.SpriteMaterial;
    m.opacity = Math.min(1, this.t * 3);
    const s = Math.min(1, (2.4 - this.t) * 8 + 0.6);
    this.sprite.scale.set(1.1 * Math.min(1, s), 0.41 * Math.min(1, s), 1);
    if (this.t <= 0) this.sprite.visible = false;
  }
}

type NpcState = 'walk' | 'browse' | 'idle' | 'wait';

interface Npc {
  ch: CharacterInstance;
  group: THREE.Group;
  bubble: Bubble;
  state: NpcState;
  path: THREE.Vector2[];
  timer: number;
  target: Display | null;
  speed: number;
  bumpCooldown: number;
  chatCooldown: number;
  heading: number;
  helloDone: boolean;
}

const BASES: CharacterBase[] = ['Rogue', 'Barbarian', 'Mage', 'Knight'];

export class People {
  readonly group = new THREE.Group();
  private npcs: Npc[] = [];
  private cashiers: { ch: CharacterInstance; timer: number }[] = [];
  private rng = 1234567;
  /** Called when a customer says something near the player (for audio). */
  onSpeak?: (text: string, x: number, z: number) => void;

  constructor(private layout: StoreLayout, count = 8) {
    const outfits: Outfit[] = [
      { hue: 0 },
      { hue: 140 },
      { hue: 200, sat: 1.1 },
      { hue: 290 },
      { hue: 60, sat: 1.2 },
      { hue: 320, light: 0.05 },
      { tint: '#f59e0b', hue: 0 },
      { tint: '#60a5fa', hue: 0 },
      { hue: 100 },
    ];
    const browseable = layout.displays;
    for (let i = 0; i < count; i++) {
      const base = BASES[i % BASES.length];
      const ch = createCharacter(base, outfits[i % outfits.length]);
      const group = new THREE.Group();
      group.add(ch.root);
      this.group.add(group);
      if (i % 3 !== 2) {
        const basket = shoppingBasket(['#e11d48', '#2563eb', '#16a34a'][i % 3]);
        basket.rotation.set(0, Math.PI / 2, 0);
        basket.position.set(0, -0.2, 0);
        attachToBone(ch, 'handslot.l', basket, 0.9);
      }
      const d = browseable[(i * 37) % browseable.length];
      group.position.set(d.stand.x, 0, d.stand.z);
      const npc: Npc = {
        ch,
        group,
        bubble: new Bubble(group, 2.15),
        state: 'idle',
        path: [],
        timer: 0.5 + i * 0.7,
        target: d,
        speed: 1.0 + (i % 4) * 0.12,
        bumpCooldown: 0,
        chatCooldown: 6 + i * 3,
        heading: 0,
        helloDone: false,
      };
      ch.play('Idle', 0);
      ch.mixer.update(Math.random() * 2);
      this.npcs.push(npc);
    }
    for (const spot of layout.checkoutSpots) {
      const ch = createCharacter('Knight', { tint: '#5B4FCF', hue: 0 });
      ch.root.position.set(spot.x, 0, spot.z);
      ch.root.rotation.y = spot.angle;
      this.group.add(ch.root);
      ch.play('Idle', 0);
      ch.mixer.update(Math.random() * 3);
      this.cashiers.push({ ch, timer: 2 + Math.random() * 5 });
    }
    toonify(this.group);
  }

  private rand(): number {
    this.rng = (this.rng * 16807) % 2147483647;
    return this.rng / 2147483647;
  }

  private planTo(npc: Npc, d: Display) {
    const p = npc.group.position;
    const from = npc.target ? npc.target.stand.node : nearestNode(this.layout.nav, p.x, p.z);
    const nodes = navPath(this.layout.nav, from, d.stand.node);
    const pts: THREE.Vector2[] = [];
    // leave the current browse spot back towards the lane first
    if (npc.target) for (const v of [...npc.target.stand.via].reverse()) pts.push(new THREE.Vector2(v.x, v.z));
    for (const n of nodes) pts.push(new THREE.Vector2(this.layout.nav[n].x, this.layout.nav[n].z));
    for (const v of d.stand.via) pts.push(new THREE.Vector2(v.x, v.z));
    pts.push(new THREE.Vector2(d.stand.x, d.stand.z));
    npc.path = pts;
    npc.target = d;
    npc.state = 'walk';
    npc.ch.play(npc.speed > 1.25 ? 'Walking_B' : 'Walking_A');
  }

  /** Customers block the player like soft obstacles. */
  blockers(): DynamicBlocker[] {
    return this.npcs.map((n) => ({ x: n.group.position.x, z: n.group.position.z, r: 0.32 }));
  }

  /** The player bumped near (x,z) with some speed. */
  bump(x: number, z: number, speed: number) {
    for (const n of this.npcs) {
      const d = Math.hypot(n.group.position.x - x, n.group.position.z - z);
      if (d < 1.15 && n.bumpCooldown <= 0 && speed > 0.6) {
        n.bumpCooldown = 4;
        const line = pick('npc.bump');
        n.bubble.say(line);
        this.onSpeak?.(line, n.group.position.x, n.group.position.z);
        n.ch.play('Hit_A', 0.1, true);
        n.timer = 0.9;
        n.state = 'wait';
      }
    }
  }

  update(dt: number, player: { x: number; z: number; yaw: number }) {
    for (const c of this.cashiers) {
      c.ch.mixer.update(dt);
      c.timer -= dt;
      if (c.timer <= 0) {
        c.ch.play(c.ch.current === 'Interact' ? 'Idle' : 'Interact', 0.3, c.ch.current !== 'Interact');
        c.timer = c.ch.current === 'Interact' ? 1.6 : 3 + this.rand() * 6;
      }
    }
    for (const n of this.npcs) {
      n.ch.mixer.update(dt);
      n.bubble.update(dt);
      n.bumpCooldown -= dt;
      n.chatCooldown -= dt;
      const p = n.group.position;
      const toPlayer = Math.hypot(player.x - p.x, player.z - p.z);
      if (n.chatCooldown <= 0 && toPlayer < 6 && toPlayer > 1.5 && !n.bubble.active) {
        const line = pick(n.helloDone ? 'npc.idle' : 'npc.hello');
        n.helloDone = true;
        n.bubble.say(line);
        this.onSpeak?.(line, p.x, p.z);
        n.chatCooldown = 14 + this.rand() * 14;
      }
      switch (n.state) {
        case 'idle':
        case 'browse':
        case 'wait':
          n.timer -= dt;
          if (n.state === 'browse' && n.target) {
            // face the shelf
            const want = n.target.angle + Math.PI;
            n.heading = turnTowards(n.heading, want, dt * 6);
          }
          if (n.timer <= 0) {
            if (n.state === 'wait') {
              n.state = n.path.length ? 'walk' : 'idle';
              n.ch.play(n.path.length ? 'Walking_A' : 'Idle');
              n.timer = 0.5;
              break;
            }
            const next = this.layout.displays[Math.floor(this.rand() * this.layout.displays.length)];
            this.planTo(n, next);
          }
          break;
        case 'walk': {
          const target = n.path[0];
          if (!target) {
            n.state = 'browse';
            n.timer = 2.5 + this.rand() * 4;
            n.ch.play(this.rand() > 0.5 ? 'PickUp' : 'Interact', 0.25, true);
            break;
          }
          // polite: wait if the player is right in front
          const fx = Math.sin(n.heading);
          const fz = Math.cos(n.heading);
          const ahead = (player.x - p.x) * fx + (player.z - p.z) * fz;
          if (toPlayer < 1.3 && ahead > 0) {
            n.state = 'wait';
            n.timer = 0.8;
            n.ch.play('Idle', 0.2);
            break;
          }
          const dx = target.x - p.x;
          const dz = target.y - p.z;
          const dist = Math.hypot(dx, dz);
          const step = n.speed * dt;
          n.heading = turnTowards(n.heading, Math.atan2(dx, dz), dt * 8);
          if (dist <= step) {
            p.x = target.x;
            p.z = target.y;
            n.path.shift();
          } else {
            p.x += (dx / dist) * step;
            p.z += (dz / dist) * step;
          }
          break;
        }
      }
      n.group.rotation.y = n.heading;
    }
  }
}

function turnTowards(a: number, b: number, maxStep: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + Math.max(-maxStep, Math.min(maxStep, d));
}
