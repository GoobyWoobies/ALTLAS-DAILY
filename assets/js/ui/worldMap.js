// Interactive world map (SVG, Equal Earth projection, Natural Earth outlines).
// Supports wheel / pinch / button zoom, drag to pan, and click-to-pick.
import { s, h, clear, icon } from './dom.js';
import { equalEarth, equalEarthInverse } from '../core/geo.js';
import { getWorld, getRelief, reliefTileUrl } from '../core/data.js';

const K = 100; // projection units -> SVG units
const LAT_TOP = 84;
const LAT_BOTTOM = -58;
const MAX_ZOOM = 150;

function project(lon, lat) {
  const [x, y] = equalEarth(lon, lat);
  return [x * K, -y * K];
}

function ringPath(r) {
  let d = '';
  for (let i = 0; i < r.length; i += 2) {
    const [x, y] = project(r[i], r[i + 1]);
    d += `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

function linePath(points) {
  return points.map(([lon, lat], i) => {
    const [x, y] = project(lon, lat);
    return `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join('');
}

let mapCount = 0; // unique ids for each map's clip path
let pathsPromise = null;
/** Pre-computed SVG path data, shared by every map instance. */
function getPaths() {
  pathsPromise ??= getWorld().then((world) => {
    const byId = new Map();
    let other = '';
    for (const f of world) {
      let d = '';
      for (const poly of f.p) for (const ring of poly) d += ringPath(ring);
      if (f.id) byId.set(f.id, (byId.get(f.id) || '') + d);
      else other += d;
    }
    // graticule every 30°
    let grat = '';
    for (let lon = -150; lon <= 150; lon += 30) {
      const pts = [];
      for (let lat = -90; lat <= 90; lat += 5) pts.push([lon, lat]);
      grat += linePath(pts);
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lon = -180; lon <= 180; lon += 5) pts.push([lon, lat]);
      grat += linePath(pts);
    }
    const edge = [];
    for (let lat = -90; lat <= 90; lat += 2) edge.push([-180, lat]);
    for (let lat = 90; lat >= -90; lat -= 2) edge.push([180, lat]);
    const sphere = `${linePath(edge)}Z`;
    return { byId, other, grat, sphere };
  });
  pathsPromise.catch(() => {
    pathsPromise = null; // let the next map try again
  });
  return pathsPromise;
}

const STYLE_KEY = 'atlas-daily:map-style';
function savedStyle() {
  try {
    return localStorage.getItem(STYLE_KEY);
  } catch {
    return null;
  }
}

/**
 * @param {object} o
 * @param {(p: {lat:number, lon:number}) => void} [o.onPick]  click handler (interactive maps)
 * @param {string} [o.label]  accessible label
 * @param {boolean} [o.borders]  draw country borders (plan style)
 * @param {boolean} [o.relief]  offer the shaded relief background, on by default
 * @param {Node} [o.actions]  controls shown over the map while it is enlarged (interactive maps)
 */
