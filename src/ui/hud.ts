/** DOM overlay: order list, timer, prompts, cart (bagging) panel, screens. */
import type { OrderDef } from '../data/order';
import { getProduct, SECTIONS } from '../data/products';
import { formatTime } from '../logic/gameFlow';
import { RULES, type OrderSession } from '../logic/order';
import { BAG_COLORS } from '../render/cart';

export interface HudCallbacks {
  start(): void;
  restart(): void;
  resume(): void;
  openBag(i: number): void;
  place(trayIndex: number, bagIndex: number): void;
  discard(trayIndex: number): void;
  unbag(bagIndex: number, itemIndex: number): void;
  closeOrder(): void;
  togglePanel(): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export class Hud {
  readonly root: HTMLDivElement;
  private orderList: HTMLDivElement;
  private orderProgress: HTMLDivElement;
  private timer: HTMLDivElement;
  private timerValue: HTMLDivElement;
  private objective: HTMLDivElement;
  private prompt: HTMLDivElement;
  private toastBox: HTMLDivElement;
  private floatLabel: HTMLDivElement;
  private panel: HTMLDivElement;
  private trayBox: HTMLDivElement;
  private bagsBox: HTMLDivElement;
  private closeBtn: HTMLButtonElement;
  private screens: Record<'intro' | 'pause' | 'won' | 'lost', HTMLDivElement>;
  private minimapSlot: HTMLDivElement;
  private trayBadge: HTMLDivElement;
  selectedTray = -1;
  panelOpen = false;
  private lastOrderSig = '';
  private lastPanelSig = '';
  private thumbs: Record<string, string> = {};

  constructor(parent: HTMLElement, private order: OrderDef, private cb: HudCallbacks) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);

    // order card
    const card = h('div', 'card order-card');
    card.appendChild(h('div', 'order-head', `<div class="order-title">Sipariş <b>${esc(order.id)}</b></div><div class="order-cust">${esc(order.customer)} · ${esc(order.address)}</div>`));
    this.orderProgress = h('div', 'order-progress');
    card.appendChild(this.orderProgress);
    this.orderList = h('div', 'order-list');
    card.appendChild(this.orderList);
    this.root.appendChild(card);

    // timer + objective
    this.timer = h('div', 'timer');
    this.timer.appendChild(h('div', 'timer-label', 'KALAN SÜRE'));
    this.timerValue = h('div', 'timer-value', formatTime(order.timeLimit));
    this.timer.appendChild(this.timerValue);
    this.root.appendChild(this.timer);
    this.objective = h('div', 'objective');
    this.root.appendChild(this.objective);

    // minimap slot
    this.minimapSlot = h('div', 'card minimap');
    this.root.appendChild(this.minimapSlot);

    // tray badge (bottom right) - opens panel
    this.trayBadge = h('div', 'tray-badge');
    this.trayBadge.addEventListener('click', () => this.cb.togglePanel());
    this.root.appendChild(this.trayBadge);

    this.prompt = h('div', 'prompt');
    this.root.appendChild(this.prompt);
    this.toastBox = h('div', 'toasts');
    this.root.appendChild(this.toastBox);
    this.floatLabel = h('div', 'float-label');
    this.root.appendChild(this.floatLabel);

    this.root.appendChild(
      h(
        'div',
        'controls-hint',
        '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> sür</span><span><kbd>Space</kbd> fren</span><span><kbd>E</kbd> al / teslim et</span><span><kbd>Tab</kbd> araba paneli</span><span><kbd>C</kbd> kamera</span><span><kbd>Esc</kbd> duraklat</span>',
      ),
    );

