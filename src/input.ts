/** Keyboard state + edge-triggered actions. */

export type Action = 'interact' | 'panel' | 'pause' | 'camera' | 'mute' | 'restart' | 'bag1' | 'bag2' | 'bag3' | 'close';

const ACTION_KEYS: Record<string, Action> = {
  KeyE: 'interact',
  Enter: 'interact',
  Tab: 'panel',
  KeyQ: 'panel',
  Escape: 'pause',
  KeyP: 'pause',
  KeyC: 'camera',
  KeyM: 'mute',
  KeyR: 'restart',
  Digit1: 'bag1',
  Digit2: 'bag2',
  Digit3: 'bag3',
  KeyF: 'close',
};

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'ShiftLeft', 'ShiftRight']);

export class Input {
  private down = new Set<string>();
  private queue: Action[] = [];

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        const a = ACTION_KEYS[e.code];
        if (a) {
          if (e.code === 'Tab') e.preventDefault();
          this.queue.push(a);
        }
      }
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  axis(): { throttle: number; steer: number; brake: boolean } {
    const f = this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0;
    const b = this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0;
    const l = this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0;
    const r = this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0;
    return { throttle: f - b, steer: l - r, brake: this.isDown('Space') };
  }

  consume(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  clear() {
    this.down.clear();
    this.queue = [];
  }
}
