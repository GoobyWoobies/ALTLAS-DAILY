// Image viewer with wheel / pinch / button zoom and drag-to-pan.
import { h, icon } from './dom.js';

const MAX_SCALE = 6;

export function createZoomImage({ src, alt }) {
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const img = h('img', { class: 'zi-img', src, alt, draggable: 'false' });
  const layer = h('div', { class: 'zi-layer' }, img);
  const view = h('div', { class: 'zi-view' }, layer);
  const el = h('div', { class: 'zi' }, view,
    h('div', { class: 'zi-tools' },
      h('button', { class: 'icon-btn', type: 'button', title: 'Zoom avant', 'aria-label': 'Zoom avant', onClick: () => zoomCenter(1.5) }, icon('plus')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onClick: () => zoomCenter(1 / 1.5) }, icon('minus')),
      h('button', { class: 'icon-btn', type: 'button', title: 'Réinitialiser', 'aria-label': 'Réinitialiser le zoom', onClick: () => set(1, 0, 0) }, icon('reset'))));

  // keep the whole image visible on screen: cap the height, keep the aspect ratio
  img.addEventListener('load', () => {
    const ar = img.naturalWidth / img.naturalHeight;
    view.style.aspectRatio = String(ar);
    el.style.maxWidth = `calc(var(--stage-max-h, 72vh) * ${ar.toFixed(4)})`;
  });
  // a missing or unreadable image is said plainly instead of leaving an empty frame
  img.addEventListener('error', () => {
    el.classList.add('zi-failed');
    view.append(h('p', { class: 'zi-error', role: 'alert' },
      'L\'image du relief n\'a pas pu être chargée. Vérifiez votre connexion puis rechargez la page.'));
  });

  function clamp() {
    const w = view.clientWidth;
    const hh = view.clientHeight;
    tx = Math.min(0, Math.max(w - w * scale, tx));
    ty = Math.min(0, Math.max(hh - hh * scale, ty));
  }
  function apply() {
    clamp();
    layer.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    el.classList.toggle('zoomed', scale > 1);
  }
  function set(s, x, y) {
    scale = s;
    tx = x;
    ty = y;
    apply();
  }
  function zoomAt(px, py, f) {
    const ns = Math.min(MAX_SCALE, Math.max(1, scale * f));
    const k = ns / scale;
    tx = px - (px - tx) * k;
    ty = py - (py - ty) * k;
    scale = ns;
    apply();
  }
  function zoomCenter(f) {
    zoomAt(view.clientWidth / 2, view.clientHeight / 2, f);
  }

  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = view.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.25 : 0.8);
  }, { passive: false });

  const pointers = new Map();
  let drag = null;
  let pinch = null;
  view.addEventListener('pointerdown', (e) => {
    try { view.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, tx, ty };
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: scale };
      drag = null;
    }
  });
  view.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = view.getBoundingClientRect();
      const target = pinch.s * (Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
      zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / scale);
    } else if (drag) {
      tx = drag.tx + (e.clientX - drag.x);
      ty = drag.ty + (e.clientY - drag.y);
      apply();
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) drag = null;
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
  view.addEventListener('dblclick', (e) => {
    const r = view.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, 2);
  });

  return { el, img, reset: () => set(1, 0, 0) };
}
