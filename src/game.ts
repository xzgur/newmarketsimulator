/** Game orchestrator: menus, work days, first-person loop, interaction and presentation. */
import * as THREE from 'three';
import { buildLayout, type Display, type StoreLayout } from './data/layout';
import type { LevelDef } from './data/order';
import { getProduct, formatPrice } from './data/products';
import { createPlayer, lateralSpeed, look, PLAYER, speedOf, stepPlayer, wrapAngle, type MoveInput, type PlayerState } from './logic/player';
import { GameFlow } from './logic/gameFlow';
import { OrderSession } from './logic/order';
import { loadAssets } from './render/assets';
import { StoreView } from './render/store';
import { OutsideView } from './render/outside';
import { paintCart, ShoppingCart } from './render/cartModel';
import { Hands } from './render/hands';
import { People } from './render/people';
import { CourierView } from './render/courier';
import { Particles } from './render/particles';
import { Post } from './render/post';
import { Lighting, MOODS, type MoodId } from './render/mood';
import { createProductMesh } from './render/productMeshes';
import { renderThumbnails } from './render/thumbnails';
import { Hud, esc, money, sectionLabel } from './ui/hud';
import { Input } from './input';
import { Sfx } from './audio';
import { productName, setLang, t } from './i18n';
import { happytime, loadingStop, midgameAd, onPlatformMute, setGameplay } from './platform';
import { loadCareer, loadSettings, saveCareer, saveSettings, type Settings } from './settings';
import {
  applyResult,
  buyUpgrade,
  finishDay,
  makeOrder,
  newRuleOn,
  packOrder,
  planDay,
  rankIndex,
  RANKS,
  scoreOrder,
  speedMultiplier,
  upgradeLevel,
  type Career,
  type DayPlan,
  type OrderResult,
  type UpgradeId,
} from './logic/career';

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

type Target = { kind: 'product'; display: Display; instance: number } | { kind: 'bag'; index: number } | { kind: 'courier' } | null;