    // cart panel
    this.panel = h('div', 'panel hidden');
    const ph = h('div', 'panel-head', '<div><div class="panel-title">Araba Paneli</div><div class="panel-sub">Ürünü seç → poşete tıkla (ya da sürükle). Kısayol: <kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></div></div>');
    const x = h('button', 'icon-btn', '✕');
    x.title = 'Kapat (Tab)';
    x.addEventListener('click', () => this.cb.togglePanel());
    ph.appendChild(x);
    this.panel.appendChild(ph);
    this.panel.appendChild(h('div', 'section-title', 'Toplama Kasası (alt raf)'));
    this.trayBox = h('div', 'tray');
    this.panel.appendChild(this.trayBox);
    this.panel.appendChild(h('div', 'section-title', 'Sipariş Poşetleri (üst kasa)'));
    this.bagsBox = h('div', 'bags');
    this.panel.appendChild(this.bagsBox);
    this.panel.appendChild(h('div', 'rules', `<b>Poşetleme kuralları</b><ul>${RULES.map((r) => `<li>${esc(r)}</li>`).join('')}<li>Her poşete en fazla ${order.bagCapacity} ürün.</li><li>Siparişte olmayan ürünü poşete koymaya çalışmak <b>-5 sn</b> ceza.</li></ul>`));
    this.closeBtn = h('button', 'btn primary close-order', 'Siparişi Tamamla <kbd>F</kbd>');
    this.closeBtn.addEventListener('click', () => this.cb.closeOrder());
    this.panel.appendChild(this.closeBtn);
    this.root.appendChild(this.panel);

