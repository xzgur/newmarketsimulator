/** Tiny synthesized sound effects via WebAudio (no audio assets needed). */

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: { osc: OscillatorNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private motor: { osc: OscillatorNode; gain: GainNode } | null = null;
  muted = false;

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  pick() {
    this.tone(660, 0.09, 'triangle', 0.4);
    this.tone(990, 0.12, 'triangle', 0.35, 0.07);
  }
  place() {
    this.tone(420, 0.08, 'sine', 0.45, 0, 260);
    this.tone(880, 0.1, 'triangle', 0.25, 0.05);
  }
  bagOpen() {
    this.tone(300, 0.18, 'sawtooth', 0.08, 0, 900);
  }
  error() {
    this.tone(180, 0.18, 'square', 0.18);
    this.tone(140, 0.22, 'square', 0.18, 0.12);
  }
  bump() {
    this.tone(90, 0.12, 'sine', 0.5, 0, 50);
  }
  tick() {
    this.tone(1200, 0.05, 'square', 0.08);
  }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.35, i * 0.1));
  }
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.35, i * 0.11));
  }
  lose() {
    [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.12, i * 0.18));
  }

  /** Continuous soft electric motor whine for the cart. */
  setCartSpeed(speed01: number) {
    if (!this.ctx || !this.master) return;
    if (!this.motor) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      osc.connect(filter).connect(g).connect(this.master);
      osc.start();
      this.motor = { osc, gain: g };
    }
    const t = this.ctx.currentTime;
    this.motor.osc.frequency.setTargetAtTime(90 + speed01 * 160, t, 0.08);
    this.motor.gain.gain.setTargetAtTime(speed01 > 0.02 ? 0.025 + speed01 * 0.04 : 0, t, 0.1);
  }

  /** Scooter engine rumble (0 = off). */
  setEngine(level: number) {
    if (!this.ctx || !this.master) return;
    if (!this.engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 22;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 12;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      osc.connect(filter).connect(g).connect(this.master);
      osc.start();
      lfo.start();
      this.engine = { osc, gain: g, lfo };
    }
    const t = this.ctx.currentTime;
    this.engine.osc.frequency.setTargetAtTime(55 + level * 70, t, 0.1);
    this.engine.gain.gain.setTargetAtTime(level > 0.01 ? 0.05 + level * 0.08 : 0, t, 0.15);
  }
}
