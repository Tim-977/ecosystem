/* Ecosystem — the guided tour.

   Driver.js does the spotlight; everything about how it feels is here. The
   tour runs across the real pages rather than in a sandbox: each chapter
   belongs to a screen, and the last Next on a chapter walks you to the next
   one and picks up where it left off. Progress lives in localStorage so a
   page load never loses your place; whether you've taken it at all lives on
   the account, so it doesn't re-run on another device.

   Replay it any time from Settings. */
(function () {
  'use strict';
  const Eco = window.Eco || {};
  const $ = (s, r = document) => r.querySelector(s);
  const STORE = 'eco-tour';
  const body = document.body;

  /* which screen each chapter belongs to, by Django url name */
  const PAGE = {
    main_page: 'overview',
    day_view: 'day',
    tasks: 'tasks',
    set_habits: 'habits',
    diary_view: 'journal',
    month_view: 'insights',
  };

  const navHref = (key) => {
    const link = $(`.nav__link[data-nav="${key}"]`);
    return link ? link.href : '/';
  };

  /* ======================================================================
     The tour itself. `el` may list fallbacks; a step whose element is
     missing on the day is dropped rather than shown against nothing.
     ====================================================================== */
  const CHAPTERS = [
    {
      key: 'overview',
      nav: 'overview',
      steps: [
        {
          el: null,
          title: 'This is Ecosystem',
          text: 'Two minutes and you\'ll know where everything lives. You can leave at any point — it\'s all replayable from Settings.',
        },
        {
          el: '.nav__links',
          title: 'Six places, one bar',
          text: 'Your day, your journal, your tasks, your routines and the insights they add up to. You\'ll live in Day and Tasks; the rest fills itself in.',
          side: 'bottom', align: 'center',
        },
        {
          el: ['#todayPanel', '.today'],
          title: 'Today, at a glance',
          text: 'Whatever you\'ve logged today shows up here. Empty now — that changes in about thirty seconds.',
          side: 'right', align: 'start',
        },
        {
          el: '[data-theme-toggle]',
          title: 'Light or dark',
          text: 'Whichever suits the room. It follows you across devices.',
          side: 'bottom', align: 'end',
        },
        {
          el: '.nav__right a[href*="settings"]',
          title: 'Settings live here',
          text: 'Your name, your activities, your data — and the button that replays this tour.',
          side: 'bottom', align: 'end',
          nextLabel: 'Open a day',
        },
      ],
    },
    {
      key: 'day',
      nav: 'day',
      steps: [
        {
          el: ['#canvas', '.timeline'],
          title: 'Your 24 hours',
          text: 'Drag across the strip to paint what you were actually doing. Rough is fine — an hour at a time is the point, not minute-perfect accounting.',
          side: 'bottom', align: 'center',
        },
        {
          el: ['#brushes', '.brushes'],
          title: 'Pick a colour first',
          text: 'These are your activities. Choose one, then paint the hours it covers. You can rename them or add your own whenever you like.',
          side: 'bottom', align: 'start',
        },
        {
          el: ['.checkin', '#checkinTitle'],
          title: 'How the day felt',
          text: 'Two sliders — mood and productivity. They take a second, and they\'re what every chart in Insights is built from.',
          side: 'left', align: 'start',
        },
        {
          el: ['#night', '.sleep'],
          title: 'And how you slept',
          text: 'Bed and wake time. The bar draws your night, so patterns show up long before you\'d notice them yourself.',
          side: 'left', align: 'start',
        },
        {
          el: ['#journal', '.journal-edit'],
          title: 'One line is enough',
          text: 'A thought for today, and a longer reflection if you feel like it. One sentence a day is what makes a month readable later.',
          side: 'top', align: 'center',
          nextLabel: 'On to tasks',
        },
      ],
    },
    {
      key: 'tasks',
      nav: 'tasks',
      steps: [
        {
          el: ['.composer', '#taskText'],
          title: 'Everything that needs doing',
          text: 'Type it, set a priority and a deadline if it has one, and forget about it until it\'s due.',
          side: 'bottom', align: 'start',
        },
        {
          el: ['.board-toolbar', '#taskBoard', '.tasks-layout'],
          title: 'Sorted for you',
          text: 'Grouped by deadline, ordered by priority, overdue on top. Anything unfinished follows you to the overview.',
          side: 'bottom', align: 'start',
          nextLabel: 'On to routines',
        },
      ],
    },
    {
      key: 'habits',
      nav: 'habits',
      steps: [
        {
          el: ['.goal', '#goalLabel'],
          title: 'A goal for the month',
          text: 'One line, in your words. It sits at the top of the month you\'re building.',
          side: 'bottom', align: 'start',
        },
        {
          el: ['#habitRows', '.habits-panel'],
          title: 'Ten habits, one grid',
          text: 'Add what you\'re keeping up with and tick the days off. Streaks and perfect days count themselves.',
          side: 'top', align: 'center',
          nextLabel: 'On to the journal',
        },
      ],
    },
    {
      key: 'journal',
      nav: 'journal',
      steps: [
        {
          el: ['#entries', '.journal-entries'],
          title: 'The month, in your words',
          text: 'Every thought you\'ve written this month, newest first — searchable, and readable end to end.',
          side: 'left', align: 'start',
          nextLabel: 'Last stop: insights',
        },
      ],
    },
    {
      key: 'insights',
      nav: 'insights',
      steps: [
        {
          el: ['#kpis', '.kpis'],
          title: 'The month in five numbers',
          text: 'Days logged, average mood, sleep, habits kept. This is the part that needs a week or two of data before it says anything interesting.',
          side: 'bottom', align: 'center',
        },
        {
          el: ['#moodChart', '.panel'],
          title: 'Mood against productivity',
          text: 'Day by day, the two lines together. Gaps are days you didn\'t log — they\'re left blank on purpose rather than counted as zeros.',
          side: 'top', align: 'center',
        },
        {
          el: ['#weekday', '.weekday'],
          title: 'The shape of your week',
          text: 'Average mood per weekday. It\'s usually the first chart that tells you something you half-knew — which days are quietly hard.',
          side: 'top', align: 'center',
        },
        {
          el: ['.page-head .segmented', '.segmented'],
          title: 'Zoom out when a month isn\'t enough',
          text: 'Switch to Year for twelve months side by side — the view that shows seasons rather than days.',
          side: 'bottom', align: 'end',
        },
        {
          el: null,
          title: 'That\'s everything',
          text: 'Log today and the rest follows. If you want this again, it\'s in Settings under Replay the tour.',
          nextLabel: 'Start logging',
        },
      ],
    },
  ];

  /* ---------------- state ---------------- */
  const read = () => {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}') || {}; } catch (e) { return {}; }
  };
  const write = (v) => {
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch (e) { /* private mode */ }
  };
  const clear = () => {
    try { localStorage.removeItem(STORE); } catch (e) { /* private mode */ }
  };
  /* where we are, and when — a tour left open for half an hour is abandoned */
  const place = (i, s) => write({ on: 1, i, s, t: Date.now() });
  const remember = (seen) => {
    const url = body.dataset.tourState;
    if (url && Eco.api) Eco.api(url, { method: 'POST', json: { seen } });
  };

  /* live steps only — a panel that isn't on the page can't be pointed at */
  const liveSteps = (chapter) => chapter.steps.filter((s) => {
    if (!s.el) return true;
    const list = Array.isArray(s.el) ? s.el : [s.el];
    s.found = list.find((sel) => document.querySelector(sel));
    return !!s.found;
  });

  /* every step in the tour, for the progress dots */
  const TOTAL = CHAPTERS.reduce((n, c) => n + c.steps.length, 0);
  const offsetOf = (i) => CHAPTERS.slice(0, i).reduce((n, c) => n + c.steps.length, 0);

  document.addEventListener('DOMContentLoaded', () => {
    const here = PAGE[body.dataset.page || ''];
    const driverFactory = window.driver && window.driver.js && window.driver.js.driver;
    if (!here || !driverFactory) return;

    const state = read();
    const fresh = body.hasAttribute('data-tour-new');
    const STALE = 30 * 60 * 1000;

    if (state.on) {
      const chapter = CHAPTERS[state.i];
      const cold = !state.t || Date.now() - state.t > STALE;
      // wandered off, or left it sitting: let it go rather than ambushing them later
      if (!chapter || cold) { clear(); if (cold) remember(true); return; }
      if (chapter.key !== here) return; // still live — it picks up when they're back
      setTimeout(() => start(state.i, state.s), 420);
      return;
    }
    if (fresh && here === 'overview') setTimeout(() => start(0, 0), 900);

    /* ==================================================================
       One chapter of the tour
       ================================================================== */
    function start(index, startAt) {
      const chapter = CHAPTERS[index];
      const steps = liveSteps(chapter);
      if (!steps.length) { hop(index + 1); return; }
      const last = steps.length - 1;
      const first = startAt === 'last' ? last : Math.min(+startAt || 0, last);
      const offset = offsetOf(index);
      let drv;

      const here = () => drv.getActiveIndex() || 0;
      const goNext = () => {
        if (here() < last) drv.moveNext();
        else if (index < CHAPTERS.length - 1) hop(index + 1);
        else finish(drv);
      };
      const goPrev = () => {
        if (here() > 0) drv.movePrevious();
        else if (index > 0) hop(index - 1, 'last');
      };
      const skipTour = () => { clear(); remember(true); drv.destroy(); };

      /* driver's own arrow keys would walk off the end of a chapter, so the
         tour takes the keyboard itself and routes it through the same doors */
      const onKey = (e) => {
        if (!drv.isActive() || e.metaKey || e.ctrlKey || e.altKey) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); goNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); goPrev(); }
        else if (e.key === 'Escape') { e.preventDefault(); skipTour(); }
      };
      document.addEventListener('keydown', onKey, true);

      const dots = (activeIndex) => {
        const at1 = offset + activeIndex;
        return CHAPTERS.map((c, ci) => {
          const done = ci < index;
          const cur = ci === index;
          return `<i class="eco-tour__dot${done ? ' is-done' : ''}${cur ? ' is-at' : ''}"></i>`;
        }).join('') + `<span class="eco-tour__count">${at1 + 1} / ${TOTAL}</span>`;
      };

      drv = driverFactory({
        animate: true,
        smoothScroll: true,
        allowClose: false, // no accidental exits — Skip and Escape are explicit
        allowKeyboardControl: false,
        overlayColor: getComputedStyle(document.documentElement).getPropertyValue('--tour-scrim').trim() || '#05050a',
        overlayOpacity: 0.62,
        stagePadding: 8,
        stageRadius: 16,
        popoverOffset: 14,
        popoverClass: 'eco-tour',
        showButtons: ['next', 'previous'],
        nextBtnText: 'Next',
        prevBtnText: 'Back',
        doneBtnText: 'Next',
        steps: steps.map((s) => ({
          element: s.found || undefined,
          popover: {
            title: s.title,
            description: s.text,
            side: s.side || 'bottom',
            align: s.align || 'center',
          },
        })),

        onPopoverRender(popover, { state: st }) {
          const i = st.activeIndex || 0;
          const step = steps[i];
          const lastChapter = index === CHAPTERS.length - 1;
          const isLast = i === last;

          popover.wrapper.classList.add('eco-tour');
          popover.nextButton.textContent = step.nextLabel || (isLast && lastChapter ? 'Finish' : 'Next');
          popover.previousButton.textContent = 'Back';
          // driver disables Back on a chapter's first step and sets display
          // inline, but here Back walks to the previous chapter's page
          const canBack = index > 0 || i > 0;
          popover.previousButton.style.display = canBack ? 'block' : 'none';
          popover.previousButton.disabled = !canBack;
          popover.previousButton.classList.toggle('driver-popover-btn-disabled', !canBack);

          const bar = document.createElement('div');
          bar.className = 'eco-tour__bar';
          bar.innerHTML = dots(i);
          popover.footer.prepend(bar);

          if (!(isLast && lastChapter)) {
            const skip = document.createElement('button');
            skip.type = 'button';
            skip.className = 'eco-tour__skip';
            skip.textContent = 'Skip tour';
            skip.addEventListener('click', skipTour);
            popover.footer.prepend(skip);
          }
        },

        onNextClick: goNext,
        onPrevClick: goPrev,

        /* keep the saved place honest as they move within the chapter */
        onHighlighted(el, step, { state: st }) {
          const saved = read();
          if (saved.on && saved.i === index) place(index, st.activeIndex || 0);
        },

        onDestroyStarted() { drv.destroy(); },
        onDestroyed() { document.removeEventListener('keydown', onKey, true); },
      });

      place(index, first);
      drv.drive(first);
    }

    /* walk to another chapter's page and carry the place with us */
    function hop(index, startAt) {
      const chapter = CHAPTERS[index];
      if (!chapter) { finish(); return; }
      place(index, startAt === 'last' ? 'last' : 0);
      window.location.href = navHref(chapter.nav);
    }

    function finish(drv) {
      clear();
      remember(true);
      if (drv) drv.destroy();
      if (Eco.toast) Eco.toast('Tour complete — replay it any time from Settings.', { type: 'success' });
    }
  });

  /* Settings (and the welcome screen) start the tour from scratch */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tour-start]');
    if (!btn) return;
    e.preventDefault();
    place(0, 0);
    const url = body.dataset.tourState;
    const go = () => { window.location.href = btn.dataset.tourStart || navHref('overview'); };
    if (url && Eco.api) Promise.race([Eco.api(url, { method: 'POST', json: { seen: false } }), new Promise((r) => setTimeout(r, 600))]).then(go);
    else go();
  });
})();
