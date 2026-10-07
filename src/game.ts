/** Game orchestrator: first-person loop, interaction, flow and presentation. */
import * as THREE from 'three';
import { buildLayout, type Display, type StoreLayout } from './data/layout';
import { DEMO_ORDER } from './data/order';
import { getProduct, formatPrice } from './data/products';
import { createPlayer, look, PLAYER, speedOf, stepPlayer, type PlayerState } from './logic/player';
import { GameFlow } from './logic/gameFlow';
import { OrderSession } from './logic/order';
import { loadAssets } from './render/assets';
import { StoreView } from './render/store';
import { OutsideView } from './render/outside';
import { ShoppingCart } from './render/cartModel';
import { Hands } from './render/hands';
import { People } from './render/people';
import { CourierView } from './render/courier';
import { Particles } from './render/particles';
import { Post, type Quality } from './render/post';
import { Lighting, MOODS, type MoodId } from './render/mood';
import { createProductMesh } from './render/productMeshes';
import { renderThumbnails } from './render/thumbnails';
import { Hud, esc, sectionLabel } from './ui/hud';
import { Input } from './input';
import { Sfx } from './audio';

interface Flyer {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  spin: number;
  done?: () => void;
}

interface Thrown {
  obj: THREE.Object3D;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
}

type Target =
  | { kind: 'product'; display: Display; instance: number }
  | { kind: 'bag'; index: number }
  | { kind: 'courier' }
  | null;

