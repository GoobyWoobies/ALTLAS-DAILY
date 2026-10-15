// Draws a set of flat rings as one SVG shape fitted to its own bounding box.
import { s } from './dom.js';

export function ringsToPath(rings, digits = 4) {
  let d = '';
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      d += `${i ? 'L' : 'M'}${r[i].toFixed(digits)} ${r[i + 1].toFixed(digits)}`;
    }
    d += 'Z';
  }
  return d;
}

export function bboxOf(rings) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i += 2) {
      x0 = Math.min(x0, r[i]);
      x1 = Math.max(x1, r[i]);
      y0 = Math.min(y0, r[i + 1]);
      y1 = Math.max(y1, r[i + 1]);
    }
  }
  return [x0, y0, x1, y1];
}

/** Returns {el, update(rings)}; the viewBox always fits the current shape. */
export function createSilhouette({ className = 'sil', label = 'Silhouette' } = {}) {
  const path = s('path', { class: 'sil-shape', 'fill-rule': 'evenodd' });
  const el = s('svg', { class: className, role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' }, path);
  return {
    el,
    update(rings) {
      const [x0, y0, x1, y1] = bboxOf(rings);
      const span = Math.max(x1 - x0, y1 - y0) || 1;
      const pad = span * 0.06;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const half = span / 2 + pad;
      el.setAttribute('viewBox', `${cx - half} ${cy - half} ${2 * half} ${2 * half}`);
      path.setAttribute('d', ringsToPath(rings));
    },
  };
}
