/** Game orchestrator: owns the scene, the loop and wires logic <-> views <-> UI. */
import * as THREE from 'three';
import { buildLayout, findDisplayAt, type Display, type StoreLayout } from './data/layout';
import { DEMO_ORDER } from './data/order';
import { getProduct, SECTIONS } from './data/products';
import { CART, createCart, stepCart, type CartState } from './logic/cartPhysics';
import { GameFlow } from './logic/gameFlow';
import { OrderSession } from './logic/order';
import { StoreView } from './render/store';
import { CartView } from './render/cart';
import { CourierView } from './render/courier';
import { createProductMesh } from './render/productMeshes';
import { renderThumbnails } from './render/thumbnails';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { Input } from './input';
import { Sfx } from './audio';

interface Flyer {
  obj: THREE.Object3D;
  from: THREE.Vector3;
  to: () => THREE.Vector3;
  t: number;
  dur: number;
  arc: number;
  done?: () => void;
}

type CamMode = 'chase' | 'top';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  private camTarget = new THREE.Vector3();
  private camMode: CamMode = 'chase';
  private layout: StoreLayout = buildLayout();
  private store!: StoreView;
  private cartView!: CartView;
  private courier!: CourierView;
  private cart!: CartState;
  private session!: OrderSession;
  private flow!: GameFlow;
  private hud: Hud;
  private minimap: Minimap;
  private input = new Input();
  private sfx = new Sfx();
  private flyers: Flyer[] = [];
  private target: Display | null = null;
  private clock = new THREE.Clock();
  private bumpCooldown = 0;
  private lastTickSecond = -1;
  private world = new THREE.Group();

  constructor(private container: HTMLElement) {
    // ?q=low → no shadows / AA, 1x pixel ratio (weak GPUs, software rendering)
    const low = new URLSearchParams(location.search).get('q') === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(low ? 1 : Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#bcd7ee');
    this.scene.fog = new THREE.Fog('#bcd7ee', 45, 90);
    this.setupLights();
    this.scene.add(this.world);

    this.hud = new Hud(container, DEMO_ORDER, {
      start: () => this.start(),
      restart: () => this.restart(),
      resume: () => this.setPaused(false),
      openBag: (i) => this.openBag(i),
      place: (t, b) => this.place(t, b),
      discard: (t) => this.discard(t),
      unbag: (b, i) => this.unbag(b, i),
      closeOrder: () => this.closeOrder(),
      togglePanel: () => this.togglePanel(),
    });
    this.minimap = new Minimap(this.layout);
    this.hud.attachMinimap(this.minimap.canvas);

    this.buildWorld();
    this.hud.setThumbnails(renderThumbnails(this.renderer));
    this.hud.showScreen('intro');

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.flow.timerRunning) this.setPaused(true);
    });
    this.resize();
    this.exposeDebug();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupLights() {
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#b8ad96', 1.5));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.25));
    const sun = new THREE.DirectionalLight('#fff6e8', 2.1);
    sun.position.set(9, 24, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -24;
    s.right = 24;
    s.top = 24;
    s.bottom = -24;
    s.near = 1;
    s.far = 70;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun);
  }

  /** (Re)creates everything that holds per-run state. */
  private buildWorld() {
    this.world.clear();
    this.flyers = [];
    this.store = new StoreView(this.layout);
    this.cartView = new CartView();
    this.courier = new CourierView(this.layout.courierParking, this.layout.courierSpot, this.layout.door.z);
    this.courier.doorCallback = (open) => (this.store.doorTarget = open ? 1 : 0);
    this.world.add(this.store.group, this.cartView.group, this.courier.group);

    const { start } = this.layout;
    this.cart = createCart(start.x, start.z, start.heading);
    this.session = new OrderSession(DEMO_ORDER);
    this.flow = new GameFlow(DEMO_ORDER.timeLimit);
    this.cartView.setPose(this.cart.x, this.cart.z, this.cart.heading);
    this.cartView.sync(this.session);
    this.cartView.setStatusColor('#4da3ff');
    this.target = null;
    this.lastTickSecond = -1;
    this.snapCamera();
  }

  private start() {
    this.sfx.unlock();
    this.flow.start();
    this.hud.showScreen(null);
    this.hud.toast('Vardiya başladı! Siparişi topla.', 'info');
    this.input.clear();
  }

  private restart() {
    this.sfx.setEngine(0);
    this.hud.setPanelOpen(false);
    this.buildWorld();
    this.hud.showScreen(null);
    this.flow.start();
    this.sfx.unlock();
    this.input.clear();
  }

  private setPaused(p: boolean) {
    if (!['playing', 'courierArriving', 'awaitingHandover'].includes(this.flow.phase)) return;
    this.flow.paused = p;
    this.hud.showScreen(p ? 'pause' : null);
    this.input.clear();
  }

  // ---------------------------------------------------------------- actions
  private togglePanel() {
    if (!this.flow.canDrive) return;
    if (this.session.closed && !this.hud.panelOpen) {
      this.hud.toast('Sipariş kapatıldı, poşetler hazır.', 'info');
      return;
    }
    this.hud.setPanelOpen(!this.hud.panelOpen);
    this.hud.updatePanel(this.session);
  }

  private interact() {
    if (this.hud.panelOpen) return;
    const ph = this.flow.phase;
    if (ph === 'awaitingHandover' && this.inDeliveryZone()) {
      this.handover();
      return;
    }
    if ((ph === 'courierArriving' || ph === 'awaitingHandover') && this.inDeliveryZone()) {
      this.hud.toast('Motorcu henüz gelmedi, biraz bekle…', 'info');
      return;
    }
    if (ph !== 'playing' || !this.target) return;
    const d = this.target;
    const product = getProduct(d.productId);
    if (this.store.stockOf(d.id) === 0) {
      this.hud.toast(`${product.name} tükendi. Başka rafa bak.`, 'err');
      this.sfx.error();
      return;
    }
    const r = this.session.pick(d.productId);
    if (!r.ok) {
      this.hud.toast(r.reason, 'err');
      this.sfx.error();
      return;
    }
    const taken = this.store.take(d.id);
    if (taken) {
      const mesh = createProductMesh(product);
      mesh.position.copy(taken.position);
      mesh.quaternion.copy(taken.quaternion);
      this.world.add(mesh);
      this.flyers.push({
        obj: mesh,
        from: taken.position.clone(),
        to: () => this.cartView.trayWorldPosition(),
        t: 0,
        dur: 0.45,
        arc: 0.8,
        done: () => {
          mesh.removeFromParent();
          this.cartView.sync(this.session);
        },
      });
    } else {
      this.cartView.sync(this.session);
    }
    this.sfx.pick();
    this.hud.toast(`Okutuldu: ${product.name}`, 'ok', 1800);
    if (this.session.tray.length >= this.session.order.trayCapacity) {
      this.hud.toast('Kasa doldu! Tab ile ürünleri poşetle.', 'info');
    }
  }

  private openBag(i: number) {
    const r = this.session.openBag(i);
    if (r.ok) {
      this.sfx.bagOpen();
      this.cartView.sync(this.session);
    }
    this.hud.updatePanel(this.session);
  }

  private place(trayIndex: number, bagIndex: number) {
    if (!this.session.bags[bagIndex]?.open) {
      this.openBag(bagIndex);
    }
    const pid = this.session.tray[trayIndex];
    const r = this.session.place(trayIndex, bagIndex);
    if (r.ok) {
      this.sfx.place();
      this.cartView.sync(this.session);
      if (pid) this.flyToBag(pid, bagIndex);
      if (this.session.isComplete() && this.session.tray.length === 0) {
        this.hud.toast('Tüm ürünler poşette! "Siparişi Tamamla"ya bas.', 'ok', 3500);
      }
    } else {
      this.sfx.error();
      this.hud.toast(r.reason, 'err', 3200);
      if (r.penalty) {
        this.flow.penalize(r.penalty);
        this.hud.flashTimerPenalty(r.penalty);
        this.cartView.flash('#ff3b30');
        if (this.flow.phase === 'lost') this.lose();
      }
    }
    this.hud.updatePanel(this.session);
  }

  private flyToBag(pid: string, bagIndex: number) {
    const mesh = createProductMesh(getProduct(pid));
    const from = this.cartView.trayWorldPosition();
    mesh.position.copy(from);
    this.world.add(mesh);
    this.flyers.push({ obj: mesh, from, to: () => this.cartView.bagWorldPosition(bagIndex), t: 0, dur: 0.35, arc: 0.5, done: () => mesh.removeFromParent() });
  }

  private discard(trayIndex: number) {
    const pid = this.session.tray[trayIndex];
    if (this.session.discard(trayIndex).ok && pid) {
      this.hud.toast(`İade edildi: ${getProduct(pid).name}`, 'info', 1800);
      this.cartView.sync(this.session);
    }
    this.hud.updatePanel(this.session);
  }

  private unbag(bagIndex: number, itemIndex: number) {
    const r = this.session.unbag(bagIndex, itemIndex);
    if (!r.ok) this.hud.toast(r.reason, 'err');
    this.cartView.sync(this.session);
    this.hud.updatePanel(this.session);
  }

  private closeOrder() {
    if (this.flow.phase !== 'playing') return;
    const r = this.session.close();
    if (!r.ok) {
      this.hud.toast(r.reason, 'err');
      this.sfx.error();
      return;
    }
    this.flow.orderClosed();
    this.sfx.complete();
    this.cartView.sync(this.session);
    this.cartView.setStatusColor('#2ecc71');
    this.hud.setPanelOpen(false);
    this.hud.toast('Sipariş hazır! Motorcu çağrıldı.', 'ok', 3500);
    this.store.deliveryActive = true;
    this.courier.arrive(() => {
      this.flow.courierArrived();
      this.hud.toast('Motorcu kapıda bekliyor! Siparişi teslim et.', 'ok', 3500);
      this.sfx.tick();
    });
  }

  private inDeliveryZone(): boolean {
    const d = this.layout.delivery;
    return Math.hypot(this.cart.x - d.x, this.cart.z - d.z) <= d.radius;
  }

  private handover() {
    if (!this.flow.handover()) return;
    this.cart.speed = 0;
    this.store.deliveryActive = false;
    this.sfx.place();
    const bags = this.cartView.takeBags();
    this.courier.receive(bags, () => {
      this.hud.toast('Motorcu siparişi teslim aldı!', 'ok');
      this.courier.leave(() => this.win());
    });
  }

  private win() {
    if (!this.flow.handoverDone()) return;
    this.sfx.setEngine(0);
    this.sfx.win();
    this.hud.showWon(this.flow.timeLeft, this.flow.stars(this.session.mistakes), this.session.mistakes, this.flow.penalties);
    this.hud.showScreen('won');
  }

  private lose() {
    this.hud.setPanelOpen(false);
    this.sfx.lose();
    this.sfx.setEngine(0);
    this.sfx.setCartSpeed(0);
    const note = this.session.closed
      ? 'Sipariş hazırdı ama motorcuya zamanında teslim edilemedi.'
      : 'Sipariş zamanında hazırlanamadı. Müşteri siparişi iptal etti.';
    this.hud.showLost(this.session.totalBagged(), this.session.totalRequired(), note);
    this.hud.showScreen('lost');
  }

  // ------------------------------------------------------------------- loop
  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private handleActions() {
    for (const a of this.input.consume()) {
      const ph = this.flow.phase;
      switch (a) {
        case 'pause':
          if (this.hud.panelOpen && !this.flow.paused) this.togglePanel();
          else this.setPaused(!this.flow.paused);
          break;
        case 'restart':
          if (ph === 'won' || ph === 'lost') this.restart();
          break;
        case 'mute':
          this.sfx.setMuted(!this.sfx.muted);
          this.hud.toast(this.sfx.muted ? 'Ses kapalı' : 'Ses açık', 'info', 1200);
          break;
        case 'camera':
          this.camMode = this.camMode === 'chase' ? 'top' : 'chase';
          break;
        default:
          if (this.flow.paused || !this.flow.canDrive) break;
          if (a === 'panel') this.togglePanel();
          else if (a === 'interact') {
            if (ph === 'intro') break;
            this.interact();
          } else if (a === 'close') {
            if (this.hud.panelOpen) this.closeOrder();
          } else if (a === 'bag1' || a === 'bag2' || a === 'bag3') {
            if (!this.hud.panelOpen) break;
            const bi = Number(a.slice(3)) - 1;
            const ti = this.hud.selectedTray >= 0 ? this.hud.selectedTray : 0;
            if (this.session.tray.length) this.place(ti, bi);
            else this.openBag(bi);
          }
      }
    }
    if (this.flow.phase === 'intro') {
      // allow Enter/E on the intro screen
    }
  }

  private update(dt: number) {
    this.handleActions();
    const flow = this.flow;
    const driving = flow.canDrive && !this.hud.panelOpen;
    const input = driving ? this.input.axis() : { throttle: 0, steer: 0, brake: true };
    if (!flow.paused && flow.phase !== 'won' && flow.phase !== 'lost') {
      const hit = stepCart(this.cart, input, dt, this.layout.colliders);
      this.bumpCooldown -= dt;
      if (hit && Math.abs(this.cart.speed) > 1.2 && this.bumpCooldown <= 0) {
        this.sfx.bump();
        this.bumpCooldown = 0.5;
      }
    }
    this.cartView.setPose(this.cart.x, this.cart.z, this.cart.heading);
    this.cartView.update(dt, this.cart.speed);
    this.sfx.setCartSpeed(flow.paused ? 0 : Math.abs(this.cart.speed) / CART.maxForward);

    // timer
    if (flow.tick(dt)) this.lose();
    if (flow.timerRunning && flow.timeLeft <= 10) {
      const s = Math.ceil(flow.timeLeft);
      if (s !== this.lastTickSecond) {
        this.lastTickSecond = s;
        this.sfx.tick();
      }
    }

    // pick target
    this.target = flow.phase === 'playing' && !this.hud.panelOpen && !flow.paused ? findDisplayAt(this.layout.displays, this.cart.x, this.cart.z) : null;
    this.store.highlight(this.target);

    if (!flow.paused) {
      this.courier.update(dt);
      this.store.update(dt);
      this.updateFlyers(dt);
    }
    this.sfx.setEngine(flow.paused ? 0 : this.courier.engineLevel);
    this.updateCamera(dt);
    this.updateHud(dt);
  }

  private updateFlyers(dt: number) {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      const to = f.to();
      f.obj.position.lerpVectors(f.from, to, e);
      f.obj.position.y += Math.sin(k * Math.PI) * f.arc;
      f.obj.rotation.y += dt * 8;
      if (k >= 1) {
        f.done?.();
        this.flyers.splice(i, 1);
      }
    }
  }

  private cameraGoal(): { pos: THREE.Vector3; look: THREE.Vector3 } {
    const fx = Math.sin(this.cart.heading);
    const fz = Math.cos(this.cart.heading);
    const c = new THREE.Vector3(this.cart.x, 0, this.cart.z);
    const ph = this.flow.phase;
    if (ph === 'handover' || ph === 'won') {
      // cinematic: look at the entrance from inside the store
      const look = new THREE.Vector3(this.layout.courierSpot.x + 0.8, 1.0, this.layout.courierSpot.z + 1.2);
      return { pos: new THREE.Vector3(look.x - 5, 4.2, look.z - 7.5), look };
    }
    const goal =
      this.camMode === 'top'
        ? { pos: c.clone().add(new THREE.Vector3(-fx * 2.5, 15, -fz * 2.5)), look: c.clone().add(new THREE.Vector3(fx * 1.2, 0, fz * 1.2)) }
        : { pos: c.clone().add(new THREE.Vector3(-fx * 5.6, 5.0, -fz * 5.6)), look: c.clone().add(new THREE.Vector3(fx * 2.2, 0.7, fz * 2.2)) };
    // keep the camera inside the building so walls never block the view
    const b = this.layout.bounds;
    const m = 0.4;
    goal.pos.x = THREE.MathUtils.clamp(goal.pos.x, b.minX + m, b.maxX - m);
    goal.pos.z = THREE.MathUtils.clamp(goal.pos.z, b.minZ + m, b.maxZ - m);
    return goal;
  }

  private snapCamera() {
    const g = this.cameraGoal();
    this.camera.position.copy(g.pos);
    this.camTarget.copy(g.look);
    this.camera.lookAt(this.camTarget);
  }

  private updateCamera(dt: number) {
    const g = this.cameraGoal();
    const k = 1 - Math.exp(-dt * (this.flow.phase === 'handover' ? 2 : 6));
    this.camera.position.lerp(g.pos, k);
    this.camTarget.lerp(g.look, 1 - Math.exp(-dt * 9));
    this.camera.lookAt(this.camTarget);
  }

  private updateHud(dt: number) {
    const flow = this.flow;
    const s = this.session;
    this.hud.setTimer(flow.timeLeft, flow.timerRunning);
    this.hud.updateOrder(s);
    this.hud.updateTrayBadge(s);
    this.hud.updatePanel(s);

    // objective line
    let obj = '';
    const remaining = s.totalRequired() - s.totalBagged();
    switch (flow.phase) {
      case 'playing':
        if (s.isComplete() && s.tray.length === 0) obj = 'Tüm ürünler poşette → <kbd>Tab</kbd> paneli aç, <b>Siparişi Tamamla</b>';
        else if (s.isComplete()) obj = 'Kasada sipariş dışı ürün kaldı → <kbd>Tab</kbd> ile iade et';
        else if (s.tray.length >= s.order.trayCapacity) obj = 'Kasa dolu → <kbd>Tab</kbd> ile ürünleri poşetle';
        else obj = `Ürünleri reyonlardan topla ve poşetle · <b>${remaining}</b> ürün kaldı`;
        break;
      case 'courierArriving':
        obj = 'Motorcu yolda… Arabayı girişteki <b style="color:#2ecc71">Teslimat Noktası</b>na sür';
        break;
      case 'awaitingHandover':
        obj = this.inDeliveryZone() ? '<kbd>E</kbd> ile siparişi motorcuya teslim et!' : 'Motorcu kapıda bekliyor! <b style="color:#2ecc71">Teslimat Noktası</b>na git';
        break;
      case 'handover':
        obj = 'Sipariş teslim ediliyor…';
        break;
      default:
        obj = '';
    }
    this.hud.setObjective(obj);

    // prompt + floating label
    let prompt: string | null = null;
    if (this.target) {
      const p = getProduct(this.target.productId);
      const stock = this.store.stockOf(this.target.id);
      prompt = stock > 0 ? `<kbd>E</kbd> Al: <b>${p.name}</b>` : `<b>${p.name}</b> tükendi`;
      const top = this.store.displayTop(this.target).project(this.camera);
      const w = this.renderer.domElement.clientWidth;
      const hgt = this.renderer.domElement.clientHeight;
      const sec = SECTIONS[p.section];
      this.hud.setFloatLabel(
        `<span class="fl-sec" style="background:${sec.color}">${sec.name}</span>${p.name}`,
        (top.x * 0.5 + 0.5) * w,
        (-top.y * 0.5 + 0.5) * hgt,
      );
    } else {
      this.hud.setFloatLabel(null);
    }
    if (flow.phase === 'awaitingHandover' && this.inDeliveryZone()) prompt = '<kbd>E</kbd> Siparişi motorcuya teslim et';
    if (this.hud.panelOpen || flow.paused || !flow.canDrive) prompt = null;
    this.hud.setPrompt(prompt);

    const markers = [];
    if (flow.phase === 'courierArriving' || flow.phase === 'awaitingHandover') {
      markers.push({ x: this.layout.delivery.x, z: this.layout.delivery.z, color: '#2ecc71', pulse: true, label: 'TESLİMAT' });
    }
    this.minimap.draw(this.cart, markers, dt);
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 70 : 55;
    this.camera.updateProjectionMatrix();
  }

  /** Small hook used by automated play-tests (scripts/playtest.mjs). */
  private exposeDebug() {
    const self = this;
    (window as unknown as { __game: unknown }).__game = {
      get phase() {
        return self.flow.phase;
      },
      get timeLeft() {
        return self.flow.timeLeft;
      },
      get cart() {
        return { ...self.cart };
      },
      get session() {
        return { tray: [...self.session.tray], bags: self.session.bags.map((b) => ({ ...b, items: [...b.items] })), mistakes: self.session.mistakes };
      },
      get target() {
        return self.target ? { id: self.target.id, productId: self.target.productId } : null;
      },
      get courier() {
        return self.courier.state;
      },
      displays: this.layout.displays,
      delivery: this.layout.delivery,
      teleport(x: number, z: number, heading: number) {
        self.cart.x = x;
        self.cart.z = z;
        self.cart.heading = heading;
        self.cart.speed = 0;
        self.snapCamera();
      },
      skipCourier() {
        self.courier.skipArrival();
      },
      /** Runs the game logic for `seconds` in 60 Hz steps (keyboard state included), then renders once. */
      advance(seconds: number) {
        const steps = Math.round(seconds * 60);
        for (let i = 0; i < steps; i++) self.update(1 / 60);
        self.renderer.render(self.scene, self.camera);
      },
      get renderInfo() {
        const i = self.renderer.info;
        return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
      },
    };
  }
}