const PA_LINES = [
  '📢 Anons: Reyon 1’de cipslerde %30 indirim!',
  '📢 Anons: Kasa 3 açılmıştır, buyurun.',
  '📢 Anons: Fırından taze simitler çıktı!',
  '📢 Anons: Kaygan zemine dikkat, temizlik var.',
  '📢 Anons: Kapında! siparişleri 15 dakikada kapınızda.',
];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, 1, 0.03, 300);
  private rig = new THREE.Group();
  private layout: StoreLayout = buildLayout();
  private world = new THREE.Group();
  private store!: StoreView;
  private outside!: OutsideView;
  private cart!: ShoppingCart;
  private hands!: Hands;
  private people!: People;
  private courier!: CourierView;
  private particles!: Particles;
  private post!: Post;
  private lighting!: Lighting;
  private player!: PlayerState;
  private session!: OrderSession;
  private flow!: GameFlow;
  private hud: Hud;
  private input: Input;
  private sfx = new Sfx();
  private flyers: Flyer[] = [];
  private thrown: Thrown[] = [];
  private held: THREE.Object3D | null = null;
  private target: Target = null;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private time = 0;
  private quality: Quality = 'high';
  private mood: MoodId = 'day';
  private ready = false;
  private shake = 0;
  private bumpCooldown = 0;
  private lastTick = -1;
  private combo = 0;
  private bestCombo = 0;
  private lastPlace = -100;
  private score = 0;
  private paTimer = 40;
  private hintTimer = 0;
  private titleT = 0;
  private wantLock = false;
  private fovKick = 0;

  constructor(private container: HTMLElement) {
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q === 'low' || q === 'medium' || q === 'high') this.quality = q;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(this.quality === 'low' ? 1 : 1.5, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);

    this.hud = new Hud(container, DEMO_ORDER, {
      start: (mood, quality) => this.start(mood, quality),
      restart: () => this.restart(),
      resume: () => this.setPaused(false),
      accept: () => this.accept(),
      complete: () => this.completeOrder(),
      togglePhone: () => this.hud.setPhoneOpen(!this.hud.phoneOpen),
      setMood: (m) => this.setMood(m),
    });
    this.hud.setTitleQuality(this.quality);
    this.hud.showScreen('loading');

    this.scene.add(this.world, this.rig);
    this.rig.add(this.camera);
    this.camera.rotation.order = 'YXZ';

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.flow?.timerRunning) this.setPaused(true);
    });
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.flow && this.inGame() && !this.flow.paused && this.wantLock) this.setPaused(true);
    });
    this.resize();
    this.exposeDebug();
    void this.init(params.get('mood'));
  }

  private inGame(): boolean {
    return ['incoming', 'playing', 'courierArriving', 'awaitingHandover', 'handover'].includes(this.flow.phase);
  }

  private async init(moodParam: string | null) {
    try {
      const base = import.meta.env.BASE_URL;
      const fonts = [new FontFace('DynaPuff', `url(${base}fonts/DynaPuff.ttf)`, { weight: '400 700' }), new FontFace('Nunito', `url(${base}fonts/Nunito.ttf)`, { weight: '200 1000' })];
      await Promise.all(
        fonts.map((f) =>
          f
            .load()
            .then((ff) => document.fonts.add(ff))
            .catch(() => undefined),
        ),
      );
      this.hud.setLoading(0.1, 'Modeller yükleniyor…');
      await loadAssets((p) => this.hud.setLoading(0.1 + p * 0.6));
      this.hud.setLoading(0.75, 'Raflar diziliyor…');
      await nextFrame();
      this.lighting = new Lighting(this.renderer, this.scene, this.quality !== 'low');
      this.outside = new OutsideView(this.layout.bounds.maxZ);
      this.scene.add(this.outside.group);
      this.buildWorld();
      this.hud.setLoading(0.85, 'Müşteriler içeri giriyor…');
      await nextFrame();
      this.hud.setThumbnails(renderThumbnails(this.renderer));
      this.post = new Post(this.renderer, this.scene, this.camera, this.quality);
      this.resize();
      if (moodParam && moodParam in MOODS) this.mood = moodParam as MoodId;
      await this.lighting.apply(this.mood, this.store, this.outside, this.post);
      this.hud.setLoading(1, 'Hazır!');
      this.ready = true;
      this.hud.showScreen('title');
      this.renderer.setAnimationLoop(() => this.frame());
    } catch (err) {
      console.error(err);
      this.hud.setLoading(1, `Yükleme hatası: ${(err as Error).message}`);
    }
  }

  /** (Re)creates everything that holds per-run state. */
  private buildWorld() {
    this.world.clear();
    for (const c of [...this.rig.children]) if (c !== this.camera) this.rig.remove(c);
    this.flyers = [];
    this.thrown = [];
    this.held = null;
    this.store = new StoreView(this.layout);
    this.people = new People(this.layout, 8);
    this.people.onSpeak = (text, x, z) => {
      if (Math.hypot(x - this.player.x, z - this.player.z) < 9) this.sfx.babble(text, 0.9 + Math.random() * 0.4);
    };
    this.courier = new CourierView(this.layout.courierParking, this.layout.courierSpot, this.layout.door.z);
    this.courier.doorCallback = (open) => (this.store.doorTarget = open ? 1 : 0);
    this.particles = new Particles();
    this.world.add(this.store.group, this.people.group, this.courier.group, this.particles.group);

    this.cart = new ShoppingCart();
    this.cart.group.position.set(0, 0, PLAYER.cartOffset);
    this.hands = new Hands();
    this.rig.add(this.cart.group, this.hands.group);

    const { start } = this.layout;
    this.player = createPlayer(start.x, start.z, start.heading);
    this.session = new OrderSession(DEMO_ORDER);
    this.flow = new GameFlow(DEMO_ORDER.timeLimit);
    this.cart.sync(this.session);
    this.target = null;
    this.combo = 0;
    this.bestCombo = 0;
    this.score = 0;
    this.lastTick = -1;
    this.paTimer = 40;
    if (this.lighting) this.lighting.placePoints(this.store, this.outside);
  }

  private async setMood(m: MoodId) {
    this.mood = m;
    if (this.lighting && this.post) await this.lighting.apply(m, this.store, this.outside, this.post);
  }

  private start(mood: MoodId, quality: Quality) {
    this.sfx.unlock();
    if (quality !== this.quality) {
      this.quality = quality;
      this.renderer.setPixelRatio(Math.min(quality === 'low' ? 1 : 1.5, window.devicePixelRatio || 1));
      this.lighting.sun.castShadow = quality !== 'low';
      this.post = new Post(this.renderer, this.scene, this.camera, quality);
      this.resize();
    }
    void this.setMood(mood);
    this.beginShift();
  }

  private beginShift() {
    this.flow.start();
    this.hud.showScreen(null);
    this.hud.setPlaying(true);
    this.hud.setPhoneScreen('incoming');
    this.hud.showHint(true);
    this.hintTimer = 25;
    this.sfx.ringStart();
    this.sfx.setMusic(1);
    this.input.enabled = true;
    this.wantLock = true;
    this.input.requestLock();
    this.input.clear();
    this.hud.toast('📱 Telefonun çalıyor! Siparişi kabul et (Enter)', 'info', 4000);
  }

  private restart() {
    this.sfx.ringStop();
    this.sfx.setEngine(0);
    this.buildWorld();
    void this.setMood(this.mood);
    this.hud.setPhoneOpen(false);
    this.beginShift();
  }

  private setPaused(p: boolean) {
    if (!this.inGame()) return;
    this.flow.paused = p;
    this.hud.showScreen(p ? 'pause' : null);
    this.input.enabled = !p;
    this.wantLock = !p;
    if (p) {
      this.input.releaseLock();
      this.sfx.setMusic(0);
    } else {
      this.input.requestLock();
      this.sfx.setMusic(1);
    }
    this.input.clear();
  }

  // ---------------------------------------------------------------- actions
  private accept() {
    if (!this.flow.accept()) return;
    this.sfx.ringStop();
    this.sfx.ding();
    this.hud.setPhoneScreen('picking');
    this.hud.setPhoneOpen(true);
    this.hud.toast('Sipariş kabul edildi! Saat işliyor ⏱', 'ok');
    setTimeout(() => {
      if (this.flow.phase === 'playing' && this.hud.phoneOpen) this.hud.setPhoneOpen(false);
    }, 6000);
  }

  private interact() {
    const t = this.target;
    const ph = this.flow.phase;
    if (ph === 'incoming') {
      this.hud.toast('Önce telefondaki siparişi kabul et (Enter)', 'info');
      return;
    }
    if (ph === 'awaitingHandover' && this.inDeliveryZone()) {
      this.handover();
      return;
    }
    if (!t) return;
    if (t.kind === 'courier') {
      if (ph === 'awaitingHandover') this.hud.toast('Biraz daha yaklaş: yeşil teslimat noktasına gir', 'info');
      return;
    }
    if (ph !== 'playing') return;
    if (t.kind === 'bag') {
      if (this.session.tray.length) this.placeHeld(t.index);
      else if (!this.session.bags[t.index].open) {
        this.session.openBag(t.index);
        this.sfx.bagOpen();
        this.cart.sync(this.session);
      } else this.hud.toast('Önce raftan bir ürün al', 'info', 1600);
      return;
    }
    if (t.kind === 'product') this.pick(t.display, t.instance);
  }

  private pick(d: Display, instance: number) {
    const product = getProduct(d.productId);
    const r = this.session.pick(d.productId);
    if (!r.ok) {
      this.hud.toast(r.reason, 'err');
      this.sfx.error();
      return;
    }
    const taken = this.store.take(d.id, instance);
    this.sfx.pick();
    const mesh = createProductMesh(product);
    this.held = mesh;
    this.hands.reachTarget = 1;
    if (taken) {
      mesh.position.copy(taken.position);
      mesh.quaternion.copy(taken.quaternion);
      this.world.add(mesh);
      this.flyers.push({
        obj: mesh,
        from: taken.position.clone(),
        to: () => this.hands.holdAnchor.getWorldPosition(new THREE.Vector3()),
        t: 0,
        dur: 0.28,
        arc: 0.15,
        spin: 0,
        done: () => this.attachHeld(mesh),
      });
    } else this.attachHeld(mesh);
    this.hud.popup(product.name, 'pick');
  }

  private attachHeld(mesh: THREE.Object3D) {
    if (this.held !== mesh) return;
    this.hands.holdAnchor.add(mesh);
    mesh.position.set(0, 0, 0);
    mesh.quaternion.identity();
    mesh.rotation.set(0.15, Math.PI + 0.4, 0);
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3()).length();
    mesh.scale.setScalar(size > 0.35 ? 0.35 / size : 1);
    mesh.traverse((o) => ((o as THREE.Mesh).castShadow = false));
  }

  private placeHeld(bagIndex: number) {
    const pid = this.session.tray[0];
    if (!pid) return;
    if (!this.session.bags[bagIndex].open) {
      this.session.openBag(bagIndex);
      this.sfx.bagOpen();
    }
    const r = this.session.place(0, bagIndex);
    if (!r.ok) {
      this.sfx.error();
      this.cart.rejectShake(bagIndex);
      this.hud.toast(r.reason, 'err', 3400);
      this.post.pulse('#ef4444', 0.35);
      this.shake = 0.25;
      if (r.penalty) {
        this.flow.penalize(r.penalty);
        this.hud.penalty(r.penalty);
        this.combo = 0;
        this.score -= 50;
        if (this.flow.phase === 'lost') this.lose();
      }
      this.cart.sync(this.session);
      return;
    }
    // fly the held mesh into the bag
    const mesh = this.held;
    this.held = null;
    this.hands.reachTarget = 0;
    if (mesh) {
      const from = mesh.getWorldPosition(new THREE.Vector3());
      this.world.attach(mesh);
      this.flyers.push({
        obj: mesh,
        from,
        to: () => this.cart.bagWorldPosition(bagIndex),
        t: 0,
        dur: 0.32,
        arc: 0.25,
        spin: 6,
        done: () => {
          mesh.removeFromParent();
          this.cart.sync(this.session);
          this.particles.sparkle(this.cart.bagWorldPosition(bagIndex), '#fff3a0', 22, 1.2);
          this.sfx.place();
        },
      });
    } else this.cart.sync(this.session);
    // combo + score
    this.combo = this.time - this.lastPlace < 14 ? this.combo + 1 : 1;
    this.lastPlace = this.time;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = 100 + (this.combo - 1) * 40;
    this.score += gained;
    if (this.combo >= 2) {
      this.hud.popup(`Seri x${this.combo}!  +${gained}`, 'combo');
      this.sfx.combo(this.combo);
    } else this.hud.popup(`+${gained}`, 'plus');
    if (this.session.isComplete()) {
      this.hud.toast('Hepsi poşette! F ile siparişi tamamla 🎉', 'ok', 4000);
      this.hud.setPhoneOpen(true);
    }
  }

  private dropHeld() {
    if (!this.session.tray.length) return;
    const pid = this.session.tray[0];
    this.session.discard(0);
    const mesh = this.held;
    this.held = null;
    this.hands.reachTarget = 0;
    this.sfx.throwItem();
    if (mesh) {
      this.world.attach(mesh);
      const fwd = new THREE.Vector3();
      this.camera.getWorldDirection(fwd);
      this.thrown.push({ obj: mesh, vel: fwd.multiplyScalar(3.2).add(new THREE.Vector3(0, 2.2, 0)), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0), life: 2.4 });
    }
    this.hud.toast(`Geri bırakıldı: ${getProduct(pid).name}`, 'info', 1600);
  }

  private completeOrder() {
    if (this.flow.phase !== 'playing') return;
    const r = this.session.close();
    if (!r.ok) {
      this.hud.toast(r.reason, 'err');
      this.sfx.error();
      return;
    }
    this.flow.orderClosed();
    this.sfx.complete();
    this.cart.sync(this.session);
    this.particles.confettiBurst(this.cart.bagWorldPosition(1).add(new THREE.Vector3(0, 0.3, 0)), 90);
    this.post.pulse('#22c55e', 0.25);
    this.store.deliveryActive = true;
    this.hud.setPhoneScreen('courier');
    this.hud.courierEta = 9;
    this.hud.toast('Sipariş hazır! Motorcu Mert yola çıktı 🛵', 'ok', 3500);
    this.courier.arrive(() => {
      this.flow.courierArrived();
      this.hud.courierEta = 0;
      this.hud.toast('Motorcu kapıda! Teslimat noktasına git ve E’ye bas', 'ok', 4000);
      this.sfx.ding();
    });
  }

  private inDeliveryZone(): boolean {
    const d = this.layout.delivery;
    return Math.hypot(this.player.x - d.x, this.player.z - d.z) <= d.radius + 0.4;
  }

  private handover() {
    if (!this.flow.handover()) return;
    this.player.vx = this.player.vz = 0;
    this.store.deliveryActive = false;
    this.sfx.place();
    const bags = this.cart.takeBags();
    this.courier.receive(bags, () => {
      this.particles.confettiBurst(this.courier.riderPosition().add(new THREE.Vector3(0, 1.6, 0)));
      this.sfx.win();
      this.hud.setPhoneScreen('delivered');
      this.courier.leave(() => this.win());
      setTimeout(() => {
        if (this.flow.phase === 'handover') this.win();
      }, 2600);
    });
  }

  private win() {
    if (!this.flow.handoverDone()) return;
    this.sfx.setEngine(0);
    this.sfx.setMusic(0);
    const timeBonus = Math.round(this.flow.timeLeft * 5);
    this.score = Math.max(0, this.score + timeBonus);
    this.hud.showWon({
      timeLeft: this.flow.timeLeft,
      stars: this.flow.stars(this.session.mistakes),
      mistakes: this.session.mistakes,
      penalties: this.flow.penalties,
      bestCombo: this.bestCombo,
      score: this.score,
    });
    this.hud.showScreen('won');
    this.input.enabled = false;
    this.wantLock = false;
    this.input.releaseLock();
  }

  private lose() {
    this.sfx.ringStop();
    this.sfx.lose();
    this.sfx.setEngine(0);
    this.sfx.setMusic(0);
    this.sfx.setCartSpeed(0);
    this.hud.setPhoneScreen('failed');
    const note = this.session.closed ? 'Sipariş hazırdı ama motorcuya zamanında teslim edilemedi.' : 'Sipariş zamanında hazırlanamadı. Müşteri siparişi iptal etti.';
    this.hud.showLost(this.session.totalBagged(), this.session.totalRequired(), note);
    this.hud.showScreen('lost');
    this.input.enabled = false;
    this.wantLock = false;
    this.input.releaseLock();
  }

  // ---------------------------------------------------------------- loop
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.post.render(dt);
  }

  private handleActions() {
    for (const a of this.input.consume()) {
      const ph = this.flow.phase;
      if (a === 'pause') {
        if (this.inGame()) this.setPaused(!this.flow.paused);
        continue;
      }
      if (a === 'mute') {
        this.sfx.setMuted(!this.sfx.muted);
        this.hud.toast(this.sfx.muted ? 'Ses kapalı' : 'Ses açık', 'info', 1200);
        continue;
      }
      if (this.flow.paused || !this.flow.canDrive) continue;
      switch (a) {
        case 'accept':
          if (ph === 'incoming') this.accept();
          break;
        case 'interact':
          this.interact();
          break;
        case 'drop':
          this.dropHeld();
          break;
        case 'phone':
          if (ph !== 'incoming') this.hud.setPhoneOpen(!this.hud.phoneOpen);
          break;
        case 'complete':
          this.completeOrder();
          break;
        case 'bag1':
        case 'bag2':
        case 'bag3':
          if (ph === 'playing' && this.session.tray.length) this.placeHeld(Number(a.slice(3)) - 1);
          break;
      }
    }
  }

  private update(dt: number) {
    this.time += dt;
    if (!this.ready) return;
    const flow = this.flow;
    if (flow.phase === 'intro') {
      this.updateTitleCamera(dt);
      this.people.update(dt, { x: 999, z: 999, yaw: 0 });
      this.outside.update(dt);
      this.store.update(dt);
      return;
    }
    this.handleActions();
    const active = flow.canDrive;
    if (active) {
      const l = this.input.look();
      look(this.player, l.yaw, l.pitch);
      const mv = this.input.move();
      const blockers = this.people.blockers();
      if (flow.phase === 'handover') mv.forward = mv.strafe = mv.turn = 0;
      const hit = stepPlayer(this.player, mv, dt, this.layout.colliders, blockers);
      this.bumpCooldown -= dt;
      const sp = speedOf(this.player);
      if (hit && this.bumpCooldown <= 0 && sp > 1.4) {
        this.sfx.bump();
        this.shake = 0.18;
        this.bumpCooldown = 0.6;
        const c = { x: this.player.x + Math.sin(this.player.yaw) * PLAYER.cartOffset, z: this.player.z + Math.cos(this.player.yaw) * PLAYER.cartOffset };
        this.people.bump(c.x, c.z, sp);
      }
      this.fovKick += ((mv.sprint && mv.forward > 0 ? 1 : 0) - this.fovKick) * Math.min(1, dt * 4);
    } else {
      this.input.look();
    }
    const speed = speedOf(this.player);
    this.sfx.setCartSpeed(flow.paused ? 0 : speed / PLAYER.sprint);

    if (flow.tick(dt)) this.lose();
    if (flow.timerRunning && flow.timeLeft <= 10) {
      const s = Math.ceil(flow.timeLeft);
      if (s !== this.lastTick) {
        this.lastTick = s;
        this.sfx.tick();
      }
    }

    if (!flow.paused) {
      this.people.update(dt, this.player);
      this.courier.update(dt);
      this.store.update(dt);
      this.outside.update(dt);
      this.particles.update(dt);
      this.updateFlyers(dt);
      this.cart.update(dt, speed);
      this.paTimer -= dt;
      if (this.paTimer <= 0 && flow.phase === 'playing') {
        this.paTimer = 50 + Math.random() * 30;
        this.sfx.chime();
        this.hud.toast(PA_LINES[Math.floor(Math.random() * PA_LINES.length)], 'info', 4200);
      }
      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) this.hud.showHint(false);
      }
    }
    this.sfx.setEngine(flow.paused ? 0 : this.courier.engineLevel);
    this.updateRig(dt, speed);
    this.updateTarget();
    this.updateHud(dt);
  }

  private updateRig(dt: number, speed: number) {
    const p = this.player;
    this.rig.position.set(p.x, 0, p.z);
    this.rig.rotation.y = p.yaw;
    const bobAmt = Math.min(1, speed / PLAYER.walk);
    const bob = Math.sin(p.stride * 2.4) * 0.028 * bobAmt;
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake * 0.08;
    this.camera.position.set((Math.random() - 0.5) * sh + Math.cos(p.stride * 1.2) * 0.012 * bobAmt, PLAYER.eyeHeight + bob + (Math.random() - 0.5) * sh, 0);
    this.camera.rotation.set(p.pitch, Math.PI, 0);
    const fov = 70 + this.fovKick * 7;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    // cart sways a bit when turning / accelerating
    const lateral = -(p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw));
    this.cart.group.rotation.z += (lateral * 0.012 - this.cart.group.rotation.z) * Math.min(1, dt * 6);
    this.cart.group.position.y = Math.abs(Math.sin(p.stride * 9)) * 0.004 * bobAmt;
    this.hands.update(dt, this.camera, PLAYER.cartOffset - 0.52, 1.04, bob);
  }

  private updateTitleCamera(dt: number) {
    this.titleT += dt;
    const t = this.titleT * 0.05;
    const x = Math.sin(t) * 11;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.y = 0;
    this.camera.position.set(x, 2.1 + Math.sin(t * 2) * 0.2, 5.3);
    this.camera.lookAt(x - 2.5 * Math.cos(t), 1.1, -3);
  }

  private updateTarget() {
    const ph = this.flow.phase;
    this.rig.updateMatrixWorld(true);
    let target: Target = null;
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 3.1;
    if (ph === 'playing' && !this.flow.paused) {
      // with an empty hand an open bag has nothing to offer, so look past it (e.g. into low produce crates)
      const holding = this.session.tray.length > 0;
      const bagHits = this.raycaster
        .intersectObjects(this.cart.hitTargets, false)
        .filter((h) => holding || !this.session.bags[ShoppingCart.bagIndexOf(h.object)].open);
      if (bagHits.length) {
        target = { kind: 'bag', index: ShoppingCart.bagIndexOf(bagHits[0].object) };
      } else {
        const hits = this.raycaster.intersectObjects(this.store.productMeshes, false);
        for (const hit of hits) {
          const r = this.store.resolveHit(hit.object, hit.instanceId);
          if (r) {
            target = { kind: 'product', display: r.display, instance: r.instance };
            break;
          }
        }
      }
    }
    if ((ph === 'awaitingHandover' || ph === 'courierArriving') && this.courier.isVisibleNear(this.player.x, this.player.z, 6)) {
      const to = this.courier.riderPosition().sub(this.camera.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
      const fwd = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      if (to.dot(fwd) > 0.85) target = { kind: 'courier' };
    }
    this.target = target;
    this.store.setHover(target?.kind === 'product' ? target : null);
    for (let i = 0; i < 3; i++) this.cart.setBagHighlight(i, target?.kind === 'bag' && target.index === i);
  }

  private updateFlyers(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      f.obj.position.lerpVectors(f.from, f.to(), e);
      f.obj.position.y += Math.sin(k * Math.PI) * f.arc;
      f.obj.rotation.y += dt * f.spin;
      if (k >= 1) {
        this.flyers.splice(i, 1);
        f.done?.();
      }
    }
    for (let i = this.thrown.length - 1; i >= 0; i--) {
      const t = this.thrown[i];
      t.life -= dt;
      t.vel.y -= 9.8 * dt;
      t.obj.position.addScaledVector(t.vel, dt);
      t.obj.rotation.x += t.spin.x * dt;
      t.obj.rotation.y += t.spin.y * dt;
      if (t.obj.position.y < 0.05) {
        t.obj.position.y = 0.05;
        t.vel.y = Math.abs(t.vel.y) * 0.35;
        t.vel.x *= 0.6;
        t.vel.z *= 0.6;
        t.spin.multiplyScalar(0.5);
      }
      if (t.life < 0.4) t.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (t.life <= 0) {
        t.obj.removeFromParent();
        this.thrown.splice(i, 1);
      }
    }
  }

  private updateHud(dt: number) {
    const flow = this.flow;
    const s = this.session;
    this.hud.setTimer(flow.timeLeft, flow.timerRunning);
    if (this.hud.courierEta > 0 && flow.phase === 'courierArriving') this.hud.courierEta = Math.max(0.5, this.hud.courierEta - dt);
    this.hud.updatePhone(s, flow.timeLeft, s.tray[0] ?? null);
    this.hud.setHeld(flow.phase === 'playing' ? (s.tray[0] ?? null) : null);
    const d = new Date();
    this.hud.setClock(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);

    const t = this.target;
    let hover: string | null = null;
    let cross: 'none' | 'product' | 'bag' | 'bad' | 'courier' = 'none';
    if (t?.kind === 'product') {
      const p = getProduct(t.display.productId);
      cross = s.tray.length ? 'bad' : 'product';
      hover = `<b>${esc(p.name)}</b><span>${esc(sectionLabel(p.id))} · ${formatPrice(p.price)}</span><em>${s.tray.length ? 'Elin dolu' : '<kbd>Sol tık</kbd> Al'}</em>`;
    } else if (t?.kind === 'bag') {
      const b = s.bags[t.index];
      cross = 'bag';
      const action = s.tray.length ? 'Poşete koy' : b.open ? 'Poşet açık' : 'Poşeti aç';
      hover = `<b>Poşet ${t.index + 1}</b><span>${b.open ? `${b.items.length}/${s.order.bagCapacity} ürün` : 'Katlanmış'}</span><em><kbd>Sol tık</kbd> ${action}</em>`;
    } else if (t?.kind === 'courier') {
      cross = 'courier';
      hover = `<b>Motorcu ${esc(DEMO_ORDER.courier)}</b><span>${this.inDeliveryZone() ? 'Siparişi teslim et' : 'Teslimat noktasına gir'}</span><em><kbd>E</kbd> Teslim et</em>`;
    }
    if (flow.phase === 'awaitingHandover' && this.inDeliveryZone() && !hover) {
      hover = `<b>Teslimat noktası</b><em><kbd>E</kbd> Siparişi motorcuya ver</em>`;
      cross = 'courier';
    }
    if (flow.paused || !flow.canDrive) hover = null;
    this.hud.setHover(hover);
    this.hud.setCrosshair(cross);

    let obj = '';
    const remaining = s.totalRequired() - s.totalBagged();
    switch (flow.phase) {
      case 'incoming':
        obj = '📱 Yeni sipariş! <kbd>Enter</kbd> ile kabul et';
        break;
      case 'playing':
        if (s.isComplete() && !s.tray.length) obj = '✅ Hepsi poşette → <kbd>F</kbd> Siparişi tamamla';
        else if (s.tray.length) obj = '🛒 Arabadaki poşete bak ve <kbd>Sol tık</kbd>';
        else obj = `🧾 Listeden ürün topla · <b>${remaining}</b> kaldı · <kbd>Tab</kbd> liste`;
        break;
      case 'courierArriving':
        obj = '🛵 Motorcu yolda! Girişteki <b class="g">yeşil noktaya</b> git';
        break;
      case 'awaitingHandover':
        obj = this.inDeliveryZone() ? '🙌 <kbd>E</kbd> ile siparişi teslim et!' : '🛵 Motorcu kapıda! <b class="g">Yeşil noktaya</b> git';
        break;
      case 'handover':
        obj = '📦 Teslim ediliyor…';
        break;
    }
    this.hud.setObjective(obj);
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post?.setSize(w, h);
  }

  /** Hooks for automated play-tests (scripts/playtest.mjs). */
  private exposeDebug() {
    const self = this;
    (window as unknown as { __game: unknown }).__game = {
      get ready() {
        return self.ready;
      },
      get phase() {
        return self.flow?.phase;
      },
      get timeLeft() {
        return self.flow.timeLeft;
      },
      get player() {
        return { ...self.player };
      },
      get session() {
        return { tray: [...self.session.tray], bags: self.session.bags.map((b) => ({ ...b, items: [...b.items] })), mistakes: self.session.mistakes };
      },
      get target() {
        const t = self.target;
        if (!t) return null;
        return t.kind === 'product' ? { kind: t.kind, productId: t.display.productId, display: t.display.id } : t;
      },
      get courier() {
        return self.courier.state;
      },
      get score() {
        return self.score;
      },
      layout: this.layout,
      start(mood: MoodId = 'day', quality: Quality = self.quality) {
        self.start(mood, quality);
      },
      teleport(x: number, z: number, yaw: number, pitch = -0.1) {
        self.player.x = x;
        self.player.z = z;
        self.player.yaw = yaw;
        self.player.pitch = pitch;
        self.player.vx = self.player.vz = 0;
      },
      /** Turn the camera to look at a world point. */
      aim(x: number, y: number, z: number) {
        const p = self.player;
        const dx = x - p.x;
        const dz = z - p.z;
        p.yaw = Math.atan2(dx, dz);
        const eyeY = PLAYER.eyeHeight;
        p.pitch = Math.atan2(y - eyeY, Math.hypot(dx, dz));
      },
      /** Aim at a bag in the cart. */
      aimBag(i: number) {
        self.rig.position.set(self.player.x, 0, self.player.z);
        self.rig.rotation.y = self.player.yaw;
        self.rig.updateMatrixWorld(true);
        const w = self.cart.bagAimPoint(i);
        (this as { aim(x: number, y: number, z: number): void }).aim(w.x, w.y, w.z);
      },
      /** Walk up to the nearest display holding `productId` and aim at one of its items. */
      goToProduct(productId: string): boolean {
        const p = self.player;
        const candidates = self.layout.displays.filter((d) => d.productId === productId && self.store.stockOf(d.id) > 0);
        if (!candidates.length) return false;
        candidates.sort((a, b) => Math.hypot(a.stand.x - p.x, a.stand.z - p.z) - Math.hypot(b.stand.x - p.x, b.stand.z - p.z));
        const d = candidates[0];
        // stand a bit further back so the cart fits in front of the shelf
        const fx = Math.sin(d.angle);
        const fz = Math.cos(d.angle);
        p.x = d.x + fx * (d.depth / 2 + 1.42);
        p.z = d.z + fz * (d.depth / 2 + 1.42);
        p.vx = p.vz = 0;
        p.yaw = d.angle + Math.PI;
        // let collisions settle (the cart may bump the stand) before aiming
        for (let i = 0; i < 5; i++) stepPlayer(p, { forward: 0, strafe: 0, turn: 0, sprint: false }, 1 / 60, self.layout.colliders);
        p.vx = p.vz = 0;
        const items = self.store.instancePositions(d.id);
        items.sort((a, b) => Math.abs(a.y - 1.1) - Math.abs(b.y - 1.1) || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const t = items[0];
        const dx = t.x - p.x;
        const dz = t.z - p.z;
        p.yaw = Math.atan2(dx, dz);
        p.pitch = Math.atan2(t.y - PLAYER.eyeHeight, Math.hypot(dx, dz));
        return true;
      },
      press(a: string) {
        self.input.push(a as never);
      },
      setMood(m: MoodId) {
        return self.setMood(m);
      },
      skipCourier() {
        self.courier.skipArrival();
      },
      /** Stop the rAF loop (tests drive frames with advance()). */
      freeze(on = true) {
        self.renderer.setAnimationLoop(on ? null : () => self.frame());
      },
      advance(seconds: number) {
        const steps = Math.round(seconds * 60);
        for (let i = 0; i < steps; i++) self.update(1 / 60);
        self.post.render(1 / 60);
      },
      get productStats() {
        return self.store.productMeshes
          .map((m) => {
            const g = m.geometry;
            const tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
            return { name: m.name, tris, count: m.count, total: tris * m.count };
          })
          .sort((a, b) => b.total - a.total);
      },
      get renderInfo() {
        const i = self.renderer.info;
        return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
      },
    };
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
