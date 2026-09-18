/* Ecosystem — Day page.
   The page is one server form (POST day_view). This script layers on:
   a date strip, the 24-hour canvas, derived sleep/habit feedback, and
   autosave that submits the very same form in the background. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$, esc, icon, pad } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#dayForm');
    if (!form) return;
    const date = new Date(+form.dataset.year, +form.dataset.month - 1, +form.dataset.day);
    const today = Eco.today();
    const isToday = +date === +today;

    initHeader(date, today);
    initStrip(form, date, today);
    initDockNav(date, today);
    const timeline = initTimeline(form, date, isToday);
    initSleep();
    initHabits();
    initAutosave(form, timeline);
  });

  /* ---------------- header + navigation ---------------- */
  function initHeader(date, today) {
    const el = $('#dayRelative');
    const diff = Math.round((date - today) / 86400000);
    const rel = diff === 0 ? 'Today' : diff === -1 ? 'Yesterday' : diff === 1 ? 'Tomorrow' : diff < 0 ? `${-diff} days ago` : `In ${diff} days`;
    el.textContent = rel;
    el.classList.toggle('is-past', diff < 0);
  }

  function initStrip(form, date, today) {
    const strip = $('#dayStrip');
    const days = +strip.dataset.days;
    const logged = new Set((strip.dataset.logged || '').split(',').filter(Boolean).map(Number));
    strip.style.setProperty('--days', days);
    let html = '';
    for (let d = 1; d <= days; d++) {
      const dt = new Date(date.getFullYear(), date.getMonth(), d);
      const future = dt > today;
      const cur = d === date.getDate();
      const cls = ['strip__day', logged.has(d) ? 'is-logged' : '', [0, 6].includes(dt.getDay()) ? 'is-weekend' : '', +dt === +today ? 'is-today' : '', future ? 'is-future' : ''].filter(Boolean).join(' ');
      const label = `${Eco.fmt(dt, { weekday: 'long', day: 'numeric', month: 'long' })}${logged.has(d) ? ', has entries' : ''}`;
      html += future
        ? `<span class="${cls}" aria-disabled="true"><span class="strip__dow">${Eco.fmt(dt, { weekday: 'narrow' })}</span><span class="strip__num">${d}</span><span class="strip__mark"></span></span>`
        : `<a class="${cls}" href="${Eco.dayUrl(dt)}" ${cur ? 'aria-current="date"' : ''} aria-label="${label}"><span class="strip__dow">${Eco.fmt(dt, { weekday: 'narrow' })}</span><span class="strip__num">${d}</span><span class="strip__mark"></span></a>`;
    }
    strip.innerHTML = html;
  }

  function initDockNav(date, today) {
    const prev = new Date(date); prev.setDate(prev.getDate() - 1);
    const next = new Date(date); next.setDate(next.getDate() + 1);
    $('#dockPrev').href = Eco.dayUrl(prev);
    $('#dockPrev').dataset.tip = Eco.fmt(prev, { weekday: 'long', day: 'numeric', month: 'short' });
    const nextBtn = $('#dockNext');
    if (next > today) { nextBtn.setAttribute('aria-disabled', 'true'); nextBtn.removeAttribute('href'); }
    else { nextBtn.href = Eco.dayUrl(next); nextBtn.dataset.tip = Eco.fmt(next, { weekday: 'long', day: 'numeric', month: 'short' }); }
    if (+date === +today) $('#dockToday').setAttribute('aria-disabled', 'true');

    const jump = $('#dockJump');
    const jumpInput = $('#jumpDate');
    jump.dataset.datefield = 'jumpDate';
    jump.dataset.max = Eco.iso(today);
    jump.insertAdjacentHTML('beforeend', '<span class="select-btn__value" hidden></span>');
    Eco.datefield(jump);
    jumpInput.addEventListener('input', () => { const d = Eco.parseISO(jumpInput.value); if (d && +d !== +date) window.location.href = Eco.dayUrl(d); });
  }

  /* ---------------- 24-hour canvas ---------------- */
  function initTimeline(form, date, isToday) {
    const canvas = $('#canvas');
    const track = $('#canvasTrack');
    const cells = $$('.canvas__cell', track);
    const segHost = $('#canvasSegments');
    const selEl = $('#canvasSelection');
    const hidden = $('#hourly_activity_logging');
    const brushesEl = $('#brushes');
    const summary = $('#timelineSummary');
    const composition = $('#composition');
    const manageUrl = $('.timeline__tools a.icon-btn').getAttribute('href');

    const hours = Array(24).fill(null);
    try {
      const parsed = JSON.parse(hidden.value || '[]');
      (Array.isArray(parsed) ? parsed : []).forEach((o) => { if (o && o.hour >= 0 && o.hour < 24) hours[o.hour] = o.activity ?? null; });
    } catch (e) { /* keep empty */ }

    let activities = [];
    let brush = null; // null | 'erase' | activity id
    let sel = null; // {a, b}
    let focusHour = 0;
    const byId = (id) => activities.find((a) => a.id === id);
    const hh = (h) => `${pad(h)}:00`;
    const fmtH = (n) => `${n}h`;

    const luminance = (hex) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
      if (!m) return 0.5;
      const n = parseInt(m[1], 16);
      const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const tone = (hex) => `color-mix(in oklab, ${hex} var(--act-mix), var(--bg-1))`;
    const ink = (hex) => (luminance(hex) > 0.36 ? 'rgba(8,8,10,0.92)' : 'rgba(255,255,255,0.96)');

    function runs() {
      const out = [];
      let start = 0;
      for (let h = 1; h <= 24; h++) {
        if (h === 24 || hours[h] !== hours[start]) { out.push({ start, len: h - start, id: hours[start] }); start = h; }
      }
      return out;
    }

    function render() {
      segHost.innerHTML = runs().map((r) => {
        const col = `grid-column:${r.start + 1} / span ${r.len}`;
        const size = r.len === 1 ? ' seg--tiny' : r.len <= 2 ? ' seg--tight' : '';
        if (r.id === null || r.id === undefined) {
          return `<div class="seg seg--empty${size}" style="${col}">${r.len >= 3 ? `<span class="seg__name">Unlogged · ${fmtH(r.len)}</span>` : ''}</div>`;
        }
        const act = byId(r.id);
        if (!act) return `<div class="seg seg--unknown${size}" style="${col}"><span class="seg__name">Unknown</span><span class="seg__dur">${fmtH(r.len)}</span></div>`;
        return `<div class="seg${size}" style="${col};--seg-bg:${tone(act.color)};--seg-fg:${ink(act.color)}"><span class="seg__name">${esc(act.name)}</span><span class="seg__dur">${fmtH(r.len)}</span></div>`;
      }).join('');

      cells.forEach((c, h) => {
        const act = hours[h] == null ? null : byId(hours[h]);
        const what = hours[h] == null ? 'Unlogged' : act ? act.name : 'Unknown activity';
        c.dataset.tip = `${hh(h)}–${hh(h + 1)} · ${what}`;
        c.setAttribute('aria-label', `${hh(h)} to ${hh(h + 1)}: ${what}`);
      });

      // totals
      const totals = new Map();
      let logged = 0;
      hours.forEach((id) => { if (id != null) { logged++; totals.set(id, (totals.get(id) || 0) + 1); } });
      const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const longest = runs().filter((r) => r.id != null).sort((a, b) => b.len - a.len)[0];
      const longestAct = longest && byId(longest.id);
      summary.innerHTML = logged
        ? `<b>${logged}h</b> logged · ${24 - logged}h open${longestAct ? ` · longest stretch <b>${esc(longestAct.name)}</b> ${longest.len}h` : ''}`
        : 'Nothing logged yet. Drag across the hours to fill in your day.';

      if (!logged) {
        composition.innerHTML = activities.length
          ? `<div class="composition__empty">${icon('paintbrush', 'icon')}<span>Tip: pick an activity above to paint with it, or drag across hours and choose one.</span></div>`
          : `<div class="composition__empty">${icon('palette', 'icon')}<span>There are no activities for ${Eco.fmt(date, { month: 'long' })} yet. Create a few (sleep, work, study…) to start logging time.</span><a class="btn btn--sm" href="${manageUrl}">${icon('plus', 'icon icon--sm')}Create activities</a></div>`;
      } else {
        const bar = sorted.map(([id, n]) => { const a = byId(id); return `<i style="flex-grow:${n};--c:${a ? tone(a.color) : 'var(--bg-4)'}" data-tip="${esc(a ? a.name : 'Unknown')} · ${n}h"></i>`; }).join('') + (logged < 24 ? `<i class="is-open" style="flex-grow:${24 - logged}" data-tip="Unlogged · ${24 - logged}h"></i>` : '');
        const legend = sorted.map(([id, n]) => { const a = byId(id); return `<span class="composition__item"><span class="swatch" style="background:${a ? tone(a.color) : 'var(--bg-4)'}"></span>${esc(a ? a.name : 'Unknown')} <b>${n}h</b><span class="muted">${Math.round((n / 24) * 100)}%</span></span>`; }).join('');
        composition.innerHTML = `<div class="composition__bar">${bar}</div><div class="composition__legend">${legend}</div>`;
      }
      renderSelection();
    }

    function renderSelection() {
      cells.forEach((c, h) => c.setAttribute('aria-selected', sel && h >= Math.min(sel.a, sel.b) && h <= Math.max(sel.a, sel.b) ? 'true' : 'false'));
      if (!sel) { selEl.hidden = true; return; }
      const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
      selEl.hidden = false;
      selEl.style.left = `calc(${(a / 24) * 100}% - 2px)`;
      selEl.style.width = `calc(${((b - a + 1) / 24) * 100}% + 4px)`;
    }

    function renderBrushes() {
      if (!activities.length) { brushesEl.innerHTML = ''; return; }
      brushesEl.innerHTML = activities.map((a, i) => `
        <button type="button" class="brush" style="--c:${tone(a.color)}" data-brush="${a.id}" aria-pressed="${brush === a.id}" data-tip="Paint ${esc(a.name)}${i < 9 ? '' : ''}" ${i < 9 ? `data-kbd="${i + 1}"` : ''}>
          <span class="brush__swatch"></span>${esc(a.name)}
        </button>`).join('') +
        `<button type="button" class="brush brush--eraser" data-brush="erase" aria-pressed="${brush === 'erase'}" data-tip="Erase hours" data-kbd="0">${icon('eraser', 'icon')}Erase</button>`;
      canvas.classList.toggle('brushing', brush !== null);
    }

    brushesEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-brush]');
      if (!b) return;
      const v = b.dataset.brush === 'erase' ? 'erase' : +b.dataset.brush;
      brush = brush === v ? null : v;
      renderBrushes();
    });

    function assign(a, b, value) {
      const lo = Math.min(a, b), hi = Math.max(a, b);
      let changed = false;
      for (let h = lo; h <= hi; h++) { if (hours[h] !== value) { hours[h] = value; changed = true; } }
      if (!changed) return;
      hidden.value = JSON.stringify(hours.map((activity, hour) => ({ hour, activity: activity ?? null })));
      hidden.dispatchEvent(new CustomEvent('eco:timeline', { bubbles: true }));
      render();
    }

    function openAssignMenu() {
      const a = Math.min(sel.a, sel.b), b = Math.max(sel.a, sel.b);
      const wrap = document.createElement('div');
      wrap.className = 'assign-menu';
      const len = b - a + 1;
      wrap.innerHTML = `<div class="assign-menu__head"><span class="assign-menu__range">${hh(a)} – ${hh(b + 1)}</span><span class="muted" style="font-size:12px">${len}h</span></div>`;
      const list = document.createElement('div');
      list.className = 'menu';
      list.setAttribute('role', 'menu');
      if (!activities.length) {
        list.innerHTML = `<div class="empty empty--compact" style="padding:14px 8px"><p class="empty__text">No activities for this month yet.</p><div class="empty__actions"><a class="btn btn--sm" href="${manageUrl}">${icon('plus', 'icon icon--sm')}Create activities</a></div></div>`;
      } else {
        activities.forEach((act, i) => {
          const btn = document.createElement('button');
          btn.type = 'button'; btn.className = 'menu__item'; btn.setAttribute('role', 'menuitem'); btn.tabIndex = -1;
          btn.innerHTML = `<span class="swatch" style="background:${tone(act.color)}"></span><span></span>${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}`;
          btn.children[1].textContent = act.name;
          btn.addEventListener('click', () => { assign(a, b, act.id); close(); });
          list.appendChild(btn);
        });
        if (hours.slice(a, b + 1).some((x) => x != null)) {
          list.insertAdjacentHTML('beforeend', '<div class="menu__sep"></div>');
          const clr = document.createElement('button');
          clr.type = 'button'; clr.className = 'menu__item'; clr.setAttribute('role', 'menuitem'); clr.tabIndex = -1;
          clr.innerHTML = `${icon('eraser')}<span>Clear ${len > 1 ? 'hours' : 'hour'}</span><kbd>0</kbd>`;
          clr.addEventListener('click', () => { assign(a, b, null); close(); });
          list.appendChild(clr);
        }
      }
      wrap.appendChild(list);
      list.addEventListener('keydown', (e) => {
        const items = $$('.menu__item', list);
        const i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); e.preventDefault(); }
        else if (/^[0-9]$/.test(e.key)) {
          const n = +e.key;
          if (n === 0) { assign(a, b, null); close(); }
          else if (activities[n - 1]) { assign(a, b, activities[n - 1].id); close(); }
          e.preventDefault();
        }
      });
      const close = () => { Eco.closePopover(); };
      Eco.popover(selEl, wrap, {
        placement: 'bottom-start', focus: false,
        onClose: () => {
          // a new drag closes this menu on its way in; it owns the selection now
          if (dragging) return;
          sel = null; renderSelection();
          if (list.contains(document.activeElement)) cells[focusHour].focus({ preventScroll: true });
        },
      });
      const first = list.querySelector('.menu__item, a');
      first && first.focus({ preventScroll: true });
    }

    // pointer: drag to select a range; release to assign (brush) or choose
    const hourAt = (x) => {
      const r = track.getBoundingClientRect();
      return Math.max(0, Math.min(23, Math.floor(((x - r.left) / r.width) * 24)));
    };
    let dragging = false;
    track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !e.target.closest('.canvas__cell')) return;
      e.preventDefault();
      dragging = true;
      Eco.closePopover();
      track.setPointerCapture(e.pointerId);
      const h = hourAt(e.clientX);
      // nothing from the last selection may linger: not its focus ring, not its range
      if (track.contains(document.activeElement)) document.activeElement.blur();
      cells.forEach((c, k) => { c.tabIndex = k === h ? 0 : -1; });
      canvas.classList.add('is-dragging');
      focusHour = h;
      sel = { a: h, b: h };
      if (brush !== null) assign(h, h, brush === 'erase' ? null : brush);
      render();
    });
    track.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const h = hourAt(e.clientX);
      if (h === sel.b) return;
      sel.b = h;
      if (brush !== null) assign(sel.a, sel.b, brush === 'erase' ? null : brush);
      renderSelection();
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      canvas.classList.remove('is-dragging');
      if (brush !== null) { sel = null; render(); return; }
      openAssignMenu();
    };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', () => { dragging = false; canvas.classList.remove('is-dragging'); sel = null; renderSelection(); });

    // keyboard
    track.addEventListener('keydown', (e) => {
      const cell = e.target.closest('.canvas__cell');
      if (!cell) return;
      const h = +cell.dataset.hour;
      const move = (to, extend) => {
        to = Math.max(0, Math.min(23, to));
        cells[h].tabIndex = -1; cells[to].tabIndex = 0; cells[to].focus();
        focusHour = to;
        if (extend) { sel = sel ? { a: sel.a, b: to } : { a: h, b: to }; } else { sel = null; }
        render();
      };
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { move(h + (e.key === 'ArrowRight' ? 1 : -1), e.shiftKey); e.preventDefault(); }
      else if (e.key === 'Home' || e.key === 'End') { move(e.key === 'Home' ? 0 : 23, e.shiftKey); e.preventDefault(); }
      else if (e.key === 'Enter' || e.key === ' ') { if (!sel) sel = { a: h, b: h }; renderSelection(); openAssignMenu(); e.preventDefault(); }
      else if (/^[0-9]$/.test(e.key)) {
        const n = +e.key;
        const range = sel || { a: h, b: h };
        if (n === 0) assign(range.a, range.b, null);
        else if (activities[n - 1]) assign(range.a, range.b, activities[n - 1].id);
        sel = null; render(); e.preventDefault();
      } else if (e.key === 'Backspace' || e.key === 'Delete') { const range = sel || { a: h, b: h }; assign(range.a, range.b, null); sel = null; render(); e.preventDefault(); }
      else if (e.key === 'Escape') { sel = null; brush = null; renderBrushes(); render(); }
    });
    cells.forEach((c) => c.addEventListener('focus', () => { focusHour = +c.dataset.hour; }));

    // number keys paint with a brush when the canvas is not focused
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, [contenteditable], .canvas, .popover') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key) && activities.length) {
        const n = +e.key;
        const v = n === 0 ? 'erase' : activities[n - 1] ? activities[n - 1].id : undefined;
        if (v === undefined) return;
        brush = brush === v ? null : v;
        renderBrushes();
        e.preventDefault();
      } else if (e.key === 'Escape' && brush !== null) { brush = null; renderBrushes(); }
    });

    // "now" marker
    if (isToday) {
      const now = $('#canvasNow');
      const place = () => { const d = new Date(); now.style.left = `${((d.getHours() + d.getMinutes() / 60) / 24) * 100}%`; now.hidden = false; now.title = `Now ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
      place();
      setInterval(place, 60000);
    }

    // load this month's activities
    (async () => {
      const res = await Eco.api(canvas.dataset.api);
      if (res.ok && Array.isArray(res.data)) activities = res.data;
      else Eco.toast('Activities could not be loaded. Logged hours are kept.', { type: 'warning' });
      renderBrushes();
      render();
      canvas.classList.add('is-ready');
    })();

    render();
    return { get dirty() { return false; } };
  }

  /* ---------------- sleep ---------------- */
  function initSleep() {
    const bed = $('#bed_time'), wake = $('#wake_up_time'), alarm = $('#first_alarm_time');
    const total = $('#sleepTotal'), totalLabel = $('#sleepTotalLabel');
    const bar = $('#nightBar'), tick = $('#nightAlarm'), note = $('#sleepAlarmNote');
    const track = $('#nightTrack'), axis = $('#nightAxis'), hint = $('#nightHint');
    const pin = $('#nightPin'), guide = $('#nightGuide');

    // the night runs 19:00 → 14:00 the next day, one bar per hour
    const START = 19 * 60, HOURS = 19, SPAN = HOURS * 60, SNAP = 15;
    const HINT = hint.textContent;
    let pending = null; // bed time from the first tap, until the second lands
    const carried = () => alarm.closest('[data-timefield]').hasAttribute('data-default');

    const mins = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ''); return m ? +m[1] * 60 + +m[2] : null; };
    const hhmm = (m) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
    const rel = (m) => (m - START + 1440) % 1440; // minutes into the night
    // times in the 14:00–19:00 gap pin to whichever end of the night they're nearer
    const pos = (m) => { const r = rel(m); return r <= SPAN ? (r / SPAN) * 100 : r < SPAN + (1440 - SPAN) / 2 ? 100 : 0; };
    const dur = (n) => `${Math.floor(n / 60)}h${n % 60 ? ` ${pad(n % 60)}m` : ''}`;

    $('#night').style.setProperty('--hours', HOURS);
    $('.night__hours', track).innerHTML = Array.from({ length: HOURS - 1 }, (_, i) => `<i style="left:${((i + 1) / HOURS) * 100}%"></i>`).join('');
    axis.innerHTML = Array.from({ length: HOURS + 1 }, (_, i) => {
      const h = (START / 60 + i) % 24;
      return `<span style="--i:${i}"${h === 0 ? ' class="is-midnight"' : ''}>${pad(h)}</span>`;
    }).join('');
    // every label fits on a roomy panel; on a tight one keep every other hour
    if (window.ResizeObserver) new ResizeObserver(() => axis.classList.toggle('is-tight', axis.clientWidth < HOURS * 16)).observe(axis);

    const render = () => {
      const b = mins(bed.value), w = mins(wake.value), a = mins(alarm.value);
      if (b != null && w != null) {
        let d = w - b; if (d < 0) d += 1440; // same rule the month statistics use
        total.textContent = dur(d);
        total.classList.remove('is-empty');
        totalLabel.textContent = 'asleep';
        if (pending == null) paintBar(b, w);
      } else {
        total.textContent = '–';
        total.classList.add('is-empty');
        totalLabel.textContent = b == null && w == null ? 'add bed and wake times' : b == null ? 'add a bed time' : 'add a wake time';
        if (pending == null) bar.style.opacity = '0';
      }
      if (a != null) {
        tick.style.opacity = '1';
        tick.style.left = `${pos(a)}%`;
        if (w != null) {
          let late = w - a; if (late < -720) late += 1440; if (late > 720) late -= 1440;
          note.textContent = late > 0 ? `Up ${dur(late).replace('0h ', '')} after first alarm` : late === 0 ? 'Up with the first alarm' : 'Up before the alarm';
        } else note.textContent = `${carried() ? 'Usual alarm' : 'First alarm'} ${alarm.value}`;
      } else { tick.style.opacity = '0'; note.textContent = ''; }
    };

    function paintBar(from, to) {
      let l = pos(from), r = pos(to);
      if (r < l) [l, r] = [r, l];
      bar.style.opacity = '1';
      bar.style.left = `${l}%`;
      bar.style.width = `${Math.max(0.8, r - l)}%`;
    }

    /* ---------- two taps on the track: bed, then wake ---------- */
    const at = (clientX) => {
      const box = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
      return (START + Math.round((x * SPAN) / SNAP) * SNAP) % 1440;
    };
    const place = (el, m) => { el.style.left = `${pos(m)}%`; };
    const tf = (input) => input.closest('[data-timefield]')._tf;
    const write = (input, m) => {
      const v = hhmm(m);
      const field = tf(input);
      if (field) field.set(v); else input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true })); // autosave + render
    };
    const say = (text) => { hint.textContent = text; };

    const cancel = () => {
      if (pending == null) return;
      pending = null;
      pin.hidden = true;
      track.classList.remove('is-pending');
      say(HINT);
      render();
    };

    track.addEventListener('pointermove', (e) => {
      const m = at(e.clientX);
      if (e.pointerType === 'mouse') { // a finger has nothing to hover with
        guide.hidden = false;
        place(guide, m);
        guide.firstElementChild.textContent = hhmm(m);
      }
      if (pending != null) paintBar(pending, m);
    });
    track.addEventListener('pointerleave', () => {
      guide.hidden = true;
      if (pending != null) paintBar(pending, pending);
    });

    track.addEventListener('click', (e) => {
      const m = at(e.clientX);
      if (pending == null) {
        pending = m;
        pin.hidden = false;
        place(pin, m);
        paintBar(m, m);
        track.classList.add('is-pending');
        say(`Bed ${hhmm(m)} — now tap when you woke up.`);
        return;
      }
      if (m === pending) return; // a night needs some length
      // tapped wake before bed: they meant the other way round
      const [from, to] = rel(m) < rel(pending) ? [m, pending] : [pending, m];
      pending = null;
      pin.hidden = true;
      track.classList.remove('is-pending');
      write(bed, from);
      write(wake, to);
      say(`Slept ${hhmm(from)} → ${hhmm(to)}. Tap twice to change it.`);
    });

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });
    document.addEventListener('pointerdown', (e) => { if (!track.contains(e.target)) cancel(); });

    // a carried-over alarm stops being "usual" the moment it's edited
    alarm.addEventListener('input', () => {
      const field = alarm.closest('[data-timefield]');
      field.removeAttribute('data-default');
      field.removeAttribute('title');
    }, { once: true });

    [bed, wake, alarm].forEach((i) => i.addEventListener('input', render));
    render();
  }

  /* ---------------- habits ---------------- */
  function initHabits() {
    const boxes = $$('.habit-list input[type="checkbox"]');
    const ring = $('#habitRing');
    if (!ring) return;
    const C = 2 * Math.PI * 18;
    let wasComplete = null;
    const render = () => {
      const done = boxes.filter((b) => b.checked).length;
      const n = boxes.length;
      ring.style.strokeDashoffset = `${C * (1 - (n ? done / n : 0))}`;
      $('#habitCount').textContent = `${done} of ${n}`;
      const complete = n > 0 && done === n;
      $('#habitLabel').textContent = complete ? 'All done today' : 'done today';
      $('#habitProgress').classList.toggle('is-complete', complete);
      if (wasComplete === false && complete) Eco.toast('Every habit checked off today', { type: 'success' });
      wasComplete = complete;
    };
    boxes.forEach((b) => b.addEventListener('change', render));
    render();
  }

  /* ---------------- autosave ----------------
     The dock only ever says "Saving…" or "Saved": pending edits count as
     saving, since they're on their way. A failed save keeps saying "Saving…",
     explains itself in a toast and retries on its own. */
  function initAutosave(form) {
    const status = $('#saveStatus');
    const dot = $('.status-dot', status);
    const text = $('.dock__status-text', status);
    // version counts edits; a save only reports "Saved" if nothing changed while it was in flight
    let state = 'saved', timer = null, retry = null, inflight = null, again = false, version = 0;

    const setState = (s) => {
      state = s;
      dot.dataset.state = s === 'saved' ? 'saved' : s === 'error' ? 'error' : 'saving';
      const label = s === 'saved' ? 'Saved' : 'Saving…';
      if (text.textContent !== label) text.textContent = label;
    };
    const inTasks = (el) => el.closest('[data-tasks-compact]');
    const schedule = (ms) => { version++; clearTimeout(retry); if (state !== 'saving') setState('dirty'); clearTimeout(timer); timer = setTimeout(save, ms); };

    form.addEventListener('input', (e) => { if (!inTasks(e.target)) schedule(e.target.matches('textarea') ? 1200 : 700); });
    form.addEventListener('change', (e) => { if (!inTasks(e.target) && e.target.type === 'checkbox') schedule(250); });
    form.addEventListener('eco:timeline', () => schedule(500));
    // Enter inside the compact task input must not submit the day form.
    form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type="checkbox"])')) e.preventDefault(); });

    async function save() {
      clearTimeout(timer);
      clearTimeout(retry);
      if (inflight) { again = true; return inflight; }
      setState('saving');
      const sent = version;
      const body = new FormData(form);
      inflight = (async () => {
        try {
          const res = await fetch(form.action, { method: 'POST', body, credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
          if (/\/auth\/login\//.test(res.url)) throw new Error('Your session expired. Log in again to keep saving.');
          if (!res.ok) throw new Error(res.status === 403 ? 'The page expired. Reload to keep saving.' : `The server responded with ${res.status}.`);
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const errors = $$('[data-flash]', doc).filter((m) => /error/.test(m.dataset.flash));
          $$('[data-flash]', doc).forEach((m) => Eco.toast(m.textContent.trim(), { type: /error/.test(m.dataset.flash) ? 'error' : 'info' }));
          if (errors.length) throw new Error(null);
          if (version !== sent) { setState('dirty'); again = true; }
          else setState('saved');
        } catch (err) {
          setState('error');
          if (err.message && err.message !== 'null') Eco.toast(err.message.startsWith('Failed to fetch') ? 'You appear to be offline. Changes are kept on this page.' : err.message, { type: 'error', action: { label: 'Retry', onClick: save } });
          retry = setTimeout(save, 8000);
        } finally {
          inflight = null;
          if (again && state !== 'error') { again = false; clearTimeout(timer); save(); }
          else again = false;
        }
      })();
      return inflight;
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    Eco.onKey('mod+s', save);

    // Never lose edits: finish saving before following an in-app link.
    document.addEventListener('click', async (e) => {
      const a = e.target.closest('a[href]');
      if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.origin !== location.origin) return;
      if (state === 'saved' || state === 'error') return;
      e.preventDefault();
      await save();
      while (inflight) await inflight;
      if (state === 'saved') window.location.href = a.href;
    });
    window.addEventListener('beforeunload', (e) => { if (state === 'dirty' || state === 'saving' || state === 'error') { e.preventDefault(); e.returnValue = ''; } });
  }
})();
