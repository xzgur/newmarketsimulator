/** Keyboard + mouse (pointer lock, with drag-to-look fallback). */

export type Action = 'interact' | 'drop' | 'phone' | 'pause' | 'mute' | 'complete' | 'bag1' | 'bag2' | 'bag3' | 'accept';

const ACTION_KEYS: Record<string, Action> = {
  KeyE: 'interact',
  KeyG: 'drop',
  KeyQ: 'drop',
  Tab: 'phone',
  KeyT: 'phone',
  Escape: 'pause',
  KeyP: 'pause',
  KeyM: 'mute',
  KeyF: 'complete',
  Digit1: 'bag1',
  Digit2: 'bag2',
  Digit3: 'bag3',
  Enter: 'accept',
  Space: 'accept',
};

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab', 'ShiftLeft', 'ShiftRight']);

export class Input {
  private down = new Set<string>();
  private queue: Action[] = [];
  private mdx = 0;
  private mdy = 0;
  private dragging = false;
  locked = false;
  /** When false (menus open), mouse look and clicks are ignored. */
  enabled = false;
  sensitivity = 0.0022;
  invertY = false;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) {
        const a = ACTION_KEYS[e.code];
        if (a) this.queue.push(a);
      }
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        this.dragging = true;
      }
      if (e.button === 0) this.queue.push('interact');
      if (e.button === 2) this.queue.push('drop');
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      // pointer lock occasionally reports a huge bogus jump (e.g. when the cursor is re-centred)
      if (Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
      if (this.locked || this.dragging) {
        this.mdx += e.movementX;
        this.mdy += e.movementY;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
    });
    // touch: drag to look
    let last: { x: number; y: number } | null = null;
    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      last = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    });
    el.addEventListener('touchmove', (e) => {
      if (!this.enabled || !last) return;
      const t = e.touches[0];
      this.mdx += (t.clientX - last.x) * 1.5;
      this.mdy += (t.clientY - last.y) * 1.5;
      last = { x: t.clientX, y: t.clientY };
    });
  }

  requestLock() {
    try {
      const r = this.el.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* pointer lock unavailable: drag-to-look still works */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  move(): { forward: number; strafe: number; turn: number; sprint: boolean } {
    const f = this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0;
    const b = this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0;
    const l = this.isDown('KeyA') ? 1 : 0;
    const r = this.isDown('KeyD') ? 1 : 0;
    const tl = this.isDown('ArrowLeft') ? 1 : 0;
    const tr = this.isDown('ArrowRight') ? 1 : 0;
    return { forward: f - b, strafe: r - l, turn: tl - tr, sprint: this.isDown('ShiftLeft') || this.isDown('ShiftRight') };
  }

  /** Mouse delta since last call, in radians (yaw, pitch). */
  look(): { yaw: number; pitch: number } {
    const out = { yaw: -this.mdx * this.sensitivity, pitch: (this.invertY ? 1 : -1) * this.mdy * this.sensitivity };
    this.mdx = 0;
    this.mdy = 0;
    return out;
  }

  consume(): Action[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  /** Inject an action (UI buttons, tests). */
  push(a: Action) {
    this.queue.push(a);
  }

  clear() {
    this.down.clear();
    this.queue = [];
    this.mdx = 0;
    this.mdy = 0;
  }
}
