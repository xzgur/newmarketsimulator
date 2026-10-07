/**
 * Game phase state machine + countdown timer.
 *
 *  intro ─start→ incoming ─accept→ playing ─orderClosed→ courierArriving ─courierArrived→
 *  awaitingHandover ─handover→ handover ─handoverDone→ won
 *  (any timed phase) ─time runs out→ lost
 */

export type Phase =
  | 'intro'
  | 'incoming'
  | 'playing'
  | 'courierArriving'
  | 'awaitingHandover'
  | 'handover'
  | 'won'
  | 'lost';

const TIMED: Phase[] = ['playing', 'courierArriving', 'awaitingHandover'];

export class GameFlow {
  phase: Phase = 'intro';
  timeLeft: number;
  readonly timeLimit: number;
  paused = false;
  penalties = 0;

  constructor(timeLimit: number) {
    this.timeLimit = timeLimit;
    this.timeLeft = timeLimit;
  }

  get timerRunning(): boolean {
    return !this.paused && TIMED.includes(this.phase);
  }

  /** True while the player may drive the cart. */
  get canDrive(): boolean {
    return !this.paused && (this.phase === 'incoming' || this.phase === 'playing' || this.phase === 'courierArriving' || this.phase === 'awaitingHandover');
  }

  /** Shift starts: the phone rings with the incoming order (timer not running yet). */
  start(): void {
    if (this.phase !== 'intro') return;
    this.phase = 'incoming';
  }

  /** Order accepted in the app: the clock starts. */
  accept(): boolean {
    return this.go('incoming', 'playing');
  }

  /** Advances the clock. Returns true on the frame the time runs out. */
  tick(dt: number): boolean {
    if (!this.timerRunning) return false;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft <= 0) {
      this.phase = 'lost';
      return true;
    }
    return false;
  }

  penalize(seconds: number): boolean {
    if (!this.timerRunning || seconds <= 0) return false;
    this.penalties += seconds;
    this.timeLeft = Math.max(0, this.timeLeft - seconds);
    if (this.timeLeft <= 0) {
      this.phase = 'lost';
      return true;
    }
    return false;
  }

  private go(from: Phase, to: Phase): boolean {
    if (this.phase !== from) return false;
    this.phase = to;
    return true;
  }

  orderClosed(): boolean {
    return this.go('playing', 'courierArriving');
  }

  courierArrived(): boolean {
    return this.go('courierArriving', 'awaitingHandover');
  }

  handover(): boolean {
    return this.go('awaitingHandover', 'handover');
  }

  handoverDone(): boolean {
    return this.go('handover', 'won');
  }

  /** 1-3 stars based on remaining time and mistakes. */
  stars(mistakes: number): number {
    if (this.phase !== 'won') return 0;
    const ratio = this.timeLeft / this.timeLimit;
    let s = ratio > 0.4 ? 3 : ratio > 0.15 ? 2 : 1;
    if (mistakes >= 3) s = Math.max(1, s - 1);
    return s;
  }
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
