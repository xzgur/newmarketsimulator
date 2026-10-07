import './style.css';
import { Game } from './game';
import { loadSettings } from './settings';
import { setLang, t } from './i18n';

const app = document.getElementById('app')!;

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2');
  } catch {
    return false;
  }
}

if (!webglAvailable()) {
  setLang(loadSettings().lang);
  app.innerHTML = `<div class="fatal">${t('webgl')}</div>`;
} else {
  new Game(app);
}
