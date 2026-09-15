/* Ecosystem — homepage. Wires the effects and runs the small interactive
   demos of the real product: painting a day, checking off habits, and
   coloring a year. Demo data is illustrative and generated on the client. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$, esc } = Eco;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => Eco.reduceMotion();

  /* seeded random so the demo looks the same on every visit */
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* run fn once, the first time el is mostly on screen */
  function onceVisible(el, fn, threshold = 0.35) {
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { io.disconnect(); fn(); }
    }), { threshold });
    io.observe(el);
  }

  const ACTS = {
    S: { name: 'Sleep', color: '#7473f2' },
    W: { name: 'Work', color: '#f08a4b' },
    T: { name: 'Study', color: '#4fb3d9' },
    P: { name: 'Sport', color: '#5fbf7f' },
    F: { name: 'Friends', color: '#e3b04f' },
    R: { name: 'Rest', color: '#b58cf0' },
  };
  const pad = Eco.pad;

  /* ---------------- header ---------------- */
  function initHeader() {
    const nav = $('[data-lnav]');
    if (!nav) return;
    const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ---------------- reveal on scroll ---------------- */
  function initReveal() {
    const els = $$('.fx-focus, .bento__card');
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---------------- manifesto: words light up as you read ---------------- */
  function initWords() {
    const el = $('[data-words]');
    if (!el) return;
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
    const spans = $$('.w', el);
    if (reduced()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp((vh * 0.82 - r.top) / (r.height + vh * 0.42), 0, 1);
      const lit = p * (spans.length + 3);
      spans.forEach((s, i) => s.style.setProperty('--p', clamp(lit - i, 0, 1).toFixed(2)));
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    update();
  }

  /* ---------------- story: sticky stage on wide screens ---------------- */
  function initStory() {
    const grid = $('[data-story]');
    if (!grid) return;
    const steps = $$('.story-step', grid);
    const visuals = steps.map((s) => $('.story-step__visual', s));
    const stage = $('[data-stage]', grid);
    const dots = $$('.story__progress i', stage);
    const wide = window.matchMedia('(min-width: 981px)');
    let current = -1;

    const setActive = (i) => {
      if (i === current) return;
      current = i;
      steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
      visuals.forEach((v, k) => v.classList.toggle('is-active', k === i));
      dots.forEach((d, k) => d.classList.toggle('is-active', k === i));
      grid.dispatchEvent(new CustomEvent('story:step', { detail: i }));
    };
    const layout = () => {
      if (wide.matches) {
        visuals.forEach((v) => stage.insertBefore(v, $('.story__progress', stage)));
        grid.classList.add('is-staged');
      } else {
        visuals.forEach((v, k) => steps[k].appendChild(v));
        grid.classList.remove('is-staged');
      }
      pick();
    };
    const pick = () => {
      const mid = window.innerHeight * 0.5;
      let best = 0, bestD = Infinity;
      steps.forEach((s, k) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top + Math.min(r.height, window.innerHeight) / 2 - mid);
        if (d < bestD) { bestD = d; best = k; }
      });
      setActive(best);
    };
    let raf = 0;
    window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); }, { passive: true });
    wide.addEventListener('change', layout);
    layout();
  }

  /* ---------------- demo 1: paint a day ---------------- */
  function initDay() {
    const root = $('[data-demo-day]');
    if (!root) return;
    const today = Eco.today();
    $('[data-day-date]', root).textContent = Eco.fmt(today, { weekday: 'long', day: 'numeric', month: 'long' });

    const plan = 'SSSSSSSRWWWWRWWWWPFFTTRS'.split('');
    const hours = plan.slice();
    let brush = 'W';
    let touched = false;

    const brushes = $('[data-brushes]', root);
    brushes.innerHTML = Object.entries(ACTS).map(([k, a]) =>
      `<button type="button" class="brush" role="radio" aria-checked="${k === brush}" data-brush="${k}" style="--c:${a.color}">${a.name}</button>`
    ).join('') + '<button type="button" class="brush brush--erase" role="radio" aria-checked="false" data-brush="">Erase</button>';
    brushes.addEventListener('click', (e) => {
      const b = e.target.closest('[data-brush]');
      if (!b) return;
      brush = b.dataset.brush;
      $$('[data-brush]', brushes).forEach((x) => x.setAttribute('aria-checked', x === b));
    });

    const ribbon = $('[data-ribbon]', root);
    ribbon.innerHTML = hours.map((_, h) => `<button type="button" data-h="${h}"></button>`).join('');
    const cells = $$('button', ribbon);
    const split = $('[data-split]', root);
    const logged = $('[data-day-logged]', root);

    const drawCell = (h, animate) => {
      const k = hours[h];
      const c = cells[h];
      c.classList.toggle('is-empty', !k);
      if (k) c.style.setProperty('--c', ACTS[k].color); else c.style.removeProperty('--c');
      c.setAttribute('aria-label', `${pad(h)}:00 · ${k ? ACTS[k].name : 'Unlogged'}`);
      if (animate) { c.classList.remove('is-painted'); void c.offsetWidth; c.classList.add('is-painted'); }
    };
    const summary = () => {
      const counts = {};
      hours.forEach((k) => { if (k) counts[k] = (counts[k] || 0) + 1; });
      split.innerHTML = Object.keys(ACTS).filter((k) => counts[k]).map((k) => `<i style="--n:${counts[k]};--c:${ACTS[k].color}"></i>`).join('');
      logged.textContent = hours.filter(Boolean).length;
    };
    const paint = (h) => {
      if (hours[h] === brush) return;
      hours[h] = brush;
      drawCell(h, true);
      summary();
    };
    hours.forEach((_, h) => drawCell(h, false));
    summary();

    let painting = false;
    ribbon.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('[data-h]');
      if (!c) return;
      touched = true;
      painting = true;
      paint(+c.dataset.h);
      e.preventDefault();
    });
    ribbon.addEventListener('pointermove', (e) => {
      if (!painting) return;
      const c = document.elementFromPoint(e.clientX, e.clientY);
      const cell = c && c.closest && c.closest('[data-h]');
      if (cell && ribbon.contains(cell)) paint(+cell.dataset.h);
    });
    window.addEventListener('pointerup', () => { painting = false; });
    window.addEventListener('pointercancel', () => { painting = false; });
    ribbon.addEventListener('click', (e) => {
      const c = e.target.closest('[data-h]');
      if (c && e.detail === 0) { touched = true; paint(+c.dataset.h); }
    });

    // the first time it's seen, the day fills itself in
    if (reduced()) return;
    onceVisible(root, () => {
      if (touched) return;
      hours.fill('');
      hours.forEach((_, h) => drawCell(h, false));
      summary();
      plan.forEach((k, h) => setTimeout(() => {
        if (touched) return;
        hours[h] = k;
        drawCell(h, true);
        summary();
      }, 260 + h * 70));
    }, 0.5);
  }

  /* ---------------- demo 2: habits for this month ---------------- */
  function initHabits() {
    const root = $('[data-demo-habits]');
    if (!root) return;
    const today = Eco.today();
    const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const todayIdx = today.getDate() - 1;
    const monthName = Eco.fmt(today, { month: 'long' });
    $('.eyebrow', root).textContent = `Routines · ${monthName}`;

    const habits = [
      ['Read 20 pages', 0.82], ['Walk 30 minutes', 0.7], ['No phone after 23:00', 0.58],
      ['Stretch', 0.76], ['Drink 2 L of water', 0.9], ['Write a thought', 0.86],
    ];
    const rand = rng(7);
    const state = habits.map(([, rate]) => Array.from({ length: days }, (_, d) => d <= todayIdx && rand() < rate));

    const host = $('[data-habits]', root);
    host.innerHTML = habits.map(([name], r) => `
      <div class="habit">
        <span class="habit__name">${esc(name)}</span>
        <div class="habit__days" style="grid-template-columns:repeat(${days},minmax(0,1fr))">${state[r].map((on, d) => d > todayIdx
          ? '<i class="hd is-future"></i>'
          : `<button type="button" class="hd${d === todayIdx ? ' is-today' : ''}" data-r="${r}" data-d="${d}" aria-pressed="false" aria-label="${esc(name)}, ${monthName} ${d + 1}"></button>`).join('')}</div>
      </div>`).join('');

    const ring = $('[data-habit-ring]', root);
    const render = (animate) => {
      $$('button.hd', host).forEach((b) => {
        const on = state[+b.dataset.r][+b.dataset.d];
        b.setAttribute('aria-pressed', on);
        if (animate) b.style.transitionDelay = `${+b.dataset.d * 28 + +b.dataset.r * 16}ms`;
        b.classList.toggle('is-on', on);
      });
      const past = todayIdx + 1;
      let done = 0, perfect = 0, streak = 0;
      for (let d = 0; d < past; d++) {
        let all = true;
        state.forEach((row) => { if (row[d]) done++; else all = false; });
        if (all) perfect++;
      }
      state.forEach((row) => { let run = 0; for (let d = 0; d < past; d++) { run = row[d] ? run + 1 : 0; streak = Math.max(streak, run); } });
      const pct = Math.round((done / (past * habits.length)) * 100);
      $('[data-habit-pct]', root).textContent = pct;
      $('[data-habit-perfect]', root).textContent = perfect;
      $('[data-habit-streak]', root).textContent = streak;
      ring.style.strokeDashoffset = 100 - pct;
    };

    host.addEventListener('click', (e) => {
      const b = e.target.closest('button.hd');
      if (!b) return;
      const r = +b.dataset.r, d = +b.dataset.d;
      state[r][d] = !state[r][d];
      $$('button.hd', host).forEach((x) => { x.style.transitionDelay = ''; });
      b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop');
      render(false);
    });

    if (reduced()) { render(false); return; }
    // start empty, then fill in as a wave the first time it's seen
    const saved = state.map((row) => row.slice());
    state.forEach((row) => row.fill(false));
    render(false);
    onceVisible(root, () => {
      saved.forEach((row, r) => row.forEach((v, d) => { state[r][d] = v; }));
      render(true);
    }, 0.4);
  }

  /* ---------------- demo 3: a year, colored by one metric ---------------- */
  function initYear() {
    const root = $('[data-demo-year]');
    if (!root) return;
    const today = Eco.today();
    const year = today.getFullYear();
    $('[data-year-label]', root).textContent = year;

    const jan1 = new Date(year, 0, 1);
    const offset = (jan1.getDay() + 6) % 7; // Monday first
    const total = (new Date(year + 1, 0, 1) - jan1) / 864e5;
    const rand = rng(year);
    const TAU = Math.PI * 2;
    const noise = () => rand() + rand() - 1;

    const data = [];
    for (let i = 0; i < total; i++) {
      const date = new Date(year, 0, 1 + i);
      const dow = (date.getDay() + 6) % 7;
      const season = Math.sin((i / total) * TAU - 1.5);
      const future = date > today;
      const skipped = rand() < 0.07;
      const mood = clamp(6.4 + season * 1.1 + (dow === 6 ? -1.1 : dow === 5 ? 0.7 : 0) + noise() * 1.3, 1, 10);
      const sleep = clamp(7.1 + season * 0.35 + (dow >= 5 ? 0.7 : 0) + noise() * 0.7, 4.5, 9.5);
      const prod = clamp(6 + (dow >= 1 && dow <= 3 ? 1.1 : 0) + (dow >= 5 ? -1.8 : 0) + season * 0.4 + noise() * 1.3, 1, 10);
      data.push({ date, dow, month: date.getMonth(), future, skipped, mood, sleep, productivity: prod });
    }
    const metrics = {
      mood: { color: 'var(--green)', level: (d) => (d.mood - 2.5) / 7.5 },
      sleep: { color: 'var(--sky)', level: (d) => (d.sleep - 4.5) / 5 },
      productivity: { color: 'var(--indigo)', level: (d) => (d.productivity - 2) / 8 },
    };

    const grid = $('[data-year]', root);
    grid.innerHTML = '<i class="is-blank"></i>'.repeat(offset) + data.map(() => '<i></i>').join('');
    const cells = $$('i:not(.is-blank)', grid);
    cells.forEach((c, i) => { c.style.setProperty('--d', `${Math.floor((i + offset) / 7) * 9}ms`); });
    const insight = $('[data-year-insight]', root);
    const scale = $('.scale', root);

    const monthNames = Array.from({ length: 12 }, (_, m) => Eco.fmt(new Date(year, m, 1), { month: 'long' }));
    const avgBy = (key, group) => {
      const sums = {}, counts = {};
      data.forEach((d) => { if (d.future || d.skipped) return; const g = group(d); sums[g] = (sums[g] || 0) + d[key]; counts[g] = (counts[g] || 0) + 1; });
      let best = null;
      Object.keys(sums).forEach((g) => { const avg = sums[g] / counts[g]; if (counts[g] >= 5 && (!best || avg > best.avg)) best = { g, avg }; });
      return best;
    };
    const describe = (metric) => {
      if (metric === 'mood') {
        const b = avgBy('mood', (d) => d.month);
        return b ? `Best month for mood: <b>${monthNames[b.g]}</b>, averaging ${b.avg.toFixed(1)}` : '';
      }
      if (metric === 'sleep') {
        const b = avgBy('sleep', (d) => d.month);
        return b ? `Most rested month: <b>${monthNames[b.g]}</b>, ${Math.floor(b.avg)}h ${pad(Math.round((b.avg % 1) * 60))}m a night` : '';
      }
      const b = avgBy('productivity', (d) => d.dow);
      const dayName = b && Eco.fmt(new Date(2024, 0, 1 + +b.g), { weekday: 'long' });
      return b ? `Most productive day: <b>${dayName}s</b>, averaging ${b.avg.toFixed(1)}` : '';
    };

    const paint = (metric, show) => {
      const m = metrics[metric];
      grid.style.setProperty('--m', m.color);
      scale.style.setProperty('--m', m.color);
      cells.forEach((c, i) => {
        const d = data[i];
        c.classList.toggle('is-future', d.future);
        c.style.setProperty('--l', !show || d.future || d.skipped ? 0 : clamp(m.level(d), 0.08, 1).toFixed(2));
      });
      insight.innerHTML = describe(metric);
    };

    const seg = $('[data-year-metric]', root);
    let metric = 'mood';
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-metric]');
      if (!b || b.dataset.metric === metric) return;
      metric = b.dataset.metric;
      $$('[data-metric]', seg).forEach((x) => x.setAttribute('aria-checked', x === b));
      paint(metric, true);
    });
    seg.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const opts = $$('[data-metric]', seg);
      const i = opts.indexOf(document.activeElement);
      if (i < 0) return;
      const next = opts[(i + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length];
      next.focus();
      next.click();
      e.preventDefault();
    });

    if (reduced()) { paint(metric, true); return; }
    paint(metric, false);
    onceVisible(root, () => paint(metric, true), 0.4);
  }

  /* ---------------- bento details ---------------- */
  function initBento() {
    $$('[data-tasks] .task-mini__check').forEach((b) => {
      b.addEventListener('click', () => {
        const row = b.closest('.task-mini');
        const done = row.classList.toggle('is-done');
        b.setAttribute('aria-pressed', done);
      });
    });

    const thought = $('[data-type]');
    if (thought && !reduced()) {
      const text = thought.dataset.type;
      thought.textContent = '';
      onceVisible(thought, () => {
        thought.classList.add('is-typing');
        let i = 0;
        const type = () => {
          thought.textContent = text.slice(0, ++i);
          if (i < text.length) setTimeout(type, text[i - 1] === '.' ? 380 : 38 + Math.random() * 50);
          else setTimeout(() => thought.classList.remove('is-typing'), 2400);
        };
        setTimeout(type, 400);
      }, 0.8);
    }
  }

  /* ---------------- drift wall tiles ---------------- */
  function fillTiles() {
    $$('[data-tile-ribbon]').forEach((el) => {
      el.innerHTML = el.dataset.tileRibbon.split('').map((k) => `<i style="--c:${ACTS[k].color}"></i>`).join('');
    });
    $$('[data-tile-dots]').forEach((el) => {
      el.innerHTML = el.dataset.tileDots.split('').map((v) => `<i class="${v === '1' ? 'is-on' : ''}"></i>`).join('');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('.landing')) return;
    initHeader();
    initReveal();
    initWords();
    initStory();
    initDay();
    initHabits();
    initYear();
    initBento();
    fillTiles();

    const fx = Eco.fx || {};
    const hero = $('[data-hero]');
    const media = $('[data-halftone]');
    fx.halftone && fx.halftone(media, { img: $('.hero__img', media), hero });
    fx.chroma && fx.chroma($('[data-chroma]'));
    fx.drift && fx.drift($('[data-drift]'));
    fx.ghost && fx.ghost($('[data-ghost]'));
    fx.glow && fx.glow($$('[data-glow]'));
  });
})();
