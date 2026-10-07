/**
 * DOM overlay: main menu, shift select, settings, how-to, pause, results;
 * in-game HUD (timer, objective, crosshair, hover / held cards, bag bar,
 * toasts, combo popups, PA subtitles) and the Order Dash phone app.
 */
import { getProduct, SECTIONS, formatPrice } from '../data/products';
import { LEVELS, type LevelDef, type OrderDef } from '../data/order';
import { formatTime } from '../logic/gameFlow';
import { ruleLines, type OrderSession } from '../logic/order';
import { BAG_COLORS } from '../render/cartModel';
import { assetUrl } from '../render/assets';
import { LANGS, productName, sectionName, setLang, t, type Lang } from '../i18n';
import { isUnlocked, type Progress, type Settings } from '../settings';
import type { MoodId } from '../render/moodIds';

export interface HudCallbacks {
  play(level: number): void;
  restart(): void;
  resume(): void;
  toMenu(): void;
  next(): void;
  accept(): void;
  complete(): void;
  togglePhone(): void;
  settingsChanged(s: Settings, changed: keyof Settings): void;
  click(): void;
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

export function sectionLabel(pid: string): string {
  const s = SECTIONS[getProduct(pid).section];
  return s.aisle > 0 ? `${t('aisle', { n: s.aisle })} · ${sectionName(s.id)}` : sectionName(s.id);
}

type PhoneScreen = 'idle' | 'incoming' | 'picking' | 'courier' | 'delivered' | 'failed';
type Screen = 'loading' | 'menu' | 'levels' | 'settings' | 'howto' | 'pause' | 'won' | 'lost';

export class Hud {
  readonly root: HTMLDivElement;
  private phone: HTMLDivElement;
  private phoneScreen: HTMLDivElement;
  private phoneClock: HTMLSpanElement;
  private crosshair: HTMLDivElement;
  private hoverCard: HTMLDivElement;
  private heldCard: HTMLDivElement;
  private bagBar: HTMLDivElement;
  private timer: HTMLDivElement;
  private objective: HTMLDivElement;
  private toasts: HTMLDivElement;
  private popups: HTMLDivElement;
  private hint: HTMLDivElement;
  private pa: HTMLDivElement;
  private banner: HTMLDivElement;
  private screens = new Map<Screen, HTMLDivElement>();
  private current: Screen | null = null;
  private settingsReturn: Screen = 'menu';
  private thumbs: Record<string, string> = {};
  screen: PhoneScreen = 'idle';
  phoneOpen = false;
  private sig = '';
  courierEta = 0;
  order: OrderDef = LEVELS[0].order;
  level: LevelDef = LEVELS[0];

