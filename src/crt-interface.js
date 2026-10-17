import { CanvasTexture, SRGBColorSpace, LinearFilter } from 'three';

// Paint the measured DOM layout only when it changes, then composite it into the same
// scene image that the game's CRT shader bends. The DOM retains keyboard,
// screen-reader and native form behavior; pointer hits use the shader's UV map.
export function createCrtInterface(curvature) {
  const menus = [...document.querySelectorAll('#start, #pause, #death, #end')];
  const roots = [...menus, document.getElementById('note'), document.getElementById('hud')];
  const fade = document.getElementById('fade');
  const slits = document.getElementById('slits');
  const touchControls = document.getElementById('touch-controls');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const scratch = document.createElement('canvas');
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  let dirty = true;
  let busy = false;
  let enabled = true;
  let ready = false;
  let lastCapture = -Infinity;
  let renderedRoot = null;
  let renderedView = '';
  let hovered = null;
  let dragging = null;
  let previousRoot = null;
  let rootChangedAt = 0;
  const activeRoot = () => roots.find((root) => !root.classList.contains('hidden')) || null;
  const invalidate = () => { dirty = true; };
  const isMenu = (root) => menus.includes(root);
  function opacity(element, root) {
    let alpha = 1;
    for (; element && element !== root; element = element.parentElement) alpha *= +getComputedStyle(element).opacity;
    return alpha;
  }
  const icons = [...document.querySelectorAll('#start svg')].map((element) => {
    const clone = element.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('color', getComputedStyle(element).color);
    const image = new Image();
    image.onload = invalidate;
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
    return { element, image };
  });
  const observer = new MutationObserver(invalidate);
  for (const root of [...roots, fade, slits, touchControls]) observer.observe(root, {
    subtree: true, childList: true, characterData: true,
    attributes: true, attributeFilter: ['class', 'style', 'aria-valuenow'],
  });
  for (const event of ['input', 'change', 'focusin', 'focusout']) document.addEventListener(event, invalidate);
  addEventListener('resize', invalidate);
  document.addEventListener('scroll', invalidate, true);
  // Notes stay in the locked game view; wheel/Page keys scroll their source
  // layout, which is then repainted on the curved glass.
  document.addEventListener('wheel', (event) => {
    if (activeRoot()?.id !== 'note') return;
    const paper = document.querySelector('#note .paper');
    if (paper.scrollHeight <= paper.clientHeight) return;
    event.preventDefault();
    paper.scrollTop += event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? paper.clientHeight : 1);
    invalidate();
  }, { passive: false });
  document.addEventListener('keydown', (event) => {
    if (activeRoot()?.id !== 'note') return;
    const paper = document.querySelector('#note .paper');
    const amount = { ArrowUp: -40, ArrowDown: 40, PageUp: -paper.clientHeight * 0.8, PageDown: paper.clientHeight * 0.8 }[event.code];
    if (amount === undefined) return;
    event.preventDefault();
    paper.scrollTop += amount;
    invalidate();
  });

  async function capture(root) {
    busy = true;
    dirty = false;
    lastCapture = performance.now();
    const view = root.dataset.screen || '';
    const headings = [...root.querySelectorAll('h1, h2')].filter((element) => element.getBoundingClientRect().height > 0).map((element) => {
      const style = getComputedStyle(element);
      return { text: element.innerText, rect: element.getBoundingClientRect(), font: style.font, fontSize: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), color: style.color, align: style.textAlign, spacing: style.letterSpacing, clip: element.closest('.front-view')?.getBoundingClientRect() };
    });
    const glyphs = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (parent.closest('h1, h2, svg, select, style, script') || !parent.getBoundingClientRect().height) continue;
      const style = getComputedStyle(parent);
      const clip = parent.closest('.front-view, .paper')?.getBoundingClientRect();
      const range = document.createRange();
      let alpha = 1;
      if (root.id === 'end' || !isMenu(root)) alpha = opacity(parent, root);
      for (let i = 0; i < node.length; i++) {
        if (!node.textContent[i].trim()) continue;
        range.setStart(node, i); range.setEnd(node, i + 1);
        const rect = range.getBoundingClientRect();
        if (rect.width && rect.height) glyphs.push({ text: node.textContent[i], x: rect.left, y: rect.top, height: rect.height, font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`, color: style.color, alpha, clip });
      }
    }
    const ranges = [...root.querySelectorAll('input[type="range"]')].filter((element) => element.getBoundingClientRect().height).map((element) => ({ rect: element.getBoundingClientRect(), fraction: (+element.value - +element.min) / (+element.max - +element.min) }));
    const selects = [...root.querySelectorAll('select')].filter((element) => element.getBoundingClientRect().height).map((element) => {
      const style = getComputedStyle(element);
      return { rect: element.getBoundingClientRect(), text: element.options[element.selectedIndex].text, color: style.color, font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` };
    });
    try {
      const snapshot = scratch;
      const ratio = Math.min(devicePixelRatio, 1.5);
      const width = Math.round(innerWidth * ratio), height = Math.round(innerHeight * ratio);
      if (snapshot.width !== width || snapshot.height !== height) { snapshot.width = width; snapshot.height = height; }
      const paint = snapshot.getContext('2d');
      paint.setTransform(1, 0, 0, 1, 0, 0);
      paint.clearRect(0, 0, width, height);
      paint.scale(ratio, ratio);
      if (root.id === 'start') {
        if (['headphones', 'loading', 'briefing'].includes(view)) {
          paint.fillStyle = 'rgba(2,6,7,0.77)';
          paint.fillRect(0, 0, innerWidth, innerHeight);
        } else {
          const shade = paint.createLinearGradient(0, 0, innerWidth, 0);
          shade.addColorStop(0, 'rgba(2,6,7,0.95)');
          shade.addColorStop(0.28, 'rgba(2,6,7,0.82)');
          shade.addColorStop(0.65, 'rgba(2,6,7,0.20)');
          shade.addColorStop(1, 'rgba(2,6,7,0.05)');
          paint.fillStyle = shade;
          paint.fillRect(0, 0, innerWidth, innerHeight);
        }
      } else if (isMenu(root)) {
        paint.fillStyle = getComputedStyle(root).backgroundColor;
        paint.fillRect(0, 0, innerWidth, innerHeight);
      }
      if (isMenu(root)) {
        const foot = paint.createLinearGradient(0, innerHeight * 0.7, 0, innerHeight);
        foot.addColorStop(0, 'transparent'); foot.addColorStop(1, 'rgba(2,6,7,0.8)');
        paint.fillStyle = foot; paint.fillRect(0, 0, innerWidth, innerHeight);
      } else {
        paintGameplay(paint, root);
      }
      for (const element of root.querySelectorAll('.setting-row, .control-list > div, .line-button, .menu-item, .load-track, .load-track i, select')) {
        const rect = element.getBoundingClientRect();
        if (!rect.height) continue;
        const style = getComputedStyle(element);
        paint.fillStyle = style.backgroundColor;
        paint.fillRect(rect.left, rect.top, rect.width, rect.height);
        if (element.matches('.menu-item.crt-hover, .menu-item:focus-visible')) {
          paint.fillStyle = 'rgba(184,76,54,0.12)';
          paint.fillRect(rect.left, rect.top, rect.width, rect.height);
        }
        if (element.matches('.menu-item')) {
          paint.fillStyle = element.classList.contains('primary') || element.classList.contains('crt-hover') ? '#d75c49' : '#758080';
          paint.fillRect(rect.left, rect.top + rect.height / 2, 9, 1);
        }
        const border = parseFloat(style.borderBottomWidth);
        if (border) {
          paint.fillStyle = style.borderBottomColor;
          paint.fillRect(rect.left, rect.bottom - border, rect.width, border);
        }
        if (element.matches('select')) {
          paint.strokeStyle = style.borderColor; paint.lineWidth = 1;
          paint.strokeRect(rect.left, rect.top, rect.width, rect.height);
        }
      }
      for (const icon of icons) {
        const rect = icon.element.getBoundingClientRect();
        if (rect.height && icon.image.complete && icon.image.naturalWidth) paint.drawImage(icon.image, rect.left, rect.top, rect.width, rect.height);
      }
      if (root !== activeRoot() || view !== (root.dataset.screen || '')) { dirty = true; return; }
      if (canvas.width !== snapshot.width || canvas.height !== snapshot.height) {
        texture.dispose(); // WebGL texture storage must be reallocated after resize.
        canvas.width = snapshot.width;
        canvas.height = snapshot.height;
      }
      const context = canvas.getContext('2d');
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(snapshot, 0, 0);
      // Native glyph metrics preserve thin system fonts and wrapping.
      const scale = canvas.width / innerWidth;
      context.save();
      context.scale(scale, scale);
      for (const heading of headings) {
        context.save();
        if (heading.clip) { context.beginPath(); context.rect(heading.clip.left, heading.clip.top, heading.clip.width, heading.clip.height); context.clip(); }
        context.font = heading.font;
        context.fillStyle = heading.color;
        context.letterSpacing = heading.spacing === 'normal' ? '0px' : heading.spacing;
        context.textAlign = heading.align === 'center' ? 'center' : 'left';
        context.textBaseline = 'alphabetic';
        const lines = heading.text.split('\n');
        lines.forEach((line, index) => {
          const metrics = context.measureText(line);
          const ascent = metrics.actualBoundingBoxAscent;
          const descent = metrics.actualBoundingBoxDescent;
          const x = heading.rect.left + (heading.align === 'center' ? heading.rect.width / 2 : 0);
          const y = heading.rect.top + index * heading.lineHeight + (heading.lineHeight - ascent - descent) / 2 + ascent;
          context.fillText(line, x, y);
        });
        context.restore();
      }
      context.textAlign = 'left';
      context.letterSpacing = '0px';
      const metricsCache = new Map();
      for (const glyph of glyphs) {
        if (glyph.clip && (glyph.y + glyph.height < glyph.clip.top || glyph.y > glyph.clip.bottom)) continue;
        context.save();
        if (glyph.clip) { context.beginPath(); context.rect(glyph.clip.left, glyph.clip.top, glyph.clip.width, glyph.clip.height); context.clip(); }
        context.globalAlpha = glyph.alpha;
        context.font = glyph.font;
        context.fillStyle = glyph.color;
        if (!metricsCache.has(glyph.font)) metricsCache.set(glyph.font, context.measureText('Mg'));
        const metrics = metricsCache.get(glyph.font);
        const y = glyph.y + (glyph.height - metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2 + metrics.actualBoundingBoxAscent;
        context.fillText(glyph.text, glyph.x, y);
        context.restore();
      }
      context.globalAlpha = 1;
      for (const input of ranges) {
        const y = input.rect.top + input.rect.height / 2;
        const start = input.rect.left + 8, end = input.rect.right - 8;
        const thumb = start + (end - start) * input.fraction;
        context.lineWidth = 3;
        context.lineCap = 'round';
        context.strokeStyle = '#546061';
        context.beginPath(); context.moveTo(start, y); context.lineTo(end, y); context.stroke();
        context.strokeStyle = '#d75c49';
        context.beginPath(); context.moveTo(start, y); context.lineTo(thumb, y); context.stroke();
        context.fillStyle = '#e4e1d9';
        context.beginPath(); context.arc(thumb, y, 6, 0, Math.PI * 2); context.fill();
      }
      for (const select of selects) {
        context.font = select.font;
        context.fillStyle = select.color;
        context.textBaseline = 'middle';
        context.fillText(select.text, select.rect.left + 12, select.rect.top + select.rect.height / 2);
        context.strokeStyle = select.color;
        context.lineWidth = 1;
        const x = select.rect.right - 13, y = select.rect.top + select.rect.height / 2;
        context.beginPath(); context.moveTo(x - 3, y - 2); context.lineTo(x, y + 2); context.lineTo(x + 3, y - 2); context.stroke();
      }
      if (!isMenu(root)) {
        // The death/ending fade is part of the image on the glass, too.
        context.fillStyle = `rgba(0,0,0,${getComputedStyle(fade).opacity})`;
        context.fillRect(0, 0, innerWidth, innerHeight);
      }
      context.restore();
      texture.needsUpdate = true;
      renderedRoot = root;
      renderedView = view;
      ready = true;
      document.body.classList.add('crt-interface-ready');
    } catch (error) {
      // Keep the accessible DOM usable if a browser cannot rasterize the UI.
      console.warn('CRT interface capture failed', error);
      enabled = false;
      document.body.classList.remove('crt-interface-ready');
    } finally {
      busy = false;
    }
  }

  function paintGameplay(context, root) {
    if (!slits.classList.contains('hidden')) {
      // Locker slots occlude the world before the HUD and the CRT lens.
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.fillStyle = 'rgba(0,0,0,0.92)';
      for (let y = 0; y < innerHeight; y += 44) context.fillRect(0, y, innerWidth, 34);
      const shade = context.createRadialGradient(innerWidth / 2, innerHeight * 0.48, innerHeight * 0.15, innerWidth / 2, innerHeight * 0.48, innerWidth * 0.65);
      shade.addColorStop(0, 'transparent'); shade.addColorStop(1, '#000');
      context.fillStyle = shade; context.fillRect(0, 0, innerWidth, innerHeight);
    }
    for (const element of root.querySelectorAll('#siege, #brief, .paper, .bar, .bar i, #crosshair, #listen, #radar-c')) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const style = getComputedStyle(element);
      context.save();
      context.globalAlpha = opacity(element, root);
      context.beginPath();
      context.roundRect(rect.left, rect.top, rect.width, rect.height, parseFloat(style.borderRadius) ? Math.min(rect.width, rect.height) / 2 : 0);
      context.fillStyle = style.backgroundColor; context.fill();
      const border = parseFloat(style.borderTopWidth);
      if (border) { context.lineWidth = border; context.strokeStyle = style.borderTopColor; context.stroke(); }
      if (element.tagName === 'CANVAS') {
        context.clip();
        context.drawImage(element, rect.left, rect.top, rect.width, rect.height);
      }
      context.restore();
    }
    const mark = root.querySelector('#listen-mark');
    if (mark?.getBoundingClientRect().height) {
      const style = getComputedStyle(mark), transform = new DOMMatrixReadOnly(style.transform);
      context.save();
      context.globalAlpha = opacity(mark, root);
      context.translate(innerWidth / 2 + transform.e, innerHeight / 2 + transform.f);
      context.rotate(Math.atan2(transform.b, transform.a));
      context.scale(1, 8 / 30);
      const glow = context.createRadialGradient(0, 0, 0, 0, 0, 15);
      glow.addColorStop(0, '#ff4030'); glow.addColorStop(0.7, 'transparent');
      context.fillStyle = glow; context.fillRect(-15, -15, 30, 30);
      context.restore();
    }
    paintTouchControls(context);
  }

  function paintTouchControls(ctx) {
    if (touchControls.classList.contains('hidden')) return;
    const stick=touchControls.querySelector('.touch-stick'),r=stick.getBoundingClientRect();
    if(r.width){
      const x=r.left+r.width/2,y=r.top+r.height/2,radius=r.width/2;
      ctx.save();ctx.strokeStyle='#a5b4a95c';ctx.fillStyle='rgba(4,14,16,0.5)';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();ctx.stroke();
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;ctx.beginPath();ctx.moveTo(x+Math.cos(a)*(radius-2),y+Math.sin(a)*(radius-2));ctx.lineTo(x+Math.cos(a)*(radius-7),y+Math.sin(a)*(radius-7));ctx.stroke();}
      ctx.setLineDash([2,4]);ctx.beginPath();ctx.arc(x,y,radius*.7,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      const thumb=touchControls.querySelector('.touch-thumb').getBoundingClientRect();
      ctx.fillStyle='#b8b59d30';ctx.strokeStyle='#c5c8ae90';ctx.beginPath();ctx.arc(thumb.left+thumb.width/2,thumb.top+thumb.height/2,thumb.width/2,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
    }
    for(const button of touchControls.querySelectorAll('button')){
      const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;
      const selected=button.matches('.pressed,.selected'),style=getComputedStyle(button);
      ctx.save();ctx.beginPath();ctx.moveTo(r.left,r.top);ctx.lineTo(r.right-7,r.top);ctx.lineTo(r.right,r.top+7);ctx.lineTo(r.right,r.bottom);ctx.lineTo(r.left+7,r.bottom);ctx.lineTo(r.left,r.bottom-7);ctx.closePath();
      ctx.fillStyle=selected?'rgba(76,50,38,0.8)':button.matches('.touch-tap')?'rgba(21,42,46,0.72)':'rgba(4,13,16,0.68)';ctx.fill();
      ctx.strokeStyle=selected?'#c79973aa':'#95ada35c';ctx.lineWidth=1;ctx.stroke();
      ctx.fillStyle=selected?'#ecb181':'#bba88885';ctx.fillRect(r.left+6,r.top,selected?24:12,1);
      const svg=button.querySelector('svg');
      if(svg){const box=svg.getBoundingClientRect();ctx.save();ctx.translate(box.left,box.top);ctx.scale(box.width/24,box.height/24);ctx.strokeStyle=style.color;ctx.lineWidth=1.25;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(new Path2D(svg.querySelector('path').getAttribute('d')));ctx.restore();}
      const label=button.querySelector('span')||button,box=label.getBoundingClientRect(),ls=getComputedStyle(label);
      if(box.width&&ls.display!=='none'){
        ctx.font=`${ls.fontWeight} ${ls.fontSize} ${ls.fontFamily}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=style.color;
        ctx.fillText(label.textContent,box.left+box.width/2,box.top+box.height/2);
      }
      ctx.restore();
    }
  }

  function mappedPoint(event) {
    const x = event.clientX / innerWidth - 0.5;
    const y = event.clientY / innerHeight - 0.5;
    const k = curvature();
    const scale = (1 + k * (x * x + y * y)) / (1 + k * 0.25);
    return { x: (0.5 + x * scale) * innerWidth, y: (0.5 + y * scale) * innerHeight };
  }
  function targetAt(event) {
    const point = mappedPoint(event);
    const target = document.elementFromPoint(point.x, point.y);
    return target && activeRoot()?.contains(target) ? target.closest('button, a, input, select') : null;
  }
  function updateSlider(input, event) {
    const point = mappedPoint(event);
    const rect = input.getBoundingClientRect();
    // The thumb occupies 16 px; its centre travels inside the track ends.
    const fraction = Math.max(0, Math.min(1, (point.x - rect.left - 8) / Math.max(1, rect.width - 16)));
    const step = +input.step || 1, min = +input.min, max = +input.max;
    input.value = Math.max(min, Math.min(max, min + Math.round(fraction * (max - min) / step) * step));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  document.addEventListener('pointermove', (event) => {
    if (!ready || !enabled || !isMenu(activeRoot())) return;
    if (dragging) updateSlider(dragging, event);
    const target = targetAt(event);
    if (target === hovered) return;
    hovered?.classList.remove('crt-hover');
    hovered = target;
    hovered?.classList.add('crt-hover');
    document.body.style.cursor = target ? 'pointer' : '';
    invalidate();
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (!ready || !enabled || !isMenu(activeRoot()) || !event.isTrusted) return;
    const target = targetAt(event);
    if (target?.matches('input[type="range"]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      dragging = target; target.focus(); updateSlider(target, event);
    }
  }, true);
  document.addEventListener('pointerup', () => {
    if (dragging) { dragging.dispatchEvent(new Event('change', { bubbles: true })); dragging = null; }
  }, true);
  document.addEventListener('click', (event) => {
    if (!ready || !enabled || !isMenu(activeRoot()) || !event.isTrusted || event.detail === 0) return;
    const target = targetAt(event);
    if (target?.matches('select')) {
      // Keep native platform pickers, including their keyboard behavior.
      if (target === event.target) return;
      event.preventDefault(); event.stopImmediatePropagation();
      target.focus();
      try { target.showPicker(); } catch (_) {}
      return;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (target?.matches('input[type="range"]')) updateSlider(target, event);
    else { target?.focus(); target?.click(); }
  }, true);

  return {
    texture,
    mapPoint: mappedPoint,
    get ready() { return ready; },
    get isMenu() { return isMenu(activeRoot()); },
    get layer() { return activeRoot()?.id || null; },
    get visible() { return enabled && ready && !!activeRoot() && renderedRoot === activeRoot() && renderedView === (activeRoot()?.dataset.screen || ''); },
    update(now) {
      const root = activeRoot();
      if (observer.takeRecords().length) dirty = true;
      if (root !== previousRoot) {
        previousRoot = root;
        rootChangedAt = now;
        document.body.style.cursor = '';
        hovered?.classList.remove('crt-hover'); hovered = null;
        invalidate();
      }
      if (root?.id === 'end' && now - rootChangedAt < 20000 && now - lastCapture > 200) dirty = true;
      // HUD fades, the listening marker and the live radar animate at 30 Hz.
      // Menu interaction keeps its full-rate, change-driven updates.
      const interval = isMenu(root) ? 1000 / 60 : 1000 / 30;
      if (root && !isMenu(root)) dirty = true;
      if (enabled && root && dirty && !busy && (root !== renderedRoot || now - lastCapture >= interval - 1)) capture(root);
    },
  };
}
