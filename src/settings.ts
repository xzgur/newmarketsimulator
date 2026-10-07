/** Player settings + campaign progress, persisted in localStorage (best effort). */
import type { Lang } from './i18n';
import type { MoodId } from './render/moodIds';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  /** Multiplier on the base mouse sensitivity (0.2 – 3). */
  sensitivity: number;
  invertY: boolean;
  fov: number;
  /** 0 – 1 */
  music: number;
  /** 0 = clean, 1 = tinny old ceiling speakers */
  muffle: number;
  sfx: number;
  announcements: boolean;
  quality: Quality;
  /** 1 = off, 2–4 = pixel size */
  pixel: number;
  /** null = use each shift's own atmosphere */
  mood: MoodId | null;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  sensitivity: 1,
  invertY: false,
  fov: 72,
  music: 0.55,
  muffle: 0.6,
  sfx: 0.8,
  announcements: true,
  quality: 'high',
  pixel: 1,
  mood: null,
};

const KEY = 'orderdash.settings.v1';
const PKEY = 'orderdash.progress.v1';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(KEY) ?? {}) };
  if (!read(KEY)) {
    const nav = (navigator.language || 'en').slice(0, 2);
    if (nav === 'tr' || nav === 'es' || nav === 'de') s.lang = nav;
  }
  return s;
}

export function saveSettings(s: Settings) {
  write(KEY, s);
}

export interface Progress {
  /** best stars per level number (0 = not cleared) */
  stars: Record<number, number>;
  best: Record<number, number>;
}

export function loadProgress(): Progress {
  return { stars: {}, best: {}, ...(read<Progress>(PKEY) ?? {}) };
}

export function saveProgress(p: Progress) {
  write(PKEY, p);
}

export function isUnlocked(p: Progress, num: number): boolean {
  return num === 1 || (p.stars[num - 1] ?? 0) > 0;
}

export function recordResult(p: Progress, num: number, stars: number, score: number): Progress {
  const next: Progress = { stars: { ...p.stars }, best: { ...p.best } };
  next.stars[num] = Math.max(next.stars[num] ?? 0, stars);
  next.best[num] = Math.max(next.best[num] ?? 0, score);
  return next;
}
