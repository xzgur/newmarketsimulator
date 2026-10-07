/**
 * DOM overlay: the "Kapında!" picker app on the phone mounted to the cart,
 * crosshair + hover card, held item card, timer, toasts, combo popups and
 * full-screen menus (loading, title with mood picker, pause, win, lose).
 */
import type { OrderDef } from '../data/order';
import { getProduct, SECTIONS, formatPrice } from '../data/products';
import { formatTime } from '../logic/gameFlow';
import { RULES, type OrderSession } from '../logic/order';
import { BAG_COLORS } from '../render/cartModel';
import { MOODS, type MoodId } from '../render/mood';
import type { Quality } from '../render/post';

export interface HudCallbacks {
  start(mood: MoodId, quality: Quality): void;
  restart(): void;
  resume(): void;
  accept(): void;
  complete(): void;
  togglePhone(): void;
  setMood(mood: MoodId): void;
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type PhoneScreen = 'idle' | 'incoming' | 'picking' | 'courier' | 'delivered' | 'failed';

export class Hud {
  readonly root: HTMLDivElement;
  private phone: HTMLDivElement;
  private phoneScreen: HTMLDivElement;
  private phoneClock: HTMLSpanElement;
  private crosshair: HTMLDivElement;
  private hoverCard: HTMLDivElement;
  private heldCard: HTMLDivElement;
  private timer: HTMLDivElement;
  private objective: HTMLDivElement;
  private toasts: HTMLDivElement;
  private popups: HTMLDivElement;
  private hint: HTMLDivElement;
  private screens: Record<'loading' | 'title' | 'pause' | 'won' | 'lost', HTMLDivElement>;
  private thumbs: Record<string, string> = {};
  screen: PhoneScreen = 'idle';
  phoneOpen = false;
  private sig = '';
  private selectedMood: MoodId = 'day';
  private selectedQuality: Quality = 'high';
  courierEta = 0;

  constructor(parent: HTMLElement, private order: OrderDef, private cb: HudCallbacks) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);

    this.crosshair = h('div', 'crosshair', '<i></i>');
    this.hoverCard = h('div', 'hover-card hidden');
    this.heldCard = h('div', 'held-card hidden');
    this.timer = h('div', 'timer hidden', '<span class="t-label">KALAN</span><span class="t-val">5:00</span>');
    this.objective = h('div', 'objective hidden');
    this.toasts = h('div', 'toasts');
    this.popups = h('div', 'popups');
    this.hint = h(
      'div',
      'controls-hint hidden',
      '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> it</span><span><kbd>Fare</kbd> bak</span><span><kbd>Sol tık</kbd> al / poşete koy</span><span><kbd>Sağ tık</kbd> geri bırak</span><span><kbd>Shift</kbd> koş</span><span><kbd>Tab</kbd> telefon</span><span><kbd>Esc</kbd> duraklat</span>',
    );

