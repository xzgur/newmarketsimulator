/** Player settings + career save, persisted in localStorage (best effort). */
import type { Lang } from './i18n';
import type { MoodId } from './render/moodIds';
import { newCareer, type Career } from './logic/career';

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
  /** null = follow the time of day of each order */
  mood: MoodId | null;
}

export const DEFAULT_SETTINGS: Settings = {
  lang: 'en',
  sensitivity: 1,
  invertY: false,
  fov: 72,
  music: 0.35,
  muffle: 0.75,
  sfx: 0.7,
  announcements: true,
  quality: 'high',
  pixel: 1,
  mood: null,
};

const KEY = 'orderdash.settings.v1';

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
  // first launch is always English; the player picks another language in the menu
  const stored = read<Partial<Settings> & { rev?: number }>(KEY) ?? {};
  if ((stored.rev ?? 1) < 2) {
    // rev 2: quieter defaults + stronger store-speaker sound
    delete stored.music;
    delete stored.muffle;
    delete stored.sfx;
  }
  const { rev: _rev, ...rest } = stored;
  return { ...DEFAULT_SETTINGS, ...rest };
}

export function saveSettings(s: Settings) {
  write(KEY, { ...s, rev: 2 });
}

const CKEY = 'orderdash.career.v1';

export function loadCareer(): Career {
  return { ...newCareer(), ...(read<Partial<Career>>(CKEY) ?? {}) };
}

export function saveCareer(c: Career) {
  write(CKEY, c);
}
