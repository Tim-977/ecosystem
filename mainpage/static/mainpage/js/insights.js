/* Ecosystem — Insights (month and year). All figures are computed from the
   day summaries, hourly grid and activity data the server rendered on the page. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$, esc, icon, pad } = Eco;
  const S = () => Eco.stats;
  const read = (id) => { const n = document.getElementById(id); try { return n ? JSON.parse(n.textContent) : null; } catch (e) { return null; } };
  const ones = (bits, named) => named.reduce((n, i) => n + ((bits || '')[i] === '1' ? 1 : 0), 0);
  const isLogged = (d) => d && (d.mood != null || d.productivity != null || d.sleep > 0 || (d.habits || '').includes('1') || d.thoughts || d.has_reflection);
  const emptyState = (glyph, title, text) => `<div class="empty empty--compact"><div class="empty__glyph">${icon(glyph, 'icon icon--lg')}</div><p class="empty__title">${title}</p><p class="empty__text">${text}</p></div>`;
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  /* mood and productivity read as the person rates them; charts stay numeric */
  const R = (kind, v) => Eco.rating.label(kind, v);
  const SEP = '|';

  function kpi(key, value, unit, foot, series, color, o = {}) {
    const tile = $(`[data-kpi="${key}"]`);
    if (!tile) return;
    const v = $('.metric__value', tile);
    if (value == null) { v.textContent = '–'; v.classList.add('is-empty'); }
    else if (o.word) { v.textContent = Eco.rating.word(o.word, value); v.classList.add('is-word'); }
    else v.innerHTML = `<span data-count-to="${value}" data-decimals="${o.decimals ?? 1}">${(+value).toFixed(o.decimals ?? 1)}</span>${unit ? `<small>${unit}</small>` : ''}`;
    $('.metric__foot span', tile).textContent = foot || '';
    if (series) Eco.charts.spark($('.metric__spark', tile), series, { color, min: o.min, max: o.max });
  }

  /* horizontal bars: hours per activity */
  function renderActivityBars(host, rows, metaEl) {
    if (!rows.length) {
      host.innerHTML = emptyState('clock', 'No hours logged', 'Paint hours on the Day timeline with your activities to see where your time goes.');
      if (metaEl) metaEl.textContent = '';
      return;
    }
    const total = rows.reduce((n, r) => n + r.hours, 0);
    const max = Math.max(...rows.map((r) => r.hours));
    if (metaEl) metaEl.textContent = `${total.toLocaleString()} hours logged`;
    host.innerHTML = rows.map((r, i) => {
      const c = r.color ? Eco.charts.tone(r.color) : 'var(--bg-4)';
      const pct = Math.round((r.hours / total) * 100);
      return `<div class="hbar" data-tip="${esc(r.name)} · ${r.hours}h · ${pct}%">
        <span class="hbar__label"><span class="swatch" style="background:${c}"></span>${esc(r.name)}</span>
        <span class="hbar__track"><i style="--w:${(r.hours / max) * 100}%;--c:${c};animation-delay:${i * 40}ms"></i></span>
        <span class="hbar__value num">${r.hours.toLocaleString()}h</span>
        <span class="hbar__pct num">${pct}%</span>
      </div>`;
    }).join('');
  }

  function renderHeatLegend(host, items) {
    host.innerHTML = items.length
      ? items.map((a) => `<span><i style="background:${Eco.charts.tone(a.color)}"></i>${esc(a.name)}</span>`).join('') + '<span><i class="is-empty"></i>Unlogged</span>'
      : '';
  }

  function wireToggle(segId, mapId, legendId, posterId) {
    const view = document.getElementById(segId);
    if (!view) return;
    view.addEventListener('eco:change', (e) => {
      const poster = e.detail === 'poster';
      document.getElementById(posterId).hidden = !poster;
      document.getElementById(mapId).hidden = poster;
      document.getElementById(legendId).hidden = poster;
    });
  }

  /* ===================== month ===================== */
  function month(root) {
    const year = +root.dataset.year, mon = +root.dataset.month, days = +root.dataset.days;
    const today = Eco.today();
    const first = new Date(year, mon - 1, 1);
    const elapsed = first > today ? 0 : (year === today.getFullYear() && mon === today.getMonth() + 1 ? today.getDate() : days);
    const summaries = read('daySummaries') || [];
    const byDay = new Map(summaries.map((d) => [Eco.parseISO(d.date).getDate(), d]));
    const grid = read('hourlyGrid') || {};
    const legend = read('activityLegend') || [];
    const actById = new Map(legend.map((a) => [a.id, a]));
    const habitNames = read('habitNames') || [];
    const named = habitNames.map((n, i) => (n ? i : -1)).filter((i) => i >= 0);
    const dayDate = (d) => new Date(year, mon - 1, d);
    const dayList = Array.from({ length: days }, (_, i) => i + 1);
    const col = (k) => dayList.map((d) => { const r = byDay.get(d); return r ? r[k] : null; });
    const mood = col('mood'), prod = col('productivity');
    const sleep = dayList.map((d) => { const r = byDay.get(d); return r && r.sleep > 0 ? r.sleep : null; });
    const monthName = Eco.fmt(first, { month: 'long' });
    const loggedDays = dayList.filter((d) => isLogged(byDay.get(d)));
    const written = dayList.filter((d) => { const r = byDay.get(d); return r && (r.thoughts || r.has_reflection); });

    // KPIs
    const bestIdx = (vals) => { let bi = -1; vals.forEach((v, i) => { if (v != null && (bi < 0 || v > vals[bi])) bi = i; }); return bi; };
    const bm = bestIdx(mood), bp = bestIdx(prod);
    const words = Eco.rating.words();
    const best = (kind, vals, i) => {
      const on = Eco.fmt(dayDate(i + 1), { month: 'short', day: 'numeric' });
      return words ? `Best on ${on}` : `Best ${vals[i]} · ${on}`;
    };
    kpi('mood', S().avg(mood), words ? '' : '/10', bm >= 0 ? best('mood', mood, bm) : 'No ratings yet', mood, 'var(--green)', { min: 0, max: 10, word: words && 'mood' });
    kpi('productivity', S().avg(prod), words ? '' : '/10', bp >= 0 ? best('productivity', prod, bp) : 'No ratings yet', prod, 'var(--indigo)', { min: 0, max: 10, word: words && 'productivity' });
    const nights = sleep.filter((v) => v != null);
    const avgSleep = S().avg(sleep);
    if (avgSleep == null) kpi('sleep', null, '', 'No nights tracked', null);
    else {
      kpi('sleep', null, '', `${nights.length} ${nights.length === 1 ? 'night' : 'nights'} tracked`, sleep, 'var(--sky)', { min: 0 });
      const v = $('[data-kpi="sleep"] .metric__value');
      v.classList.remove('is-empty');
      v.textContent = S().hours(avgSleep);
    }
    if (named.length && elapsed) {
      const perDay = dayList.slice(0, elapsed).map((d) => { const r = byDay.get(d); return r ? ones(r.habits, named) : 0; });
      const done = perDay.reduce((a, b) => a + b, 0);
      kpi('habits', Math.round((done / (named.length * elapsed)) * 100), '%', `${done} check-offs · ${named.length} habits`, perDay, 'var(--orange)', { decimals: 0, min: 0, max: named.length });
    } else kpi('habits', null, '', named.length ? 'Month hasn’t started' : 'No habits set', null);
    kpi('logged', loggedDays.length, `/${elapsed || days}`, `${written.length} with writing`, null, null, { decimals: 0 });
    Eco.initControls($('#kpis'));
    const summary = $('#monthSummary');
    if (summary) summary.textContent = loggedDays.length ? `${loggedDays.length} days logged · ${written.length} journal entries · ${nights.length} nights of sleep tracked.` : `Nothing logged in ${monthName} yet.`;

    const tipFor = (i) => Eco.tt(Eco.fmt(dayDate(i + 1), { weekday: 'long', day: 'numeric', month: 'short' }), [
      { label: 'Mood', value: R('mood', mood[i]), color: 'var(--green)' },
      { label: 'Productivity', value: R('productivity', prod[i]), color: 'var(--indigo)' },
      { label: 'Sleep', value: sleep[i] != null ? S().hours(sleep[i]) : '–', color: 'var(--sky)' },
    ]);
    const openDay = (i) => { if (dayDate(i + 1) <= today) window.location.href = Eco.dayUrl(dayDate(i + 1)); };

    // mood & productivity
    if (mood.some((v) => v != null) || prod.some((v) => v != null)) {
      Eco.charts.line($('#moodChart'), {
        labels: dayList, height: 240, yMin: 0, yMax: 10, yTicks: [0, 5, 10], band: true, xEvery: 5, formatX: (d) => d,
        series: [{ color: 'var(--green)', values: mood }, { color: 'var(--indigo)', values: prod, areaOpacity: 0.1 }],
        tooltip: tipFor, onClick: openDay, label: `Mood and productivity in ${monthName}`,
      });
    } else $('#moodChart').innerHTML = emptyState('activity', 'No ratings this month', 'Rate mood and productivity on the Day page to chart them here.');

    // weekday pattern
    const wk = WEEKDAYS.map(() => ({ sum: 0, n: 0, p: 0, pn: 0 }));
    dayList.forEach((d, i) => {
      const w = (dayDate(d).getDay() + 6) % 7;
      if (mood[i] != null) { wk[w].sum += mood[i]; wk[w].n++; }
      if (prod[i] != null) { wk[w].p += prod[i]; wk[w].pn++; }
    });
    const wAvg = wk.map((w) => (w.n ? w.sum / w.n : null));
    const top = Math.max(...wAvg.filter((v) => v != null));
    $('#weekday').innerHTML = wAvg.some((v) => v != null)
      ? WEEKDAYS.map((name, i) => `
        <div class="weekday__row${wAvg[i] === top ? ' is-top' : ''}" data-tip="${name} · mood ${R('mood', wAvg[i])} · productivity ${R('productivity', wk[i].pn ? wk[i].p / wk[i].pn : null)} · ${wk[i].n} days">
          <span class="weekday__name">${name}</span>
          <span class="weekday__track"><i style="--w:${wAvg[i] != null ? wAvg[i] * 10 : 0}%"></i>${wk[i].pn ? `<b style="left:${(wk[i].p / wk[i].pn) * 10}%"></b>` : ''}</span>
          <span class="weekday__val num">${wAvg[i] != null ? S().fmt(wAvg[i]) : '–'}</span>
        </div>`).join('') + '<p class="weekday__note"><i></i>Mood<b></b>Productivity</p>'
      : emptyState('calendar-days', 'Not enough ratings', 'Weekday patterns appear once a few days are rated.');

    // sleep
    if (nights.length) {
      $('#sleepMeta').textContent = `avg ${S().hours(avgSleep)} · ${nights.length} nights`;
      Eco.charts.bars($('#sleepChart'), {
        labels: dayList, values: sleep, height: 210, yMax: Math.max(10, Math.ceil(Math.max(...nights))), yTicks: [0, 4, 8], formatY: (v) => `${v}h`, xEvery: 5,
        color: (v) => (v >= 7 ? Eco.charts.css('--sky') : Eco.charts.mix(Eco.charts.css('--bg-4'), Eco.charts.css('--sky'), 0.5)), maxBar: 14,
        refLines: [{ y: 8, label: '8h' }], tooltip: tipFor, onClick: openDay, label: `Hours of sleep in ${monthName}`,
      });
    } else $('#sleepChart').innerHTML = emptyState('moon', 'No sleep tracked', 'Add bed and wake times on a day to see your nights here.');

    // activity hours: the server's per-activity totals ("Name (ID: n)" → hours)
    const agg = read('activityHours') || {};
    const rows = Object.entries(agg).map(([key, hours]) => {
      const m = /^(.*) \(ID: (\d+)\)$/.exec(key);
      const a = m ? actById.get(+m[2]) : null;
      return { name: m ? m[1] : key, hours, color: a ? a.color : null };
    }).sort((a, b) => b.hours - a.hours);
    renderActivityBars($('#actBars'), rows, $('#actMeta'));

    // activity map
    const used = new Set();
    Object.values(grid).forEach((hours) => hours.forEach((id) => id != null && used.add(id)));
    if (used.size) {
      Eco.charts.matrix($('#heatMap'), {
        cols: days, rows: 24, gap: 2, cellHeight: 11, radius: 2,
        cell: (c, r) => { const h = grid[c + 1]; const id = h ? h[r] : null; if (id == null) return null; const a = actById.get(id); return a ? { color: a.color } : { unknown: true }; },
        rowTicks: [0, 6, 12, 18], rowLabel: (r) => pad(r),
        colTicks: [0, 4, 9, 14, 19, 24, days - 1], colLabel: (c) => c + 1,
        tooltip: (c, r) => {
          const h = grid[c + 1]; const id = h ? h[r] : null; const a = id != null ? actById.get(id) : null;
          return Eco.tt(`${Eco.fmt(dayDate(c + 1), { weekday: 'short', day: 'numeric', month: 'short' })} · ${pad(r)}:00`, [{ label: id == null ? 'Unlogged' : a ? a.name : 'Unknown activity', value: '', color: a ? Eco.charts.tone(a.color) : undefined }]);
        },
        onClick: (c) => openDay(c), label: `Hourly activities in ${monthName}`,
      });
      renderHeatLegend($('#heatLegend'), legend.filter((a) => used.has(a.id)));
    } else $('#heatMap').innerHTML = emptyState('layout-grid', 'No hours logged this month', 'Once you fill in the Day timeline, every hour of the month appears here as a map.');
    wireToggle('heatView', 'heatMap', 'heatLegend', 'heatPoster');

    // habit consistency
    const hm = $('#habitMap');
    if (named.length) {
      hm.style.setProperty('--days', days);
      hm.innerHTML = `<div class="hmap">${named.map((i) => {
        let count = 0;
        const cells = dayList.map((d) => {
          const dt = dayDate(d); const r = byDay.get(d); const future = dt > today;
          const done = !future && r && (r.habits || '')[i] === '1';
          if (done) count++;
          return `<span class="hcell${done ? ' is-done' : ''}${future ? ' is-future' : ''}" data-tip="${esc(habitNames[i])} · ${Eco.fmt(dt, { day: 'numeric', month: 'short' })} · ${future ? 'upcoming' : done ? 'done' : 'not done'}"></span>`;
        }).join('');
        return `<div class="hmap__row"><span class="hmap__name">${esc(habitNames[i])}</span><span class="hmap__cells">${cells}</span><span class="hmap__stat num">${elapsed ? Math.round((count / elapsed) * 100) : 0}%</span></div>`;
      }).join('')}</div>`;
    } else hm.innerHTML = emptyState('repeat', `No habits for ${monthName}`, 'Set habits for the month to see how consistently you kept them.');

    $$('.row-link').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) window.location.href = tr.dataset.href; }));
  }

  /* ===================== year ===================== */
  function year(root) {
    const yr = +root.dataset.year;
    const today = Eco.today();
    const summaries = read('daySummaries') || [];
    const byIso = new Map(summaries.map((d) => [d.date, d]));
    const grid = read('hourlyGrid') || {};
    const legend = read('activityLegend') || [];
    const actById = new Map(legend.map((a) => [a.id, a]));
    const start = new Date(yr, 0, 1), end = new Date(yr, 11, 31);
    const lastDay = end < today ? end : today;
    const logged = summaries.filter(isLogged);
    const mName = (i) => Eco.fmt(new Date(yr, i, 1), { month: 'long' });

    const monthly = Array.from({ length: 12 }, (_, m) => summaries.filter((d) => Eco.parseISO(d.date).getMonth() === m));
    const monthAvg = (pick) => monthly.map((rows) => S().avg(rows.map(pick).filter((v) => v != null)));
    const mMood = monthAvg((r) => r.mood), mProd = monthAvg((r) => r.productivity), mSleep = monthAvg((r) => (r.sleep > 0 ? r.sleep : null));
    const bestMonth = (arr) => { let bi = -1; arr.forEach((v, i) => { if (v != null && (bi < 0 || v > arr[bi])) bi = i; }); return bi; };
    const moods = summaries.map((d) => d.mood).filter((v) => v != null);
    const prods = summaries.map((d) => d.productivity).filter((v) => v != null);
    const sleeps = summaries.map((d) => (d.sleep > 0 ? d.sleep : null)).filter((v) => v != null);

    const words = Eco.rating.words();
    kpi('mood', S().avg(moods), words ? '' : '/10', bestMonth(mMood) >= 0 ? `Best: ${Eco.fmt(new Date(yr, bestMonth(mMood), 1), { month: 'short' })}` : 'No ratings yet', mMood, 'var(--green)', { min: 0, max: 10, word: words && 'mood' });
    kpi('productivity', S().avg(prods), words ? '' : '/10', bestMonth(mProd) >= 0 ? `Best: ${Eco.fmt(new Date(yr, bestMonth(mProd), 1), { month: 'short' })}` : 'No ratings yet', mProd, 'var(--indigo)', { min: 0, max: 10, word: words && 'productivity' });
    kpi('sleep', null, '', sleeps.length ? `${sleeps.length} nights tracked` : 'No nights tracked', sleeps.length ? mSleep : null, 'var(--sky)', { min: 0 });
    if (sleeps.length) { const v = $('[data-kpi="sleep"] .metric__value'); v.classList.remove('is-empty'); v.textContent = S().hours(S().avg(sleeps)); }
    const hoursIn = (rows) => rows.reduce((n, r) => n + (grid[r.date] || []).filter((x) => x != null).length, 0);
    const totalHours = Object.values(grid).reduce((n, h) => n + h.filter((x) => x != null).length, 0);
    const daysWithHours = Object.values(grid).filter((h) => h.some((x) => x != null)).length;
    kpi('hours', totalHours || null, 'h', totalHours ? `across ${daysWithHours} days` : 'No hours logged', totalHours ? monthly.map(hoursIn) : null, 'var(--fg-3)', { decimals: 0, min: 0 });
    const elapsedDays = start > today ? 0 : Math.round((lastDay - start) / 86400000) + 1;
    kpi('logged', logged.length, `/${elapsedDays || 365}`, `${summaries.filter((d) => d.thoughts || d.has_reflection).length} with writing`, null, null, { decimals: 0 });
    Eco.initControls($('#kpis'));
    $('#yearSummary').textContent = logged.length
      ? `${logged.length} days logged across ${monthly.filter((r) => r.some(isLogged)).length} months.`
      : `Nothing logged in ${yr} yet.`;

    // calendar heatmap with a metric switch
    const valueOf = (pick) => (d) => { const r = byIso.get(Eco.iso(d)); return r ? pick(r) : null; };
    const shade = (token, t) => Eco.charts.mix(Eco.charts.css('--bg-3'), Eco.charts.css(token), t);
    const metrics = {
      mood: { label: 'Mood', value: valueOf((r) => r.mood), color: (v) => shade('--green', 0.15 + (v / 10) * 0.85), fmt: (v) => (words ? R('mood', v) : `${v}/10`), samples: [2, 4, 6, 8, 10] },
      productivity: { label: 'Productivity', value: valueOf((r) => r.productivity), color: (v) => shade('--indigo', 0.15 + (v / 10) * 0.85), fmt: (v) => (words ? R('productivity', v) : `${v}/10`), samples: [2, 4, 6, 8, 10] },
      sleep: { label: 'Sleep', value: valueOf((r) => (r.sleep > 0 ? r.sleep : null)), color: (v) => shade('--sky', Math.max(0.12, Math.min(1, (v - 3) / 6))), fmt: (v) => S().hours(v), samples: [4, 6, 7, 8, 9] },
      habits: { label: 'Habits done', value: valueOf((r) => { const n = (r.habits || '').split('').filter((b) => b === '1').length; return n || null; }), color: (v) => shade('--orange', 0.18 + Math.min(1, v / 8) * 0.82), fmt: (v) => v, samples: [1, 2, 4, 6, 8] },
    };
    let metric = 'mood';
    const tooltip = (d, v) => Eco.tt(Eco.fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }), [{ label: metrics[metric].label, value: v == null ? '–' : metrics[metric].fmt(v) }]);
    const cal = Eco.charts.calendar($('#yearCalendar'), {
      start, end, gap: 3, maxCell: 17, value: metrics[metric].value, color: metrics[metric].color, tooltip,
      onClick: (d) => { if (d <= today) window.location.href = Eco.dayUrl(d); }, label: `${yr} calendar`,
    });
    const legendScale = () => {
      const m = metrics[metric];
      $('#calLegend').innerHTML = `<span>Less</span>${m.samples.map((v) => `<i style="background:${m.color(v)}"></i>`).join('')}<span>More</span>`;
    };
    legendScale();
    document.addEventListener('eco:theme', () => { cal.recolor(metrics[metric].value, metrics[metric].color, tooltip); legendScale(); });
    const segs = ['yearMetric', 'dockMetric'].map((id) => document.getElementById(id)).filter(Boolean);
    segs.forEach((s) => s.addEventListener('eco:change', (e) => {
      metric = e.detail;
      segs.forEach((o) => { if (o !== s) Eco.segmented(o).select($(`[data-value="${metric}"]`, o), false); });
      cal.recolor(metrics[metric].value, metrics[metric].color, tooltip);
      legendScale();
      $('#calTitle').textContent = metrics[metric].label;
    }));

    // monthly averages
    if (moods.length || prods.length) {
      Eco.charts.line($('#monthlyChart'), {
        labels: Array.from({ length: 12 }, (_, i) => i), band: true, height: 220, yMin: 0, yMax: 10, yTicks: [0, 5, 10], xEvery: 1,
        formatX: (i) => Eco.fmt(new Date(yr, i, 1), { month: 'short' }),
        series: [{ color: 'var(--green)', values: mMood }, { color: 'var(--indigo)', values: mProd, areaOpacity: 0.1 }],
        tooltip: (i) => Eco.tt(mName(i), [
          { label: 'Mood', value: R('mood', mMood[i]), color: 'var(--green)' },
          { label: 'Productivity', value: R('productivity', mProd[i]), color: 'var(--indigo)' },
          { label: 'Sleep', value: mSleep[i] != null ? S().hours(mSleep[i]) : '–', color: 'var(--sky)' },
          { label: 'Days logged', value: monthly[i].filter(isLogged).length },
        ]),
        onClick: (i) => { window.location.href = `/month/${yr}/${i + 1}/`; }, label: `Monthly averages in ${yr}`,
      });
    } else $('#monthlyChart').innerHTML = emptyState('activity', 'No ratings this year', 'Monthly averages of mood and productivity appear once days are rated.');

    // activity totals, merged by name + color like the year legend
    const totals = new Map();
    Object.values(grid).forEach((hours) => hours.forEach((id) => {
      if (id == null) return;
      const a = actById.get(id);
      const key = a ? `${a.name}${SEP}${a.color}` : '';
      totals.set(key, (totals.get(key) || 0) + 1);
    }));
    const rows = [...totals.entries()].map(([k, hours]) => {
      if (!k) return { name: 'Unknown activity', hours, color: null };
      const i = k.lastIndexOf(SEP);
      return { name: k.slice(0, i), hours, color: k.slice(i + 1) };
    }).sort((a, b) => b.hours - a.hours);
    renderActivityBars($('#actBars'), rows.slice(0, 12), $('#actMeta'));

    // the whole year, hour by hour
    const dates = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) dates.push(new Date(d));
    const used = new Set();
    Object.values(grid).forEach((h) => h.forEach((id) => id != null && used.add(id)));
    if (used.size) {
      const monthStarts = dates.map((d, i) => (d.getDate() === 1 ? i : -1)).filter((i) => i >= 0);
      Eco.charts.matrix($('#yearMap'), {
        cols: dates.length, rows: 24, gap: 0, cellHeight: 8, radius: 0,
        cell: (c, r) => { const h = grid[Eco.iso(dates[c])]; const id = h ? h[r] : null; if (id == null) return null; const a = actById.get(id); return a ? { color: a.color } : { unknown: true }; },
        rowTicks: [0, 6, 12, 18], rowLabel: (r) => pad(r),
        colTicks: monthStarts, colLabel: (c) => Eco.fmt(dates[c], { month: 'short' }),
        tooltip: (c, r) => {
          const h = grid[Eco.iso(dates[c])]; const id = h ? h[r] : null; const a = id != null ? actById.get(id) : null;
          return Eco.tt(`${Eco.fmt(dates[c], { weekday: 'short', day: 'numeric', month: 'short' })} · ${pad(r)}:00`, [{ label: id == null ? 'Unlogged' : a ? a.name : 'Unknown activity', value: '', color: a ? Eco.charts.tone(a.color) : undefined }]);
        },
        onClick: (c) => { if (dates[c] <= today) window.location.href = Eco.dayUrl(dates[c]); }, label: `Every logged hour of ${yr}`,
      });
      const seen = new Set();
      renderHeatLegend($('#yearLegend'), legend.filter((a) => {
        const k = `${a.name}${SEP}${a.color}`;
        if (!used.has(a.id) || seen.has(k)) return false;
        seen.add(k);
        return true;
      }));
    } else $('#yearMap').innerHTML = emptyState('layout-grid', `No hours logged in ${yr}`, 'As you fill in Day timelines, the whole year appears here hour by hour.');
    wireToggle('yearView', 'yearMap', 'yearLegend', 'yearPoster');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const m = $('#insightsMonth');
    if (m) month(m);
    const y = $('#insightsYear');
    if (y) year(y);
  });
})();
