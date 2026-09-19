/* Ecosystem — Overview. Everything here is derived from the day summaries
   the server put on the page (newest first) plus today's hourly log. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, esc, icon, pad } = Eco;

  const read = (id) => { const n = document.getElementById(id); try { return n ? JSON.parse(n.textContent) : null; } catch (e) { return null; } };
  const ones = (bits) => (bits || '').split('').filter((b) => b === '1').length;
  const isLogged = (d) => d && (d.mood != null || d.productivity != null || d.sleep > 0 || ones(d.habits) > 0 || d.thoughts || d.has_reflection);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  let dayIndex = new Map();
  const words = () => Eco.rating.words();
  const moodOf = (v) => Eco.rating.label('mood', v);
  const prodOf = (v) => Eco.rating.label('productivity', v);

  /* the last seven days, ending today: a quick sense of the week around today */
  function renderWeek(host, today, habitNames) {
    const named = habitNames.filter(Boolean).length || 10;
    host.innerHTML = `<div class="week__head"><span class="eyebrow">Last 7 days</span></div><div class="week__days">${Array.from({ length: 7 }, (_, k) => {
      const d = addDays(today, k - 6);
      const r = dayIndex.get(Eco.iso(d));
      const logged = isLogged(r);
      const mood = r && r.mood != null ? r.mood : null;
      const h = r ? ones(r.habits) : 0;
      const tip = logged ? `${Eco.fmt(d, { weekday: 'long' })} · mood ${moodOf(mood)} · ${h} habits` : `${Eco.fmt(d, { weekday: 'long' })} · nothing logged`;
      return `<a class="week__day${k === 6 ? ' is-today' : ''}${logged ? '' : ' is-empty'}" href="${Eco.dayUrl(d)}" data-tip="${esc(tip)}">
        <span class="week__dow">${Eco.fmt(d, { weekday: 'short' })}</span>
        <span class="week__mood num${words() && mood != null ? ' is-word' : ''}">${esc(moodOf(mood))}</span>
        <span class="week__bar"><i style="--w:${Math.min(100, (h / named) * 100)}%"></i></span>
      </a>`;
    }).join('')}</div>`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = $('#overview');
    if (!root) return;
    const days = read('daySummaries') || [];
    const habitNames = (read('habitNames') || []).map((h) => h || '');
    const today = Eco.today();
    const todayIso = Eco.iso(today);
    const byIso = new Map(days.map((d) => [d.date, d]));
    dayIndex = byIso;
    const todayRow = byIso.get(todayIso);
    // keyed by ISO date, not a single server-picked day: the server's own
    // "today" can be a calendar day off from ours (different timezone, or a
    // request landing right on a midnight boundary), so we look up our own
    // local date instead of trusting a server/client match.
    const hourlyGrid = read('todayHourlyGrid') || {};
    const hourly = hourlyGrid[todayIso] || null;
    const hasHourly = Array.isArray(hourly) && hourly.some((x) => x != null);

    /* streaks */
    let streak = 0;
    for (let d = isLogged(todayRow) ? today : addDays(today, -1); isLogged(byIso.get(Eco.iso(d))); d = addDays(d, -1)) streak++;
    const latest = days.find(isLogged);

    renderHero(root, { todayRow, hasHourly, streak, latest, habitNames });
    renderToday(root, { todayRow, hourly, hasHourly, habitNames, today });
    renderTrend({ days, byIso, today });
    renderRhythm({ byIso, today, streak, days });
    renderThoughts(days);

    $('#dockTask').addEventListener('click', () => {
      const input = $('.focus .quick-add__input');
      if (input) { input.scrollIntoView({ block: 'center', behavior: Eco.reduceMotion() ? 'auto' : 'smooth' }); input.focus({ preventScroll: true }); }
    });
  });

  function renderHero(root, { todayRow, hasHourly, streak, latest, habitNames }) {
    const now = new Date();
    const h = now.getHours();
    const part = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    $('#heroGreeting').textContent = `${part}, ${root.dataset.name}`;
    $('#heroDate').textContent = Eco.fmt(now, { weekday: 'long', day: 'numeric', month: 'long' });
    const clock = $('#heroClock');
    const tick = () => { const d = new Date(); clock.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
    tick(); setInterval(tick, 15000);

    const named = habitNames.filter(Boolean).length;
    const parts = [];
    if (todayRow) {
      if (todayRow.mood != null) parts.push(words() ? `mood ${moodOf(todayRow.mood)}` : `mood ${todayRow.mood}/10`);
      if (named && ones(todayRow.habits)) parts.push(`${ones(todayRow.habits)} of ${named} habits`);
      if (todayRow.sleep > 0) parts.push(`${Eco.stats.hours(todayRow.sleep)} of sleep`);
    }
    let text;
    if (parts.length || hasHourly) text = `Today so far: ${parts.join(' · ') || 'hours logged'}.`;
    else if (streak > 0) text = `Yesterday is logged. Log today to make it a ${streak + 1}-day streak.`;
    else if (latest) text = `Today is still unwritten. Your last entry was ${Eco.fmt(Eco.parseISO(latest.date), { day: 'numeric', month: 'long', year: 'numeric' })}.`;
    else text = 'This is where your days come together. Start by logging today.';
    $('#heroSummary').textContent = text;
  }

  async function renderToday(root, { todayRow, hourly, hasHourly, habitNames, today }) {
    const body = $('#todayBody');
    const dayUrl = Eco.dayUrl(today);
    const logged = isLogged(todayRow) || hasHourly;
    const panel = $('#todayPanel');
    panel.classList.toggle('is-empty', !logged);
    if (!logged) {
      invite(panel);
      $('#todayOpen').hidden = true;
      body.innerHTML = `
        <div class="today-empty">
          <div class="today-empty__lead">
            <p class="today-empty__title">Today is still a blank page</p>
            <p class="today-empty__text">Take a minute: rate your mood, note your sleep, check off habits and fill in the hours as the day goes.</p>
            <a class="btn btn--primary" href="${dayUrl}">${icon('calendar-check', 'icon icon--sm')}Start today’s log</a>
          </div>
          <div class="today-empty__steps">
            <a class="step" href="${dayUrl}#checkinTitle">${icon('activity')}<span><b>Check in</b><small>Mood and productivity</small></span>${icon('arrow-right', 'icon icon--sm step__go')}</a>
            <a class="step" href="${dayUrl}#sleepTitle">${icon('moon')}<span><b>Sleep</b><small>Bed, wake and first alarm</small></span>${icon('arrow-right', 'icon icon--sm step__go')}</a>
            <a class="step" href="${dayUrl}#habits">${icon('repeat')}<span><b>Habits</b><small>${habitNames.filter(Boolean).length ? `${habitNames.filter(Boolean).length} set for this month` : 'None set for this month yet'}</small></span>${icon('arrow-right', 'icon icon--sm step__go')}</a>
            <a class="step" href="${dayUrl}#journal">${icon('pen-line')}<span><b>Write</b><small>A thought or a reflection</small></span>${icon('arrow-right', 'icon icon--sm step__go')}</a>
          </div>
        </div>`;
      return;
    }

    const named = habitNames.map((n, i) => ({ n, i })).filter((x) => x.n);
    const doneHabits = todayRow ? named.filter((x) => (todayRow.habits || '')[x.i] === '1').length : 0;
    const stat = (label, value, unit, empty, cls = '') => `<div class="today-stat"><span class="eyebrow">${label}</span><span class="today-stat__value${empty ? ' is-empty' : ''}${cls}">${value}${unit && !empty ? `<small>${unit}</small>` : ''}</span></div>`;
    const rated = (k) => todayRow && todayRow[k] != null;
    const unit = words() ? '' : '/10', wordCls = words() ? ' is-word' : '';
    body.innerHTML = `
      <div class="ribbon" id="ribbon" aria-label="Hours logged today"></div>
      <div class="ribbon__axis" aria-hidden="true"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
      <div class="today-stats">
        ${stat('Mood', rated('mood') ? esc(moodOf(todayRow.mood)) : '–', unit, !rated('mood'), rated('mood') ? wordCls : '')}
        ${stat('Productivity', rated('productivity') ? esc(prodOf(todayRow.productivity)) : '–', unit, !rated('productivity'), rated('productivity') ? wordCls : '')}
        ${stat('Sleep', todayRow && todayRow.sleep > 0 ? Eco.stats.hours(todayRow.sleep) : '–', '', !(todayRow && todayRow.sleep > 0))}
        <div class="today-stat today-stat--habits">
          <span class="eyebrow">Habits</span>
          ${named.length ? `<span class="today-stat__value">${doneHabits}<small>/${named.length}</small></span>
          <svg class="ring today-ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle class="ring__track" cx="15" cy="15" r="12" stroke-width="3.5"/><circle class="ring__value" id="todayRing" cx="15" cy="15" r="12" stroke-width="3.5" stroke="var(--green)"/></svg>` : `<a class="today-stat__value is-empty link-quiet" href="/habits/${today.getFullYear()}/${today.getMonth() + 1}/">Set habits</a>`}
        </div>
      </div>
      ${todayRow && todayRow.thoughts ? `<blockquote class="today-quote">${icon('quote', 'icon')}<p></p></blockquote>` : ''}
      <div class="week" id="week"></div>`;
    if (todayRow && todayRow.thoughts) $('.today-quote p', body).textContent = todayRow.thoughts;
    renderWeek($('#week'), today, habitNames);
    const ringEl = $('#todayRing');
    if (ringEl) Eco.charts.ring(ringEl, named.length ? doneHabits / named.length : 0);

    const ribbon = $('#ribbon');
    const drawRibbon = (acts) => {
      const hours = Array.isArray(hourly) ? hourly : Array(24).fill(null);
      const byId = new Map((acts || []).map((a) => [a.id, a]));
      ribbon.innerHTML = hours.map((id, h) => {
        const a = id == null ? null : byId.get(id);
        const label = `${pad(h)}:00 · ${id == null ? 'Unlogged' : a ? a.name : 'Unknown activity'}`;
        return `<i class="${id == null ? 'is-empty' : ''}" style="${a ? `--c:${Eco.charts.tone(a.color)}` : id != null ? '--c:var(--bg-4)' : ''}" data-tip="${esc(label)}"></i>`;
      }).join('');
      if (!hasHourly) ribbon.insertAdjacentHTML('beforeend', `<a class="ribbon__hint link-quiet" href="${dayUrl}">No hours logged yet · fill in your day</a>`);
    };
    drawRibbon([]);
    let lastActs = [];
    if (hasHourly) {
      const res = await Eco.api(`${root.dataset.activitiesApi}?year=${today.getFullYear()}&month=${today.getMonth() + 1}`);
      lastActs = res.ok ? res.data : [];
      drawRibbon(lastActs);
    }
    document.addEventListener('eco:theme', () => drawRibbon(lastActs));
  }

  /* an empty Today invites a start: a soft light follows the pointer across it */
  function invite(panel) {
    if (panel._invite || Eco.reduceMotion() || window.matchMedia('(hover: none)').matches) return;
    panel._invite = true;
    let raf = 0, x = 0, y = 0;
    panel.addEventListener('pointermove', (e) => {
      const r = panel.getBoundingClientRect();
      x = e.clientX - r.left; y = e.clientY - r.top;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; panel.style.setProperty('--gx', `${x}px`); panel.style.setProperty('--gy', `${y}px`); });
    }, { passive: true });
  }

  function renderTrend({ days, byIso, today }) {
    const rated = (d) => d && (d.mood != null || d.productivity != null || d.sleep > 0);
    let end = today;
    const windowCount = (e) => { let c = 0; for (let i = 0; i < 30; i++) if (rated(byIso.get(Eco.iso(addDays(e, -i))))) c++; return c; };
    let count = windowCount(end);
    const note = $('#trendNote');
    if (count < 2) {
      const lastRated = days.find(rated);
      if (!lastRated) {
        $('#trendChart').innerHTML = `<div class="empty"><div class="empty__glyph">${icon('activity', 'icon icon--lg')}</div><p class="empty__title">No check-ins yet</p><p class="empty__text">Rate your mood and productivity on a day, and add your sleep. Your 30-day trend will draw itself here.</p></div>`;
        $('.trend .chart-legend').hidden = true;
        return;
      }
      end = Eco.parseISO(lastRated.date);
      count = windowCount(end);
      $('#trendLabel').textContent = `30 days to ${Eco.fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
      note.textContent = 'No check-ins in the last 30 days, so this shows your most recent stretch.';
    } else {
      const moods = []; for (let i = 0; i < 30; i++) { const d = byIso.get(Eco.iso(addDays(end, -i))); if (d && d.mood != null) moods.push(d.mood); }
      const avg = Eco.stats.avg(moods);
      note.textContent = avg != null ? `${count} check-ins · average mood ${moodOf(avg)}` : `${count} check-ins`;
    }
    const dates = Array.from({ length: 30 }, (_, i) => addDays(end, i - 29));
    const rows = dates.map((d) => byIso.get(Eco.iso(d)));
    const mood = rows.map((r) => (r ? r.mood : null));
    const prod = rows.map((r) => (r ? r.productivity : null));
    const sleep = rows.map((r) => (r && r.sleep > 0 ? r.sleep : null));
    const tooltip = (i) => Eco.tt(Eco.fmt(dates[i], { weekday: 'short', day: 'numeric', month: 'short' }), [
      { label: 'Mood', value: moodOf(mood[i]), color: 'var(--green)' },
      { label: 'Productivity', value: prodOf(prod[i]), color: 'var(--indigo)' },
      { label: 'Sleep', value: sleep[i] != null ? Eco.stats.hours(sleep[i]) : '–', color: 'var(--sky)' },
    ]);
    const go = (i) => { window.location.href = Eco.dayUrl(dates[i]); };
    const fmtX = (d) => Eco.fmt(d, { day: 'numeric', month: 'short' });
    Eco.charts.line($('#trendChart'), {
      labels: dates, band: true, height: 176, yMin: 0, yMax: 10, yTicks: [0, 5, 10], formatX: () => '', pad: { b: 8 },
      series: [{ name: 'Mood', color: 'var(--green)', values: mood }, { name: 'Productivity', color: 'var(--indigo)', values: prod, areaOpacity: 0.12 }],
      tooltip, onClick: go, label: 'Mood and productivity over 30 days',
    });
    Eco.charts.bars($('#sleepChart'), {
      labels: dates, values: sleep, height: 70, yMax: 12, yTicks: [0], yAxis: true, formatY: () => '', color: 'var(--sky)', maxBar: 10, fill: 0.42,
      formatX: fmtX, xEvery: 7, pad: { t: 10 }, tooltip, onClick: go, label: 'Hours of sleep over 30 days',
    });
  }

  function renderRhythm({ byIso, today, streak, days }) {
    let logged30 = 0, written30 = 0;
    for (let i = 0; i < 30; i++) { const d = byIso.get(Eco.iso(addDays(today, -i))); if (isLogged(d)) logged30++; if (d && (d.thoughts || d.has_reflection)) written30++; }
    let best = 0, run = 0;
    for (let i = 0; i < 120; i++) { if (isLogged(byIso.get(Eco.iso(addDays(today, -i))))) { run++; best = Math.max(best, run); } else run = 0; }
    $('#rhythmStats').innerHTML = `
      <div><span class="eyebrow">Streak</span><b class="num" data-count-to="${streak}">${streak}</b><small>${streak === 1 ? 'day' : 'days'}</small></div>
      <div><span class="eyebrow">Logged</span><b class="num" data-count-to="${logged30}">${logged30}</b><small>of 30 days</small></div>
      <div><span class="eyebrow">Written</span><b class="num" data-count-to="${written30}">${written30}</b><small>of 30 days</small></div>`;
    Eco.initControls($('#rhythmStats'));
    const level = (d) => { if (!isLogged(d)) return null; const n = ones(d.habits); return n === 0 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4; };
    const color = (l) => Eco.charts.mix(Eco.charts.css('--bg-3'), Eco.charts.css('--green'), [0, 0.22, 0.45, 0.7, 1][l]);
    const start = addDays(today, -16 * 7 + 1);
    Eco.charts.calendar($('#rhythmCalendar'), {
      start, end: today, gap: 3, maxCell: 16,
      value: (d) => level(byIso.get(Eco.iso(d))),
      color,
      tooltip: (d, v) => { const r = byIso.get(Eco.iso(d)); return Eco.tt(Eco.fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }), v == null ? [{ label: 'Nothing logged', value: '' }] : [{ label: 'Habits done', value: ones(r.habits) }, { label: 'Mood', value: moodOf(r.mood) }]); },
      onClick: (d) => { if (d <= today) window.location.href = Eco.dayUrl(d); },
      label: 'Days logged over the last 16 weeks',
    });
    document.querySelectorAll('.rhythm__legend i').forEach((i) => { i.style.background = +i.dataset.l === 0 ? Eco.charts.css('--empty-cell') : color(+i.dataset.l); });
    if (!days.some(isLogged)) $('.rhythm__legend').hidden = true;
  }

  function renderThoughts(days) {
    const host = $('#thoughts');
    const written = days.filter((d) => d.thoughts).slice(0, 6);
    if (!written.length) {
      host.innerHTML = `<div class="panel"><div class="empty"><div class="empty__glyph">${icon('quote', 'icon icon--lg')}</div><p class="empty__title">No thoughts yet</p><p class="empty__text">Each day has room for one short thought. The latest ones collect here.</p></div></div>`;
      return;
    }
    host.innerHTML = written.map((d) => {
      const date = Eco.parseISO(d.date);
      return `<a class="thought" href="${Eco.dayUrl(date)}#journal">
        <span class="thought__date"><span class="eyebrow">${Eco.fmt(date, { weekday: 'short' })}</span><span>${Eco.fmt(date, { day: 'numeric', month: 'short', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })}</span></span>
        <p class="thought__text"></p>
        <span class="thought__meta">${d.mood != null ? `<span class="tag"><span class="dot" style="background:var(--green)"></span>${words() ? esc(moodOf(d.mood)) : `Mood ${d.mood}`}</span>` : ''}${d.has_reflection ? `<span class="tag">${icon('pen-line', 'icon')}Reflection</span>` : ''}</span>
      </a>`;
    }).join('');
    host.querySelectorAll('.thought__text').forEach((p, i) => { p.textContent = written[i].thoughts; });
  }
})();