  constructor(
    parent: HTMLElement,
    private cb: HudCallbacks,
    private settings: Settings,
    private progress: Progress,
  ) {
    this.root = h('div', 'hud');
    parent.appendChild(this.root);
    this.crosshair = h('div', 'crosshair hidden', '<i></i>');
    this.hoverCard = h('div', 'hover-card hidden');
    this.heldCard = h('div', 'held-card hidden');
    this.bagBar = h('div', 'bag-bar hidden');
    this.timer = h('div', 'timer hidden');
    this.objective = h('div', 'objective hidden');
    this.toasts = h('div', 'toasts');
    this.popups = h('div', 'popups');
    this.hint = h('div', 'controls-hint hidden');
    this.pa = h('div', 'pa hidden');
    this.banner = h('div', 'shift-banner hidden');
    this.phone = h('div', 'phone hidden');
    const bezel = h('div', 'phone-bezel');
    const status = h('div', 'phone-status');
    this.phoneClock = h('span', '', '09:41');
    status.append(this.phoneClock, h('span', 'phone-notch'), h('span', '', '5G ▮▮▮'));
    this.phoneScreen = h('div', 'phone-screen');
    bezel.append(status, this.phoneScreen);
    this.phone.appendChild(bezel);
    this.phone.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-act=accept]')) this.cb.accept();
      else if (el.closest('[data-act=complete]')) this.cb.complete();
      else if (el.closest('[data-act=toggle]')) this.cb.togglePhone();
    });
    this.root.append(this.crosshair, this.hoverCard, this.heldCard, this.bagBar, this.timer, this.objective, this.toasts, this.popups, this.hint, this.pa, this.banner, this.phone);
    for (const s of ['loading', 'menu', 'levels', 'settings', 'howto', 'pause', 'won', 'lost'] as Screen[]) {
      const el = h('div', `screen screen-${s} hidden`);
      el.addEventListener('click', (e) => this.onScreenClick(s, e));
      el.addEventListener('input', (e) => this.onSettingInput(e));
      this.screens.set(s, el);
      this.root.appendChild(el);
    }
    this.renderLoading();
  }

  setThumbnails(t2: Record<string, string>) {
    this.thumbs = t2;
    this.sig = '';
  }

  thumb(pid: string, cls = 'thumb'): string {
    const src = this.thumbs[pid];
    return src ? `<img class="${cls}" src="${src}" alt="">` : `<span class="${cls} ph"></span>`;
  }

  setProgress(p: Progress) {
    this.progress = p;
  }

  // ================================================================ menus
  private logo(cls = ''): string {
    return `<img class="logo ${cls}" src="${assetUrl('ui/logo.webp')}" alt="Order Dash">`;
  }

  private renderLoading() {
    this.screens.get('loading')!.innerHTML = `<div class="loading-box">${this.logo('logo-load')}<div class="load-bar"><i></i></div><div class="load-text">${esc(t('menu.loading'))}</div></div>`;
  }

  setLoading(p: number, key?: string) {
    const s = this.screens.get('loading')!;
    (s.querySelector('.load-bar i') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    if (key) (s.querySelector('.load-text') as HTMLElement).textContent = key.startsWith('!') ? key.slice(1) : t(key);
  }

  private nextLevel(): number {
    for (const l of LEVELS) if (!(this.progress.stars[l.num] > 0)) return l.num;
    return LEVELS.length;
  }

  private renderMenu() {
    const n = this.nextLevel();
    const anyDone = Object.keys(this.progress.stars).length > 0;
    this.screens.get('menu')!.innerHTML = `
      <div class="menu-wrap">
        ${this.logo('logo-menu')}
        <p class="tagline">${esc(t('menu.tagline'))}</p>
        <div class="menu-buttons">
          <button class="btn primary xl" data-act="play" data-level="${n}">▶ ${esc(anyDone ? t('menu.continue', { n }) : t('menu.play'))}</button>
          <button class="btn" data-act="go" data-to="levels">🗂 ${esc(t('menu.shifts'))}</button>
          <button class="btn" data-act="go" data-to="settings">⚙ ${esc(t('menu.settings'))}</button>
          <button class="btn" data-act="go" data-to="howto">❓ ${esc(t('menu.howto'))}</button>
        </div>
        <div class="lang-row">${LANGS.map((l) => `<button class="chip ${l.id === this.settings.lang ? 'on' : ''}" data-lang="${l.id}">${l.flag} ${l.name}</button>`).join('')}</div>
      </div>
      <div class="credits">${esc(t('menu.credits'))}</div>`;
  }

  private renderLevels() {
    const cards = LEVELS.map((l) => {
      const unlocked = isUnlocked(this.progress, l.num);
      const stars = this.progress.stars[l.num] ?? 0;
      const best = this.progress.best[l.num];
      const items = l.order.lines.reduce((a, x) => a + x.qty, 0);
      return `<button class="level-card ${unlocked ? '' : 'locked'} mood-${l.mood}" data-act="${unlocked ? 'play' : 'locked'}" data-level="${l.num}">
        <span class="lv-num">${l.num}</span>
        <span class="lv-title">${esc(t(`lvl.${l.num}.title`))}</span>
        <span class="lv-desc">${esc(unlocked ? t(`lvl.${l.num}.desc`) : t('menu.locked'))}</span>
        <span class="lv-meta">🧾 ${items} · 🛍 ${l.order.bagCount} · ⏱ ${formatTime(l.order.timeLimit)}</span>
        <span class="lv-stars">${[1, 2, 3].map((i) => `<i class="${i <= stars ? 'on' : ''}">★</i>`).join('')}${best ? `<em>${t('menu.best')}: ${best}</em>` : ''}</span>
        ${unlocked ? '' : '<span class="lock">🔒</span>'}
      </button>`;
    }).join('');
    this.screens.get('levels')!.innerHTML = `
      <div class="panel wide">
        <div class="panel-head"><h2>${esc(t('menu.shifts'))}</h2><button class="btn small" data-act="back">← ${esc(t('menu.back'))}</button></div>
        <div class="level-grid">${cards}</div>
      </div>`;
  }

  private renderSettings() {
    const s = this.settings;
    const slider = (key: keyof Settings, label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, hint = '') => `
      <label class="set-row"><span class="set-label">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ''}</span>
        <input type="range" id="set-${key}" data-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}">
        <output>${fmt(value)}</output></label>`;
    const seg = (key: keyof Settings, label: string, opts: [string, string][], value: string) => `
      <div class="set-row"><span class="set-label">${esc(label)}</span>
        <div class="seg">${opts.map(([v, l]) => `<button class="${String(value) === v ? 'on' : ''}" data-seg="${key}" data-val="${v}">${esc(l)}</button>`).join('')}</div></div>`;
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    this.screens.get('settings')!.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>${esc(t('set.title'))}</h2><button class="btn small primary" data-act="back">${esc(t('set.done'))}</button></div>
        <div class="set-grid">
          ${seg('lang', t('set.language'), LANGS.map((l) => [l.id, `${l.flag} ${l.name}`] as [string, string]), s.lang)}
          ${slider('sensitivity', t('set.sensitivity'), 0.2, 3, 0.05, s.sensitivity, (v) => `${v.toFixed(2)}×`)}
          ${seg('invertY', t('set.invert'), [['false', t('set.off')], ['true', t('set.on')]], String(s.invertY))}
          ${slider('fov', t('set.fov'), 60, 95, 1, s.fov, (v) => `${v}°`)}
          ${slider('music', t('set.music'), 0, 1, 0.01, s.music, pct)}
          ${slider('muffle', t('set.muffle'), 0, 1, 0.01, s.muffle, pct, t('set.muffleHint'))}
          ${slider('sfx', t('set.sfx'), 0, 1, 0.01, s.sfx, pct)}
          ${seg('announcements', t('set.announce'), [['true', t('set.on')], ['false', t('set.off')]], String(s.announcements))}
          ${seg('quality', t('set.quality'), [['low', t('set.low')], ['medium', t('set.medium')], ['high', t('set.high')]], s.quality)}
          ${seg('pixel', t('set.pixel'), [['1', t('set.off')], ['2', '2×'], ['3', '3×'], ['4', '4×']], String(s.pixel))}
          ${seg('mood', t('set.mood'), [['auto', 'Auto'], ['day', t('mood.day')], ['sunset', t('mood.sunset')], ['night', t('mood.night')]], s.mood ?? 'auto')}
        </div>
      </div>`;
  }

  private renderHowto() {
    this.screens.get('howto')!.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h2>${esc(t('menu.howto'))}</h2><button class="btn small" data-act="back">← ${esc(t('menu.back'))}</button></div>
        <ol class="howto">${[1, 2, 3, 4, 5, 6].map((i) => `<li><span class="step">${i}</span><p>${t(`how.${i}`)}</p></li>`).join('')}</ol>
        <div class="howto-keys">${t('how.controls')}</div>
      </div>`;
  }

  private renderPause() {
    this.screens.get('pause')!.innerHTML = `
      <div class="panel narrow center">
        <h2>${esc(t('pause.title'))}</h2>
        <p>${esc(t('pause.text'))}</p>
        <div class="stack">
          <button class="btn primary" data-act="resume">▶ ${esc(t('pause.resume'))}</button>
          <button class="btn" data-act="go" data-to="settings">⚙ ${esc(t('menu.settings'))}</button>
          <button class="btn" data-act="restart">↻ ${esc(t('pause.restart'))}</button>
          <button class="btn" data-act="menu">⌂ ${esc(t('pause.menu'))}</button>
        </div>
      </div>`;
  }

  showWon(data: { timeLeft: number; stars: number; mistakes: number; bestCombo: number; score: number; last: boolean }) {
    const review = t(`end.review${Math.max(1, data.stars)}`);
    this.screens.get('won')!.innerHTML = `
      <div class="panel narrow center result">
        <div class="badge good">${esc(t('end.delivered'))}</div>
        <h2>${esc(t('end.onTheWay', { id: this.order.id }))}</h2>
        <div class="stars">${[1, 2, 3].map((i) => `<span class="${i <= data.stars ? 'on' : ''}" style="animation-delay:${i * 0.18}s">★</span>`).join('')}</div>
        <div class="review"><b>${esc(this.order.customer)}</b> <span>${'★'.repeat(Math.min(5, data.stars + 2))}</span><p>“${esc(review)}”</p></div>
        <div class="stats">
          <div><b>${data.score}</b><span>${esc(t('end.score'))}</span></div>
          <div><b>${formatTime(data.timeLeft)}</b><span>${esc(t('end.timeLeft'))}</span></div>
          <div><b>x${data.bestCombo}</b><span>${esc(t('end.combo'))}</span></div>
          <div><b>${data.mistakes}</b><span>${esc(t('end.mistakes'))}</span></div>
        </div>
        ${data.last ? `<p class="all-done">${esc(t('end.allDone'))}</p>` : ''}
        <div class="btn-row">
          ${data.last ? '' : `<button class="btn primary" data-act="next">${esc(t('end.next'))} →</button>`}
          <button class="btn" data-act="restart">↻ ${esc(t('end.again'))}</button>
          <button class="btn" data-act="menu">⌂ ${esc(t('pause.menu'))}</button>
        </div>
      </div>`;
  }

  showLost(bagged: number, total: number, packed: boolean) {
    this.screens.get('lost')!.innerHTML = `
      <div class="panel narrow center result">
        <div class="badge bad">${esc(t('end.timeUp'))}</div>
        <h2>${esc(t('end.cancelled'))}</h2>
        <p>${esc(t(packed ? 'end.lateNotDelivered' : 'end.lateNotPacked'))}</p>
        <div class="stats"><div><b>${bagged}/${total}</b><span>${esc(t('end.bagged'))}</span></div></div>
        <div class="btn-row">
          <button class="btn primary" data-act="restart">↻ ${esc(t('end.retry'))}</button>
          <button class="btn" data-act="menu">⌂ ${esc(t('pause.menu'))}</button>
        </div>
      </div>`;
  }

  showScreen(name: Screen | null) {
    if (name === 'menu') this.renderMenu();
    if (name === 'levels') this.renderLevels();
    if (name === 'settings') {
      if (this.current && this.current !== 'settings') this.settingsReturn = this.current;
      this.renderSettings();
    }
    if (name === 'howto') this.renderHowto();
    if (name === 'pause') this.renderPause();
    this.current = name;
    for (const [k, el] of this.screens) el.classList.toggle('hidden', k !== name);
    this.root.classList.toggle('menu-open', name !== null);
    this.root.classList.toggle('menu-dim', name !== null && name !== 'loading');
  }

  get currentScreen(): Screen | null {
    return this.current;
  }

  private onScreenClick(s: Screen, e: Event) {
    const el = (e.target as HTMLElement).closest('[data-act],[data-lang],[data-seg]') as HTMLElement | null;
    if (!el) return;
    this.cb.click();
    if (el.dataset.lang) {
      this.applySetting('lang', el.dataset.lang as Lang);
      this.renderMenu();
      return;
    }
    if (el.dataset.seg) {
      const key = el.dataset.seg as keyof Settings;
      const raw = el.dataset.val!;
      const value = raw === 'true' ? true : raw === 'false' ? false : key === 'pixel' ? Number(raw) : key === 'mood' ? (raw === 'auto' ? null : (raw as MoodId)) : raw;
      this.applySetting(key, value as never);
      this.renderSettings();
      return;
    }
    switch (el.dataset.act) {
      case 'play':
        this.cb.play(Number(el.dataset.level));
        break;
      case 'go':
        this.showScreen(el.dataset.to as Screen);
        break;
      case 'back':
        this.showScreen(s === 'settings' ? this.settingsReturn : 'menu');
        break;
      case 'resume':
        this.cb.resume();
        break;
      case 'restart':
        this.cb.restart();
        break;
      case 'menu':
        this.cb.toMenu();
        break;
      case 'next':
        this.cb.next();
        break;
    }
  }

  private onSettingInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const key = input.dataset.key as keyof Settings | undefined;
    if (!key) return;
    const v = Number(input.value);
    this.applySetting(key, v as never);
    const out = input.parentElement?.querySelector('output');
    if (out) out.textContent = key === 'sensitivity' ? `${v.toFixed(2)}×` : key === 'fov' ? `${v}°` : `${Math.round(v * 100)}%`;
  }

  private applySetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    this.settings[key] = value;
    if (key === 'lang') {
      setLang(value as Lang);
      this.sig = '';
    }
    this.cb.settingsChanged(this.settings, key);
  }

  // ================================================================ in-game
  setLevel(level: LevelDef) {
    this.level = level;
    this.order = level.order;
    this.sig = '';
  }

  setPlaying(on: boolean) {
    for (const el of [this.timer, this.phone, this.objective, this.crosshair]) el.classList.toggle('hidden', !on);
    if (!on) {
      this.bagBar.classList.add('hidden');
      this.heldCard.classList.add('hidden');
      this.hoverCard.classList.add('hidden');
      this.hint.classList.add('hidden');
    }
  }

  showHint(on: boolean) {
    this.hint.innerHTML = t('hud.hint');
    this.hint.classList.toggle('hidden', !on);
  }

  shiftBanner(level: LevelDef, newRule: string | null) {
    this.banner.innerHTML = `<div class="sb-num">${t('menu.shifts')} · ${level.num}/${LEVELS.length}</div><div class="sb-title">${esc(t(`lvl.${level.num}.title`))}</div>${newRule ? `<div class="sb-rule">✨ ${esc(newRule)}</div>` : ''}`;
    this.banner.classList.remove('hidden');
    this.banner.classList.remove('out');
    setTimeout(() => this.banner.classList.add('out'), 3600);
    setTimeout(() => this.banner.classList.add('hidden'), 4200);
  }

  setTimer(seconds: number, running: boolean) {
    const html = `<span class="t-label">${t('hud.time')}</span><span class="t-val">${formatTime(seconds)}</span>`;
    if (this.timer.innerHTML !== html) this.timer.innerHTML = html;
    this.timer.classList.toggle('warn', seconds <= 60 && seconds > 20);
    this.timer.classList.toggle('danger', seconds <= 20);
    this.timer.classList.toggle('paused', !running);
  }

  penalty(sec: number) {
    const el = h('div', 'penalty', `-${sec}s`);
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

  setHeld(pid: string | null, session: OrderSession | null) {
    this.heldCard.classList.toggle('hidden', !pid);
    this.bagBar.classList.toggle('hidden', !pid || !session);
    if (!pid || !session) return;
    const html = `${this.thumb(pid)}<div><small>${t('hud.held')}</small><b>${esc(productName(pid))}</b><span>${t('hud.heldHint')}</span></div>`;
    if (this.heldCard.innerHTML !== html) this.heldCard.innerHTML = html;
    const bars = session.bags
      .map((b, i) => `<div class="bb ${b.open ? 'open' : ''}" style="--b:${BAG_COLORS[i]}"><kbd>${i + 1}</kbd><b>${t('hud.bag', { n: i + 1 })}</b><span>${b.open ? `${b.items.length}/${session.order.bagCapacity}` : t('app.closed')}</span></div>`)
      .join('');
    if (this.bagBar.innerHTML !== bars) this.bagBar.innerHTML = bars;
  }

  toast(text: string, kind: 'info' | 'ok' | 'err' = 'info', ms = 2600) {
    const el = h('div', `toast ${kind}`, esc(text));
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstChild?.remove();
    setTimeout(() => el.classList.add('out'), ms - 300);
    setTimeout(() => el.remove(), ms);
  }

  paSubtitle(text: string) {
    this.pa.innerHTML = `<span class="pa-icon">📢</span><span>${esc(text)}</span>`;
    this.pa.classList.remove('hidden');
    clearTimeout((this.pa as unknown as { _t?: number })._t);
    (this.pa as unknown as { _t?: number })._t = window.setTimeout(() => this.pa.classList.add('hidden'), 6500);
  }

  popup(text: string, cls = '') {
    const p = h('div', `popup ${cls}`, esc(text));
    this.popups.appendChild(p);
    setTimeout(() => p.remove(), 1300);
  }

  // ================================================================ phone
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

  updatePhone(session: OrderSession, heldPid: string | null) {
    const sig = JSON.stringify([this.screen, this.phoneOpen, session.progress(), session.bags, heldPid, Math.ceil(this.courierEta), Object.keys(this.thumbs).length, this.order.id]);
    if (sig === this.sig) return;
    this.sig = sig;
    const o = this.order;
    const total = o.lines.reduce((a, l) => a + getProduct(l.productId).price * l.qty, 0);
    const head = (pill: string, cls = '') => `<div class="app-head"><span class="app-logo">Order<b>Dash</b></span><span class="pill ${cls}">${pill}</span></div>`;
    let html = '';
    switch (this.screen) {
      case 'incoming':
        html = `${head(esc(t('app.new')), 'pulse')}
          <div class="incoming">
            <div class="ring-icon">🛎️</div>
            <div class="inc-title">${esc(t('app.order', { id: o.id }))}</div>
            <div class="inc-row"><span>👤 ${esc(o.customer)}</span><span>📍 ${o.distanceKm} km</span></div>
            <div class="inc-addr">${esc(o.address)}</div>
            <div class="inc-items">${o.lines.map((l) => this.thumb(l.productId, 'thumb sm')).join('')}</div>
            <div class="inc-row big"><span>${esc(t('app.items', { n: o.lines.reduce((a, l) => a + l.qty, 0) }))}</span><span>${formatPrice(total)}</span></div>
            <div class="inc-note">💬 “${esc(o.note)}”</div>
            <div class="inc-row"><span>⏱ ${esc(t('app.prep'))}</span><b>${formatTime(o.timeLimit)}</b></div>
            <button class="btn accept" data-act="accept">${esc(t('app.accept'))} <kbd>Enter</kbd></button>
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
            <div class="mini-top"><span class="app-logo sm">Order<b>Dash</b></span><span class="mini-count">${done}/${totalQ}</span></div>
            <div class="bar"><i style="width:${(done / totalQ) * 100}%"></i></div>
            ${next ? `<div class="mini-next">${this.thumb(next.productId, 'thumb sm')}<div><small>${esc(t('app.next'))}</small><b>${esc(productName(next.productId))}</b><span>${esc(sectionLabel(next.productId))}</span></div></div>` : `<div class="mini-done">✅ ${esc(t('app.allDone'))} <kbd>F</kbd></div>`}
            <div class="mini-foot"><kbd>Tab</kbd> ${esc(t('app.openList'))}</div></div>`;
          break;
        }
        html = `${head(`${esc(o.id)} · ${esc(o.customer)}`)}
          <div class="prog"><div class="bar"><i style="width:${(done / totalQ) * 100}%"></i></div><span>${esc(t('app.bagged', { n: done, t: totalQ }))}</span></div>
          <div class="lines">${prog
            .map((l) => {
              const p = getProduct(l.productId);
              const complete = l.bagged >= l.qty;
              const inHand = heldPid === l.productId;
              const state = complete ? '<span class="st ok">✔</span>' : inHand ? '<span class="st hand">✋</span>' : `<span class="st">${l.bagged}/${l.qty}</span>`;
              return `<div class="line ${complete ? 'done' : ''}">${this.thumb(l.productId)}<div class="lt"><b>${l.qty > 1 ? `${l.qty}× ` : ''}${esc(productName(p.id))}</b><span style="--c:${SECTIONS[p.section].color}">${esc(sectionLabel(l.productId))}</span></div>${state}</div>`;
            })
            .join('')}</div>
          <div class="bags-mini">${session.bags
            .map((b, i) => `<div class="bm ${b.open ? 'open' : ''}" style="--b:${BAG_COLORS[i]}"><b>${i + 1}</b><span>${b.open ? `${b.items.length}/${o.bagCapacity}` : esc(t('app.closed'))}</span></div>`)
            .join('')}</div>
          <div class="rules-mini">${ruleLines(o.rules, o.bagCapacity).map((r) => `• ${r}`).join('<br>')}</div>
          <button class="btn complete ${can.ok ? 'ready' : ''}" data-act="complete" ${can.ok ? '' : 'disabled'}>${esc(t('app.complete'))} <kbd>F</kbd></button>
          <div class="mini-foot" data-act="toggle"><kbd>Tab</kbd> ${esc(t('app.shrink'))}</div>`;
        break;
      }
      case 'courier': {
        const eta = Math.max(0, Math.ceil(this.courierEta));
        const k = Math.max(0, Math.min(1, 1 - this.courierEta / 12));
        html = `${head(esc(t('app.ready')), 'green')}
          <div class="map">
            <div class="road r1"></div><div class="road r2"></div><div class="road r3"></div>
            <div class="store-pin">🏪</div>
            <div class="scooter" style="left:${8 + k * 62}%;top:${78 - k * 46}%">🛵</div>
          </div>
          <div class="courier-card"><div class="avatar">🧑</div><div><b>${esc(o.courier)}</b><span>${esc(eta > 0 ? t('app.toStore', { n: eta }) : t('app.atDoor'))}</span></div></div>
          <div class="courier-tip">${eta > 0 ? t('app.tipGo') : t('app.tipGive')}</div>`;
        break;
      }
      case 'delivered':
        html = `${head(esc(t('app.delivered')), 'green')}<div class="delivered"><div class="big-check">✓</div><b>${esc(t('app.onTheWay'))}</b><span>${esc(t('app.notified', { name: o.customer }))}</span></div>`;
        break;
      case 'failed':
        html = `${head(esc(t('app.cancelled')), 'red')}<div class="delivered"><div class="big-check red">✕</div><b>${esc(t('app.timeUp'))}</b><span>${esc(t('app.cancelledText'))}</span></div>`;
        break;
      default:
        html = `${head('')}<div class="waiting">${esc(t('app.waiting'))}</div>`;
    }
    this.phoneScreen.innerHTML = html;
  }
}