const BASE_SENSITIVITY = 0.0022;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.03, 300);
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
  private career: Career = loadCareer();
  private plan: DayPlan = planDay(this.career.day);
  private results: OrderResult[] = [];
  private level: LevelDef = makeOrder(this.career.day, 0, this.career);
  /** Seconds since the store opened today. */
  private dayT = 0;
  /** Closing time reached: no new orders. */
  private closing = false;
  private paClosed = false;
  private goalCheered = false;
  private nextOrderT = -1;
  private endDayT = -1;
  private driftTipT = -1;
  private moodK = -1;
  // drift
  private driftT = 0;
  private driftLevel = 0;
  private wasDrifting = false;
  private boostT = 0;
  private boostLevel = 0;
  private sparkT = 0;
  private hud: Hud;
  private input: Input;
  private sfx = new Sfx();
  private settings: Settings = loadSettings();
  private flyers: Flyer[] = [];
  private thrown: Thrown[] = [];
  private held: THREE.Object3D | null = null;
  private target: Target = null;
  private raycaster = new THREE.Raycaster();
  private clock = new THREE.Clock();
  private time = 0;
  private ready = false;
  private shake = 0;
  private bumpCooldown = 0;
  private lastTick = -1;
  private combo = 0;
  private bestCombo = 0;
  private lastPlace = -100;
  private score = 0;
  private paTimer = 40;
  private paIndex = 0;
  private paNext: string | null = null;
  private warned = 0;
  private handoverT = 0;
  private hintTimer = 0;
  private titleT = 0;
  private wantLock = false;
  private fovKick = 0;
  private builtLang = '';

  constructor(private container: HTMLElement) {
    setLang(this.settings.lang);
    const params = new URLSearchParams(location.search);
    const q = params.get('q');
    if (q === 'low' || q === 'medium' || q === 'high') this.settings.quality = q;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.applyPixelRatio();
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.applyInputSettings();

    this.hud = new Hud(
      container,
      {
        play: () => this.startDay(),
        buy: (id) => this.buy(id),
        restart: () => this.startDay(this.plan.day),
        resume: () => this.setPaused(false),
        toMenu: () => this.toMenu(),
        next: () => this.onNext(),
        accept: () => this.accept(),
        complete: () => this.completeOrder(),
        togglePhone: () => this.hud.setPhoneOpen(!this.hud.phoneOpen),
        settingsChanged: (s, k) => this.onSettings(s, k),
        click: () => this.sfx.click(),
      },
      this.settings,
      this.career,
    );
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
    // first interaction anywhere starts the audio (browsers block autoplay)
    const unlock = () => {
      this.sfx.unlock();
      this.sfx.setMusic(true);
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' && this.hud.currentScreen === 'dayEnd') this.onNext();
    });
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    this.resize();
    this.exposeDebug();
    void this.init(params.get('mood'));
  }

  private applyPixelRatio() {
    const max = this.settings.quality === 'low' ? 1 : this.settings.quality === 'medium' ? 1.25 : 1.5;
    this.renderer.setPixelRatio(Math.min(max, window.devicePixelRatio || 1));
  }

  private applyInputSettings() {
    this.input.sensitivity = BASE_SENSITIVITY * this.settings.sensitivity;
    this.input.invertY = this.settings.invertY;
  }

  private inGame(): boolean {
    return ['waiting', 'incoming', 'playing', 'courierArriving', 'awaitingHandover', 'handover'].includes(this.flow.phase);
  }

  private async init(moodParam: string | null) {
    try {
      const base = import.meta.env.BASE_URL;
      const fonts = [new FontFace('Baloo 2', `url(${base}fonts/Baloo2.ttf)`, { weight: '400 800' }), new FontFace('Nunito', `url(${base}fonts/Nunito.ttf)`, { weight: '200 1000' })];
      await Promise.all(fonts.map((f) => f.load().then((ff) => document.fonts.add(ff)).catch(() => undefined)));
      this.hud.setLoading(0.1, 'menu.loadingModels');
      await loadAssets((p) => this.hud.setLoading(0.1 + p * 0.6));
      this.hud.setLoading(0.75, 'menu.loading');
      await nextFrame();
      this.lighting = new Lighting(this.renderer, this.scene, this.settings.quality !== 'low');
      await this.lighting.preloadSkies();
      this.outside = new OutsideView(this.layout.bounds.maxZ);
      this.scene.add(this.outside.group);
      this.buildWorld(this.level);
      this.hud.setLoading(0.88, 'menu.loadingPeople');
      await nextFrame();
      this.hud.setThumbnails(renderThumbnails(this.renderer));
      this.post = new Post(this.renderer, this.scene, this.camera, this.settings.quality, this.settings.pixel);
      this.resize();
      if (moodParam && moodParam in MOODS) this.settings.mood = moodParam as MoodId;
      await this.applyMood();
      this.sfx.setLevels(this.settings.music, this.settings.sfx, this.settings.muffle);
      this.sfx.announcements = this.settings.announcements;
      this.hud.setLoading(1, 'menu.ready');
      this.ready = true;
      this.hud.showScreen('menu');
      loadingStop();
      onPlatformMute((m) => this.sfx.setExternalMute('platform', m));
      this.renderer.setAnimationLoop(() => this.frame());
    } catch (err) {
      console.error(err);
      this.hud.setLoading(1, `!${t('loadError', { msg: (err as Error).message })}`);
    }
  }

  /** (Re)creates everything that holds per-shift state. */
  private buildWorld(level: LevelDef) {
    this.level = level;
    this.world.clear();
    for (const c of [...this.rig.children]) if (c !== this.camera) this.rig.remove(c);
    this.flyers = [];
    this.thrown = [];
    this.held = null;
    this.store = new StoreView(this.layout);
    this.people = new People(this.layout, this.plan.shoppers);
    this.people.onSpeak = (text, x, z) => {
      if (Math.hypot(x - this.player.x, z - this.player.z) < 9) this.sfx.babble(text, 0.9 + Math.random() * 0.4);
    };
    this.courier = new CourierView(this.layout.courierParking, this.layout.courierSpot, this.layout.door.z);
    this.courier.doorCallback = (open) => (this.store.doorTarget = open ? 1 : 0);
    this.particles = new Particles();
    this.world.add(this.store.group, this.people.group, this.courier.group, this.particles.group);

    this.paintCart();
    this.cart = new ShoppingCart(level.order.bagCount);
    this.cart.group.position.set(0, 0, PLAYER.cartOffset);
    this.hands = new Hands();
    this.rig.add(this.cart.group, this.hands.group);

    const { start } = this.layout;
    this.player = createPlayer(start.x, start.z, start.heading);
    this.session = new OrderSession(level.order);
    this.flow = new GameFlow(level.order.timeLimit);
    this.cart.sync(this.session);
    this.hud.setLevel(level);
    this.target = null;
    this.combo = 0;
    this.bestCombo = 0;
    this.score = 0;
    this.lastTick = -1;
    this.paTimer = 999;
    this.warned = 0;
    this.handoverT = 0;
    this.builtLang = this.settings.lang;
    if (this.lighting) this.lighting.placePoints(this.store, this.outside);
  }

  private paintCart() {
    const i = rankIndex(this.career);
    paintCart(RANKS[i].paint, i === RANKS.length - 1);
  }

  /** Fixed atmosphere from settings, or the time of day of the running day. */
  private async applyMood() {
    if (!this.lighting || !this.post) return;
    this.moodK = -1;
    if (this.settings.mood) await this.lighting.apply(this.settings.mood, this.store, this.outside, this.post);
    else this.updateTimeOfDay(true);
  }

  private updateTimeOfDay(force = false) {
    if (this.settings.mood || !this.lighting || !this.post) return;
    const k = this.inGame() ? Math.min(1, this.dayT / this.plan.length) : 0.1;
    if (!force && Math.abs(k - this.moodK) < 0.002) return;
    this.moodK = k;
    this.lighting.setTimeOfDay(k, this.store, this.outside, this.post);
  }

  private onSettings(s: Settings, key: keyof Settings) {
    this.settings = s;
    saveSettings(s);
    switch (key) {
      case 'lang':
        setLang(s.lang);
        this.hud.setThumbnails(renderThumbnails(this.renderer));
        // shelves, tags and signs carry text: rebuild them when we're in the menu
        if (this.flow.phase === 'intro' && this.builtLang !== s.lang) {
          this.buildWorld(this.level);
          void this.applyMood();
        }
        break;
      case 'sensitivity':
      case 'invertY':
        this.applyInputSettings();
        break;
      case 'music':
      case 'sfx':
      case 'muffle':
        this.sfx.setLevels(s.music, s.sfx, s.muffle);
        break;
      case 'announcements':
        this.sfx.announcements = s.announcements;
        break;
      case 'quality':
        this.applyPixelRatio();
        this.lighting.sun.castShadow = s.quality !== 'low';
        this.post.dispose();
        this.post = new Post(this.renderer, this.scene, this.camera, s.quality, s.pixel);
        this.resize();
        void this.applyMood();
        break;
      case 'pixel':
        this.post.setPixel(s.pixel);
        break;
      case 'mood':
        void this.applyMood();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- flow
  private notes(): string[] {
    return [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t(`note.${i}`));
  }

  /** A new work day: the store opens at 8 AM and orders keep coming until 8 PM. */
  private startDay(day = this.career.day) {
    this.plan = planDay(day);
    this.results = [];
    this.dayT = 0;
    this.closing = false;
    this.paClosed = false;
    this.goalCheered = false;
    this.nextOrderT = -1;
    this.endDayT = -1;
    this.resetDrift();
    this.sfx.unlock();
    this.sfx.setMusic(true);
    this.sfx.setMusicRate(1);
    this.sfx.ringStop();
    this.sfx.setEngine(0);
    this.buildWorld(makeOrder(day, 0, this.career, this.notes()));
    this.hud.setCareer(this.career);
    this.hud.setPhoneOpen(false);
    this.hud.showScreen(null);
    this.hud.setPlaying(true);
    void this.applyMood();
    if (day <= 2) {
      this.hud.showHint(true);
      this.hintTimer = 25;
      this.driftTipT = 40;
    } else this.driftTipT = -1;
    const rule = newRuleOn(day);
    this.hud.dayBanner(this.plan, rule ? t(`rule.${rule}`) : null);
    this.input.enabled = true;
    this.wantLock = true;
    this.input.requestLock();
    this.input.clear();
    setGameplay(true);
    // store PA opens the day
    this.paNext = 'pa.open';
    this.paTimer = 3;
    this.beginOrder();
  }

  /** The phone rings with the current order. */
  private beginOrder() {
    this.flow.start();
    this.hud.setPhoneScreen('incoming');
    this.sfx.ringStart();
    this.hud.toast(t('t.ringing'), 'info', 4000);
    if (this.level.express) this.hud.toast(t('t.express'), 'info', 4000);
  }

  /** Next order of the day — the player keeps going from wherever they are. */
  private nextOrder() {
    const level = makeOrder(this.plan.day, this.level.index + 1, this.career, this.notes());
    this.level = level;
    this.store.restock();
    this.store.deliveryActive = false;
    // a fresh cart with the new order's bags (the old ones left with the courier)
    if (this.held) this.held.removeFromParent();
    this.held = null;
    this.hands.reachTarget = 0;
    this.rig.remove(this.cart.group);
    this.paintCart();
    this.cart = new ShoppingCart(level.order.bagCount);
    this.cart.group.position.set(0, 0, PLAYER.cartOffset);
    this.rig.add(this.cart.group);
    this.session = new OrderSession(level.order);
    this.flow = new GameFlow(level.order.timeLimit);
    this.cart.sync(this.session);
    this.hud.setLevel(level);
    this.target = null;
    this.lastTick = -1;
    this.warned = 0;
    this.handoverT = 0;
    this.beginOrder();
  }

  /** "Next" on the end-of-day screen. */
  private adBusy = false;

  private onNext() {
    if (this.hud.currentScreen !== 'dayEnd' || this.adBusy) return;
    // natural break between two days: the platform may show a midgame ad
    this.adBusy = true;
    void midgameAd((on) => {
      this.sfx.setExternalMute('ad', on);
      this.sfx.setMusic(!on);
    }).then(() => {
      this.adBusy = false;
      this.startDay();
    });
  }

  private endDay() {
    const delivered = this.results.filter((r) => r.delivered).length;
    const { career, passed } = finishDay(this.career, this.plan, delivered);
    this.career = career;
    saveCareer(career);
    this.hud.setCareer(career);
    this.sfx.ringStop();
    this.sfx.setSkid(0);
    this.sfx.setCartSpeed(0);
    this.sfx.setEngine(0);
    this.sfx.setMusicRate(1);
    if (passed) {
      this.sfx.win();
      this.post.pulse('#FFD23F', 0.3);
      happytime();
    } else this.sfx.lose();
    setGameplay(false);
    this.flow = new GameFlow(0);
    this.hud.setPlaying(false);
    this.input.enabled = false;
    this.wantLock = false;
    this.input.releaseLock();
    this.hud.showDayEnd(this.plan, this.results, passed);
    this.hud.showScreen('dayEnd');
  }

  private buy(id: UpgradeId) {
    const next = buyUpgrade(this.career, id);
    if (!next) {
      this.sfx.error();
      return;
    }
    this.career = next;
    saveCareer(next);
    this.sfx.combo(3);
    this.hud.setCareer(next);
    this.hud.toast(t('shop.bought', { name: t(`up.${id}.name`) }), 'ok', 2000);
  }

  private toMenu() {
    setGameplay(false);
    this.sfx.ringStop();
    this.sfx.setEngine(0);
    this.sfx.setCartSpeed(0);
    this.input.enabled = false;
    this.wantLock = false;
    this.input.releaseLock();
    this.flow.paused = false;
    this.buildWorld(this.level);
    void this.applyMood();
    this.hud.setPlaying(false);
    this.hud.setCareer(this.career);
    this.hud.showScreen('menu');
  }

  private setPaused(p: boolean) {
    if (!this.inGame()) return;
    this.flow.paused = p;
    setGameplay(!p);
    this.hud.showScreen(p ? 'pause' : null);
    this.input.enabled = !p;
    this.wantLock = !p;
    if (p) this.input.releaseLock();
    else this.input.requestLock();
    this.input.clear();
  }

  // ---------------------------------------------------------------- actions
  private accept() {
    if (!this.flow.accept()) return;
    this.sfx.ringStop();
    this.sfx.ding();
    this.hud.setPhoneScreen('picking');
    this.hud.setPhoneOpen(true);
    this.hud.toast(t('t.accepted'), 'ok');
    if (this.level.tutorial) setTimeout(() => this.hud.toast(t('tut.findAisle'), 'info', 5000), 2500);
    setTimeout(() => {
      if (this.flow.phase === 'playing' && this.hud.phoneOpen) this.hud.setPhoneOpen(false);
    }, 6000);
  }

  private interact() {
    const tg = this.target;
    const ph = this.flow.phase;
    if (ph === 'incoming') {
      this.hud.toast(t('t.acceptFirst'), 'info');
      return;
    }
    if (ph === 'awaitingHandover' && this.inDeliveryZone()) {
      this.handover();
      return;
    }
    if (!tg) return;
    if (tg.kind === 'courier') {
      if (ph === 'awaitingHandover') this.hud.toast(t('t.closer'), 'info');
      return;
    }
    if (ph !== 'playing') return;
    if (tg.kind === 'bag') {
      if (this.session.tray.length) this.placeHeld(tg.index);
      else if (!this.session.bags[tg.index].open) {
        this.session.openBag(tg.index);
        this.sfx.bagOpen();
        this.cart.sync(this.session);
      } else this.hud.toast(t('t.grabFirst'), 'info', 1600);
      return;
    }
    if (tg.kind === 'product') this.pick(tg.display, tg.instance);
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
      this.flyers.push({ obj: mesh, from: taken.position.clone(), to: () => this.hands.holdAnchor.getWorldPosition(new THREE.Vector3()), t: 0, dur: 0.28, arc: 0.15, spin: 0, done: () => this.attachHeld(mesh) });
    } else this.attachHeld(mesh);
    this.hud.popup(productName(product.id), 'pick');
    if (this.level.tutorial && !this.session.bags.some((b) => b.open)) this.hud.toast(t('tut.openBag'), 'info', 4000);
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
    if (!pid || bagIndex >= this.session.bags.length) return;
    if (!this.session.bags[bagIndex].open) {
      this.session.openBag(bagIndex);
      this.sfx.bagOpen();
    }
    const r = this.session.place(0, bagIndex);
    if (!r.ok) {
      this.sfx.error();
      this.cart.rejectShake(bagIndex);
      this.hud.toast(r.reason, 'err', 3400);
      this.post.pulse('#FF5B4F', 0.35);
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
          this.particles.sparkle(this.cart.bagWorldPosition(bagIndex), '#FFD23F', 22, 1.2);
          this.sfx.place();
        },
      });
    } else this.cart.sync(this.session);
    this.combo = this.time - this.lastPlace < 14 ? this.combo + 1 : 1;
    this.lastPlace = this.time;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gained = 100 + (this.combo - 1) * 40;
    this.score += gained;
    if (this.combo >= 2) {
      this.hud.popup(`${t('hud.combo', { n: this.combo })}  +${gained}`, 'combo');
      this.sfx.combo(this.combo);
    } else this.hud.popup(`+${gained}`, 'plus');
    if (this.session.isComplete()) {
      this.hud.toast(t('t.allBagged'), 'ok', 4000);
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
    this.hud.toast(t('t.putBack', { name: productName(pid) }), 'info', 1600);
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
    this.particles.confettiBurst(this.cart.bagWorldPosition(0).add(new THREE.Vector3(0, 0.3, 0)), 90);
    this.post.pulse('#4FBF5A', 0.25);
    this.store.deliveryActive = true;
    this.hud.setPhoneScreen('courier');
    this.hud.courierEta = upgradeLevel(this.career, 'courier') ? 4.5 : 9;
    this.hud.toast(t('t.orderReady', { name: this.level.order.courier }), 'ok', 3500);
    this.courier.arrive(() => {
      this.flow.courierArrived();
      this.hud.courierEta = 0;
      this.hud.toast(t('t.courierHere'), 'ok', 4000);
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
      this.hud.toast(t('t.taken'), 'ok');
      this.courier.leave(() => this.win());
      // don't wait for the whole ride out: the review pops up shortly after (game time)
      this.handoverT = 2.4;
    });
  }

  private win() {
    if (!this.flow.handoverDone()) return;
    this.sfx.setEngine(0);
    this.finishOrder(true);
  }

  private lose() {
    this.sfx.ringStop();
    this.sfx.lose();
    this.sfx.setEngine(0);
    this.sfx.setCartSpeed(0);
    this.hud.setPhoneScreen('failed');
    this.finishOrder(false);
  }

  /** Scores the order and pays out; the review pops up as a notification and the day goes on. */
  private finishOrder(delivered: boolean) {
    this.sfx.setMusicRate(1);
    this.sfx.ringStop();
    const r = scoreOrder(this.level, this.career, delivered, this.flow.timeLeft, this.session.mistakes);
    this.results.push(r);
    const { career, promoted } = applyResult(this.career, r);
    this.career = career;
    saveCareer(career);
    this.hud.setCareer(career);
    this.hud.reviewToast(this.level, r);
    if (promoted) {
      this.paintCart();
      this.hud.promotion(promoted);
      happytime();
      this.sfx.win();
      this.post.pulse('#FFD23F', 0.4);
    } else if (delivered && r.stars >= 4) this.sfx.combo(r.stars);
    if (!delivered) {
      this.courier.cancel();
      this.store.deliveryActive = false;
    }
    const done = this.results.filter((x) => x.delivered).length;
    if (delivered && done === this.plan.goal && !this.goalCheered) {
      this.goalCheered = true;
      setTimeout(() => this.hud.toast(t('t.goalReached'), 'ok', 4500), 1200);
    }
    // back to free roaming until the next order rings (or the day ends)
    this.flow.idle();
    this.hud.setUrgency(0);
    if (this.closing) {
      this.endDayT = 2.5;
      this.hud.nextOrderIn = -1;
    } else {
      this.nextOrderT = 4.5;
      this.hud.nextOrderIn = this.nextOrderT;
    }
    this.hud.setPhoneScreen('waiting');
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
        this.hud.toast(this.sfx.muted ? t('t.muted') : t('t.unmuted'), 'info', 1200);
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
    if (flow.phase === 'intro' || (!this.inGame() && this.hud.currentScreen === 'menu')) {
      this.updateTitleCamera(dt);
      this.people.update(dt, { x: 999, z: 999, yaw: 0 });
      this.outside.update(dt);
      this.store.update(dt);
      this.input.consume();
      return;
    }
    this.handleActions();
    if (flow.canDrive) {
      const l = this.input.look();
      look(this.player, l.yaw, l.pitch);
      const mv = this.input.move();
      if (flow.phase === 'handover') mv.forward = mv.strafe = mv.turn = 0;
      const boostMul = this.boostT > 0 ? (this.boostLevel > 1 ? 1.5 : 1.32) : 1;
      const hit = stepPlayer(this.player, mv, dt, this.layout.colliders, this.people.blockers(), speedMultiplier(this.career) * boostMul);
      this.updateDrift(dt, mv, hit);
      this.bumpCooldown -= dt;
      const sp = speedOf(this.player);
      if (hit && this.bumpCooldown <= 0 && sp > 1.4) {
        this.sfx.bump();
        this.shake = 0.18;
        this.bumpCooldown = 0.6;
        this.people.bump(this.player.x + Math.sin(this.player.yaw) * PLAYER.cartOffset, this.player.z + Math.cos(this.player.yaw) * PLAYER.cartOffset, sp);
      }
      const kick = this.boostT > 0 ? 1.8 : mv.sprint && mv.forward > 0 ? 1 : 0;
      this.fovKick += (kick - this.fovKick) * Math.min(1, dt * 4);
    } else {
      this.input.look();
      if (this.wasDrifting) this.resetDrift();
    }
    const speed = speedOf(this.player);
    this.sfx.setCartSpeed(flow.paused || !this.inGame() ? 0 : speed / PLAYER.sprint);

    if (flow.tick(dt)) this.lose();
    this.updateUrgency();

    if (!flow.paused) {
      this.people.update(dt, this.player);
      const fastCourier = upgradeLevel(this.career, 'courier') > 0 && (this.courier.state === 'ridingIn' || this.courier.state === 'walkingIn');
      this.courier.update(fastCourier ? dt * 2 : dt);
      this.store.update(dt);
      this.outside.update(dt);
      this.particles.update(dt);
      this.updateFlyers(dt);
      this.cart.update(dt, speed);
      if (this.handoverT > 0) {
        this.handoverT -= dt;
        if (this.handoverT <= 0) this.win();
      }
      this.updateDay(dt);
      if (!this.inGame()) return;
      this.paTimer -= dt;
      if (this.paTimer <= 0) {
        this.paTimer = 40 + Math.random() * 25;
        let key = this.paNext;
        this.paNext = null;
        if (!key) {
          this.paIndex = (this.paIndex % 8) + 1;
          key = `pa.${this.paIndex}`;
        }
        const text = t(key);
        this.sfx.announce(text, key);
        this.hud.paSubtitle(text);
      }
      if (this.hintTimer > 0) {
        this.hintTimer -= dt;
        if (this.hintTimer <= 0) this.hud.showHint(false);
      }
      if (this.driftTipT > 0) {
        this.driftTipT -= dt;
        if (this.driftTipT <= 0) this.hud.toast(t('t.driftTip'), 'info', 6000);
      }
    }
    this.sfx.setEngine(flow.paused ? 0 : this.courier.engineLevel);
    this.updateRig(dt, speed);
    this.updateTarget();
    this.updateHud(dt);
    this.updateRadar();
  }

  /** In-game wall clock: 08:00 at opening, 20:00 at closing. */
  private dayClock(): string {
    const k = Math.min(1, this.dayT / this.plan.length);
    const mins = Math.floor(8 * 60 + k * 12 * 60);
    return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }

  /** Day clock: closing time, pacing of new orders, end of the day. */
  private updateDay(dt: number) {
    if (!this.inGame()) return;
    this.dayT += dt;
    const len = this.plan.length;
    if (!this.paClosed && this.dayT >= len * 0.86) {
      this.paClosed = true;
      this.paNext = 'pa.closing';
      this.paTimer = Math.min(this.paTimer, 0.5);
    }
    if (!this.closing && this.dayT >= len) {
      this.closing = true;
      this.hud.toast(t('t.closing'), 'info', 4500);
      this.sfx.chime();
      // nothing in progress: lights out
      if (this.flow.phase === 'waiting' || this.flow.phase === 'incoming') {
        this.sfx.ringStop();
        this.flow.idle();
        this.nextOrderT = -1;
        this.endDayT = 2.5;
        this.hud.nextOrderIn = -1;
        this.hud.setPhoneScreen('waiting');
      }
    }
    if (this.nextOrderT > 0) {
      this.nextOrderT -= dt;
      this.hud.nextOrderIn = Math.max(0.01, this.nextOrderT);
      if (this.nextOrderT <= 0) {
        this.nextOrderT = -1;
        if (!this.closing) this.nextOrder();
      }
    }
    if (this.endDayT > 0) {
      this.endDayT -= dt;
      if (this.endDayT <= 0) {
        this.endDayT = -1;
        this.endDay();
        return;
      }
    }
    this.updateTimeOfDay();
  }

  private resetDrift() {
    this.driftT = 0;
    this.driftLevel = 0;
    this.wasDrifting = false;
    this.sfx.setSkid(0);
    this.hud.setDrift(false, 0, 0);
  }

  /**
   * Hold Space while moving and turn: the cart slides. Sliding charges a
   * boost (blue → orange sparks); letting go fires it. Bumping loses it.
   */
  private updateDrift(dt: number, mv: MoveInput, hit: boolean) {
    const p = this.player;
    const sp = speedOf(p);
    const lat = Math.abs(lateralSpeed(p));
    const sliding = !!mv.drift && sp > PLAYER.driftMinSpeed;
    this.boostT = Math.max(0, this.boostT - dt);
    if (sliding) {
      if (hit) this.driftT *= 0.5;
      else if (lat > 0.4) this.driftT += dt * Math.min(1.6, Math.max(0.6, lat / 1.0));
      const lvl = this.driftT > 1.5 ? 2 : this.driftT > 0.6 ? 1 : 0;
      if (lvl > this.driftLevel) {
        this.sfx.driftLevel(lvl);
        this.hud.popup(t(lvl > 1 ? 'hud.driftSuper' : 'hud.driftBoost'), 'plus');
      }
      this.driftLevel = lvl;
      this.wasDrifting = true;
      this.sfx.setSkid(Math.min(1, 0.25 + lat / 2.6));
      this.sparkT -= dt;
      if (this.sparkT <= 0 && lat > 0.4) {
        this.sparkT = 0.045;
        const color = lvl > 1 ? '#FF8F3A' : lvl > 0 ? '#3FA2F7' : '#e9e2d0';
        for (const side of [-0.3, 0.3]) {
          const at = new THREE.Vector3(side, 0.06, PLAYER.cartOffset + 0.25).applyMatrix4(this.rig.matrixWorld);
          this.particles.sparkle(at, color, lvl > 0 ? 3 : 2, lvl > 0 ? 1.4 : 0.6);
        }
      }
      this.hud.setDrift(true, Math.min(1, this.driftT / 1.5), lvl);
      return;
    }
    if (this.wasDrifting && this.driftLevel > 0) {
      // release: boost!
      this.boostLevel = this.driftLevel;
      this.boostT = this.driftLevel > 1 ? 1.6 : 0.9;
      this.sfx.boost(this.driftLevel);
      this.hud.popup(t(this.driftLevel > 1 ? 'hud.superBoost' : 'hud.boost'), 'combo');
      this.post.pulse(this.driftLevel > 1 ? '#FF8F3A' : '#3FA2F7', 0.18);
      this.shake = Math.max(this.shake, 0.1);
    }
    if (this.wasDrifting) this.resetDrift();
  }

  /** Low-time drama: red pulsing edges, shaking timer, ticking, faster music. */
  private updateUrgency() {
    const flow = this.flow;
    const left = flow.timeLeft;
    const live = flow.timerRunning;
    const u = live && left <= 30 ? Math.min(1, (30 - left) / 30) * 0.7 + 0.3 : 0;
    this.hud.setUrgency(u);
    this.sfx.setMusicRate(live && left <= 30 ? 1 + (left <= 10 ? 0.12 : 0.06) : 1);
    if (!live) return;
    if (left <= 30 && this.warned < 1) {
      this.warned = 1;
      this.hud.toast(t('hud.hurry'), 'err', 2600);
      this.sfx.error();
    }
    if (left <= 10 && this.warned < 2) {
      this.warned = 2;
      this.hud.toast(t('hud.lastTen'), 'err', 2600);
    }
    if (left <= 15) {
      const s = Math.ceil(left);
      if (s !== this.lastTick) {
        this.lastTick = s;
        this.sfx.tick();
        if (left <= 10) {
          this.sfx.heartbeat();
          this.shake = Math.max(this.shake, 0.06);
        }
      }
    }
  }

  /** Shelf Radar upgrade: arrow to the nearest shelf holding the next missing item. */
  private updateRadar() {
    const s = this.session;
    if (!upgradeLevel(this.career, 'radar') || this.flow.phase !== 'playing' || this.flow.paused || s.tray.length) {
      this.hud.setRadar(null);
      return;
    }
    const next = s.progress().find((l) => l.bagged < l.qty);
    if (!next) {
      this.hud.setRadar(null);
      return;
    }
    const p = this.player;
    let best: Display | null = null;
    let bd = Infinity;
    for (const d of this.layout.displays) {
      if (d.productId !== next.productId || this.store.stockOf(d.id) <= 0) continue;
      const dist = Math.hypot(d.stand.x - p.x, d.stand.z - p.z);
      if (dist < bd) {
        bd = dist;
        best = d;
      }
    }
    if (!best) {
      this.hud.setRadar(null);
      return;
    }
    const rel = wrapAngle(Math.atan2(best.x - p.x, best.z - p.z) - p.yaw);
    this.hud.setRadar(-rel, Math.hypot(best.x - p.x, best.z - p.z));
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
    const fov = this.settings.fov + this.fovKick * 7;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const lateral = -(p.vx * Math.cos(p.yaw) - p.vz * Math.sin(p.yaw));
    this.cart.group.rotation.z += (lateral * 0.012 - this.cart.group.rotation.z) * Math.min(1, dt * 6);
    this.cart.group.position.y = Math.abs(Math.sin(p.stride * 9)) * 0.004 * bobAmt;
    this.hands.update(dt, this.camera, PLAYER.cartOffset - 0.52, 1.04, bob);
  }

  private updateTitleCamera(dt: number) {
    this.titleT += dt;
    const tt = this.titleT * 0.05;
    const x = Math.sin(tt) * 11;
    this.rig.position.set(0, 0, 0);
    this.rig.rotation.y = 0;
    this.camera.position.set(x, 2.0 + Math.sin(tt * 2) * 0.2, 5.4);
    this.camera.lookAt(x - 2.5 * Math.cos(tt), 1.15, -3);
    if (Math.abs(this.camera.fov - 62) > 0.05) {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateTarget() {
    const ph = this.flow.phase;
    let target: Target = null;
    this.rig.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    this.raycaster.far = 3.1;
    if (ph === 'playing' && !this.flow.paused) {
      const holding = this.session.tray.length > 0;
      const bagHits = this.raycaster.intersectObjects(this.cart.hitTargets, false).filter((hh) => holding || !this.session.bags[ShoppingCart.bagIndexOf(hh.object)].open);
      if (bagHits.length) target = { kind: 'bag', index: ShoppingCart.bagIndexOf(bagHits[0].object) };
      else {
        for (const hit of this.raycaster.intersectObjects(this.store.productMeshes, false)) {
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
    for (let i = 0; i < this.session.bags.length; i++) this.cart.setBagHighlight(i, target?.kind === 'bag' && target.index === i);
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
      const th = this.thrown[i];
      th.life -= dt;
      th.vel.y -= 9.8 * dt;
      th.obj.position.addScaledVector(th.vel, dt);
      th.obj.rotation.x += th.spin.x * dt;
      th.obj.rotation.y += th.spin.y * dt;
      if (th.obj.position.y < 0.05) {
        th.obj.position.y = 0.05;
        th.vel.y = Math.abs(th.vel.y) * 0.35;
        th.vel.x *= 0.6;
        th.vel.z *= 0.6;
        th.spin.multiplyScalar(0.5);
      }
      if (th.life < 0.4) th.obj.scale.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (th.life <= 0) {
        th.obj.removeFromParent();
        this.thrown.splice(i, 1);
      }
    }
  }

  private updateHud(dt: number) {
    const flow = this.flow;
    const s = this.session;
    this.hud.setTimer(flow.timeLeft, flow.timerRunning, flow.phase !== 'waiting');
    if (this.hud.courierEta > 0 && flow.phase === 'courierArriving') this.hud.courierEta = Math.max(0.5, this.hud.courierEta - dt);
    this.hud.setDayInfo(this.plan.day, this.dayClock(), this.results.filter((r) => r.delivered).length, this.plan.goal, this.closing, money(this.career.cash));
    this.hud.updatePhone(s, s.tray[0] ?? null);
    this.hud.setHeld(flow.phase === 'playing' ? (s.tray[0] ?? null) : null, s);
    this.hud.setClock(this.dayClock());

    const tg = this.target;
    let hover: string | null = null;
    let cross: 'none' | 'product' | 'bag' | 'bad' | 'courier' = 'none';
    if (tg?.kind === 'product') {
      const p = getProduct(tg.display.productId);
      cross = s.tray.length ? 'bad' : 'product';
      hover = `<b>${esc(productName(p.id))}</b><span>${esc(sectionLabel(p.id))} · ${formatPrice(p.price)}</span><em>${s.tray.length ? esc(t('hud.handFull')) : t('hud.grab')}</em>`;
    } else if (tg?.kind === 'bag') {
      const b = s.bags[tg.index];
      cross = 'bag';
      const action = s.tray.length ? t('hud.bagPut') : b.open ? t('hud.bagIsOpen') : t('hud.bagOpen');
      hover = `<b>${esc(t('hud.bag', { n: tg.index + 1 }))}</b><span>${b.open ? esc(t('hud.bagItems', { n: b.items.length, cap: s.order.bagCapacity })) : esc(t('hud.bagFolded'))}</span><em><kbd>${tg.index + 1}</kbd> ${esc(action)}</em>`;
    } else if (tg?.kind === 'courier') {
      cross = 'courier';
      hover = `<b>${esc(t('hud.courier', { name: this.level.order.courier }))}</b><span>${esc(this.inDeliveryZone() ? t('hud.handOver') : t('hud.goGreen'))}</span><em>${t('hud.handOverKey')}</em>`;
    }
    if (flow.phase === 'awaitingHandover' && this.inDeliveryZone() && !hover) {
      hover = `<b>${esc(t('hud.deliverySpot'))}</b><em>${t('hud.deliveryKey')}</em>`;
      cross = 'courier';
    }
    if (flow.paused || !flow.canDrive) hover = null;
    this.hud.setHover(hover);
    this.hud.setCrosshair(cross);

    let obj = '';
    const remaining = s.totalRequired() - s.totalBagged();
    switch (flow.phase) {
      case 'incoming':
        obj = t('obj.incoming');
        break;
      case 'playing':
        if (s.isComplete() && !s.tray.length) obj = t('obj.allBagged');
        else if (s.tray.length) obj = t('obj.bagIt');
        else obj = t('obj.collect', { n: remaining });
        break;
      case 'courierArriving':
        obj = t('obj.courierComing');
        break;
      case 'awaitingHandover':
        obj = this.inDeliveryZone() ? t('obj.handOver') : t('obj.courierHere');
        break;
      case 'handover':
        obj = t('obj.handingOver');
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
      get level() {
        return { day: self.level.day, index: self.level.index, express: self.level.express };
      },
      get day() {
        return { ...self.plan, t: self.dayT, closing: self.closing, delivered: self.results.filter((r) => r.delivered).length, results: self.results.length };
      },
      get order() {
        return self.level.order;
      },
      get screen() {
        return self.hud.currentScreen;
      },
      /** Bag index for each item of the current order (lines expanded by qty). */
      get packPlan() {
        return packOrder(self.level.order);
      },
      get career() {
        return { ...self.career };
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
        const tg = self.target;
        if (!tg) return null;
        return tg.kind === 'product' ? { kind: tg.kind, productId: tg.display.productId, display: tg.display.id } : tg;
      },
      get courier() {
        return self.courier.state;
      },
      get score() {
        return self.score;
      },
      layout: this.layout,
      hud: this.hud,
      startDay(day?: number) {
        self.startDay(day);
      },
      /** Skip straight to the next order of the day. */
      skipOrder() {
        self.sfx.ringStop();
        self.nextOrder();
      },
      /** Jump the day clock (seconds since opening). */
      setDayTime(sec: number) {
        self.dayT = sec;
      },
      get drift() {
        return { t: self.driftT, level: self.driftLevel, boost: self.boostT };
      },
      next() {
        self.onNext();
      },
      buy(id: UpgradeId) {
        self.buy(id);
      },
      giveStars(n: number) {
        self.career = { ...self.career, stars: self.career.stars + n };
        self.hud.setCareer(self.career);
        self.paintCart();
      },
      giveCash(v: number) {
        self.career = { ...self.career, cash: self.career.cash + v };
        self.hud.setCareer(self.career);
      },
      teleport(x: number, z: number, yaw: number, pitch = -0.1) {
        Object.assign(self.player, { x, z, yaw, pitch, vx: 0, vz: 0 });
      },
      aim(x: number, y: number, z: number) {
        const p = self.player;
        const dx = x - p.x;
        const dz = z - p.z;
        p.yaw = Math.atan2(dx, dz);
        p.pitch = Math.atan2(y - PLAYER.eyeHeight, Math.hypot(dx, dz));
      },
      aimBag(i: number) {
        self.rig.position.set(self.player.x, 0, self.player.z);
        self.rig.rotation.y = self.player.yaw;
        self.rig.updateMatrixWorld(true);
        const w = self.cart.bagAimPoint(i);
        (this as { aim(x: number, y: number, z: number): void }).aim(w.x, w.y, w.z);
      },
      goToProduct(productId: string): boolean {
        const p = self.player;
        const candidates = self.layout.displays.filter((d) => d.productId === productId && self.store.stockOf(d.id) > 0);
        if (!candidates.length) return false;
        candidates.sort((a, b) => Math.hypot(a.stand.x - p.x, a.stand.z - p.z) - Math.hypot(b.stand.x - p.x, b.stand.z - p.z));
        const d = candidates[0];
        const fx = Math.sin(d.angle);
        const fz = Math.cos(d.angle);
        Object.assign(p, { x: d.x + fx * (d.depth / 2 + 1.42), z: d.z + fz * (d.depth / 2 + 1.42), vx: 0, vz: 0, yaw: d.angle + Math.PI });
        for (let i = 0; i < 5; i++) stepPlayer(p, { forward: 0, strafe: 0, turn: 0, sprint: false }, 1 / 60, self.layout.colliders);
        p.vx = p.vz = 0;
        const items = self.store.instancePositions(d.id);
        items.sort((a, b) => Math.abs(a.y - 1.1) - Math.abs(b.y - 1.1) || Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
        const tt = items[0];
        const dx = tt.x - p.x;
        const dz = tt.z - p.z;
        p.yaw = Math.atan2(dx, dz);
        p.pitch = Math.atan2(tt.y - PLAYER.eyeHeight, Math.hypot(dx, dz));
        return true;
      },
      press(a: string) {
        self.input.push(a as never);
      },
      popup(text: string, cls = 'combo') {
        self.hud.popup(text, cls);
      },
      npcSay(text: string) {
        self.people.sayAll(text);
      },
      skipCourier() {
        self.courier.skipArrival();
      },
      debugWin() {
        self.flow.phase = 'handover';
        self.win();
      },
      freeze(on = true) {
        self.renderer.setAnimationLoop(on ? null : () => self.frame());
      },
      advance(seconds: number) {
        const steps = Math.round(seconds * 60);
        for (let i = 0; i < steps; i++) self.update(1 / 60);
        self.post.render(1 / 60);
      },
      get renderInfo() {
        const i = self.renderer.info;
        return { calls: i.render.calls, triangles: i.render.triangles };
      },
    };
  }
}

function nextFrame(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()));
}
