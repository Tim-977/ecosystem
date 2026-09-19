/* Ecosystem — pre-signup onboarding.

   One question at a time in the middle of the screen. Answering a
   single-choice question commits in place: the options you didn't pick shed,
   the one you did settles, and the line Ecosystem answers with takes their
   place before the next question arrives. The widget field at both edges is
   the real product in miniature and leans toward whatever was just said.

   One rAF loop (in widgets.js) drives the cursor light and the parallax;
   everything else here is CSS transitions. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;
  const STORE = 'eco-onboarding';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = () => window.matchMedia('(hover: none)').matches;

  /* how long an answer holds the screen before the next question arrives */
  const SETTLE = 300;
  const HOLD = 1250;

  /* ---------------- what Ecosystem says back: one line, never a lecture ---------------- */
  const REACT = {
    scale: {
      numbers: 'Numbers it is — precise, and straight onto your charts.',
      words: 'Words it is. The numbers stay behind the scenes.',
    },
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
      tried: 'One line counts as a whole entry here.',
      curious: 'Start with a sentence about today.',
      no: 'Then it stays folded away until you want it.',
    },
    focus: {
      time: 'Then the timeline and the activity map do the talking.',
      mood: 'Mood beside sleep and weekdays — it shows up fast.',
      habits: 'Streaks and perfect days, counted for you.',
      story: 'Month and year views. Give it a few weeks.',
    },
  };

  /* ---------------- the beat between the questions, in their words ---------------- */
  const MOMENT = {
    hours: ['Your hours aren\'t lost.', ' They\'re just unrecorded.'],
    alarms: ['Mornings aren\'t a willpower problem.', ' They\'re a sleep pattern.'],
    deadlines: ['Nothing sneaks up', ' on a week you can see.'],
    unfinished: ['You finish more', ' than you remember finishing.'],
    consistency: ['Consistency isn\'t a streak.', ' It\'s a record you can look at.'],
    blur: ['A blurred week', ' is just an unwritten one.'],
  };
  const MOMENT_DEFAULT = ['You don\'t need to be more organised.', ' You need something to look back on.'];

  /* ---------------- answers → the composition on the last screen ---------------- */
  const SLIP_CARD = {
    alarms: ['bed-double', 'Sleep', 'Bedtime, wake-up and the <b>hours between</b>'],
    deadlines: ['list-checks', 'Tasks', 'Sorted by deadline, <b>overdue on top</b>'],
    hours: ['palette', 'Timeline', 'A 24-hour day <b>painted in your colours</b>'],
    unfinished: ['target', 'Carry-over', 'Unfinished work <b>kept on the home screen</b>'],
    consistency: ['flame', 'Habits', 'Ten a month, <b>streaks counted for you</b>'],
    blur: ['book-open', 'Your month', 'A month that <b>reads back like a diary</b>'],
  };
  const DIARY_CARD = {
    keep: 'Open beside <b>every single day</b>',
    used_to: '<b>One line a day</b> — the version that survives',
    tried: '<b>One line</b> counts as a whole entry',
    curious: 'Starts at <b>one sentence</b> about today',
    no: '<b>Folded away</b> until you want it',
  };
  const FOCUS_CARD = {
    time: ['clock', 'Where it goes', 'Every hour of the month <b>on one map</b>'],
    mood: ['activity', 'What moves you', 'Mood beside <b>sleep and weekdays</b>'],
    habits: ['flame', 'Habits', 'Ten a month, <b>streaks counted for you</b>'],
    story: ['calendar-days', 'Your year', '<b>One square a day</b>, twelve months at once'],
  };

  /* which widgets lean in, per step */
  const STEP_FOCUS = {
    intro: [],
    name: [],
    scale: ['scale'],
    slip: null, // follows their picks
    moment: null,
    diary: ['diary'],
    focus: [],
    preview: [],
  };

  document.addEventListener('DOMContentLoaded', () => {
    const root = $('[data-ob]');
    if (!root) return;

    const stage = $('[data-ob-stage]', root);
    const steps = $$('.ob-step', stage);
    const order = steps.map((s) => s.dataset.step);
    const chapters = $$('.chapter', root);
    const orbit = $('[data-orbit]', root);
    const spot = $('[data-spot]', root);

    let at = 0;
    let moved = false;
    let timers = [];
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
    const cancel = () => { timers.forEach(clearTimeout); timers = []; };

    /* ---------------- state ---------------- */
    const state = { name: '', scale: '', slip: [], diary: '', focus: '' };
    try {
      const seeded = JSON.parse(document.getElementById('obSaved').textContent || '{}');
      const local = JSON.parse(localStorage.getItem(STORE) || '{}');
      Object.assign(state, seeded, local);
    } catch (e) { /* first visit, or storage unavailable */ }
    if (!Array.isArray(state.slip)) state.slip = [];
    if (typeof state.name !== 'string') state.name = '';
    state.name = state.name.trim().slice(0, 24);

    const payload = (extra) => Object.assign({
      name: state.name || '', scale: state.scale || '',
      slip: state.slip, diary: state.diary || '', focus: state.focus || '',
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
       Chapter rail
       ====================================================================== */
    const chapterOf = (i) => {
      const c = steps[i].dataset.chapter;
      return c === undefined ? -1 : +c;
    };
    const paintRail = () => {
      const here = chapterOf(at);
      chapters.forEach((ch, c) => {
        const mine = steps.filter((s) => +s.dataset.chapter === c);
        const done = mine.filter((s) => steps.indexOf(s) < at).length;
        const full = here > c || (here < 0 && at > steps.indexOf(mine[mine.length - 1]));
        const p = full ? 1 : Math.min(1, done / Math.max(1, mine.length));
        $('i', ch).style.setProperty('--p', p.toFixed(3));
        ch.classList.toggle('is-at', here === c);
        ch.classList.toggle('is-done', p >= 1 && here !== c);
      });
    };

    const lean = () => {
      const key = order[at];
      const keys = STEP_FOCUS[key] === null ? state.slip.slice() : STEP_FOCUS[key];
      orb.focus(keys && keys.length ? keys : []);
    };

    /* ======================================================================
       Step machine — everything overlaps, nothing jumps
       ====================================================================== */
    const go = (to, back) => {
      if (to < 0 || to >= steps.length || to === at) return;
      cancel();
      moved = true;
      const from = steps[at];
      const next = steps[to];
      if (order[to] === 'preview') buildFinale();
      if (order[to] === 'moment') buildMoment();

      reset(from);
      from.classList.remove('is-active');
      from.classList.toggle('is-back', !back); // stepping forward leaves it above us
      from.inert = true;

      // both class changes land in one style recalc, so `next` animates from
      // wherever it was parked rather than jumping across the middle
      next.classList.remove('is-back');
      next.classList.add('is-active');
      next.inert = false;

      at = to;
      root.classList.toggle('is-finale', order[at] === 'preview');
      paintRail();
      lean();
      enter(next);
    };
    const next = () => go(at + 1, false);
    const back = () => go(at - 1, true);

    /* what a step looks like when you arrive on it */
    function enter(step) {
      const key = step.dataset.step;
      backBtn.hidden = at === 0;

      if (key === 'name') {
        nameInput.value = state.name || '';
        if (!coarse()) later(() => nameInput.focus(), 340);
      }
      const cta = $('[data-ob-next]:not([data-ob-clear]), [data-ob-finish]', step);
      if (cta && key !== 'name' && moved && !coarse()) {
        later(() => { try { cta.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }, 360);
      }
    }

    /* clear any half-played commit so coming back shows the options again */
    function reset(step) {
      step.classList.remove('is-echoing');
      $$('.ob-pick', step).forEach((o) => o.classList.remove('is-shed', 'is-chosen', 'is-gone'));
      $$('[data-ob-opts]', step).forEach((g) => g.classList.remove('is-committing'));
      const el = $('[data-ob-echo]', step);
      if (el && !el.classList.contains('ob-echo--line')) el.classList.remove('is-on');
    }

    /* ---------------- the line Ecosystem answers with ---------------- */
    const echo = (step, text) => {
      const el = $('[data-ob-echo]', step);
      if (!el) return;
      if (!text) { el.classList.remove('is-on'); el.textContent = ''; return; }
      el.textContent = text;
      el.classList.add('is-on');
    };
    const unlock = (step, on) => {
      const btn = $('[data-ob-next]:not([data-ob-clear])', step);
      if (btn) btn.disabled = !on;
    };

    /* ---------------- 1 · name — required, asked for gently ---------------- */
    const nameStep = $('[data-step="name"]', stage);
    const nameInput = $('[data-ob-name]', nameStep);
    const nameField = $('[data-ob-name-field]', nameStep);
    nameInput.addEventListener('input', () => {
      state.name = nameInput.value.trim().slice(0, 24);
      if (state.name) { nameField.classList.remove('is-wanting'); nameInput.removeAttribute('aria-invalid'); }
      persist();
    });
    /* an empty name doesn't move on: the line warms, the hint steps forward */
    const nameReady = () => {
      if (state.name) return true;
      nameInput.value = '';
      nameInput.setAttribute('aria-invalid', 'true');
      nameField.classList.remove('is-wanting');
      void nameField.offsetWidth; // replay the nudge on every attempt
      nameField.classList.add('is-wanting');
      nameInput.focus();
      return false;
    };

    /* ---------------- 2 · tracking format, and the preview it opens into ---------------- */
    const scaleStep = $('[data-step="scale"]', stage);
    const swap = $('[data-ob-swap]', scaleStep);
    const cards = $('[data-ob-opts="scale"]', scaleStep);
    const tryBox = $('[data-ob-try]', scaleStep);
    const tryTitle = $('[data-ob-try-title]', scaleStep);
    const rows = { numbers: $('[data-ob-try-numbers]', scaleStep), words: $('[data-ob-try-words]', scaleStep) };
    const switchBtn = $('[data-ob-switch]', scaleStep);
    const switchLabel = $('[data-ob-switch-label]', scaleStep);
    const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
    const tone = Eco.moodTone;
    const sample = { mood: 8, productivity: 6 };

    const paintMood = () => orb.mood(sample.mood, state.scale === 'words');
    const paintRange = (range) => {
      const n = +range.value;
      const kind = range.dataset.obRange;
      range.style.setProperty('--p', `${((n - 1) / 9) * 100}%`);
      range.style.setProperty('--track-c', tone(n));
      const out = $(`[data-ob-out="${kind}"]`, scaleStep);
      out.textContent = n;
      out.style.color = tone(n);
    };
    $$('[data-ob-range]', scaleStep).forEach((r) => {
      paintRange(r);
      r.addEventListener('input', () => { paintRange(r); sample[r.dataset.obRange] = +r.value; if (r.dataset.obRange === 'mood') paintMood(); });
    });
    $$('[data-ob-words]', scaleStep).forEach((group) => {
      group.addEventListener('click', (e) => {
        const w = e.target.closest('.ob-word');
        if (!w) return;
        $$('.ob-word', group).forEach((x) => x.setAttribute('aria-checked', x === w));
        sample[group.dataset.obWords] = +w.dataset.score;
        if (group.dataset.obWords === 'mood') paintMood();
      });
    });

    /* grow or shrink the swap area over the same beat as whatever changes inside it */
    const settleHeight = (change) => {
      const h0 = swap.offsetHeight;
      change();
      const h1 = swap.offsetHeight;
      if (reduced() || !swap.animate || Math.abs(h1 - h0) < 1) return;
      swap.animate([{ height: `${h0}px` }, { height: `${h1}px` }], { duration: 560, easing: EASE });
    };
    const showFormat = (style) => {
      state.scale = style;
      $$('[data-value]', cards).forEach((o) => o.setAttribute('aria-checked', o.dataset.value === style));
      tryTitle.textContent = style === 'words' ? 'Words' : 'Numbers';
      rows.numbers.hidden = style !== 'numbers';
      rows.words.hidden = style !== 'words';
      switchLabel.textContent = style === 'words' ? 'Use numbers instead' : 'Use words instead';
      switchBtn.hidden = false;
      paintMood();
      echo(scaleStep, REACT.scale[style]);
      unlock(scaleStep, true);
    };
    /* the chosen card opens up into the preview: the panel starts clipped to
       the card's own outline and grows out to its full size */
    const expand = (card, style) => {
      const from = card.getBoundingClientRect();
      tryBox.classList.add('is-morphing');
      settleHeight(() => { cards.hidden = true; tryBox.hidden = false; showFormat(style); });
      const to = tryBox.getBoundingClientRect();
      if (reduced() || !tryBox.animate) { tryBox.classList.remove('is-morphing'); return; }
      const clip = `inset(${from.top - to.top}px ${to.right - from.right}px ${to.bottom - from.bottom}px ${from.left - to.left}px round 20px)`;
      const grow = tryBox.animate([{ clipPath: clip }, { clipPath: 'inset(0px 0px 0px 0px round 20px)' }], { duration: 620, easing: EASE });
      $$('.ob-try__head, .ob-try__rows:not([hidden])', tryBox).forEach((el, i) => el.animate(
        [{ opacity: 0, transform: 'translate3d(0, 8px, 0)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, delay: 170 + i * 70, easing: EASE, fill: 'backwards' }));
      switchBtn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 420, delay: 360, easing: EASE, fill: 'backwards' });
      grow.onfinish = grow.oncancel = () => tryBox.classList.remove('is-morphing');
    };
    /* the other format, straight from the preview */
    switchBtn.addEventListener('click', () => {
      const style = state.scale === 'words' ? 'numbers' : 'words';
      settleHeight(() => showFormat(style));
      if (!reduced() && rows[style].animate) {
        rows[style].animate([{ opacity: 0, transform: 'translate3d(0, 6px, 0)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE });
        tryTitle.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: EASE });
      }
      persist();
    });

    /* ---------------- option groups ---------------- */
    $$('[data-ob-opts]', stage).forEach((group) => {
      const key = group.dataset.obOpts;
      const step = group.closest('.ob-step');
      const multi = group.hasAttribute('data-multi');
      const commits = group.hasAttribute('data-commit'); // answering moves you on
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

      /* one answer, then the screen moves on by itself */
      const commit = (opt, text) => {
        group.classList.add('is-committing');
        opts.forEach((o) => { if (o !== opt) o.classList.add('is-shed'); });
        opt.classList.add('is-chosen');
        if (reduced()) { echo(step, text); later(next, 600); return; }
        later(() => { opt.classList.add('is-gone'); echo(step, text); step.classList.add('is-echoing'); }, SETTLE);
        later(next, HOLD);
      };

      const choose = (opt) => {
        const value = opt.dataset.value;
        if (multi) {
          const i = state.slip.indexOf(value);
          if (i >= 0) state.slip.splice(i, 1);
          else if (state.slip.length < max) state.slip.push(value);
          else return;
          paintChips();
          echo(step, state.slip.length ? REACT.slip[state.slip[state.slip.length - 1]] : '');
          unlock(step, state.slip.length > 0);
          lean();
        } else {
          state[key] = value;
          opts.forEach((o) => o.setAttribute('aria-checked', o === opt));
          const table = REACT[key];
          const line = table ? table[value] : '';
          if (key === 'scale') { if (tryBox.hidden) expand(opt, value); else showFormat(value); }
          else if (commits) { commit(opt, line); } else { echo(step, line); unlock(step, true); }
        }
        persist();
      };

      group.addEventListener('click', (e) => {
        const opt = e.target.closest('[data-value]');
        if (opt && group.contains(opt) && !group.classList.contains('is-committing')) choose(opt);
      });

      // anything answered earlier in the session comes back filled in
      if (multi) {
        if (state.slip.length) { paintChips(); echo(step, REACT.slip[state.slip[state.slip.length - 1]]); unlock(step, true); }
      } else if (state[key]) {
        const opt = opts.find((o) => o.dataset.value === state[key]);
        if (opt) {
          opts.forEach((o) => o.setAttribute('aria-checked', o === opt));
          if (key === 'scale') { cards.hidden = true; tryBox.hidden = false; showFormat(state[key]); }
        }
      }
    });

    /* ---------------- the beat between the questions ---------------- */
    const momentStep = $('[data-step="moment"]', stage);
    const momentTitle = $('[data-ob-moment-title]', momentStep);
    const momentSub = $('[data-ob-moment-sub]', momentStep);

    function buildMoment() {
      const first = state.slip[0];
      const line = (first && MOMENT[first]) || MOMENT_DEFAULT;
      momentTitle.innerHTML = `${Eco.esc(line[0])}<em>${Eco.esc(line[1])}</em>`;
      momentSub.textContent = state.name
        ? `You don't need to change how you live, ${state.name}. Just log a few things each day and see what starts to show up.`
        : 'You don\'t need to change how you live. Just log a few things each day and see what starts to show up.';
    }

    /* ---------------- the finale ---------------- */
    const fan = $('[data-ob-fan]', stage);
    const previewTitle = $('[data-ob-preview-title]', stage);
    const TILT = ['-5deg', '3deg', '-2.5deg', '4.5deg'];
    const LIFT = ['10px', '-6px', '8px', '-4px'];

    function buildFinale() {
      previewTitle.innerHTML = state.name
        ? `You're ready,<em> ${Eco.esc(state.name)}.</em>`
        : 'You\'re<em> ready.</em>';

      const cardsOut = [];
      if (state.scale) {
        cardsOut.push(['smile', 'Your day', state.scale === 'words'
          ? 'Mood and productivity <b>in words</b>, not numbers'
          : 'Mood and productivity on a <b>1–10 scale</b>']);
      }
      state.slip.slice(0, 2).forEach((s) => { if (SLIP_CARD[s]) cardsOut.push(SLIP_CARD[s]); });
      if (state.diary && cardsOut.length < 4) cardsOut.push(['pen-line', 'Journal', DIARY_CARD[state.diary]]);
      if (state.focus && FOCUS_CARD[state.focus] && !cardsOut.some((c) => c[1] === FOCUS_CARD[state.focus][1])) {
        if (cardsOut.length >= 4) cardsOut.pop();
        cardsOut.push(FOCUS_CARD[state.focus]);
      }
      if (!cardsOut.length) {
        cardsOut.push(
          ['palette', 'Timeline', 'A 24-hour day <b>painted in your colours</b>'],
          ['flame', 'Habits', 'Ten a month, <b>streaks counted for you</b>'],
          ['book-open', 'Your month', 'A month that <b>reads back like a diary</b>'],
        );
      }

      fan.innerHTML = cardsOut.slice(0, 4).map((c, i) =>
        `<article class="ob-fan__card" role="listitem" style="--r:${TILT[i % TILT.length]};--ty:${LIFT[i % LIFT.length]}">`
        + `<span class="ob-fan__icon">${Eco.icon(c[0], 'icon icon--sm')}</span>`
        + `<span class="ob-fan__label">${c[1]}</span>`
        + `<p class="ob-fan__text">${c[2]}</p></article>`).join('');
    }

    /* ---------------- wiring ---------------- */
    const backBtn = $('[data-ob-back].scene-link', root);
    $$('[data-ob-next]', root).forEach((btn) => {
      btn.addEventListener('click', () => {
        const clear = btn.dataset.obClear;
        if (btn.closest('.ob-step') === nameStep && !nameReady()) return;
        if (clear === 'slip') {
          state.slip = [];
          const step = btn.closest('.ob-step');
          $$('[data-value]', step).forEach((o) => { o.setAttribute('aria-pressed', 'false'); o.classList.remove('is-spent'); });
          echo(step, '');
          lean();
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
      if (e.key === 'Escape' && at > 0) { back(); return; }
      if (e.key !== 'Enter' || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = steps[at];
      const cta = $('[data-ob-next]:not([data-ob-clear]), [data-ob-finish]', step);
      if (!cta || cta.disabled) return;
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
      e.preventDefault();
      cta.click();
    });

    steps.forEach((s, i) => { s.inert = i !== 0; });
    paintRail();
    lean();
    paintMood();
    enter(steps[0]);
    const fx = Eco.fx || {};
    if (fx.glow) fx.glow($$('[data-glow]', root), { radius: 340 });
  });
})();