    this.screens = {
      intro: this.buildIntro(),
      pause: this.buildScreen('Duraklatıldı', '<p>Süre durdu. Hazır olduğunda devam et.</p>', [
        ['Devam Et', () => this.cb.resume(), 'primary'],
        ['Yeniden Başla', () => this.cb.restart(), ''],
      ]),
      won: this.buildScreen('', '', [['Tekrar Oyna', () => this.cb.restart(), 'primary']]),
      lost: this.buildScreen('', '', [['Tekrar Dene', () => this.cb.restart(), 'primary']]),
    };
    for (const s of Object.values(this.screens)) this.root.appendChild(s);
  }

  setThumbnails(t: Record<string, string>) {
    this.thumbs = t;
    this.lastOrderSig = '';
    this.lastPanelSig = '';
    const introList = this.screens.intro.querySelector('.intro-items');
    if (introList) introList.innerHTML = this.introItems();
  }

  attachMinimap(c: HTMLCanvasElement) {
    this.minimapSlot.appendChild(c);
  }

  private thumb(pid: string, cls = 'thumb'): string {
    const src = this.thumbs[pid];
    return src ? `<img class="${cls}" src="${src}" alt="">` : `<span class="${cls} ph"></span>`;
  }

  private introItems(): string {
    return this.order.lines
      .map((l) => {
        const p = getProduct(l.productId);
        return `<div class="intro-item">${this.thumb(p.id)}<span>${l.qty > 1 ? `<b>${l.qty}×</b> ` : ''}${esc(p.name)}</span></div>`;
      })
      .join('');
  }

  private buildIntro(): HTMLDivElement {
    const s = h('div', 'screen intro');
    const box = h('div', 'screen-box wide');
    box.innerHTML = `
      <div class="brand">MARKET <span>Online Sipariş</span></div>
      <h1>Sipariş Toplama Demo</h1>
      <p class="lead">Online sipariş <b>${esc(this.order.id)}</b> geldi! Robot toplama arabanı sür, ürünleri reyonlardan topla,
      poşetlere yerleştir ve kapıda bekleyen motorcuya teslim et. Süren: <b>${formatTime(this.order.timeLimit)}</b>.</p>
      <div class="intro-grid">
        <div>
          <h3>Sipariş listesi</h3>
          <div class="intro-items">${this.introItems()}</div>
        </div>
        <div>
          <h3>Nasıl oynanır?</h3>
          <ol class="howto">
            <li><kbd>W</kbd><kbd>S</kbd> ileri/geri, <kbd>A</kbd><kbd>D</kbd> dönüş (yerinde dönebilir), <kbd>Space</kbd> fren.</li>
            <li>Raf önüne yaklaş, sarı çerçeve çıkınca <kbd>E</kbd> ile ürünü al. Ürün alt kasaya düşer.</li>
            <li><kbd>Tab</kbd> ile araba panelini aç: poşeti aç, ürünleri poşetlere yerleştir.</li>
            <li>Benzer ürünlere dikkat! (ör. <i>Yarım Yağlı</i> ≠ <i>Tam Yağlı</i>)</li>
            <li>Her şey poşetteyse <b>Siparişi Tamamla</b> → motorcu gelir.</li>
            <li>Arabayı girişteki <b>Teslimat Noktası</b>'na sür ve <kbd>E</kbd> ile teslim et.</li>
          </ol>
        </div>
      </div>`;
    const btn = h('button', 'btn primary big', 'Vardiyayı Başlat');
    btn.addEventListener('click', () => this.cb.start());
    box.appendChild(btn);
    s.appendChild(box);
    return s;
  }

  private buildScreen(title: string, body: string, buttons: [string, () => void, string][]): HTMLDivElement {
    const s = h('div', 'screen hidden');
    const box = h('div', 'screen-box');
    box.appendChild(h('h1', '', title));
    box.appendChild(h('div', 'screen-body', body));
    const row = h('div', 'btn-row');
    for (const [label, fn, cls] of buttons) {
      const b = h('button', `btn ${cls}`, label);
      b.addEventListener('click', fn);
      row.appendChild(b);
    }
    box.appendChild(row);
    s.appendChild(box);
    return s;
  }

  showScreen(name: 'intro' | 'pause' | 'won' | 'lost' | null) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    this.root.classList.toggle('screen-open', name !== null);
  }

  showWon(timeLeft: number, stars: number, mistakes: number, penalties: number) {
    const s = this.screens.won;
    s.querySelector('h1')!.textContent = 'Sipariş Teslim Edildi!';
    s.querySelector('.screen-body')!.innerHTML = `
      <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>
      <p>Motorcu siparişi aldı ve yola çıktı. Harika iş!</p>
      <div class="stats">
        <div><b>${formatTime(timeLeft)}</b><span>kalan süre</span></div>
        <div><b>${mistakes}</b><span>hatalı ürün</span></div>
        <div><b>${penalties} sn</b><span>ceza</span></div>
      </div>`;
  }

  showLost(bagged: number, total: number, phaseNote: string) {
    const s = this.screens.lost;
    s.querySelector('h1')!.textContent = 'Süre Doldu!';
    s.querySelector('.screen-body')!.innerHTML = `<p>${esc(phaseNote)}</p><div class="stats"><div><b>${bagged}/${total}</b><span>poşetlenen ürün</span></div></div>`;
  }

  setTimer(seconds: number, running: boolean) {
    this.timerValue.textContent = formatTime(seconds);
    this.timer.classList.toggle('warn', seconds <= 60 && seconds > 20);
    this.timer.classList.toggle('danger', seconds <= 20);
    this.timer.classList.toggle('paused', !running);
  }

  flashTimerPenalty(sec: number) {
    const el = h('div', 'penalty', `-${sec} sn`);
    this.timer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  setObjective(html: string) {
    if (this.objective.innerHTML !== html) this.objective.innerHTML = html;
  }

  setPrompt(html: string | null) {
    this.prompt.classList.toggle('hidden', !html);
    if (html && this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
  }

  setFloatLabel(text: string | null, x = 0, y = 0) {
    this.floatLabel.classList.toggle('hidden', !text);
    if (!text) return;
    if (this.floatLabel.innerHTML !== text) this.floatLabel.innerHTML = text;
    this.floatLabel.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
  }

  toast(text: string, kind: 'info' | 'ok' | 'err' = 'info', ms = 2600) {
    const t = h('div', `toast ${kind}`, esc(text));
    this.toastBox.appendChild(t);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), ms - 300);
    setTimeout(() => t.remove(), ms);
  }

  updateOrder(session: OrderSession) {
    const prog = session.progress();
    const sig = JSON.stringify([prog, this.thumbs ? Object.keys(this.thumbs).length : 0]);
    if (sig === this.lastOrderSig) return;
    this.lastOrderSig = sig;
    const total = session.totalRequired();
    const done = session.totalBagged();
    this.orderProgress.innerHTML = `<div class="bar"><i style="width:${(done / total) * 100}%"></i></div><span>${done}/${total} poşette</span>`;
    this.orderList.innerHTML = prog
      .map((l) => {
        const p = getProduct(l.productId);
        const sec = SECTIONS[p.section];
        const complete = l.bagged >= l.qty;
        const inCart = l.inTray > 0 && !complete;
        return `<div class="line ${complete ? 'done' : ''}">
          ${this.thumb(p.id)}
          <div class="line-text"><div class="line-name">${esc(p.name)}</div>
          <div class="line-sec" style="--c:${sec.color}">${esc(sec.name)}</div></div>
          <div class="line-qty">${inCart ? '<span class="in-tray" title="Kasada, poşetlenmeyi bekliyor">kasada</span>' : ''}${complete ? '✔' : `${l.bagged}/${l.qty}`}</div>
        </div>`;
      })
      .join('');
  }

  updateTrayBadge(session: OrderSession) {
    const n = session.tray.length;
    const html = `<span class="tb-icon">🛒</span><span>Kasa <b>${n}/${session.order.trayCapacity}</b></span><kbd>Tab</kbd>`;
    if (this.trayBadge.innerHTML !== html) this.trayBadge.innerHTML = html;
    this.trayBadge.classList.toggle('full', n >= session.order.trayCapacity);
    this.trayBadge.classList.toggle('has', n > 0);
  }

  setPanelOpen(open: boolean) {
    this.panelOpen = open;
    this.panel.classList.toggle('hidden', !open);
    this.root.classList.toggle('panel-open', open);
    if (!open) this.selectedTray = -1;
    this.lastPanelSig = '';
  }

  updatePanel(session: OrderSession) {
    if (!this.panelOpen) return;
    if (this.selectedTray >= session.tray.length) this.selectedTray = session.tray.length - 1;
    if (this.selectedTray < 0 && session.tray.length) this.selectedTray = 0;
    const sig = JSON.stringify([session.tray, session.bags, this.selectedTray, session.closed]);
    if (sig === this.lastPanelSig) return;
    this.lastPanelSig = sig;

    // tray
    this.trayBox.innerHTML = '';
    for (let i = 0; i < session.order.trayCapacity; i++) {
      const pid = session.tray[i];
      const slot = h('div', `slot ${pid ? 'filled' : 'empty'} ${i === this.selectedTray ? 'selected' : ''}`);
      if (pid) {
        const p = getProduct(pid);
        slot.innerHTML = `${this.thumb(pid, 'thumb big')}<div class="slot-name">${esc(p.name)}</div>`;
        slot.draggable = true;
        slot.dataset.index = String(i);
        slot.addEventListener('click', () => {
          this.selectedTray = i;
          this.lastPanelSig = '';
          this.updatePanel(session);
        });
        slot.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', String(i));
          this.selectedTray = i;
        });
        const del = h('button', 'slot-del', 'İade');
        del.title = 'Ürünü rafa iade et (ceza yok)';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cb.discard(i);
        });
        slot.appendChild(del);
      }
      this.trayBox.appendChild(slot);
    }

    // bags
    this.bagsBox.innerHTML = '';
    session.bags.forEach((bag, bi) => {
      const el = h('div', `bag ${bag.open ? 'open' : 'folded'} ${bag.closed ? 'closed' : ''}`);
      el.style.setProperty('--bag', BAG_COLORS[bi]);
      el.innerHTML = `<div class="bag-head"><span class="bag-num">${bi + 1}</span> Poşet ${bi + 1}<span class="bag-cap">${bag.items.length}/${session.order.bagCapacity}</span></div>`;
      if (!bag.open) {
        const ob = h('button', 'btn small', 'Poşeti Aç');
        ob.addEventListener('click', (e) => {
          e.stopPropagation();
          this.cb.openBag(bi);
        });
        el.appendChild(ob);
      } else {
        const items = h('div', 'bag-items');
        bag.items.forEach((pid, ii) => {
          const it = h('div', 'bag-item', `${this.thumb(pid)}<span>${esc(getProduct(pid).name)}</span>`);
          if (!session.closed) {
            const back = h('button', 'bag-item-back', '↩');
            back.title = 'Kasaya geri al';
            back.addEventListener('click', (e) => {
              e.stopPropagation();
              this.cb.unbag(bi, ii);
            });
            it.appendChild(back);
          }
          items.appendChild(it);
        });
        if (!bag.items.length) items.appendChild(h('div', 'bag-empty', 'Boş — ürün bırak'));
        el.appendChild(items);
      }
      el.addEventListener('click', () => {
        if (!bag.open) {
          this.cb.openBag(bi);
          return;
        }
        if (this.selectedTray >= 0) this.cb.place(this.selectedTray, bi);
      });
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.classList.add('drop');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drop');
        const idx = Number(e.dataTransfer?.getData('text/plain'));
        if (!Number.isNaN(idx)) this.cb.place(idx, bi);
      });
      this.bagsBox.appendChild(el);
    });

    const can = session.canClose();
    this.closeBtn.disabled = !can.ok;
    this.closeBtn.title = can.ok ? '' : can.reason;
    this.closeBtn.classList.toggle('ready', can.ok);
  }
}
