/* Ecosystem — monthly habits: consistency matrix from stored check-offs,
   inline editing of the ten habit slots, and unsaved-change tracking. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$, esc } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#habitsForm');
    if (!form) return;
    const year = +form.dataset.year, month = +form.dataset.month, days = +form.dataset.days;
    const today = Eco.today();
    const monthStart = new Date(year, month - 1, 1);
    const elapsed = monthStart > today ? 0 : (year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : days);
    const bitsByDay = new Map((JSON.parse($('#habitDays').textContent) || []).map((d) => [d.day, d.habits]));
    const rows = $$('.habit-row', form);
    const done = (i, d) => (bitsByDay.get(d) || '')[i] === '1';

    // header day numbers
    $('#matrixDays').innerHTML = Array.from({ length: days }, (_, k) => {
      const dt = new Date(year, month - 1, k + 1);
      return `<span class="${[0, 6].includes(dt.getDay()) ? 'is-weekend' : ''}${+dt === +today ? ' is-today' : ''}">${k + 1}</span>`;
    }).join('');
    form.style.setProperty('--days', days);

    const stats = rows.map((row) => {
      const i = +row.dataset.index - 1;
      let count = 0, best = 0, run = 0;
      for (let d = 1; d <= elapsed; d++) { if (done(i, d)) { count++; run++; best = Math.max(best, run); } else run = 0; }
      return { i, count, best, rate: elapsed ? count / elapsed : 0 };
    });

    rows.forEach((row, k) => {
      const s = stats[k];
      const name = () => $('.habit-row__input', row).value.trim() || `Habit ${s.i + 1}`;
      $('.habit-row__cells', row).innerHTML = Array.from({ length: days }, (_, j) => {
        const d = j + 1;
        const dt = new Date(year, month - 1, d);
        const future = dt > today;
        const isDone = !future && done(s.i, d);
        const cls = `hcell${isDone ? ' is-done' : ''}${future ? ' is-future' : ''}${+dt === +today ? ' is-today' : ''}`;
        const label = `${Eco.fmt(dt, { weekday: 'short', day: 'numeric', month: 'short' })} · ${future ? 'upcoming' : isDone ? 'done' : 'not done'}`;
        return future ? `<span class="${cls}"></span>` : `<a class="${cls}" href="${Eco.dayUrl(dt)}#habits" data-tip="${esc(label)}" aria-label="${esc(label)}" style="--delay:${j * 8}ms"></a>`;
      }).join('');
      $$('.hcell', row).forEach((c) => c.addEventListener('mouseenter', () => { c.dataset.tip = `${name()} · ${c.getAttribute('aria-label')}`; }));
      $('.habit-row__stat', row).innerHTML = elapsed ? `<b>${s.count}</b><span>/${elapsed}</span>` : '<span>–</span>';
    });

    // metrics
    const named = () => rows.filter((r) => $('.habit-row__input', r).value.trim());
    const renderMetrics = () => {
      const active = rows.filter((r) => !r.classList.contains('is-empty'));
      const activeStats = active.map((r) => stats[rows.indexOf(r)]);
      $('#mHabits').textContent = named().length;
      if (!active.length || !elapsed) {
        ['#mRate', '#mPerfect', '#mBest'].forEach((id) => { $(id).textContent = '–'; $(id).classList.add('is-empty'); });
        $('#mRateFoot').textContent = elapsed ? 'no habits set' : 'month hasn’t started';
        $('#mBestFoot').innerHTML = '&nbsp;';
        return;
      }
      const total = activeStats.reduce((n, s) => n + s.count, 0);
      const rate = Math.round((total / (activeStats.length * elapsed)) * 100);
      $('#mRate').innerHTML = `${rate}<small>%</small>`;
      $('#mRateFoot').textContent = `${total} check-offs in ${elapsed} days`;
      let perfect = 0;
      for (let d = 1; d <= elapsed; d++) if (activeStats.every((s) => done(s.i, d))) perfect++;
      $('#mPerfect').textContent = perfect;
      const best = activeStats.slice().sort((a, b) => b.rate - a.rate || b.best - a.best)[0];
      const bestRow = rows[stats.indexOf(best)];
      $('#mBest').textContent = $('.habit-row__input', bestRow).value.trim() || '–';
      $('#mBestFoot').textContent = `${Math.round(best.rate * 100)}% · longest run ${best.best} ${best.best === 1 ? 'day' : 'days'}`;
    };
    renderMetrics();

    // add / reveal slots
    const addBtn = $('#addHabit');
    const updateSlots = () => {
      const left = rows.filter((r) => r.classList.contains('is-empty') && !r.classList.contains('is-open')).length;
      $('#slotsLeft').textContent = left ? `${left} of 10 slots free` : 'All 10 slots in use';
      addBtn.disabled = left === 0;
    };
    const openSlot = () => {
      const slot = rows.find((r) => r.classList.contains('is-empty') && !r.classList.contains('is-open'));
      if (!slot) return;
      slot.classList.add('is-open');
      $('.habit-row__input', slot).focus();
      updateSlots();
    };
    addBtn.addEventListener('click', openSlot);
    if (!rows.some((r) => !r.classList.contains('is-empty'))) openSlot();
    updateSlots();

    // unsaved changes
    const fields = $$('input[name], textarea[name]', form).filter((f) => f.type !== 'hidden');
    const initial = new Map(fields.map((f) => [f, f.value]));
    const status = $('#habitsStatus');
    const save = $('#habitsSave');
    let dirty = false;
    form.addEventListener('input', () => {
      dirty = fields.some((f) => f.value !== initial.get(f));
      $('.status-dot', status).dataset.state = dirty ? 'dirty' : 'saved';
      $('.dock__status-text', status).textContent = dirty ? 'Unsaved changes' : 'No changes';
      save.disabled = !dirty;
      renderMetrics();
    });
    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.matches('.habit-row__input')) {
        e.preventDefault();
        const next = rows[rows.indexOf(e.target.closest('.habit-row')) + 1];
        if (next && next.classList.contains('is-empty') && !next.classList.contains('is-open') && e.target.value.trim()) openSlot();
        else if (next && !next.classList.contains('is-empty')) $('.habit-row__input', next).focus();
      }
    });
    let submitting = false;
    form.addEventListener('submit', () => { submitting = true; save.classList.add('is-busy'); });
    $$('form[data-confirm]').forEach((f) => f.addEventListener('submit', () => { submitting = true; }));
    Eco.onKey('mod+s', () => { if (dirty) form.requestSubmit(); });
    window.addEventListener('beforeunload', (e) => { if (dirty && !submitting) { e.preventDefault(); e.returnValue = ''; } });
  });
})();
