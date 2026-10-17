const $ = (id) => document.getElementById(id);
const root = $('start');
let screen = 'loading';
let backTo = 'menu';
let actions = {};
let begin = null;
let retry = null;
let confirmAction = null;
let hasSave = false;
let loadingTimer;

function show(view, { focus = true } = {}) {
  screen = view;
  root.classList.remove('hidden');
  root.dataset.screen = view;
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('hidden', el.dataset.view !== view));
  root.querySelector(`[data-view="${view}"]`)?.scrollTo(0, 0);
  if (focus) requestAnimationFrame(() => {
    const heading = root.querySelector(`[data-view="${view}"] h1, [data-view="${view}"] h2`);
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  });
}
function back() {
  if (backTo === 'pause') {
    front.hide();
    $('resume').focus();
  } else {
    show('menu');
  }
}
function progress(label, fraction, detail) {
  const value = Math.max(0, Math.min(100, Math.round(fraction * 100)));
  $('load-label').textContent = label;
  $('load-value').textContent = `${value}%`;
  $('load-progress').setAttribute('aria-valuenow', value);
  $('load-progress').querySelector('i').style.width = `${value}%`;
  if (detail) $('load-detail').textContent = detail;
}
function showLoading(label, detail) {
  progress(label, 0, detail);
  show('loading', { focus: false });
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    $('load-detail').textContent = 'Загрузка продолжается. При медленном соединении потребуется больше времени.';
  }, 18000);
}

export const front = {
  get screen() { return root.classList.contains('hidden') ? 'hidden' : screen; },
  bind(callbacks) { actions = callbacks; },
  progress,
  loading: showLoading,
  assetsReady() {
    clearTimeout(loadingTimer);
    progress('Объект готов', 1);
    show('headphones');
  },
  saveAvailable(value) {
    hasSave = value;
    $('continue').classList.toggle('hidden', !value);
  },
  menu() {
    clearTimeout(loadingTimer);
    backTo = 'menu';
    show('menu');
  },
  hide() { root.classList.add('hidden'); },
  briefing(callback, fromSave = false) {
    clearTimeout(loadingTimer);
    begin = callback;
    $('briefing-heading').innerHTML = fromSave ? 'Снова<br>в темноту.' : 'Ночью станция<br>замолчала.';
    $('intro').classList.toggle('hidden', fromSave);
    $('begin-session').firstChild.textContent = fromSave ? 'ПРОДОЛЖИТЬ ' : 'ОТКРЫТЬ ГЛАЗА ';
    show('briefing');
  },
  fail(message, callback) {
    clearTimeout(loadingTimer);
    retry = callback;
    $('load-error').textContent = message;
    show('error');
  },
};

$('enter-menu').addEventListener('click', () => front.menu());
$('begin-session').addEventListener('click', () => { if (begin) { const fn = begin; begin = null; fn(); } });
$('load-retry').addEventListener('click', () => retry?.());
$('play').addEventListener('click', () => {
  if (hasSave) {
    backTo = 'menu';
    confirmAction = () => actions.newGame?.();
    show('confirm');
  } else actions.newGame?.();
});
$('continue').addEventListener('click', () => actions.continue?.());
$('confirm-new').addEventListener('click', () => { const fn = confirmAction; confirmAction = null; fn?.(); });
$('restart').addEventListener('click', () => {
  backTo = 'pause';
  confirmAction = () => actions.restart?.();
  show('confirm');
});
$('return-menu').addEventListener('click', () => actions.returnMenu?.());
document.querySelectorAll('[data-open]').forEach((el) => el.addEventListener('click', () => {
  backTo = el.dataset.context || 'menu';
  show(el.dataset.open);
}));
document.querySelectorAll('[data-back]').forEach((el) => el.addEventListener('click', back));
addEventListener('keydown', (event) => {
  const isFront = !root.classList.contains('hidden');
  const nav = isFront && screen === 'menu' ? root.querySelector('[data-view="menu"] .menu-nav')
    : !isFront && !$('pause').classList.contains('hidden') ? $('pause').querySelector('.menu-nav') : null;
  if (nav && ['ArrowDown', 'ArrowUp'].includes(event.code)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const buttons = [...nav.querySelectorAll('button')].filter((button) => !button.classList.contains('hidden'));
    const index = buttons.indexOf(document.activeElement);
    const next = index < 0 ? 0 : (index + (event.code === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    return;
  }
  if (event.code === 'Enter' && !['BUTTON', 'INPUT', 'SELECT', 'A'].includes(document.activeElement?.tagName)) {
    const button = nav?.querySelector('button:not(.hidden)') || (isFront && ['headphones', 'briefing', 'error'].includes(screen) ? root.querySelector(`[data-view="${screen}"] button`) : null);
    if (button) { event.preventDefault(); button.click(); return; }
  }
  if (event.code === 'Escape' && !root.classList.contains('hidden') && ['settings', 'controls', 'credits', 'confirm'].includes(screen)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    back();
  }
}, true);

// Preferences are available before sound is initialized and survive reloads.
const playerMeters = $('player-meters');
try { playerMeters.value = localStorage.getItem('echo.player-meters') === 'visible' ? 'visible' : 'hidden'; } catch (_) {}
function applyPlayerMeters() {
  document.body.classList.toggle('show-player-meters', playerMeters.value === 'visible');
  try { localStorage.setItem('echo.player-meters', playerMeters.value); } catch (_) {}
}
playerMeters.addEventListener('change', applyPlayerMeters);
applyPlayerMeters();
for (const id of ['vol', 'sens']) {
  try {
    const saved = localStorage.getItem(`echo.${id}`);
    if (saved !== null && Number.isFinite(+saved)) $(id).value = saved;
  } catch (_) {}
  const update = () => {
    $(`${id}-value`).value = id === 'vol' ? `${Math.round(+$(id).value / 1.5 * 100)}%` : (+$(id).value).toFixed(1);
    try { localStorage.setItem(`echo.${id}`, $(id).value); } catch (_) {}
  };
  $(id).addEventListener('input', update);
  update();
}
$('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
    $('settings-message').textContent = '';
  } catch (_) {
    $('settings-message').textContent = 'Полный экран недоступен в этом браузере.';
  }
});
addEventListener('fullscreenchange', () => {
  $('fullscreen').textContent = document.fullscreenElement ? 'Выйти из полного экрана ↙' : 'На весь экран ↗';
});
showLoading('Подготовка игры', 'Загрузка геометрии и материалов.');
