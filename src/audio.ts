/**
 * Audio: synthesized sound effects (WebAudio) + the store music track played
 * through a "ceiling speaker" chain (band-limited, slightly boxy, a bit of
 * room reverb) + spoken store announcements.
 */
import { assetUrl } from './render/assets';
import { speechLang } from './i18n';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicGain!: GainNode;
  private hp!: BiquadFilterNode;
  private hp2!: BiquadFilterNode;
  private lp!: BiquadFilterNode;
  private lp2!: BiquadFilterNode;
  private far!: GainNode;
  private mid!: BiquadFilterNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private noiseBuf!: AudioBuffer;
  private music: HTMLAudioElement | null = null;
  private rattle: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
  private ringTimer: number | null = null;
  muted = false;
  private vol = { music: 0.55, sfx: 0.8, muffle: 0.6 };
  announcements = true;
  private musicWanted = false;

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      if (this.musicWanted) void this.music?.play().catch(() => {});
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // music → speaker chain
    this.music = new Audio(assetUrl('audio/store-music.mp3'));
    this.music.loop = true;
    this.music.crossOrigin = 'anonymous';
    const src = ctx.createMediaElementSource(this.music);
    // PA speakers are mono, band-limited (no bass, no air), a bit boxy and
    // slightly overdriven; several ceiling speakers + the hall add echoes.
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';
    const filt = (type: BiquadFilterType, q = 0.9) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      return f;
    };
    this.hp = filt('highpass');
    this.hp2 = filt('highpass');
    this.lp = filt('lowpass');
    this.lp2 = filt('lowpass');
    this.mid = filt('peaking', 1.4);
    this.mid.frequency.value = 1250;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
    }
    drive.curve = curve;
    drive.oversample = '2x';
    const verb = ctx.createConvolver();
    verb.buffer = this.roomImpulse(1.9);
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.far = ctx.createGain();
    this.musicGain = ctx.createGain();
    src.connect(mono).connect(this.hp).connect(this.hp2).connect(this.mid).connect(drive).connect(this.lp).connect(this.lp2);
    this.lp2.connect(this.dry).connect(this.musicGain);
    this.lp2.connect(verb).connect(this.wet).connect(this.musicGain);
    // the other ceiling speakers further down the aisles
    for (const [d, g] of [
      [0.023, 0.55],
      [0.047, 0.4],
      [0.081, 0.25],
    ]) {
      const delay = ctx.createDelay(0.2);
      delay.delayTime.value = d;
      const gain = ctx.createGain();
      gain.gain.value = g;
      this.lp2.connect(delay).connect(gain).connect(this.far);
    }
    this.far.connect(this.musicGain);
    this.musicGain.connect(this.master);
    this.apply();
    if (this.musicWanted) void this.music.play().catch(() => {});
    this.startClinks();
  }

  private roomImpulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  /** Volumes 0–1; muffle 0 = clean, 1 = tinny old ceiling speaker. */
  setLevels(music: number, sfx: number, muffle: number) {
    this.vol = { music, sfx, muffle };
    this.apply();
  }

  private apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.vol.muffle;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.75, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.musicGain.gain.setTargetAtTime(this.vol.music * 0.42, t, 0.1);
    // m = 0: clean hi-fi; m = 1: tinny, far-away ceiling speakers
    const hp = 30 + m * 520;
    const lp = 18000 * Math.pow(2600 / 18000, m);
    this.hp.frequency.setTargetAtTime(hp, t, 0.05);
    this.hp2.frequency.setTargetAtTime(hp, t, 0.05);
    this.lp.frequency.setTargetAtTime(lp, t, 0.05);
    this.lp2.frequency.setTargetAtTime(lp, t, 0.05);
    this.mid.gain.setTargetAtTime(m * 7, t, 0.05);
    this.dry.gain.setTargetAtTime(1 - m * 0.55, t, 0.05);
    this.far.gain.setTargetAtTime(m * 0.7, t, 0.05);
    this.wet.gain.setTargetAtTime(0.03 + m * 0.6, t, 0.05);
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.apply();
  }

  setMusic(on: boolean) {
    this.musicWanted = on;
    if (!this.music) return;
    if (on) void this.music.play().catch(() => {});
    else this.music.pause();
  }

  /** Slightly faster (and higher) music when time is running out. */
  setMusicRate(rate: number) {
    if (!this.music || Math.abs(this.music.playbackRate - rate) < 0.005) return;
    this.music.preservesPitch = false;
    this.music.playbackRate = rate;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.4, delay = 0, slideTo?: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.05);
  }

  /** Barcode scanner beep. */
  pick() {
    this.tone(1760, 0.09, 'square', 0.1);
    this.tone(2640, 0.06, 'sine', 0.09, 0.05);
  }
  /** Plastic bag rustle + soft pop. */
  place() {
    this.noise(0.22, 0.45, 3400, 0.7);
    this.noise(0.15, 0.3, 5200, 0.9, 0.08);
    this.tone(520, 0.1, 'triangle', 0.18, 0.02, 760);
  }
  bagOpen() {
    this.noise(0.35, 0.5, 3000, 0.5);
    this.noise(0.2, 0.35, 5000, 0.8, 0.15);
  }
  combo(level: number) {
    const base = 660 * Math.pow(1.122, Math.min(8, level));
    this.tone(base, 0.12, 'triangle', 0.22);
    this.tone(base * 1.5, 0.16, 'triangle', 0.18, 0.07);
  }
  error() {
    this.tone(330, 0.12, 'square', 0.1);
    this.tone(247, 0.2, 'square', 0.1, 0.12);
  }
  throwItem() {
    this.noise(0.18, 0.3, 1400, 0.6);
    this.tone(700, 0.16, 'sine', 0.14, 0, 300);
  }
  /** Plastic cart clack (no deep thud). */
  bump() {
    this.noise(0.07, 0.4, 2600, 2.5);
    this.tone(420, 0.07, 'triangle', 0.16, 0, 300);
  }
  /** Low double thump for the last seconds. */
  heartbeat() {
    this.tone(70, 0.14, 'sine', 0.5, 0, 45);
    this.tone(64, 0.16, 'sine', 0.38, 0.18, 40);
  }
  tick() {
    this.tone(1400, 0.05, 'square', 0.06);
  }
  ding() {
    this.tone(1318, 0.5, 'sine', 0.22);
    this.tone(1760, 0.6, 'sine', 0.18, 0.12);
  }
  click() {
    this.tone(900, 0.04, 'triangle', 0.12);
  }
  /** Store PA chime: ding-dong-ding. */
  chime() {
    this.tone(659, 0.9, 'sine', 0.22, 0);
    this.tone(523, 0.9, 'sine', 0.22, 0.45);
    this.tone(784, 1.1, 'sine', 0.22, 0.9);
  }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.26, i * 0.09));
  }
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.26, i * 0.11));
  }
  lose() {
    [523, 440, 349, 294].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, i * 0.18));
  }
  /** Customer speech: cartoon babble. */
  babble(text: string, pitch = 1) {
    const n = Math.min(9, Math.max(3, Math.round(text.length / 3)));
    for (let i = 0; i < n; i++) {
      const f = (300 + Math.random() * 200) * pitch;
      this.tone(f, 0.07, 'square', 0.035, i * 0.075, f * (0.8 + Math.random() * 0.4));
    }
  }

  /** Chime + spoken announcement through the store PA (if enabled). */
  announce(text: string) {
    if (!this.announcements || this.muted) return;
    this.chime();
    const lang = speechLang();
    setTimeout(() => void this.speak(text, lang), 1500);
  }

  /** Voices load asynchronously (often empty on the first call). */
  private voices(): Promise<SpeechSynthesisVoice[]> {
    const synth = window.speechSynthesis;
    if (!synth) return Promise.resolve([]);
    const now = synth.getVoices();
    if (now.length) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done = () => resolve(synth.getVoices());
      synth.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 2000);
    });
  }

  private async speak(text: string, lang: string) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const all = await this.voices();
      const base = lang.slice(0, 2).toLowerCase();
      const matching = all.filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith(base));
      // never let the OS default voice read the text in another language
      if (!matching.length) return;
      const exact = matching.filter((v) => v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase());
      const pool = exact.length ? exact : matching;
      const voice = pool.find((v) => /google|natural|neural|samantha|daniel/i.test(v.name)) ?? pool[0];
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice.lang;
      u.voice = voice;
      u.rate = 0.98;
      u.pitch = 1.05;
      u.volume = Math.min(1, 0.3 + this.vol.sfx * 0.4);
      synth.cancel();
      synth.speak(u);
    } catch {
      /* speech unavailable: the chime + subtitle still play */
    }
  }

  ringStart() {
    if (!this.ctx || this.ringTimer !== null) return;
    const ring = () => [1318, 1568, 1318, 1568, 1976, 1568].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.2, i * 0.13));
    ring();
    this.ringTimer = window.setInterval(ring, 1600);
  }
  ringStop() {
    if (this.ringTimer !== null) window.clearInterval(this.ringTimer);
    this.ringTimer = null;
  }

  /** Light rattle of the cart wheels. */
  setCartSpeed(speed01: number) {
    if (!this.ctx) return;
    if (!this.rattle) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 2;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.rattle = { src, gain, filter };
    }
    const t = this.ctx.currentTime;
    const jitter = 0.8 + Math.random() * 0.4;
    this.rattle.gain.gain.setTargetAtTime(speed01 > 0.03 ? (0.015 + speed01 * 0.05) * jitter : 0, t, 0.05);
    this.rattle.filter.frequency.setTargetAtTime(1500 + speed01 * 1200, t, 0.1);
  }

  /** Scooter engine (0 = off). */
  setEngine(level: number) {
    if (!this.ctx) return;
    if (!this.engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 26;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 18;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.7;
      osc.connect(filter).connect(gain).connect(this.sfxBus);
      osc.start();
      lfo.start();
      this.engine = { osc, gain };
    }
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(110 + level * 120, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(level > 0.01 ? 0.03 + level * 0.06 : 0, t, 0.15);
  }

  /** Occasional far-away scanner beeps from the tills. */
  private startClinks() {
    const clink = () => {
      if (!this.ctx) return;
      if (Math.random() < 0.6) this.tone(1750 + Math.random() * 300, 0.06, 'square', 0.015);
      window.setTimeout(clink, 2500 + Math.random() * 4000);
    };
    window.setTimeout(clink, 3000);
  }
}
