import { front } from './frontend.js';

// Paint the loading screen before building the world and compiling shaders.
requestAnimationFrame(() => setTimeout(() => {
  import('./main.js').catch((error) => {
    console.error('Game initialization failed', error);
    front.fail('Не удалось запустить игру. Проверьте поддержку WebGL 2 и обновите страницу.', () => location.reload());
  });
}, 0));
