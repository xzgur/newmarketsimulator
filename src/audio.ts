/**
 * Procedural audio (WebAudio, no files): sound effects, a chill lo-fi music
 * loop, store ambience, cart rattle, phone ringtone and cartoon "babble" for
 * customers' speech bubbles.
 */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private rattle: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode } | null = null;
  private ringTimer: number | null = null;
  private musicTimer: number | null = null;
  private musicStep = 0;
  private musicIntensity = 0;
  muted = false;

  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.22;
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.18;
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.ambBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02; // brown-ish
      d[i] = last * 3.5 + white * 0.15;
    }
    this.startAmbience();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx) this.master.gain.value = m ? 0 : 0.6;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.4, delay = 0, slideTo?: number, bus?: GainNode) {
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
    osc.connect(g).connect(bus ?? this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 1 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
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
    this.tone(1760, 0.09, 'square', 0.12);
    this.tone(2640, 0.06, 'sine', 0.1, 0.05);
  }
  /** Plastic bag rustle + soft thud. */
  place() {
    this.noise(0.22, 0.5, 3200, 0.7);
    this.noise(0.15, 0.35, 5000, 0.9, 0.08);
    this.tone(160, 0.12, 'sine', 0.35, 0.02, 90);
  }
  bagOpen() {
    this.noise(0.35, 0.55, 2800, 0.5);
    this.noise(0.2, 0.4, 4800, 0.8, 0.15);
  }
  combo(level: number) {
    const base = 660 * Math.pow(1.122, Math.min(8, level));
    this.tone(base, 0.12, 'triangle', 0.25);
    this.tone(base * 1.5, 0.16, 'triangle', 0.2, 0.07);
  }
  error() {
    this.tone(220, 0.16, 'square', 0.12);
    this.tone(165, 0.24, 'square', 0.12, 0.13);
  }
  throwItem() {
    this.noise(0.18, 0.3, 900, 0.6);
    this.tone(500, 0.18, 'sine', 0.15, 0, 180);
  }
  bump() {
    this.tone(110, 0.14, 'sine', 0.5, 0, 60);
    this.noise(0.08, 0.3, 1800, 2);
  }
  footstepOops() {
    this.tone(320, 0.08, 'triangle', 0.2, 0, 240);
  }
  tick() {
    this.tone(1400, 0.05, 'square', 0.06);
  }
  ding() {
    this.tone(1318, 0.5, 'sine', 0.25);
    this.tone(1760, 0.6, 'sine', 0.2, 0.12);
  }
  /** Store PA chime: ding-dong-ding. */
  chime() {
    this.tone(659, 0.9, 'sine', 0.25, 0);
    this.tone(523, 0.9, 'sine', 0.25, 0.45);
    this.tone(784, 1.2, 'sine', 0.25, 0.9);
  }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.3, i * 0.09));
  }
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.32, 'triangle', 0.3, i * 0.11));
    [262, 330, 392].forEach((f) => this.tone(f, 1.2, 'sine', 0.15, 0.77));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.1, i * 0.2));
  }
  /** Customer speech: cute gibberish syllables. */
  babble(text: string, pitch = 1) {
    const n = Math.min(9, Math.max(3, Math.round(text.length / 3)));
    for (let i = 0; i < n; i++) {
      const f = (260 + Math.random() * 180) * pitch;
      this.tone(f, 0.07, 'square', 0.05, i * 0.075, f * (0.8 + Math.random() * 0.4));
    }
  }

  ringStart() {
    if (!this.ctx || this.ringTimer !== null) return;
    const ring = () => {
      [1318, 1568, 1318, 1568, 1976, 1568].forEach((f, i) => this.tone(f, 0.12, 'sine', 0.22, i * 0.13));
    };
    ring();
    this.ringTimer = window.setInterval(ring, 1600);
  }
  ringStop() {
    if (this.ringTimer !== null) window.clearInterval(this.ringTimer);
    this.ringTimer = null;
  }

  /** Continuous rattle of the cart wheels. */
  setCartSpeed(speed01: number) {
    if (!this.ctx) return;
    if (!this.rattle) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 1.5;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      this.rattle = { src, gain, filter };
    }
    const t = this.ctx.currentTime;
    const jitter = 0.85 + Math.random() * 0.3;
    this.rattle.gain.gain.setTargetAtTime(speed01 > 0.03 ? (0.04 + speed01 * 0.12) * jitter : 0, t, 0.05);
    this.rattle.filter.frequency.setTargetAtTime(600 + speed01 * 900, t, 0.1);
    this.rattle.src.playbackRate.setTargetAtTime(0.7 + speed01 * 0.8, t, 0.1);
  }

  setEngine(level: number) {
    if (!this.ctx) return;
    if (!this.engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 24;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 14;
      lfo.connect(lfoGain).connect(osc.frequency);
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 520;
      osc.connect(filter).connect(gain).connect(this.sfxBus);
      osc.start();
      lfo.start();
      this.engine = { osc, gain };
    }
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(58 + level * 80, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(level > 0.01 ? 0.05 + level * 0.1 : 0, t, 0.15);
  }

  private startAmbience() {
    if (!this.ctx) return;
    // HVAC hum / crowd murmur
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f).connect(g).connect(this.ambBus);
    src.start();
    // occasional far-away clinks / scanner beeps
    const clink = () => {
      if (!this.ctx) return;
      const r = Math.random();
      if (r < 0.4) this.tone(1700 + Math.random() * 400, 0.06, 'square', 0.03, 0, undefined, this.ambBus);
      else if (r < 0.7) this.tone(2400 + Math.random() * 800, 0.25, 'sine', 0.05, 0, undefined, this.ambBus);
      window.setTimeout(clink, 1500 + Math.random() * 3500);
    };
    window.setTimeout(clink, 2000);
  }

  /** Lo-fi loop: Fmaj7 – Em7 – Dm7 – Cmaj7 with bass and hats. 0 = off. */
  setMusic(intensity: number) {
    this.musicIntensity = intensity;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(intensity > 0 ? 0.16 + intensity * 0.08 : 0, this.ctx.currentTime, 0.5);
    if (intensity > 0 && this.musicTimer === null) {
      const bpm = 92;
      const beat = 60 / bpm / 2; // eighth notes
      const chords = [
        [53, 57, 60, 64],
        [52, 55, 59, 62],
        [50, 53, 57, 60],
        [48, 52, 55, 59],
      ];
      const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
      const step = () => {
        if (!this.ctx) return;
        const s = this.musicStep++;
        const bar = Math.floor(s / 8) % 4;
        const inBar = s % 8;
        const ch = chords[bar];
        if (inBar === 0) {
          ch.forEach((n, i) => this.tone(midi(n), beat * 7.5, 'triangle', 0.08, i * 0.02, undefined, this.musicBus));
          this.tone(midi(ch[0] - 12), beat * 3, 'sine', 0.28, 0, undefined, this.musicBus);
        }
        if (inBar === 4) this.tone(midi(ch[0] - 12 + 7), beat * 3, 'sine', 0.22, 0, undefined, this.musicBus);
        if (inBar % 2 === 1 || this.musicIntensity > 1) this.noiseOn(this.musicBus, 0.04, 8000, 0.03);
        if (inBar === 0 || inBar === 3 || inBar === 4) this.tone(70, 0.18, 'sine', 0.35, 0, 40, this.musicBus);
        if (inBar === 2 || inBar === 6) this.noiseOn(this.musicBus, 0.12, 1800, 0.12);
        // little melody
        if ((inBar === 2 || inBar === 5 || inBar === 7) && Math.random() < 0.6) {
          const n = ch[Math.floor(Math.random() * 4)] + 12;
          this.tone(midi(n), beat * 1.6, 'sine', 0.07, 0, undefined, this.musicBus);
        }
      };
      this.musicTimer = window.setInterval(step, beat * 1000 * (this.musicIntensity > 1 ? 0.8 : 1));
    }
    if (intensity === 0 && this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  private noiseOn(bus: GainNode, dur: number, freq: number, vol: number) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
  }
}
