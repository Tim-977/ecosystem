/* Ecosystem — the floating product cluster.
   Shared by the onboarding flow and the signup page so the two screens are
   literally the same scene. Everything degrades: any widget that isn't in
   the markup is simply skipped.

   Eco.widgets(orbitEl, { spot }) → { focus(keys), mood(score, asWord) } */
(function () {
  'use strict';
  const Eco = (window.Eco = window.Eco || {});
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = () => window.matchMedia('(hover: none)').matches;

  const ACTS = ['#7473f2', '#f08a4b', '#4fb3d9', '#5fbf7f', '#e3b04f', '#b58cf0'];
  const DAY = 'AAAAAAABBCCCBBBBDDEEFFAA';
  const DAYS = 14;
  const THOUGHTS = [
    'Walked home the long way. Worth it.',
    'Slept badly. Coffee after four again.',
    'Finally finished the thing I kept moving.',
  ];
  const WORDS = [[3, 'Rough'], [5, 'Okay'], [7, 'Good'], [9, 'Great']];
  const tone = (n) => (n >= 8 ? 'var(--green)' : n >= 5 ? 'var(--indigo)' : 'var(--amber)');
  Eco.moodWords = WORDS;
  Eco.moodTone = tone;

  /* Count a figure up to the number already in the markup, so a stalled rAF
     leaves the real figure on screen rather than a zero. Runs once per element. */
  Eco.countUp = function (els) {
    Array.from(els).forEach((el, i) => {
      if (reduced() || el.dataset.counted) return;
      el.dataset.counted = '1';
      const target = +el.dataset.count;
      const suffix = el.dataset.suffix || '';
      const dp = (el.dataset.count.split('.')[1] || '').length;
      const dur = 1400, delay = 420 + i * 180;
      let t0 = 0;
      const tick = (now) => {
        if (!t0) t0 = now;
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = (target * (1 - Math.pow(1 - p, 3))).toFixed(dp) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      setTimeout(() => requestAnimationFrame(tick), delay);
      setTimeout(() => { el.textContent = target.toFixed(dp) + suffix; }, delay + dur + 500);
    });
  };

  Eco.widgets = function (orbit, { spot = null, live = null } = {}) {
    if (!orbit) return { focus() {}, mood() {} };
    const widgets = $$('.ow', orbit);

    /* ---------- cursor light + parallax: one loop, idles to nothing ---------- */
    if (!coarse() && !reduced()) {
      const p = { x: 0.5, y: 0.5, cx: 0.5, cy: 0.5, px: 0, py: 0, raf: 0 };
      const frame = () => {
        p.raf = 0;
        p.cx += (p.x - p.cx) * 0.1;
        p.cy += (p.y - p.cy) * 0.1;
        orbit.style.setProperty('--mx', ((p.cx - 0.5) * 2).toFixed(3));
        orbit.style.setProperty('--my', ((p.cy - 0.5) * 2).toFixed(3));
        if (spot) {
          spot.style.setProperty('--sx', `${p.px.toFixed(1)}px`);
          spot.style.setProperty('--sy', `${p.py.toFixed(1)}px`);
        }
        if (Math.abs(p.x - p.cx) > 0.001 || Math.abs(p.y - p.cy) > 0.001) kick();
      };
      const kick = () => { if (!p.raf) p.raf = requestAnimationFrame(frame); };
      window.addEventListener('pointermove', (e) => {
        p.x = clamp(e.clientX / window.innerWidth, 0, 1);
        p.y = clamp(e.clientY / window.innerHeight, 0, 1);
        p.px = e.clientX; p.py = e.clientY;
        if (live) live.classList.add('is-live');
        kick();
      }, { passive: true });
    }

    /* ---------- hours: paint your own day ---------- */
    const ribbon = $('[data-ribbon]', orbit);
    if (ribbon) {
      const count = $('[data-hours-count]', orbit);
      const cells = DAY.split('').map((ch) => ch.charCodeAt(0) - 65);
      const repaint = () => {
        $$('button', ribbon).forEach((b, i) => {
          b.classList.toggle('is-empty', cells[i] < 0);
          b.style.setProperty('--c', cells[i] < 0 ? 'transparent' : ACTS[cells[i] % ACTS.length]);
        });
        if (count) count.textContent = `${cells.filter((c) => c >= 0).length}/24h`;
      };
      ribbon.innerHTML = cells.map((_, i) => `<button type="button" data-h="${i}" aria-label="Hour ${i}"></button>`).join('');
      repaint();

      let brush = 1, down = false;
      const paintAt = (el) => {
        if (!el || !el.dataset || el.dataset.h === undefined) return;
        const i = +el.dataset.h;
        if (cells[i] === brush) return;
        cells[i] = brush;
        el.classList.remove('is-hit'); void el.offsetWidth; el.classList.add('is-hit');
        repaint();
      };
      ribbon.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-h]');
        if (!b) return;
        brush = (cells[+b.dataset.h] + 1) % ACTS.length;
        down = true;
        paintAt(b);
      });
      ribbon.addEventListener('pointermove', (e) => { if (down) paintAt(document.elementFromPoint(e.clientX, e.clientY)); });
      window.addEventListener('pointerup', () => { down = false; });
    }

    /* ---------- habits: tick the grid, the streak keeps up ---------- */
    const habits = $('[data-habits]', orbit);
    if (habits) {
      const streakOut = $('[data-habit-streak]', orbit);
      const grid = [
        [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1],
        [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      ];
      habits.innerHTML = grid.map((row, r) =>
        `<div class="ow-habits__row">${row.map((v, d) =>
          `<button type="button" class="${v ? 'is-on' : ''}" data-r="${r}" data-d="${d}" aria-label="Habit ${r + 1}, day ${d + 1}"></button>`).join('')}</div>`).join('');
      const recount = () => {
        let best = 0, run = 0;
        for (let d = 0; d < DAYS; d += 1) {
          if (grid.every((row) => row[d])) { run += 1; best = Math.max(best, run); } else run = 0;
        }
        if (streakOut) streakOut.textContent = best;
      };
      recount();
      habits.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-r]');
        if (!b) return;
        grid[+b.dataset.r][+b.dataset.d] ^= 1;
        b.classList.toggle('is-on', !!grid[+b.dataset.r][+b.dataset.d]);
        recount();
      });
    }

    /* ---------- tasks: tickable ---------- */
    $$('[data-tasks] .ow-tick', orbit).forEach((t) => {
      t.addEventListener('click', () => {
        const on = t.classList.toggle('is-on');
        t.closest('li').classList.toggle('is-done', on);
      });
    });

    /* ---------- year heatmap ---------- */
    const year = $('[data-year]', orbit);
    if (year) {
      const levels = ['var(--empty-cell)',
        'color-mix(in srgb, var(--green) 26%, var(--bg-1))',
        'color-mix(in srgb, var(--green) 45%, var(--bg-1))',
        'color-mix(in srgb, var(--green) 64%, var(--bg-1))',
        'color-mix(in srgb, var(--green) 84%, var(--bg-1))'];
      let seed = 7;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      year.innerHTML = Array.from({ length: 26 * 5 }, () => {
        const v = rnd();
        const l = v > 0.82 ? 4 : v > 0.62 ? 3 : v > 0.4 ? 2 : v > 0.2 ? 1 : 0;
        return `<i style="background:${levels[l]}"></i>`;
      }).join('');
    }

    /* ---------- journal: a thought types itself ---------- */
    const journal = $('[data-journal]', orbit);
    if (journal && !reduced()) {
      let ti = 0, ci = 0, dir = 1, timer = 0;
      const tick = () => {
        const text = THOUGHTS[ti];
        ci += dir;
        journal.textContent = text.slice(0, ci);
        let wait = dir > 0 ? 44 : 22;
        if (ci >= text.length) { dir = -1; wait = 2800; }
        else if (ci <= 0) { dir = 1; ti = (ti + 1) % THOUGHTS.length; wait = 420; }
        timer = setTimeout(tick, wait);
      };
      tick();
      document.addEventListener('visibilitychange', () => {
        clearTimeout(timer);
        if (!document.hidden) timer = setTimeout(tick, 400);
      });
    } else if (journal && !journal.textContent.trim()) {
      journal.textContent = THOUGHTS[0]; // reduced motion: no typing, but never an empty card
    }

    /* ---------- the marketing figures ---------- */
    Eco.countUp($$('[data-count]', orbit));

    /* ---------- mood: mirrors whatever the visitor picked ---------- */
    const moodValue = $('[data-mood-value]', orbit);
    const moodMeter = $('[data-mood-meter]', orbit);
    const mood = (n, asWord) => {
      if (!moodValue) return;
      const word = WORDS.reduce((a, b) => (Math.abs(b[0] - n) < Math.abs(a[0] - n) ? b : a))[1];
      moodValue.classList.toggle('is-word', !!asWord);
      moodValue.innerHTML = asWord ? `<b>${word}</b>` : `<b>${n}</b><small>/10</small>`;
      moodValue.querySelector('b').style.color = tone(n);
      if (moodMeter) {
        moodMeter.style.setProperty('--w', `${n * 10}%`);
        moodMeter.style.setProperty('--c', tone(n));
      }
    };

    /* ---------- lean the cluster toward an answer ---------- */
    const focus = (keys) => {
      const all = keys && keys[0] === '*';
      const some = !!(keys && keys.length);
      widgets.forEach((w) => {
        const mine = (w.dataset.w || '').split(/\s+/);
        const on = all || (keys || []).some((k) => mine.includes(k));
        w.classList.toggle('is-focus', !!on);
        w.classList.toggle('is-dim', some && !on && !all);
      });
    };

    return { focus, mood };
  };
})();