export function createWorldMap({ onPick = null, label = 'Carte du monde', borders = true, relief = false, actions = null } = {}) {
  const [xMax] = project(180, 0);
  const [, yTop] = project(0, LAT_TOP);
  const [, yBottom] = project(0, LAT_BOTTOM);
  const full = { x: -xMax - 4, y: yTop - 4, w: 2 * xMax + 8, h: yBottom - yTop + 8 };
  let vb = { ...full };
  let interactive = Boolean(onPick);
  let overlays = []; // {kind, ...}
  const countryEls = new Map();
  let highlighted = { ids: [], cls: 'wm-hl' }; // re-applied once the paths are loaded

  const svg = s('svg', {
    class: 'wm-svg',
    viewBox: `${full.x} ${full.y} ${full.w} ${full.h}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': label,
  });
  const gReliefLow = s('g', { class: 'wm-relief-low' });
  const gReliefHigh = s('g', { class: 'wm-relief-high' });
  const gBase = s('g', { class: 'wm-base' });
  const gOver = s('g', { class: 'wm-over' });
  // the map covers latitudes LAT_BOTTOM..LAT_TOP: when the box is taller than that,
  // outlines and graticule are cut at the same edge as the relief background
  const clipId = `wm-clip-${++mapCount}`;
  svg.append(s('defs', null, s('clipPath', { id: clipId }, s('rect', { x: full.x, y: yTop, width: full.w, height: yBottom - yTop }))));
  gBase.setAttribute('clip-path', `url(#${clipId})`);
  svg.append(gReliefLow, gReliefHigh, gBase, gOver);
  let reliefOn = relief && savedStyle() !== 'plan';
  let reliefManifest = null;

  const zoomBtns = h('div', { class: 'wm-zoom' },
    h('button', { class: 'icon-btn', type: 'button', title: 'Zoom avant', 'aria-label': 'Zoom avant', onClick: () => zoomCenter(0.6) }, icon('plus')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Zoom arrière', 'aria-label': 'Zoom arrière', onClick: () => zoomCenter(1 / 0.6) }, icon('minus')),
    h('button', { class: 'icon-btn', type: 'button', title: 'Vue entière', 'aria-label': 'Vue entière', onClick: () => reset() }, icon('reset')),
    onPick ? h('button', { class: 'icon-btn wm-expand', type: 'button', title: 'Agrandir la carte', 'aria-label': 'Agrandir la carte', 'aria-pressed': 'false', onClick: () => setExpanded(!expanded) }, icon('expand')) : null);
  const kbdHelp = h('p', { class: 'wm-kbd', 'aria-hidden': 'true' }, 'Flèches : déplacer · Entrée : placer · + / − : zoom');
  const credit = h('p', { class: 'wm-credit' }, 'Relief : AWS Terrain Tiles, Natural Earth');
  const styleBtns = relief
    ? h('div', { class: 'wm-style', role: 'group', 'aria-label': 'Fond de carte' },
      ['relief', 'plan'].map((st) => h('button', {
        type: 'button', 'data-style': st, 'aria-pressed': 'false',
        onClick: () => setRelief(st === 'relief', true),
      }, st === 'relief' ? 'Relief' : 'Plan')))
    : null;
  // proportions come from the stylesheet (.wm), so a screen can make its map taller
  const el = h('div', { class: `wm${interactive ? ' wm-interactive' : ''}${borders ? '' : ' wm-noborders'}` }, svg, zoomBtns, kbdHelp, relief ? credit : null, styleBtns,
    actions ? h('div', { class: 'wm-actions' }, actions) : null);
  let expanded = false;

  // enlarged view: the map fills the window (Escape or the same button to leave)
  function setExpanded(on) {
    expanded = on;
    el.classList.toggle('wm-expanded', on);
    document.documentElement.classList.toggle('wm-lock', on);
    const btn = zoomBtns.querySelector('.wm-expand');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? 'Réduire la carte' : 'Agrandir la carte';
      btn.setAttribute('aria-label', btn.title);
      btn.replaceChildren(icon(on ? 'shrink' : 'expand'));
    }
    if (on) document.addEventListener('keydown', onEscape);
    else document.removeEventListener('keydown', onEscape);
  }
  function onEscape(e) {
    if (e.key === 'Escape' || !el.isConnected) setExpanded(false);
  }
  let cursor = null; // keyboard cursor {lat, lon}

  function setKeyboard(on) {
    if (on) {
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('role', 'application');
      svg.setAttribute('aria-label', `${label}. Flèches pour déplacer le curseur, Entrée pour placer, plus et moins pour zoomer.`);
    } else {
      svg.removeAttribute('tabindex');
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', label);
      cursor = null;
    }
  }
  setKeyboard(interactive);

  svg.addEventListener('keydown', (e) => {
    if (!interactive || !onPick) return;
    const moves = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (moves[e.key]) {
      e.preventDefault();
      if (!cursor) {
        const c = equalEarthInverse((vb.x + vb.w / 2) / K, -(vb.y + vb.h / 2) / K) || [0, 20];
        cursor = { lon: c[0], lat: c[1] };
      }
      const step = vb.w * 0.025 * (180 / Math.PI) / K * (e.shiftKey ? 4 : 1);
      const [dx, dy] = moves[e.key];
      cursor = {
        lon: Math.max(-180, Math.min(180, cursor.lon + dx * step)),
        lat: Math.max(LAT_BOTTOM, Math.min(LAT_TOP, cursor.lat + dy * step)),
      };
      // keep the cursor in view
      const [cx, cy] = project(cursor.lon, cursor.lat);
      if (cx < vb.x || cx > vb.x + vb.w || cy < vb.y || cy > vb.y + vb.h) {
        vb = { ...vb, x: cx - vb.w / 2, y: cy - vb.h / 2 };
        clampVB();
        applyVB();
      } else {
        drawOverlays();
      }
    } else if ((e.key === 'Enter' || e.key === ' ') && cursor) {
      e.preventDefault();
      e.stopPropagation();
      onPick({ ...cursor });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomCenter(0.6);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomCenter(1 / 0.6);
    }
  });

  // shown over the map when a layer cannot be loaded
  const notice = h('p', { class: 'wm-notice', role: 'status', hidden: true });
  el.append(notice);
  function showNotice(text) {
    notice.textContent = text;
    notice.hidden = false;
  }

  getPaths().then(({ byId, other, grat, sphere }) => {
    gBase.append(s('path', { class: 'wm-sphere', d: sphere }));
    gBase.append(s('path', { class: 'wm-grat', d: grat }));
    gBase.append(s('path', { class: 'wm-land wm-other', d: other }));
    for (const [id, d] of byId) {
      const p = s('path', { class: 'wm-land', d, 'data-id': id });
      countryEls.set(id, p);
      if (highlighted.ids.includes(id)) p.classList.add(highlighted.cls);
      gBase.append(p);
    }
    drawOverlays();
  }).catch(() => {
    showNotice('Les contours des pays n\'ont pas pu être chargés. Vérifiez votre connexion puis rechargez la page.');
  });

  // ------------------------------------------------------------------ relief
  // Tiles are pre-rendered in the same Equal Earth frame (tools/build_relief_map.py).
  // Level 0 always covers the whole map; one sharper level is added for the view.
  function reliefTile(level, li, key) {
    const [c, r] = key.split('_').map(Number);
    const { extent, tile } = reliefManifest;
    const unitsPerTilePx = (extent.x1 - extent.x0) / level.w;
    const wpx = Math.min(tile, level.w - c * tile);
    const hpx = Math.min(tile, level.h - r * tile);
    return s('image', {
      href: reliefTileUrl(li, key),
      x: extent.x0 + c * tile * unitsPerTilePx,
      y: extent.y0 + r * tile * unitsPerTilePx,
      // a hair of overlap hides seams between tiles
      width: wpx * unitsPerTilePx + 0.02,
      height: hpx * unitsPerTilePx + 0.02,
      preserveAspectRatio: 'none',
      'data-key': `${li}/${key}`,
    });
  }

  function updateRelief() {
    if (!reliefOn || !reliefManifest) return;
    const { extent, levels, tile } = reliefManifest;
    const extW = extent.x1 - extent.x0;
    if (!gReliefLow.firstChild) {
      for (const key of levels[0].tiles) gReliefLow.append(reliefTile(levels[0], 0, key));
    }
    const needPxPerUnit = (1 / unitsPerPx()) * (window.devicePixelRatio || 1);
    let li = levels.findIndex((L) => L.w / extW >= needPxPerUnit);
    if (li < 0) li = levels.length - 1;
    const want = new Set();
    if (li > 0) {
      const L = levels[li];
      const tu = (tile * extW) / L.w; // tile size in SVG units
      const have = L._set ??= new Set(L.tiles);
      const c0 = Math.max(0, Math.floor((vb.x - extent.x0) / tu));
      const c1 = Math.min(L.cols - 1, Math.floor((vb.x + vb.w - extent.x0) / tu));
      const r0 = Math.max(0, Math.floor((vb.y - extent.y0) / tu));
      const r1 = Math.min(L.rows - 1, Math.floor((vb.y + vb.h - extent.y0) / tu));
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          if (have.has(`${c}_${r}`)) want.add(`${li}/${c}_${r}`);
        }
      }
    }
    for (const img of [...gReliefHigh.children]) {
      if (!want.has(img.dataset.key)) img.remove();
      else want.delete(img.dataset.key);
    }
    for (const k of want) {
      const [l, key] = k.split('/');
      gReliefHigh.append(reliefTile(levels[Number(l)], Number(l), key));
    }
  }

  let reliefFailed = false;
  function setRelief(on, remember = false) {
    reliefOn = relief && on && !reliefFailed;
    el.classList.toggle('wm-relief', reliefOn);
    styleBtns?.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', String((b.dataset.style === 'relief') === reliefOn)));
    if (remember) {
      try {
        localStorage.setItem(STYLE_KEY, reliefOn ? 'relief' : 'plan');
      } catch {
        /* preference only */
      }
    }
    if (!reliefOn) {
      clear(gReliefLow);
      clear(gReliefHigh);
      return;
    }
    getRelief().then((m) => {
      reliefManifest = m;
      updateRelief();
    }).catch(() => {
      // keep the game playable on the plan map, and say why the relief is missing
      reliefFailed = true;
      setRelief(false);
      const btn = styleBtns?.querySelector('[data-style="relief"]');
      if (btn) {
        btn.disabled = true;
        btn.title = 'Fond de relief indisponible';
      }
      showNotice('Fond de relief indisponible : carte affichée en mode Plan.');
    });
  }
  setRelief(reliefOn);
  if (typeof ResizeObserver !== 'undefined') {
    // the box can change shape (layout, enlarged view): keep the same centre and scale
    const ro = new ResizeObserver(() => {
      if (!el.isConnected) return ro.disconnect(); // the map left the page
      const cx = vb.x + vb.w / 2;
      const cy = vb.y + vb.h / 2;
      clampVB();
      vb.x = cx - vb.w / 2;
      vb.y = cy - vb.h / 2;
      clampVB();
      applyVB();
    });
    ro.observe(svg);
  }

  // ---------------------------------------------------------------- view box
  // The view box follows the shape of the box on screen, so the map fills it
  // whatever its proportions (wide on desktop, square on a phone, full window).
  function aspect() {
    const r = svg.getBoundingClientRect();
    return r.width && r.height ? r.height / r.width : full.h / full.w;
  }

  /** Widest view: the whole world fits in the box. */
  function maxW(a = aspect()) {
    return Math.max(full.w, full.h / a);
  }

  function applyVB() {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    drawOverlays();
    updateRelief();
  }

  function clampVB() {
    const a = aspect();
    vb.w = Math.min(maxW(a), Math.max(full.w / MAX_ZOOM, vb.w));
    vb.h = vb.w * a;
    // centred when the view is larger than the world, kept inside it otherwise
    vb.x = vb.w >= full.w ? full.x + (full.w - vb.w) / 2 : Math.min(full.x + full.w - vb.w, Math.max(full.x, vb.x));
    vb.y = vb.h >= full.h ? full.y + (full.h - vb.h) / 2 : Math.min(full.y + full.h - vb.h, Math.max(full.y, vb.y));
  }

  function zoomAt(px, py, f) {
    const w = Math.min(maxW(), Math.max(full.w / MAX_ZOOM, vb.w * f));
    const k = w / vb.w;
    vb = { x: px - (px - vb.x) * k, y: py - (py - vb.y) * k, w, h: vb.h * k };
    clampVB();
    applyVB();
  }

  function zoomCenter(f) {
    zoomAt(vb.x + vb.w / 2, vb.y + vb.h / 2, f);
  }

  function reset() {
    vb = { ...full, w: Infinity };
    clampVB();
    applyVB();
  }

  /** SVG units per CSS pixel. */
  function unitsPerPx() {
    const r = svg.getBoundingClientRect();
    return r.width ? Math.max(vb.w / r.width, vb.h / r.height) : vb.w / 800;
  }

  function clientToSvg(cx, cy) {
    const r = svg.getBoundingClientRect();
    const u = unitsPerPx();
    // preserveAspectRatio "meet": content is centred in the element
    const offX = (r.width - vb.w / u) / 2;
    const offY = (r.height - vb.h / u) / 2;
    return [vb.x + (cx - r.left - offX) * u, vb.y + (cy - r.top - offY) * u];
  }

  // ------------------------------------------------------------ interaction
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = clientToSvg(e.clientX, e.clientY);
    zoomAt(x, y, e.deltaY < 0 ? 0.8 : 1.25);
  }, { passive: false });

  svg.addEventListener('pointerdown', (e) => {
    try { svg.setPointerCapture(e.pointerId); } catch { /* synthetic or already released pointer */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { x: e.clientX, y: e.clientY, vb: { ...vb }, moved: false };
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), w: vb.w };
      drag = null;
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const [mx, my] = clientToSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      zoomAt(mx, my, (pinch.w * (pinch.dist / d)) / vb.w);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    el.classList.add('wm-dragging');
    const u = unitsPerPx();
    vb = { ...drag.vb, x: drag.vb.x - dx * u, y: drag.vb.y - dy * u };
    clampVB();
    applyVB();
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && e.type === 'pointerup' && interactive && onPick) {
      const [x, y] = clientToSvg(e.clientX, e.clientY);
      const ll = equalEarthInverse(x / K, -y / K);
      if (ll) onPick({ lon: ll[0], lat: ll[1] });
    }
    if (pointers.size === 0) {
      drag = null;
      el.classList.remove('wm-dragging');
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);

  // --------------------------------------------------------------- overlays
  function drawOverlays() {
    clear(gOver);
    const u = unitsPerPx();
    for (const o of overlays) {
      if (o.kind === 'bbox') {
        const [w, so, e, n] = o.bbox;
        const pts = [];
        for (let i = 0; i <= 16; i++) pts.push([w + ((e - w) * i) / 16, n]);
        for (let i = 0; i <= 16; i++) pts.push([e, n - ((n - so) * i) / 16]);
        for (let i = 0; i <= 16; i++) pts.push([e - ((e - w) * i) / 16, so]);
        for (let i = 0; i <= 16; i++) pts.push([w, so + ((n - so) * i) / 16]);
        gOver.append(s('path', { class: 'wm-bbox', d: `${linePath(pts)}Z` }));
      } else if (o.kind === 'line') {
        const [x1, y1] = project(o.a.lon, o.a.lat);
        const [x2, y2] = project(o.b.lon, o.b.lat);
        gOver.append(s('line', { class: 'wm-line', x1, y1, x2, y2 }));
      } else if (o.kind === 'marker') {
        const [x, y] = project(o.lon, o.lat);
        gOver.append(s('circle', { class: `wm-marker wm-marker-${o.style}`, cx: x, cy: y, r: (o.style === 'ring' ? 9 : 5.5) * u }));
      }
    }
    if (cursor && interactive) {
      const [x, y] = project(cursor.lon, cursor.lat);
      gOver.append(s('circle', { class: 'wm-marker wm-marker-cursor', cx: x, cy: y, r: 10 * u }));
    }
  }

  function setOverlays(list) {
    overlays = list;
    drawOverlays();
  }

  return {
    el,
    reset,
    setInteractive(on) {
      interactive = on;
      el.classList.toggle('wm-interactive', on);
      setKeyboard(on && Boolean(onPick));
      drawOverlays();
    },
    /** overlays: [{kind:'marker', lat, lon, style:'guess'|'target'|'ring'}, {kind:'line', a, b}, {kind:'bbox', bbox}] */
    setOverlays,
    setExpanded: (on) => expanded !== on && setExpanded(on),
    highlight(ids = [], cls = 'wm-hl') {
      highlighted = { ids, cls };
      for (const p of countryEls.values()) p.classList.remove('wm-hl', 'wm-hl2');
      for (const id of ids) countryEls.get(id)?.classList.add(cls);
    },
    /** Frame a lon/lat box (w, s, e, n), with a minimum span so small areas keep context. */
    focus(bbox, minSpanDeg = 30) {
      let [w, so, e, n] = bbox;
      const cx = (w + e) / 2;
      const cy = (so + n) / 2;
      const hw = Math.max((e - w) / 2, minSpanDeg / 2);
      const hh = Math.max((n - so) / 2, minSpanDeg / 4);
      w = cx - hw; e = cx + hw; so = cy - hh; n = cy + hh;
      const pts = [[w, so], [w, n], [e, so], [e, n], [cx, so], [cx, n], [w, cy], [e, cy]].map(([lo, la]) =>
        project(Math.max(-180, Math.min(180, lo)), Math.max(-89, Math.min(89, la))));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const bw = Math.max(...xs) - Math.min(...xs);
      const bh = Math.max(...ys) - Math.min(...ys);
      const a = aspect();
      const wv = Math.max(bw, bh / a) * 1.25;
      vb = { x: (Math.min(...xs) + Math.max(...xs)) / 2 - wv / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 - (wv * a) / 2, w: wv, h: wv * a };
      clampVB();
      applyVB();
    },
  };
}