    // phone
    this.phone = h('div', 'phone hidden');
    const bezel = h('div', 'phone-bezel');
    const status = h('div', 'phone-status');
    this.phoneClock = h('span', '', '09:41');
    status.appendChild(this.phoneClock);
    status.appendChild(h('span', 'phone-notch'));
    status.appendChild(h('span', '', '5G ▮▮▮ 🔋'));
    bezel.appendChild(status);
    this.phoneScreen = h('div', 'phone-screen');
    bezel.appendChild(this.phoneScreen);
    this.phone.appendChild(bezel);
    this.phone.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-act=accept]')) this.cb.accept();
      else if (t.closest('[data-act=complete]')) this.cb.complete();
      else if (t.closest('[data-act=toggle]')) this.cb.togglePhone();
    });

    this.root.append(this.crosshair, this.hoverCard, this.heldCard, this.timer, this.objective, this.toasts, this.popups, this.hint, this.phone);

    this.screens = {
      loading: this.buildLoading(),
      title: this.buildTitle(),
      pause: this.buildPause(),
      won: this.buildEnd('won'),
      lost: this.buildEnd('lost'),
    };
    for (const s of Object.values(this.screens)) this.root.appendChild(s);
  }

  setThumbnails(t: Record<string, string>) {
    this.thumbs = t;
    this.sig = '';
  }

  thumb(pid: string, cls = 'thumb'): string {
    const src = this.thumbs[pid];
    return src ? `<img class="${cls}" src="${src}" alt="">` : `<span class="${cls} ph"></span>`;
  }

  // ------------------------------------------------------------ screens
  private buildLoading(): HTMLDivElement {
    const s = h('div', 'screen loading');
    s.innerHTML = `<div class="logo">MARKET<br><span>KOŞUSU</span></div><div class="load-bar"><i></i></div><div class="load-text">Raflar diziliyor…</div>`;
    return s;
  }

  setLoading(p: number, text?: string) {
    const bar = this.screens.loading.querySelector('.load-bar i') as HTMLElement;
    bar.style.width = `${Math.round(p * 100)}%`;
    if (text) (this.screens.loading.querySelector('.load-text') as HTMLElement).textContent = text;
  }

  private buildTitle(): HTMLDivElement {
    const s = h('div', 'screen title');
    const moods = (Object.keys(MOODS) as MoodId[])
      .map(
        (id) => `<button class="mood-card ${id === this.selectedMood ? 'on' : ''}" data-mood="${id}">
          <span class="mood-art mood-${id}"></span>
          <b>${esc(MOODS[id].name)}</b><small>${esc(MOODS[id].sub)}</small></button>`,
      )
      .join('');
    s.innerHTML = `
      <div class="title-wrap">
        <div class="logo big">MARKET<br><span>KOŞUSU</span></div>
        <p class="tagline">Sipariş düştü, saat işliyor. Arabayı kap, reyonları tara, poşetle ve kapıdaki motorcuya yetiştir!</p>
        <div class="title-grid">
          <div class="panel-card">
            <h3>Atmosfer</h3>
            <div class="moods">${moods}</div>
            <h3>Grafik</h3>
            <div class="seg" data-group="quality">
              <button data-q="high" class="on">Yüksek</button><button data-q="medium">Orta</button><button data-q="low">Düşük</button>
            </div>
          </div>
          <div class="panel-card howto">
            <h3>Nasıl oynanır?</h3>
            <ol>
              <li>Telefonuna gelen siparişi <b>kabul et</b>.</li>
              <li>Reyonları gez, ürüne nişan al ve <kbd>Sol tık</kbd> ile al.</li>
              <li>Aşağı, arabadaki poşetlere bak ve <kbd>Sol tık</kbd> ile poşete koy.</li>
              <li>Benzer ürünlere dikkat! Yanlış ürünü <kbd>Sağ tık</kbd> ile geri bırak.</li>
              <li>Bitince <kbd>F</kbd> ile siparişi tamamla, motorcu gelsin.</li>
              <li>Kapıdaki motorcuya bak ve <kbd>E</kbd> ile teslim et!</li>
            </ol>
          </div>
        </div>
        <button class="btn primary big" data-act="start">Vardiyaya Başla</button>
        <div class="credits">3D modeller: KayKit (Kay Lousberg, CC0) · Yazı tipleri: DynaPuff, Nunito (OFL) · Gökyüzü: Poly Haven (CC0)</div>
      </div>`;
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const mood = t.closest('[data-mood]') as HTMLElement | null;
      if (mood) {
        this.selectedMood = mood.dataset.mood as MoodId;
        s.querySelectorAll('.mood-card').forEach((c) => c.classList.toggle('on', c === mood));
        this.cb.setMood(this.selectedMood);
      }
      const q = t.closest('[data-q]') as HTMLElement | null;
      if (q) {
        this.selectedQuality = q.dataset.q as Quality;
        s.querySelectorAll('[data-q]').forEach((c) => c.classList.toggle('on', c === q));
      }
      if (t.closest('[data-act=start]')) this.cb.start(this.selectedMood, this.selectedQuality);
    });
    return s;
  }

  setTitleQuality(q: Quality) {
    this.selectedQuality = q;
    this.screens.title.querySelectorAll('[data-q]').forEach((c) => c.classList.toggle('on', (c as HTMLElement).dataset.q === q));
  }

  private buildPause(): HTMLDivElement {
    const s = h('div', 'screen pause hidden');
    s.innerHTML = `<div class="screen-box"><h1>Mola</h1><p>Süre durdu. Hazır olduğunda devam et.</p>
      <div class="moods small">${(Object.keys(MOODS) as MoodId[]).map((id) => `<button class="mood-card" data-mood="${id}"><span class="mood-art mood-${id}"></span><b>${esc(MOODS[id].name)}</b></button>`).join('')}</div>
      <div class="btn-row"><button class="btn primary" data-act="resume">Devam Et</button><button class="btn" data-act="restart">Yeniden Başla</button></div></div>`;
    s.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const mood = t.closest('[data-mood]') as HTMLElement | null;
      if (mood) this.cb.setMood(mood.dataset.mood as MoodId);
      if (t.closest('[data-act=resume]')) this.cb.resume();
      if (t.closest('[data-act=restart]')) this.cb.restart();
    });
    return s;
  }

  private buildEnd(kind: 'won' | 'lost'): HTMLDivElement {
    const s = h('div', `screen end ${kind} hidden`);
    s.innerHTML = `<div class="screen-box"><div class="end-body"></div><div class="btn-row"><button class="btn primary" data-act="restart">${kind === 'won' ? 'Bir Vardiya Daha' : 'Tekrar Dene'}</button></div></div>`;
    s.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-act=restart]')) this.cb.restart();
    });
    return s;
  }

  showScreen(name: 'loading' | 'title' | 'pause' | 'won' | 'lost' | null) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    this.root.classList.toggle('menu-open', name !== null);
  }

  showWon(data: { timeLeft: number; stars: number; mistakes: number; penalties: number; bestCombo: number; score: number }) {
    const review = data.stars === 3 ? 'Işık hızında geldi, yumurtalar sapasağlam! Teşekkürler 💚' : data.stars === 2 ? 'Her şey tamamdı, eline sağlık 🙂' : 'Biraz geç geldi ama sorun değil.';
    this.screens.won.querySelector('.end-body')!.innerHTML = `
      <div class="end-badge">TESLİM EDİLDİ</div>
      <h1>Sipariş ${esc(this.order.id)} yolda!</h1>
      <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= data.stars ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`).join('')}</div>
      <div class="review"><b>${esc(this.order.customer)}</b> <span>${'★'.repeat(data.stars + 2)}</span><p>“${esc(review)}”</p></div>
      <div class="stats">
        <div><b>${data.score}</b><span>puan</span></div>
        <div><b>${formatTime(data.timeLeft)}</b><span>kalan süre</span></div>
        <div><b>x${data.bestCombo}</b><span>en iyi seri</span></div>
        <div><b>${data.mistakes}</b><span>hatalı ürün</span></div>
      </div>`;
  }

  showLost(bagged: number, total: number, note: string) {
    this.screens.lost.querySelector('.end-body')!.innerHTML = `
      <div class="end-badge red">SÜRE DOLDU</div>
      <h1>Sipariş iptal edildi</h1>
      <p>${esc(note)}</p>
      <div class="stats"><div><b>${bagged}/${total}</b><span>poşetlenen ürün</span></div></div>`;
  }

  // ------------------------------------------------------------ in-game bits
  setPlaying(on: boolean) {
    this.timer.classList.toggle('hidden', !on);
    this.phone.classList.toggle('hidden', !on);
    this.objective.classList.toggle('hidden', !on);
    this.crosshair.classList.toggle('hidden', !on);
  }

  showHint(on: boolean) {
    this.hint.classList.toggle('hidden', !on);
  }

  setTimer(seconds: number, running: boolean) {
    const v = this.timer.querySelector('.t-val')!;
    const txt = formatTime(seconds);
    if (v.textContent !== txt) v.textContent = txt;
    this.timer.classList.toggle('warn', seconds <= 60 && seconds > 20);
    this.timer.classList.toggle('danger', seconds <= 20);
    this.timer.classList.toggle('paused', !running);
  }

  penalty(sec: number) {
    const el = h('div', 'penalty', `-${sec} sn`);
    this.timer.appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  setObjective(html: string) {
    if (this.objective.innerHTML !== html) this.objective.innerHTML = html;
    this.objective.classList.toggle('empty', !html);
  }

  setCrosshair(state: 'none' | 'product' | 'bag' | 'bad' | 'courier') {
    this.crosshair.className = `crosshair ${state}`;
  }

  setHover(html: string | null) {
    this.hoverCard.classList.toggle('hidden', !html);
    if (html && this.hoverCard.innerHTML !== html) this.hoverCard.innerHTML = html;
  }

  setHeld(pid: string | null) {
    this.heldCard.classList.toggle('hidden', !pid);
    if (!pid) return;
    const p = getProduct(pid);
    const html = `${this.thumb(pid)}<div><small>ELİNDE</small><b>${esc(p.name)}</b><span>Poşete bak + <kbd>Sol tık</kbd> · Geri bırak <kbd>Sağ tık</kbd></span></div>`;
    if (this.heldCard.innerHTML !== html) this.heldCard.innerHTML = html;
  }

  toast(text: string, kind: 'info' | 'ok' | 'err' = 'info', ms = 2600) {
    const t = h('div', `toast ${kind}`, esc(text));
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => t.classList.add('out'), ms - 300);
    setTimeout(() => t.remove(), ms);
  }

  popup(text: string, cls = '') {
    const p = h('div', `popup ${cls}`, esc(text));
    this.popups.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  // ------------------------------------------------------------ phone
  setPhoneScreen(s: PhoneScreen) {
    this.screen = s;
    this.sig = '';
    this.phone.classList.toggle('ringing', s === 'incoming');
    if (s === 'incoming' || s === 'courier' || s === 'delivered') this.setPhoneOpen(true);
  }

  setPhoneOpen(open: boolean) {
    this.phoneOpen = open;
    this.phone.classList.toggle('open', open);
    this.sig = '';
  }

  setClock(text: string) {
    if (this.phoneClock.textContent !== text) this.phoneClock.textContent = text;
  }

  updatePhone(session: OrderSession, timeLeft: number, heldPid: string | null) {
    const sig = JSON.stringify([this.screen, this.phoneOpen, session.progress(), session.bags, heldPid, Math.ceil(timeLeft), Math.ceil(this.courierEta), Object.keys(this.thumbs).length]);
    if (sig === this.sig) return;
    this.sig = sig;
    let html = '';
    const o = this.order;
    const total = o.lines.reduce((a, l) => a + getProduct(l.productId).price * l.qty, 0);
    switch (this.screen) {
      case 'incoming':
        html = `
          <div class="app-head brand"><span class="app-logo">Kapında!</span><span class="pill pulse">YENİ SİPARİŞ</span></div>
          <div class="incoming">
            <div class="ring-icon">🛎️</div>
            <div class="inc-title">Sipariş ${esc(o.id)}</div>
            <div class="inc-row"><span>👤 ${esc(o.customer)}</span><span>📍 ${o.distanceKm} km</span></div>
            <div class="inc-addr">${esc(o.address)}</div>
            <div class="inc-items">${o.lines.map((l) => this.thumb(l.productId, 'thumb sm')).join('')}</div>
            <div class="inc-row big"><span>${o.lines.reduce((a, l) => a + l.qty, 0)} ürün</span><span>${formatPrice(total)}</span></div>
            <div class="inc-note">💬 “${esc(o.note)}”</div>
            <div class="inc-row"><span>⏱ Hazırlama süresi</span><b>${formatTime(o.timeLimit)}</b></div>
            <button class="btn accept" data-act="accept">Kabul Et <kbd>Enter</kbd></button>
          </div>`;
        break;
      case 'picking': {
        const prog = session.progress();
        const done = session.totalBagged();
        const totalQ = session.totalRequired();
        const can = session.canClose();
        if (!this.phoneOpen) {
          const next = prog.find((l) => l.bagged < l.qty);
          html = `<div class="mini" data-act="toggle">
            <div class="mini-top"><span class="app-logo sm">Kapında!</span><span class="mini-count">${done}/${totalQ}</span></div>
            <div class="bar"><i style="width:${(done / totalQ) * 100}%"></i></div>
            ${next ? `<div class="mini-next">${this.thumb(next.productId, 'thumb sm')}<div><small>SIRADAKİ</small><b>${esc(getProduct(next.productId).name)}</b><span>${esc(sectionLabel(next.productId))}</span></div></div>` : `<div class="mini-done">✅ Hepsi poşette! <kbd>F</kbd></div>`}
            <div class="mini-foot"><kbd>Tab</kbd> listeyi aç</div></div>`;
          break;
        }
        html = `
          <div class="app-head"><span class="app-logo sm">Kapında!</span><span class="pill">${esc(o.id)} · ${esc(o.customer)}</span></div>
          <div class="prog"><div class="bar"><i style="width:${(done / totalQ) * 100}%"></i></div><span>${done}/${totalQ} poşette</span></div>
          <div class="lines">${prog
            .map((l) => {
              const p = getProduct(l.productId);
              const complete = l.bagged >= l.qty;
              const inHand = heldPid === l.productId;
              const state = complete ? '<span class="st ok">✔</span>' : inHand ? '<span class="st hand">✋</span>' : `<span class="st">${l.bagged}/${l.qty}</span>`;
              return `<div class="line ${complete ? 'done' : ''}">${this.thumb(l.productId)}<div class="lt"><b>${l.qty > 1 ? `${l.qty}× ` : ''}${esc(p.name)}</b><span style="--c:${SECTIONS[p.section].color}">${esc(sectionLabel(l.productId))}</span></div>${state}</div>`;
            })
            .join('')}</div>
          <div class="bags-mini">${session.bags
            .map((b, i) => `<div class="bm ${b.open ? 'open' : ''}" style="--b:${BAG_COLORS[i]}"><b>${i + 1}</b><span>${b.open ? `${b.items.length}/${o.bagCapacity}` : 'kapalı'}</span></div>`)
            .join('')}</div>
          <div class="rules-mini">${RULES.map((r) => `• ${esc(r)}`).join('<br>')}</div>
          <button class="btn complete ${can.ok ? 'ready' : ''}" data-act="complete" ${can.ok ? '' : 'disabled'}>Siparişi Tamamla <kbd>F</kbd></button>
          <div class="mini-foot" data-act="toggle"><kbd>Tab</kbd> küçült</div>`;
        break;
      }
      case 'courier': {
        const eta = Math.max(0, Math.ceil(this.courierEta));
        const k = Math.max(0, Math.min(1, 1 - this.courierEta / 12));
        html = `
          <div class="app-head brand"><span class="app-logo">Kapında!</span><span class="pill green">HAZIR</span></div>
          <div class="map">
            <div class="road r1"></div><div class="road r2"></div><div class="road r3"></div>
            <div class="store-pin">🏪</div>
            <div class="scooter" style="left:${8 + k * 62}%;top:${78 - k * 46}%">🛵</div>
          </div>
          <div class="courier-card">
            <div class="avatar">🧑‍🦰</div>
            <div><b>Motorcu ${esc(o.courier)}</b><span>${eta > 0 ? `Mağazaya ${eta} sn` : 'Kapıda bekliyor!'}</span></div>
          </div>
          <div class="courier-tip">${eta > 0 ? 'Arabayı girişteki <b>yeşil teslimat noktasına</b> götür.' : 'Motorcuya bak ve <kbd>E</kbd> ile teslim et!'}</div>`;
        break;
      }
      case 'delivered':
        html = `<div class="app-head brand"><span class="app-logo">Kapında!</span><span class="pill green">TESLİM</span></div>
          <div class="delivered"><div class="big-check">✓</div><b>Sipariş yola çıktı!</b><span>${esc(o.customer)} bilgilendirildi.</span></div>`;
        break;
      case 'failed':
        html = `<div class="app-head brand"><span class="app-logo">Kapında!</span><span class="pill red">İPTAL</span></div>
          <div class="delivered"><div class="big-check red">✕</div><b>Süre doldu</b><span>Sipariş iptal edildi.</span></div>`;
        break;
      default:
        html = `<div class="app-head brand"><span class="app-logo">Kapında!</span></div><div class="waiting">Sipariş bekleniyor…</div>`;
    }
    this.phoneScreen.innerHTML = html;
    void timeLeft;
  }
}

export function sectionLabel(pid: string): string {
  const s = SECTIONS[getProduct(pid).section];
  return s.aisle > 0 ? `Reyon ${s.aisle} · ${s.name}` : s.name;
}
