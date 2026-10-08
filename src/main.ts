import './style.css';
import { Game } from './game';
import { loadSettings } from './settings';
import { setLang, t } from './i18n';
import { initPlatform, loadingStart } from './platform';

const app = document.getElementById('app')!;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot() {
  // the platform SDK (CrazyGames) must be ready before saves are read
  await initPlatform();
  loadingStart();
  if (!webglAvailable()) {
    setLang(loadSettings().lang);
    app.innerHTML = `<div class="fatal">${t('webgl')}</div>`;
    return;
  }
  new Game(app);
}

void boot();
