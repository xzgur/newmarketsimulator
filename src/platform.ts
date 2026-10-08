/**
 * Thin wrapper around the CrazyGames HTML5 SDK v3 (window.CrazyGames.SDK).
 * Everything is a no-op when the SDK isn't on the page (normal web build),
 * failed to load, or reports environment 'disabled', so the game never
 * depends on it.
 *
 *   loadingStart/Stop   boot → main menu
 *   gameplayStart/Stop  around actual play (pause, end of day, menus)
 *   happytime           promotions, a passed day
 *   midgameAd           at a natural break (between days)
 *   storage             SDK data module (cloud save) with localStorage fallback
 */

interface CgSettings {
  muteAudio?: boolean;
  disableChat?: boolean;
}

interface CgSdk {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings?: CgSettings;
    addSettingsChangeListener?(cb: (s: CgSettings) => void): void;
  };
  ad: {
    requestAd(type: 'midgame' | 'rewarded', callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (e: unknown) => void }): void;
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

let sdk: CgSdk | null = null;
let playing = false;

function raw(): CgSdk | null {
  return (window as unknown as { CrazyGames?: { SDK?: CgSdk } }).CrazyGames?.SDK ?? null;
}

/** Initialises the SDK when present. Never throws, never blocks for long. */
export async function initPlatform(): Promise<void> {
  const s = raw();
  if (!s) return;
  try {
    await Promise.race([s.init(), new Promise((_, reject) => setTimeout(() => reject(new Error('SDK init timeout')), 5000))]);
    if (s.environment !== 'disabled') sdk = s;
  } catch (e) {
    console.warn('CrazyGames SDK unavailable:', e);
  }
}

export const platformName = () => (sdk ? 'crazygames' : 'web');

function call(fn: (s: CgSdk) => void) {
  if (!sdk) return;
  try {
    fn(sdk);
  } catch (e) {
    console.warn('CrazyGames SDK call failed:', e);
  }
}

export const loadingStart = () => call((s) => s.game.loadingStart());
export const loadingStop = () => call((s) => s.game.loadingStop());
export const happytime = () => call((s) => s.game.happytime());

/** Idempotent: only forwards real start/stop transitions. */
export function setGameplay(on: boolean) {
  if (on === playing) return;
  playing = on;
  call((s) => (on ? s.game.gameplayStart() : s.game.gameplayStop()));
}

/** Platform-level mute (CrazyGames settings). Calls back now and on every change. */
export function onPlatformMute(cb: (muted: boolean) => void) {
  call((s) => {
    cb(!!s.game.settings?.muteAudio);
    s.game.addSettingsChangeListener?.((st) => cb(!!st.muteAudio));
  });
}

/**
 * Midgame ad at a natural break. `pause(true)` mutes + freezes the game while
 * the ad shows; resolves when the game may continue (also on error / no ad).
 */
export function midgameAd(pause: (on: boolean) => void): Promise<void> {
  return new Promise((resolve) => {
    if (!sdk) return resolve();
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      pause(false);
      resolve();
    };
    // safety net: never leave the player stuck if the SDK goes silent
    const guard = setTimeout(end, 60000);
    call((s) =>
      s.ad.requestAd('midgame', {
        adStarted: () => pause(true),
        adFinished: () => {
          clearTimeout(guard);
          end();
        },
        adError: () => {
          clearTimeout(guard);
          end();
        },
      }),
    );
  });
}

/** Cloud save on CrazyGames (data module), localStorage elsewhere. */
export const storage = {
  get(key: string): string | null {
    try {
      if (sdk?.data) return sdk.data.getItem(key);
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      if (sdk?.data) sdk.data.setItem(key, value);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable: progress just won't persist */
    }
  },
};
