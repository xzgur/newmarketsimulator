import './style.css';
import { Game } from './game';

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
  app.innerHTML = '<div class="fatal">Bu oyun WebGL2 gerektiriyor. Lütfen güncel bir tarayıcı kullan.</div>';
} else {
  new Game(app);
}
