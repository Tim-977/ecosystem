/* Ecosystem — pre-signup onboarding.

   Steps cross-fade on top of each other; the widget cluster on the right is
   the real product in miniature and leans toward whatever was just answered.
   One rAF loop drives the cursor light and the parallax — everything else is
   CSS transitions, so this stays cheap on a laptop. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;
  const STORE = 'eco-onboarding';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = () => window.matchMedia('(hover: none)').matches;

  /* ---------------- what Ecosystem says back: one line, never a lecture ---------------- */
  const REACT = {
    scale: {
      numbers: 'Slider it is — straight onto your charts.',
      words: 'Words it is. The numbers stay behind the scenes.',
    },
    rating: (n) => (n >= 8 ? 'A good one. Worth knowing why.'
      : n >= 5 ? 'Middling days vanish from memory first.'
        : 'Rough one. The pattern shows up over weeks.'),
    slip: {
      alarms: 'That\'s a sleep pattern. It gets tracked here.',
      deadlines: 'Tasks sort themselves by what\'s due.',
      hours: 'That\'s exactly what the timeline is for.',
      unfinished: 'Unfinished stays visible, not buried.',
      consistency: 'Habits run monthly. Streaks do the remembering.',
      blur: 'One line a day brings the week back.',
    },
    diary: {
      keep: 'Then you already do the hard part.',
      used_to: 'A line a day is the version that survives.',
      tried: 'One line counts as an entry here.',
      curious: 'Start with a sentence about today.',
      no: 'Then it stays out of your way.',
    },
    streak: {
      protect: 'Streaks front and centre. They\'re addictive.',
      gentle: 'No red marks. The month just carries on.',
      depends: 'There when you want it, quiet when you don\'t.',
    },
  };

  /* ---------------- answers → the summary on the last screen ---------------- */
  const SLIP_LINE = {
    alarms: ['bed-double', 'Sleep, alarms and the hours between'],
    deadlines: ['list-checks', 'Tasks sorted by deadline, overdue on top'],
    hours: ['palette', 'A 24-hour timeline in your own colors'],
    unfinished: ['target', 'Unfinished work kept on the home screen'],
    consistency: ['flame', 'Ten habits a month, streaks counted'],
    blur: ['book-open', 'A month that reads back like a diary'],
  };
  const DIARY_LINE = {
    keep: 'Journal open beside every day',
    used_to: 'Journal: one line a day, nothing more required',
    tried: 'Journal: one line is a whole entry',
    curious: 'Journal: starts at one sentence',
    no: 'Journal folded away until you want it',
  };
  const STREAK_LINE = {
    protect: 'Streaks and perfect days, kept visible',
    gentle: 'Missed days pass without comment',
    depends: 'Streaks counted quietly in the background',
  };

  /* widgets lit per step */
  const STEP_FOCUS = {
    intro: [],
    name: [],
    scale: ['scale'],
    slip: null, // follows their picks
    diary: ['diary'],
    streak: ['consistency'],
    preview: ['*'],
  };

  document.addEventListener('DOMContentLoaded', () => {
    const root = $('[data-ob]');
    if (!root) return;

    const stage = $('[data-ob-stage]', root);
    const steps = $$('.ob-step', stage);
    const order = steps.map((s) => s.dataset.step);
    const tracked = steps.filter((s) => !s.hasAttribute('data-untracked'));
    const rail = $('[data-ob-rail]', root);
    const atEl = $('[data-ob-at]', root), ofEl = $('[data-ob-of]', root);
    const orbit = $('[data-orbit]', root);
    const spot = $('[data-spot]', root);

    let at = 0;
    let moved = false;

    /* ---------------- state ---------------- */
    const state = { name: '', scale: '', rating: {}, slip: [], diary: '', streak: '' };
    try {
      const seeded = JSON.parse(document.getElementById('obSaved').textContent || '{}');
      const local = JSON.parse(localStorage.getItem(STORE) || '{}');
      Object.assign(state, seeded, local);
    } catch (e) { /* first visit, or storage unavailable */ }
    if (!Array.isArray(state.slip)) state.slip = [];
    if (!state.rating || typeof state.rating !== 'object') state.rating = {};

    const payload = (extra) => Object.assign({
      name: state.name || '', scale: state.scale || '', rating: state.rating,
      slip: state.slip, diary: state.diary || '', streak: state.streak || '',
    }, extra || {});

    let saveTimer = 0;
    const push = (body) => (Eco.api ? Eco.api(root.dataset.saveUrl, { method: 'POST', json: body }) : Promise.resolve());
    const persist = (extra) => {
      const body = payload(extra);
      try { localStorage.setItem(STORE, JSON.stringify(body)); } catch (e) { /* private mode */ }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => push(body), 500);
    };

    const orb = Eco.widgets(orbit, { spot, live: root });

    /* ======================================================================
       Step machine — everything overlaps, nothing jumps
       ====================================================================== */
    const paint = () => {
      const idx = tracked.indexOf(steps[at]);
      const n = tracked.length;
      ofEl.textContent = n;
      if (idx >= 0) atEl.textContent = idx + 1;
      atEl.parentElement.style.visibility = idx < 0 ? 'hidden' : '';
      const done = idx < 0 ? (at === 0 ? 0 : n) : idx;
      rail.style.setProperty('--p', (done / n).toFixed(3));
      $$('[data-ob-back]', root).forEach((b) => { if (b.classList.contains('ob__back')) b.hidden = at === 0; });
    };

    const lean = () => {
      const key = order[at];
      const keys = STEP_FOCUS[key] === null ? state.slip.slice() : STEP_FOCUS[key];
      orb.focus(keys && keys.length ? keys : []);
    };

    const go = (to, back) => {
      if (to < 0 || to >= steps.length || to === at) return;
      moved = true;
      const from = steps[at];
      const next = steps[to];
      if (order[to] === 'preview') buildPreview(); // rows must exist before the step lights up

      from.classList.remove('is-active');
      from.classList.toggle('is-back', !back); // stepping forward leaves it above us
      from.inert = true;

      // both class changes land in one style recalc, so `next` animates from
      // wherever it was parked rather than jumping across the middle
      next.classList.remove('is-back');
      next.classList.add('is-active');
      next.inert = false;

      at = to;
      paint();
      lean();
      enter(next);
    };
    const next = () => go(at + 1, false);
    const back = () => go(at - 1, true);

    function enter(step) {
      const key = step.dataset.step;
      if (key === 'name') {
        nameInput.value = state.name || '';
        if (!coarse()) setTimeout(() => nameInput.focus(), 320);
      }
      const cta = $('[data-ob-next]:not([data-ob-clear]), [data-ob-finish]', step);
      if (cta && key !== 'name' && moved) setTimeout(() => { try { cta.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }, 340);
    }

    /* ---------------- reactions ---------------- */
    const react = (step, text) => {
      const el = $('[data-ob-react]', step);
      if (!el) return;
      if (!text) { el.hidden = true; return; }
      const fresh = el.hidden || el.textContent !== text;
      el.hidden = false;
      el.textContent = text;
      if (fresh) { el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); }
    };
    const unlock = (step, on) => {
      const btn = $('[data-ob-next]:not([data-ob-clear])', step);
      if (btn) btn.disabled = !on;
    };

    /* ---------------- 1 · name ---------------- */
    const nameStep = $('[data-step="name"]', stage);
    const nameInput = $('[data-ob-name]', nameStep);
    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.trim().slice(0, 24);
      persist();
    });

    /* ---------------- 2 · rating style + live control ---------------- */
    const scaleStep = $('[data-step="scale"]', stage);
    const tryBox = $('[data-ob-try]', scaleStep);
    const tryNumbers = $('[data-ob-try-numbers]', scaleStep);
    const tryWords = $('[data-ob-try-words]', scaleStep);
    const range = $('[data-ob-range]', scaleStep);
    const rangeOut = $('[data-ob-scale-out]', scaleStep);

    const WORDS = Eco.moodWords, tone = Eco.moodTone;
    const paintMood = () => orb.mood(state.rating.mood || 7, state.scale === 'words');

    const paintRange = (n) => {
      range.style.setProperty('--p', `${((n - 1) / 9) * 100}%`);
      range.style.setProperty('--track-c', tone(n));
      const b = rangeOut.querySelector('b');
      b.textContent = n;
      b.style.color = tone(n);
    };
    const markWords = (n) => {
      const near = WORDS.reduce((a, b) => (Math.abs(b[0] - n) < Math.abs(a[0] - n) ? b : a))[0];
      $$('[data-ob-words] .ob-word', scaleStep).forEach((w) => w.setAttribute('aria-checked', +w.dataset.score === near));
    };
    const setScore = (n) => {
      state.rating = { mood: n };
      paintRange(n);
      markWords(n);
      paintMood();
      react(scaleStep, REACT.rating(n));
      unlock(scaleStep, true);
      persist();
    };
    const showTry = (style) => {
      tryBox.hidden = false;
      tryNumbers.hidden = style !== 'numbers';
      tryWords.hidden = style !== 'words';
      const current = state.rating.mood || 7;
      range.value = current;
      paintRange(current);
      markWords(current);
      paintMood();
    };

    range.addEventListener('input', () => setScore(+range.value));
    $$('[data-ob-words] .ob-word', scaleStep).forEach((w) => {
      w.addEventListener('click', () => { range.value = w.dataset.score; setScore(+w.dataset.score); });
    });

    /* ---------------- option groups ---------------- */
    $$('[data-ob-opts]', stage).forEach((group) => {
      const key = group.dataset.obOpts;
      const step = group.closest('.ob-step');
      const multi = group.hasAttribute('data-multi');
      const max = +group.dataset.max || 3;
      const opts = $$('[data-value]', group);

      const paintChips = () => {
        const full = state.slip.length >= max;
        opts.forEach((o) => {
          const on = state.slip.includes(o.dataset.value);
          o.setAttribute('aria-pressed', on);
          o.classList.toggle('is-spent', full && !on);
        });
      };

      const choose = (opt) => {
        const value = opt.dataset.value;
        if (multi) {
          const i = state.slip.indexOf(value);
          if (i >= 0) state.slip.splice(i, 1);
          else if (state.slip.length < max) state.slip.push(value);
          else return;
          paintChips();
          react(step, state.slip.length ? REACT.slip[state.slip[state.slip.length - 1]] : '');
          unlock(step, state.slip.length > 0);
          lean();
        } else {
          state[key] = value;
          opts.forEach((o) => o.setAttribute('aria-checked', o === opt));
          if (key === 'scale') { showTry(value); paintMood(); }
          const table = REACT[key];
          if (table) react(step, table[value]);
          unlock(step, true);
        }
        persist();
      };

      group.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-value]');
        if (opt && group.contains(opt)) choose(opt);
      });

      // anything already answered this session comes back filled in
      if (multi) {
        if (state.slip.length) { paintChips(); react(step, REACT.slip[state.slip[state.slip.length - 1]]); unlock(step, true); }
      } else if (state[key]) {
        const opt = opts.find((o) => o.dataset.value === state[key]);
        if (opt) {
          opts.forEach((o) => o.setAttribute('aria-checked', o === opt));
          if (key === 'scale') showTry(state[key]);
          const table = REACT[key];
          if (table) react(step, key === 'scale' && state.rating.mood ? REACT.rating(state.rating.mood) : table[state[key]]);
          unlock(step, true);
        }
      }
    });

    /* ---------------- the last screen ---------------- */
    const summary = $('[data-ob-summary]', stage);
    const previewTitle = $('[data-ob-preview-title]', stage);

    function buildPreview() {
      previewTitle.innerHTML = state.name
        ? `Here's yours,<em> ${Eco.esc(state.name)}.</em>`
        : 'Here\'s<em> yours.</em>';

      const rows = [];
      if (state.scale) {
        rows.push(['smile', state.scale === 'words'
          ? 'Mood and productivity <b>in words</b>'
          : 'Mood and productivity on a <b>1–10 slider</b>', true]);
      }
      state.slip.slice(0, 3).forEach((s) => { if (SLIP_LINE[s]) rows.push([SLIP_LINE[s][0], SLIP_LINE[s][1], false]); });
      if (state.diary) rows.push(['pen-line', DIARY_LINE[state.diary], false]);
      if (state.streak) rows.push(['repeat', STREAK_LINE[state.streak], false]);
      if (!rows.length) rows.push(['layout-grid', 'Hours, sleep, mood, habits and tasks on one screen', true]);

      summary.innerHTML = rows.map((r, i) =>
        `<li class="ob-sum${r[2] ? ' ob-sum--accent' : ''}">`
        + `<span class="ob-sum__icon">${Eco.icon(r[0], 'icon icon--sm')}</span><span>${r[1]}</span></li>`).join('');
    }

    /* ---------------- wiring ---------------- */
    $$('[data-ob-next]', root).forEach((btn) => {
      btn.addEventListener('click', () => {
        const clear = btn.dataset.obClear;
        if (clear === 'name') { state.name = ''; nameInput.value = ''; persist(); }
        if (clear === 'slip') {
          state.slip = [];
          const step = btn.closest('.ob-step');
          $$('[data-value]', step).forEach((o) => { o.setAttribute('aria-pressed', 'false'); o.classList.remove('is-spent'); });
          react(step, '');
          persist();
        }
        next();
      });
    });
    $$('[data-ob-back]', root).forEach((b) => b.addEventListener('click', back));

    const finish = $('[data-ob-finish]', root);
    finish.addEventListener('click', (e) => {
      e.preventDefault();
      clearTimeout(saveTimer);
      const body = payload({ completed: true });
      try { localStorage.setItem(STORE, JSON.stringify(body)); } catch (err) { /* private mode */ }
      const href = finish.getAttribute('href');
      // let the save land, but never hold the visitor up for it
      Promise.race([push(body), new Promise((r) => setTimeout(r, 700))]).then(() => { window.location.href = href; });
    });
    $('[data-ob-skip]', root).addEventListener('click', () => { clearTimeout(saveTimer); push(payload()); });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = steps[at];
      const cta = $('[data-ob-next]:not([data-ob-clear]), [data-ob-finish]', step);
      if (!cta || cta.disabled) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault();
      cta.click();
    });

    steps.forEach((s, i) => { s.inert = i !== 0; });
    paint();
    lean();
    paintMood();
    const fx = Eco.fx || {};
    if (fx.glow) fx.glow($$('[data-glow]', root), { radius: 340 });
  });
})();
