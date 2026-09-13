/* Ecosystem — Journal: month index, quiet-day dividers, ordering and in-page search. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const root = $('#journal');
    if (!root) return;
    const year = +root.dataset.year, month = +root.dataset.month;
    const host = $('#entries');
    const entries = $$('.entry', host);
    const days = new Date(year, month, 0).getDate();
    const today = Eco.today();
    const written = new Set(entries.map((e) => +e.dataset.day));
    const words = (el) => (el.textContent.trim().match(/\S+/g) || []).length;
    const counts = entries.map((e) => $$('[data-search]', e).reduce((n, x) => n + words(x), 0));
    const total = counts.reduce((a, b) => a + b, 0);
    entries.forEach((e) => $$('[data-search]', e).forEach((x) => { x.dataset.html = x.innerHTML; }));

    // summary + stats
    const monthName = Eco.fmt(new Date(year, month - 1, 1), { month: 'long' });
    const elapsed = year === today.getFullYear() && month === today.getMonth() + 1 ? today.getDate() : (new Date(year, month - 1, 1) > today ? 0 : days);
    $('#journalSummary').textContent = entries.length
      ? `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} · ${total.toLocaleString()} words written in ${monthName}.`
      : elapsed && elapsed < days ? 'A quiet month so far.' : 'Nothing was written this month.';
    const longest = counts.length ? Math.max(...counts) : 0;
    $('#journalStats').innerHTML = `
      <div><dt class="eyebrow">Entries</dt><dd class="num" data-count-to="${entries.length}">${entries.length}</dd></div>
      <div><dt class="eyebrow">Words</dt><dd class="num" data-count-to="${total}">${total}</dd></div>
      <div><dt class="eyebrow">Longest</dt><dd class="num">${longest}<small> words</small></dd></div>
      <div><dt class="eyebrow">Written</dt><dd class="num">${elapsed ? Math.round((written.size / elapsed) * 100) : 0}<small>% of days</small></dd></div>`;
    Eco.initControls($('#journalStats'));
    if (!entries.length) { $('#journalStats').hidden = true; $('#journalStats').previousElementSibling.hidden = true; }
    $('#journalEmpty').hidden = entries.length > 0;

    // month index
    const cal = $('#journalCalendar');
    const first = (new Date(year, month - 1, 1).getDay() + 6) % 7;
    let cells = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span class="jcal__dow">${d}</span>`).join('');
    for (let i = 0; i < first; i++) cells += '<span></span>';
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month - 1, d);
      const cls = `jcal__day${written.has(d) ? ' has-entry' : ''}${+date === +today ? ' is-today' : ''}${date > today ? ' is-future' : ''}`;
      cells += written.has(d)
        ? `<a class="${cls}" href="#day-${d}" data-day="${d}" aria-label="${Eco.fmt(date, { day: 'numeric', month: 'long' })}, has an entry">${d}</a>`
        : date > today ? `<span class="${cls}">${d}</span>` : `<a class="${cls}" href="${Eco.dayUrl(date)}#journal" data-tip="Nothing written · open day">${d}</a>`;
    }
    cal.innerHTML = `<div class="jcal__grid">${cells}</div>`;
    cal.addEventListener('click', (e) => {
      const a = e.target.closest('a.has-entry');
      if (!a) return;
      e.preventDefault();
      const target = document.getElementById(`day-${a.dataset.day}`);
      target.scrollIntoView({ behavior: Eco.reduceMotion() ? 'auto' : 'smooth', block: 'start' });
      target.classList.remove('is-flash'); void target.offsetWidth; target.classList.add('is-flash');
    });

    // order + quiet-day dividers
    let order = 'asc';
    try { order = localStorage.getItem('eco-journal-order') || 'asc'; } catch (e) { /* ignore */ }
    const orderSeg = $('#journalOrder');
    const layout = () => {
      $$('.quiet', host).forEach((q) => q.remove());
      const visible = entries.filter((e) => !e.hidden);
      const sorted = visible.slice().sort((a, b) => (order === 'asc' ? a.dataset.day - b.dataset.day : b.dataset.day - a.dataset.day));
      entries.filter((e) => e.hidden).concat(sorted).forEach((e) => host.insertBefore(e, $('#journalEmpty')));
      if (searchInput.value.trim()) return;
      sorted.forEach((e, i) => {
        const next = sorted[i + 1];
        if (!next) return;
        const a = Math.min(+e.dataset.day, +next.dataset.day), b = Math.max(+e.dataset.day, +next.dataset.day);
        const gap = b - a - 1;
        if (gap < 1) return;
        const q = document.createElement('div');
        q.className = 'quiet';
        q.innerHTML = `<span>${gap} quiet ${gap === 1 ? 'day' : 'days'}</span><span class="muted">${gap === 1 ? `${monthName} ${a + 1}` : `${a + 1}–${b - 1} ${monthName}`}</span>`;
        host.insertBefore(q, next);
      });
    };
    if (orderSeg) {
      const opt = $(`[data-value="${order}"]`, orderSeg);
      if (opt) Eco.segmented(orderSeg).select(opt, false);
      orderSeg.addEventListener('eco:change', (e) => { order = e.detail; try { localStorage.setItem('eco-journal-order', order); } catch (err) { /* ignore */ } layout(); });
    }

    // search
    const searchInput = $('#journalSearch');
    const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const search = () => {
      const q = searchInput.value.trim();
      let shown = 0;
      entries.forEach((e) => {
        let hit = !q;
        $$('[data-search]', e).forEach((x) => {
          x.innerHTML = x.dataset.html;
          if (!q) return;
          const re = new RegExp(escRe(q), 'gi');
          if (re.test(x.textContent)) {
            hit = true;
            const walker = document.createTreeWalker(x, NodeFilter.SHOW_TEXT);
            const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach((n) => {
              const parts = n.nodeValue.split(new RegExp(`(${escRe(q)})`, 'gi'));
              if (parts.length < 2) return;
              const frag = document.createDocumentFragment();
              parts.forEach((p, i) => { if (i % 2) { const m = document.createElement('mark'); m.textContent = p; frag.appendChild(m); } else frag.appendChild(document.createTextNode(p)); });
              n.parentNode.replaceChild(frag, n);
            });
          }
        });
        e.hidden = !hit;
        if (hit) shown++;
      });
      $('#searchEmpty').hidden = !(q && entries.length && !shown);
      $('#searchTerm').textContent = q;
      layout();
    };
    searchInput.addEventListener('input', search);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { searchInput.value = ''; search(); searchInput.blur(); } });
    $('#searchClear').addEventListener('click', () => { searchInput.value = ''; search(); searchInput.focus(); });
    Eco.onKey('/', () => searchInput.focus());
    if (!entries.length) searchInput.disabled = true;

    layout();

    // scroll spy: mark the entry being read in the index
    const io = new IntersectionObserver((list) => {
      list.forEach((en) => {
        if (!en.isIntersecting) return;
        $$('.jcal__day.is-reading', cal).forEach((x) => x.classList.remove('is-reading'));
        const a = $(`.jcal__day[data-day="${en.target.dataset.day}"]`, cal);
        a && a.classList.add('is-reading');
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    entries.forEach((e) => io.observe(e));
  });
})();
