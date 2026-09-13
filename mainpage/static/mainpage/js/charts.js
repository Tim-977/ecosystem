/* Ecosystem — charts. Small, dependency-free SVG/canvas charts drawn with
   the design tokens, redrawn on resize and theme change. Every chart takes
   real series (null = no data) and renders gaps rather than inventing values. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const NS = 'http://www.w3.org/2000/svg';

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* colors */
  function parseColor(c) {
    const probe = document.createElement('span');
    probe.style.color = c;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    probe.remove();
    const m = rgb.match(/[\d.]+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  const cache = new Map();
  const rgbOf = (c) => { if (!cache.has(c)) cache.set(c, parseColor(c)); return cache.get(c); };
  document.addEventListener('eco:theme', () => cache.clear());
  function mix(a, b, t) {
    const x = rgbOf(a), y = rgbOf(b);
    return `rgb(${Math.round(x[0] + (y[0] - x[0]) * t)}, ${Math.round(x[1] + (y[1] - x[1]) * t)}, ${Math.round(x[2] + (y[2] - x[2]) * t)})`;
  }
  /* The user's activity colors, softened toward the surface so saturated picks stay calm. */
  const actMix = () => (parseFloat(css('--act-mix')) || 70) / 100;
  const tone = (hex) => mix(css('--bg-1'), hex, actMix());

  const el = (tag, attrs = {}, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    parent && parent.appendChild(n);
    return n;
  };

  /* Redraw on resize / theme switch without piling up observers. */
  function responsive(container, draw) {
    let w = 0;
    const run = (force) => {
      const nw = Math.round(container.clientWidth);
      if (!force && nw === w) return;
      w = nw;
      if (w > 0) draw(w, force === 'theme');
    };
    const ro = new ResizeObserver(() => run(false));
    ro.observe(container);
    document.addEventListener('eco:theme', () => run('theme'));
    run(true);
    return { redraw: () => run(true) };
  }

  /* monotone cubic interpolation → smooth path without overshoot */
  function smoothPath(pts) {
    if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
    const n = pts.length;
    const dx = [], dy = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
    }
    return d;
  }
  const segments = (values) => {
    const out = []; let cur = [];
    values.forEach((v, i) => { if (v === null || v === undefined || Number.isNaN(v)) { if (cur.length) out.push(cur); cur = []; } else cur.push(i); });
    if (cur.length) out.push(cur);
    return out;
  };

  let gradId = 0;

  /* ---------------- line / area ---------------- */
  function line(container, o) {
    const height = o.height || 220;
    const pad = { t: 14, r: 12, b: 26, l: o.yAxis === false ? 8 : 30, ...(o.pad || {}) };
    container.classList.add('chart');
    container.style.height = `${height}px`;
    let first = true;
    return responsive(container, (width) => {
      container.innerHTML = '';
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': o.label || 'Chart' }, container);
      const n = o.labels.length;
      const yMin = o.yMin ?? 0;
      const yMax = o.yMax ?? Math.max(1, ...o.series.flatMap((s) => s.values.filter((v) => v != null)));
      const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
      // band: points sit in the centre of equal slots, so the chart aligns with a bar chart below it
      const x = (i) => (o.band ? pad.l + (iw / n) * (i + 0.5) : pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw));
      const y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;

      const grid = el('g', { class: 'chart__grid' }, svg);
      const axis = el('g', { class: 'chart__axis' }, svg);
      (o.yTicks || [yMin, (yMin + yMax) / 2, yMax]).forEach((tv) => {
        el('line', { x1: pad.l, x2: width - pad.r, y1: Math.round(y(tv)) + 0.5, y2: Math.round(y(tv)) + 0.5 }, grid);
        if (o.yAxis !== false) { const t = el('text', { x: pad.l - 10, y: y(tv) + 3.5, 'text-anchor': 'end' }, axis); t.textContent = o.formatY ? o.formatY(tv) : tv; }
      });
      const every = o.xEvery || Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
      o.labels.forEach((lab, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        if (i === n - 1 && i % every !== 0 && (n - 1) % every < every * 0.6) return;
        const t = el('text', { x: x(i), y: height - 6, 'text-anchor': o.band ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }, axis);
        t.textContent = o.formatX ? o.formatX(lab, i) : lab;
      });
      (o.refLines || []).forEach((r) => {
        el('line', { class: 'chart__ref', x1: pad.l, x2: width - pad.r, y1: y(r.y), y2: y(r.y) }, svg);
        if (r.label) { const t = el('text', { class: 'chart__reflabel', x: width - pad.r, y: y(r.y) - 6, 'text-anchor': 'end' }, svg); t.textContent = r.label; }
      });

      const defs = el('defs', {}, svg);
      o.series.forEach((s) => {
        const color = s.color.startsWith('var(') ? css(s.color.slice(4, -1)) : s.color;
        const segs = segments(s.values);
        if (o.area !== false && s.area !== false) {
          const id = `g${++gradId}`;
          const g = el('linearGradient', { id, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
          el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': s.areaOpacity ?? 0.2 }, g);
          el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, g);
          segs.forEach((idx) => {
            if (idx.length < 2) return;
            const pts = idx.map((i) => [x(i), y(s.values[i])]);
            const d = `${smoothPath(pts)}L${pts[pts.length - 1][0]},${pad.t + ih}L${pts[0][0]},${pad.t + ih}Z`;
            el('path', { d, fill: `url(#${id})`, class: `chart__area${first && !Eco.reduceMotion() ? ' fade-in' : ''}` }, svg);
          });
        }
        segs.forEach((idx) => {
          const pts = idx.map((i) => [x(i), y(s.values[i])]);
          if (pts.length === 1) { el('circle', { cx: pts[0][0], cy: pts[0][1], r: 2.5, fill: color }, svg); return; }
          const p = el('path', { d: smoothPath(pts), stroke: color, class: 'chart__line', 'stroke-width': s.width || 1.75, 'stroke-dasharray': s.dashed ? '3 4' : undefined }, svg);
          if (first && !s.dashed && !Eco.reduceMotion()) { const len = p.getTotalLength(); p.style.setProperty('--len', len); p.classList.add('draw-in'); }
        });
      });

      // hover
      const cross = el('line', { class: 'chart__cross', y1: pad.t, y2: pad.t + ih, opacity: 0 }, svg);
      const dots = o.series.map((s) => el('circle', { r: 4, class: 'chart__dot', fill: s.color.startsWith('var(') ? css(s.color.slice(4, -1)) : s.color, opacity: 0 }, svg));
      const hit = el('rect', { x: pad.l, y: 0, width: iw, height, fill: 'transparent', style: o.onClick ? 'cursor:pointer' : '' }, svg);
      const idxAt = (evt) => { const r = svg.getBoundingClientRect(); const px = evt.clientX - r.left - pad.l; return clamp(o.band ? Math.floor(px / (iw / n)) : Math.round((px / iw) * (n - 1)), 0, n - 1); };
      hit.addEventListener('pointermove', (evt) => {
        const i = idxAt(evt);
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('opacity', 1);
        o.series.forEach((s, k) => { const v = s.values[i]; if (v == null) dots[k].setAttribute('opacity', 0); else { dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('opacity', 1); } });
        if (o.tooltip) { const r = svg.getBoundingClientRect(); Eco.chartTip.show(o.tooltip(i), r.left + x(i), r.top + pad.t + Math.min(...o.series.map((s) => (s.values[i] == null ? ih : y(s.values[i]) - pad.t)))); }
      });
      hit.addEventListener('pointerleave', () => { cross.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); Eco.chartTip.hide(); });
      o.onClick && hit.addEventListener('click', (evt) => o.onClick(idxAt(evt)));
      first = false;
    });
  }

  /* ---------------- vertical bars ---------------- */
  function bars(container, o) {
    const height = o.height || 180;
    const pad = { t: 14, r: 8, b: 26, l: o.yAxis === false ? 4 : 30, ...(o.pad || {}) };
    container.classList.add('chart');
    container.style.height = `${height}px`;
    let first = true;
    return responsive(container, (width) => {
      container.innerHTML = '';
      const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': o.label || 'Bar chart' }, container);
      const n = o.values.length;
      const yMax = o.yMax ?? Math.max(1, ...o.values.filter((v) => v != null));
      const iw = width - pad.l - pad.r, ih = height - pad.t - pad.b;
      const slot = iw / n, bw = Math.max(2, Math.min(o.maxBar || 22, slot * (o.fill || 0.62)));
      const y = (v) => pad.t + ih - (v / yMax) * ih;
      const grid = el('g', { class: 'chart__grid' }, svg);
      const axis = el('g', { class: 'chart__axis' }, svg);
      (o.yTicks || [0, yMax / 2, yMax]).forEach((tv) => {
        el('line', { x1: pad.l, x2: width - pad.r, y1: Math.round(y(tv)) + 0.5, y2: Math.round(y(tv)) + 0.5 }, grid);
        if (o.yAxis !== false) { const t = el('text', { x: pad.l - 10, y: y(tv) + 3.5, 'text-anchor': 'end' }, axis); t.textContent = o.formatY ? o.formatY(tv) : tv; }
      });
      const every = o.xEvery || Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 44))));
      const color = (i) => { const c = typeof o.color === 'function' ? o.color(o.values[i], i) : o.color; return c.startsWith('var(') ? css(c.slice(4, -1)) : c; };
      const group = el('g', {}, svg);
      o.values.forEach((v, i) => {
        const cx = pad.l + slot * i + slot / 2;
        if (i % every === 0 || i === n - 1) { const t = el('text', { x: cx, y: height - 6, 'text-anchor': 'middle' }, axis); t.textContent = o.formatX ? o.formatX(o.labels[i], i) : o.labels[i]; }
        if (v == null || v <= 0) { el('rect', { x: cx - bw / 2, y: pad.t + ih - 2, width: bw, height: 2, rx: 1, fill: css('--bg-4') }, group); return; }
        const top = y(v), h = pad.t + ih - top, r = Math.min(4, bw / 2, h);
        const d = `M${cx - bw / 2},${pad.t + ih}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${pad.t + ih}Z`;
        const p = el('path', { d, fill: color(i), class: first && !Eco.reduceMotion() ? 'grow-up' : '' }, group);
        if (first) p.style.animationDelay = `${Math.min(400, i * 12)}ms`;
      });
      (o.refLines || []).forEach((r) => {
        el('line', { class: 'chart__ref', x1: pad.l, x2: width - pad.r, y1: y(r.y), y2: y(r.y) }, svg);
        if (r.label) { const t = el('text', { class: 'chart__reflabel', x: width - pad.r, y: y(r.y) - 6, 'text-anchor': 'end' }, svg); t.textContent = r.label; }
      });
      const hl = el('rect', { y: pad.t, height: ih, width: slot, rx: 6, fill: css('--fg-1'), opacity: 0 }, svg);
      svg.insertBefore(hl, group);
      const hit = el('rect', { x: pad.l, y: 0, width: iw, height, fill: 'transparent', style: o.onClick ? 'cursor:pointer' : '' }, svg);
      const idxAt = (evt) => { const r = svg.getBoundingClientRect(); return clamp(Math.floor((evt.clientX - r.left - pad.l) / slot), 0, n - 1); };
      hit.addEventListener('pointermove', (evt) => {
        const i = idxAt(evt);
        hl.setAttribute('x', pad.l + slot * i); hl.setAttribute('opacity', 0.04);
        if (o.tooltip) { const r = svg.getBoundingClientRect(); Eco.chartTip.show(o.tooltip(i), r.left + pad.l + slot * i + slot / 2, r.top + (o.values[i] ? y(o.values[i]) : pad.t + ih)); }
      });
      hit.addEventListener('pointerleave', () => { hl.setAttribute('opacity', 0); Eco.chartTip.hide(); });
      o.onClick && hit.addEventListener('click', (evt) => o.onClick(idxAt(evt)));
      first = false;
    });
  }

  /* ---------------- sparkline ---------------- */
  function spark(container, values, o = {}) {
    const w = o.width || 84, h = o.height || 22;
    const vals = values.map((v) => (v == null ? null : +v));
    const real = vals.filter((v) => v != null);
    container.innerHTML = '';
    if (real.length < 2) return;
    const min = o.min ?? Math.min(...real), max = o.max ?? Math.max(...real);
    const span = max - min || 1;
    const n = vals.length;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h, 'aria-hidden': 'true', preserveAspectRatio: 'none' }, container);
    const color = o.color && o.color.startsWith('var(') ? css(o.color.slice(4, -1)) : (o.color || css('--fg-2'));
    segments(vals).forEach((idx) => {
      const pts = idx.map((i) => [(i / (n - 1)) * (w - 2) + 1, h - 2 - ((vals[i] - min) / span) * (h - 4)]);
      if (pts.length === 1) { el('circle', { cx: pts[0][0], cy: pts[0][1], r: 1.2, fill: color }, svg); return; }
      el('path', { d: smoothPath(pts), fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }, svg);
    });
  }

  /* ---------------- calendar heatmap (weeks × weekdays) ---------------- */
  function calendar(container, o) {
    const gap = o.gap || 3;
    container.classList.add('chart');
    let cells = [];
    const start = new Date(o.start); start.setHours(0, 0, 0, 0);
    const end = new Date(o.end); end.setHours(0, 0, 0, 0);
    const first = new Date(start); first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    const weeks = Math.ceil(((end - first) / 86400000 + 1) / 7);
    const left = o.dayLabels === false ? 0 : 28, top = 18;
    const draw = (width) => {
      container.innerHTML = '';
      const cell = Math.max(6, Math.min(o.maxCell || 16, Math.floor((width - left - gap * (weeks - 1)) / weeks)));
      const w = left + weeks * cell + gap * (weeks - 1);
      const height = top + 7 * cell + 6 * gap;
      const svg = el('svg', { viewBox: `0 0 ${w} ${height}`, width: w, height, role: 'img', 'aria-label': o.label || 'Calendar heatmap', style: `width:${w}px;height:${height}px` }, container);
      const axis = el('g', { class: 'chart__axis' }, svg);
      if (left) ['Mon', '', 'Wed', '', 'Fri', '', ''].forEach((d, i) => { if (!d) return; const t = el('text', { x: 0, y: top + i * (cell + gap) + cell / 2 + 3.5 }, axis); t.textContent = d; });
      const empty = css('--empty-cell');
      const g = el('g', {}, svg);
      let lastMonth = -1;
      cells = [];
      for (let wk = 0; wk < weeks; wk++) {
        for (let wd = 0; wd < 7; wd++) {
          const d = new Date(first); d.setDate(first.getDate() + wk * 7 + wd);
          if (d < start || d > end) continue;
          if (d.getMonth() !== lastMonth && wd === 0 && (wk > 0 || d.getDate() <= 7)) {
            const t = el('text', { x: left + wk * (cell + gap), y: 10 }, axis);
            t.textContent = Eco.fmt(d, { month: 'short' });
            lastMonth = d.getMonth();
          }
          const v = o.value(d);
          const r = el('rect', { x: left + wk * (cell + gap), y: top + wd * (cell + gap), width: cell, height: cell, rx: Math.min(3.5, cell / 3.5), fill: v == null ? empty : o.color(v) }, g);
          r.style.transition = 'fill 260ms var(--ease-out)';
          cells.push([r, d, v]);
        }
      }
      g.addEventListener('pointermove', (evt) => {
        const c = cells.find((x) => x[0] === evt.target);
        if (!c) { Eco.chartTip.hide(); return; }
        const b = c[0].getBoundingClientRect();
        Eco.chartTip.show(o.tooltip(c[1], c[2]), b.left + b.width / 2, b.top);
      });
      g.addEventListener('pointerleave', () => Eco.chartTip.hide());
      if (o.onClick) { g.style.cursor = 'pointer'; g.addEventListener('click', (evt) => { const c = cells.find((x) => x[0] === evt.target); c && o.onClick(c[1], c[2]); }); }
    };
    const api = responsive(container, draw);
    return {
      recolor(value, color, tooltip) {
        o.value = value; o.color = color; if (tooltip) o.tooltip = tooltip;
        const empty = css('--empty-cell');
        cells.forEach((c) => { const v = value(c[1]); c[2] = v; c[0].setAttribute('fill', v == null ? empty : color(v)); });
      },
      redraw: api.redraw,
    };
  }

  /* ---------------- matrix on canvas (columns × rows) ---------------- */
  function matrix(container, o) {
    container.classList.add('chart', 'matrix');
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', o.label || 'Activity matrix');
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const padL = o.rowAxis === false ? 0 : 30, padB = o.colAxis === false ? 0 : 20;
    let geo = null;
    const draw = (width) => {
      const cols = o.cols, rows = o.rows;
      const gap = o.gap ?? 2;
      const cw = (width - padL - gap * (cols - 1)) / cols;
      const ch = o.cellHeight || Math.max(4, cw * 0.5);
      const height = rows * ch + gap * (rows - 1) + padB;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const empty = css('--empty-cell'), none = css('--bg-3');
      const radius = Math.min(o.radius ?? 3, cw / 2.5, ch / 2.5);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const info = o.cell(c, r);
          const x = padL + c * (cw + gap), y = r * (ch + gap);
          ctx.fillStyle = info && info.color ? (info.raw ? info.color : tone(info.color)) : info && info.unknown ? none : empty;
          if (radius >= 1 && ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, cw, ch, radius); ctx.fill(); }
          else ctx.fillRect(x, y, cw, ch);
        }
      }
      ctx.fillStyle = css('--fg-4');
      ctx.font = `10px ${css('--font-mono')}`;
      ctx.textBaseline = 'middle';
      if (o.rowAxis !== false) (o.rowTicks || []).forEach((r) => { ctx.textAlign = 'left'; ctx.fillText(o.rowLabel(r), 0, r * (ch + gap) + ch / 2); });
      if (o.colAxis !== false) {
        ctx.textBaseline = 'alphabetic';
        (o.colTicks || []).forEach((c) => { ctx.textAlign = 'center'; ctx.fillText(o.colLabel(c), padL + c * (cw + gap) + cw / 2, height - 5); });
      }
      geo = { cw, ch, gap, cols, rows, height };
    };
    const api = responsive(container, (w) => draw(w));
    canvas.addEventListener('pointermove', (evt) => {
      if (!geo) return;
      const r = canvas.getBoundingClientRect();
      const x = evt.clientX - r.left - padL, y = evt.clientY - r.top;
      const c = Math.floor(x / (geo.cw + geo.gap)), row = Math.floor(y / (geo.ch + geo.gap));
      if (c < 0 || c >= geo.cols || row < 0 || row >= geo.rows || !o.tooltip) { Eco.chartTip.hide(); canvas.style.cursor = ''; return; }
      canvas.style.cursor = o.onClick ? 'pointer' : 'crosshair';
      Eco.chartTip.show(o.tooltip(c, row), r.left + padL + c * (geo.cw + geo.gap) + geo.cw / 2, r.top + row * (geo.ch + geo.gap));
    });
    canvas.addEventListener('pointerleave', () => Eco.chartTip.hide());
    if (o.onClick) canvas.addEventListener('click', (evt) => {
      const r = canvas.getBoundingClientRect();
      const c = Math.floor((evt.clientX - r.left - padL) / (geo.cw + geo.gap));
      const row = Math.floor((evt.clientY - r.top) / (geo.ch + geo.gap));
      if (c >= 0 && c < geo.cols && row >= 0 && row < geo.rows) o.onClick(c, row);
    });
    return api;
  }

  /* ---------------- progress ring ---------------- */
  function ring(svgCircle, pct) {
    const r = +svgCircle.getAttribute('r');
    const C = 2 * Math.PI * r;
    svgCircle.setAttribute('stroke-dasharray', C.toFixed(2));
    svgCircle.style.strokeDashoffset = C;
    requestAnimationFrame(() => requestAnimationFrame(() => { svgCircle.style.strokeDashoffset = C * (1 - clamp(pct, 0, 1)); }));
  }

  Eco.charts = { line, bars, spark, calendar, matrix, ring, tone, mix, css };

  /* tooltip row helper */
  Eco.tt = (title, rows) => `<div class="tt-title">${Eco.esc(title)}</div>${rows.map((r) => `<div class="tt-row">${r.color ? `<span class="dot" style="background:${r.color}"></span>` : ''}<span>${Eco.esc(r.label)}</span><b>${Eco.esc(r.value)}</b></div>`).join('')}`;

  /* shared number helpers for analytics pages */
  Eco.stats = {
    avg(values) { const v = values.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; },
    fmt(v, d = 1) { return v == null ? '–' : (+v).toFixed(d).replace(/\.0+$/, ''); },
    hours(h) { if (h == null) return '–'; const m = Math.round(h * 60); return `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}m` : ''}`; },
  };
})();
