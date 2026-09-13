/* Ecosystem — tasks: a small store over /api/todo/ plus the two list UIs
   (compact lists on Day/Overview, the full board on the Tasks page).
   Editable fields mirror what the update endpoint accepts: status, priority
   and deadline (none / until / exact). Text is fixed once a task is created. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$, esc, icon, pad } = Eco;

  const PRIORITIES = [
    { value: 'critical', label: 'Critical' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
  ];
  const LIMIT = 30;

  /* ---------------- store ---------------- */
  const store = {
    pending: [], done: [], loaded: false, error: null,
    listeners: new Set(),
    emit() { this.listeners.forEach((fn) => fn(this)); },
    subscribe(fn) { this.listeners.add(fn); if (this.loaded || this.error) fn(this); return () => this.listeners.delete(fn); },
    get total() { return this.pending.length + this.done.length; },
    async load() {
      const res = await Eco.api('/api/todo/');
      if (res.ok) { this.pending = res.data.pending || []; this.done = res.data.done || []; this.loaded = true; this.error = null; }
      else { this.error = res.data.error || 'Tasks could not be loaded.'; }
      this.emit();
      return res;
    },
    async add(payload) {
      const res = await Eco.api('/api/todo/add/', { method: 'POST', json: payload });
      if (res.ok) await this.load();
      return res;
    },
    async update(id, changes) {
      const res = await Eco.api(`/api/todo/${id}/update/`, { method: 'PUT', json: changes });
      await this.load();
      return res;
    },
    async remove(id) {
      const res = await Eco.api(`/api/todo/${id}/delete/`, { method: 'DELETE' });
      await this.load();
      return res;
    },
  };
  let loading = null;
  const ensureLoaded = () => loading || (loading = store.load());

  /* ---------------- deadline semantics ---------------- */
  function due(task, now = new Date()) {
    const today = Eco.today();
    const type = task.due_type || 'none';
    if (type === 'today') return { kind: 'today', label: 'Today', tone: 'amber', deadline: null };
    if (type === 'none' || !task.due_date) return { kind: 'none', label: '', tone: '', deadline: null };
    const d = Eco.parseISO(task.due_date);
    const dayDiff = Math.round((d - today) / 86400000);
    let deadline;
    if (type === 'exact' && task.due_time) { const [h, m] = task.due_time.split(':').map(Number); deadline = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m); }
    else deadline = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59);
    const mins = (deadline - now) / 60000;
    const dayName = dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Tomorrow' : dayDiff === -1 ? 'Yesterday'
      : dayDiff > 1 && dayDiff < 7 ? Eco.fmt(d, { weekday: 'long' })
      : Eco.fmt(d, { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
    const time = type === 'exact' && task.due_time ? ` ${task.due_time}` : '';
    if (mins < 0) {
      const ago = type === 'exact' && dayDiff === 0 ? `${task.due_time}` : dayName;
      return { kind: 'overdue', label: `Overdue · ${ago}${dayDiff !== 0 ? time : ''}`, tone: 'red', deadline };
    }
    if (mins <= 30) return { kind: 'soon', label: `Due in ${Math.max(1, Math.round(mins))} min`, tone: 'orange', deadline };
    if (dayDiff === 0) return { kind: 'today', label: type === 'until' ? 'By end of today' : `Today${time}`, tone: 'amber', deadline };
    return { kind: 'upcoming', label: type === 'until' ? `By ${dayName}` : `${dayName}${time}`, tone: '', deadline };
  }

  const priorityGlyph = (p) => {
    const lvl = { low: 1, medium: 2, high: 3, critical: 4 }[p] || 2;
    if (lvl === 4) return '<svg class="prio prio--critical" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="3.5"/><path d="M8 4.6v4.2M8 11.2v.2"/></svg>';
    return `<svg class="prio prio--${p}" viewBox="0 0 16 16" aria-hidden="true">${[0, 1, 2].map((i) => `<rect x="${2 + i * 4.5}" y="${10 - i * 3.5}" width="3" height="${4 + i * 3.5}" rx="1" class="${i < lvl ? 'on' : ''}"/>`).join('')}</svg>`;
  };
  const priorityLabel = (p) => (PRIORITIES.find((x) => x.value === p) || PRIORITIES[2]).label;

  /* ---------------- shared row ---------------- */
  function rowHTML(task, { actions = true } = {}) {
    const d = due(task);
    const done = task.status === 'done';
    return `
      <li class="task${done ? ' is-done' : ''} task--${d.kind}" data-id="${task.id}">
        <input type="checkbox" class="check check--round task__check" ${done ? 'checked' : ''} aria-label="${done ? 'Mark as not done' : 'Mark as done'}: ${esc(task.text)}">
        <div class="task__body">
          <span class="task__text">${esc(task.text)}</span>
          <span class="task__meta">
            <span class="task__prio" data-tip="${priorityLabel(task.priority)} priority">${priorityGlyph(task.priority)}</span>
            ${d.label ? `<span class="tag ${d.tone ? `tag--${d.tone}` : ''}">${d.kind === 'overdue' ? icon('triangle-alert', 'icon') : d.kind === 'none' ? '' : icon('clock', 'icon')}${esc(d.label)}</span>` : ''}
          </span>
        </div>
        ${actions ? `<div class="task__actions">
          ${done ? '' : `<button type="button" class="icon-btn icon-btn--sm" data-act="edit" data-tip="Priority & deadline" aria-label="Edit priority and deadline">${icon('pencil', 'icon icon--sm')}</button>`}
          <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-act="delete" data-tip="Delete" aria-label="Delete task">${icon('trash-2', 'icon icon--sm')}</button>
        </div>` : ''}
      </li>`;
  }

  async function toggle(task, li) {
    const next = task.status === 'done' ? 'pending' : 'done';
    li && li.classList.add(next === 'done' ? 'is-completing' : 'is-reopening');
    await new Promise((r) => setTimeout(r, Eco.reduceMotion() ? 0 : 380));
    const res = await store.update(task.id, { status: next });
    if (!res.ok) { Eco.toast(res.data.error || 'Could not update the task.', { type: 'error' }); return; }
    if (next === 'done') {
      Eco.toast('Task completed', { type: 'success', action: { label: 'Undo', onClick: () => store.update(task.id, { status: 'pending' }) } });
    }
  }

  async function remove(task) {
    const ok = await Eco.confirm({ title: 'Delete this task?', text: `“${task.text}” will be removed permanently.`, confirm: 'Delete', danger: true, icon: 'trash-2' });
    if (!ok) return;
    const res = await store.remove(task.id);
    Eco.toast(res.ok ? 'Task deleted' : (res.data.error || 'Could not delete the task.'), { type: res.ok ? 'info' : 'error' });
  }

  const findTask = (id) => store.pending.concat(store.done).find((t) => t.id === id);

  function bindRows(container) {
    container.addEventListener('change', (e) => {
      const cb = e.target.closest('.task__check');
      if (!cb) return;
      const li = cb.closest('.task');
      const task = findTask(+li.dataset.id);
      if (task) toggle(task, li);
    });
    container.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const task = findTask(+b.closest('.task').dataset.id);
      if (!task) return;
      if (b.dataset.act === 'delete') remove(task);
      if (b.dataset.act === 'edit') openEditor(b, task);
    });
  }

  /* ---------------- deadline + priority editor ---------------- */
  function deadlineFields(prefix, task = {}) {
    const type = task.due_type || 'none';
    const opt = (v, label, extra = '') => `<button type="button" role="radio" class="segmented__opt" data-value="${v}" aria-checked="${type === v}" tabindex="${type === v ? 0 : -1}" ${extra}>${label}</button>`;
    return `
      <div class="field">
        <span class="field__label">Deadline</span>
        <div class="segmented segmented--sm" role="radiogroup" aria-label="Deadline type" data-role="due">
          ${opt('none', 'None')}${opt('today', 'Today', prefix === 'edit' && type !== 'today' ? 'disabled data-tip="Can only be chosen when creating a task"' : '')}${opt('until', 'By date')}${opt('exact', 'Date & time')}
        </div>
      </div>
      <div class="deadline-fields" data-role="due-fields">
        <div class="field" data-for="date">
          <label class="field__label" for="${prefix}-date-btn">Date</label>
          <button type="button" class="select-btn datefield" id="${prefix}-date-btn" data-datefield="${prefix}-date" data-placeholder="Pick a date">${icon('calendar')}<span class="select-btn__value"></span></button>
          <input type="hidden" id="${prefix}-date" value="${esc(task.due_date || '')}">
        </div>
        <div class="field" data-for="time">
          <label class="field__label" for="${prefix}-time-h">Time</label>
          <div class="timefield" data-timefield>
            <input class="timefield__seg" id="${prefix}-time-h" inputmode="numeric" aria-label="Hours" placeholder="--" autocomplete="off">
            <span class="timefield__colon">:</span>
            <input class="timefield__seg" inputmode="numeric" aria-label="Minutes" placeholder="--" autocomplete="off">
            <button type="button" class="icon-btn icon-btn--sm timefield__clear" aria-label="Clear time">${icon('x', 'icon icon--xs')}</button>
            <input type="hidden" id="${prefix}-time" value="${esc(task.due_time || '')}">
          </div>
        </div>
      </div>`;
  }
  function wireDeadline(root, prefix) {
    const seg = $('[data-role="due"]', root);
    const fields = $('[data-role="due-fields"]', root);
    const apply = () => {
      const v = $('[aria-checked="true"]', seg).dataset.value;
      fields.hidden = !(v === 'until' || v === 'exact');
      $('[data-for="time"]', fields).hidden = v !== 'exact';
    };
    seg.addEventListener('eco:change', apply);
    Eco.initControls(root);
    apply();
    return {
      value() {
        const type = $('[aria-checked="true"]', seg).dataset.value;
        return { due_type: type, due_date: $(`#${prefix}-date`, root).value || null, due_time: $(`#${prefix}-time`, root).value || null };
      },
      reset() { Eco.segmented(seg).select($('[data-value="none"]', seg), false); $(`#${prefix}-date`, root).value = ''; $(`#${prefix}-time`, root).value = ''; Eco.initControls(root); $$('[data-datefield]', root).forEach((b) => b._df && b._df.render()); $$('[data-timefield]', root).forEach((t) => t._tf && t._tf.set('')); apply(); },
    };
  }
  function validateDeadline(v) {
    if (v.due_type === 'until' && !v.due_date) return 'Pick the date this task is due by.';
    if (v.due_type === 'exact' && (!v.due_date || !v.due_time)) return 'Pick both a date and a time.';
    return null;
  }
  function prioritySegment(current) {
    return `<div class="field">
      <span class="field__label">Priority</span>
      <div class="segmented segmented--sm" role="radiogroup" aria-label="Priority" data-role="prio">
        ${PRIORITIES.map((p) => `<button type="button" role="radio" class="segmented__opt" data-value="${p.value}" aria-checked="${current === p.value}" tabindex="${current === p.value ? 0 : -1}">${priorityGlyph(p.value)}${p.label}</button>`).join('')}
      </div>
    </div>`;
  }

  function openEditor(anchor, task) {
    const el = document.createElement('form');
    el.className = 'task-editor';
    el.noValidate = true;
    el.innerHTML = `
      <p class="task-editor__title"></p>
      ${prioritySegment(task.priority || 'medium')}
      ${deadlineFields('edit', task)}
      <p class="field__error" data-role="error" hidden></p>
      <div class="task-editor__foot">
        <button type="button" class="btn btn--ghost btn--sm" data-role="cancel">Cancel</button>
        <button type="submit" class="btn btn--primary btn--sm">Save</button>
      </div>`;
    $('.task-editor__title', el).textContent = task.text;
    const pop = Eco.popover(anchor, el, { placement: 'bottom-end', className: 'popover--pad', focus: false });
    const dl = wireDeadline(el, 'edit');
    $$('.segmented', el).forEach((s) => Eco.segmented(s).update(false));
    $('[data-role="prio"] [aria-checked="true"]', el).focus();
    $('[data-role="cancel"]', el).addEventListener('click', () => Eco.closePopover());
    el.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = {};
      const prio = $('[data-role="prio"] [aria-checked="true"]', el).dataset.value;
      if (prio !== task.priority) changes.priority = prio;
      const v = dl.value();
      const err = $('[data-role="error"]', el);
      if (v.due_type !== 'today') {
        const msg = validateDeadline(v);
        if (msg) { err.innerHTML = `${icon('circle-alert', 'icon icon--sm')}${esc(msg)}`; err.hidden = false; return; }
        if (v.due_type !== task.due_type || (v.due_date || null) !== (task.due_date || null) || (v.due_type === 'exact' && v.due_time !== task.due_time)) {
          Object.assign(changes, { due_type: v.due_type, due_date: v.due_type === 'none' ? null : v.due_date, due_time: v.due_type === 'exact' ? v.due_time : null });
        }
      }
      if (!Object.keys(changes).length) { Eco.closePopover(); return; }
      const submit = $('[type="submit"]', el);
      submit.classList.add('is-busy');
      const res = await store.update(task.id, changes);
      if (res.ok) { Eco.closePopover(); Eco.toast('Task updated', { type: 'success' }); }
      else { submit.classList.remove('is-busy'); err.innerHTML = `${icon('circle-alert', 'icon icon--sm')}${esc(res.data.error || 'Could not save.')}`; err.hidden = false; }
    });
    return pop;
  }

  /* ---------------- compact list (Day, Overview) ---------------- */
  function mountCompact(root) {
    const limit = +(root.dataset.limit || 6);
    root.innerHTML = `
      <ul class="tasks tasks--compact" role="list" data-role="list">
        ${'<li class="task task--skeleton"><span class="skeleton" style="width:18px;height:18px;border-radius:50%"></span><span class="skeleton" style="height:12px;flex:1"></span></li>'.repeat(3)}
      </ul>
      <div class="quick-add" data-role="add">
        ${icon('plus', 'icon icon--sm')}
        <label class="sr-only" for="quickAdd-${limit}">Add a task</label>
        <input class="quick-add__input" id="quickAdd-${limit}" type="text" placeholder="Add a task" autocomplete="off" maxlength="200" enterkeyhint="done">
        <kbd class="quick-add__hint">↵</kbd>
      </div>`;
    const list = $('[data-role="list"]', root);
    bindRows(list);
    const render = () => {
      if (store.error) { list.innerHTML = `<li class="tasks__note">${icon('circle-alert', 'icon icon--sm')}${esc(store.error)}</li>`; return; }
      const items = store.pending.slice(0, limit);
      const hidden = store.pending.length - items.length;
      const room = root.hasAttribute('data-show-done') ? Math.max(0, limit - items.length - 1) : 0;
      const done = store.done.slice(0, Math.min(3, room));
      const doneHTML = done.length ? `<li class="tasks__divider eyebrow">Recently completed</li>${done.map((t) => rowHTML(t, { actions: false })).join('')}` : '';
      if (!items.length) {
        list.innerHTML = `<li class="tasks__empty">${icon('circle-check', 'icon')}<span>${store.done.length ? 'No open tasks. Everything is done.' : 'No open tasks.'}</span></li>${doneHTML}`;
        return;
      }
      list.innerHTML = items.map((t) => rowHTML(t, { actions: false })).join('') + (hidden > 0 ? `<li class="tasks__more"><a class="link-quiet" href="/tasks/">+ ${hidden} more open</a></li>` : '') + doneHTML;
    };
    store.subscribe(render);
    const input = $('[data-role="add"] input', root);
    // Not a <form>: compact lists can sit inside another page's form (Day).
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      const res = await store.add({ text, priority: 'medium', due_type: 'none' });
      input.disabled = false;
      if (res.ok) { input.value = ''; input.focus(); }
      else Eco.toast(res.data.error || 'Could not add the task.', { type: 'error' });
    });
    ensureLoaded();
  }

  /* ---------------- full board (Tasks page) ---------------- */
  function mountBoard(root) {
    const composer = $('[data-role="composer"]', root);
    const text = $('#taskText', composer);
    const prioBtn = $('#taskPriorityBtn', composer);
    const dueHost = $('[data-role="composer-due"]', composer);
    const error = $('[data-role="composer-error"]', composer);
    const board = $('[data-role="board"]', root);
    const capacity = $('[data-role="capacity"]', root);
    let priority = 'medium';
    let view = 'open';
    let prioFilter = 'all';

    dueHost.innerHTML = deadlineFields('new');
    const dl = wireDeadline(dueHost, 'new');

    const renderPrio = () => { prioBtn.innerHTML = `${priorityGlyph(priority)}<span>${priorityLabel(priority)}</span>${icon('chevron-down', 'icon icon--xs')}`; };
    renderPrio();
    prioBtn.addEventListener('click', () => {
      if (prioBtn.getAttribute('aria-expanded') === 'true') { Eco.closePopover(); return; }
      Eco.menu(prioBtn, PRIORITIES.map((p) => ({ ...p, selected: p.value === priority })), (v) => { priority = v; renderPrio(); prioBtn.focus(); }, { role: 'listbox' });
      $$('.popover .menu__item').forEach((b, i) => b.insertAdjacentHTML('afterbegin', priorityGlyph(PRIORITIES[i].value)));
    });

    composer.addEventListener('submit', async (e) => {
      e.preventDefault();
      const showError = (msg) => { error.innerHTML = `${icon('circle-alert', 'icon icon--sm')}${esc(msg)}`; error.hidden = false; };
      error.hidden = true;
      const value = text.value.trim();
      if (!value) { showError('Write what needs doing first.'); text.focus(); return; }
      const v = dl.value();
      const msg = validateDeadline(v);
      if (msg) { showError(msg); return; }
      if (store.total >= LIMIT) { showError(`You can keep at most ${LIMIT} tasks. Delete finished ones to make room.`); return; }
      const submit = $('[type="submit"]', composer);
      submit.classList.add('is-busy');
      const res = await store.add({ text: value, priority, due_type: v.due_type, due_date: v.due_date, due_time: v.due_time });
      submit.classList.remove('is-busy');
      if (!res.ok) { showError(res.data.error || 'Could not add the task.'); return; }
      text.value = '';
      priority = 'medium'; renderPrio();
      dl.reset();
      text.focus();
      Eco.toast('Task added', { type: 'success' });
    });

    const filterSeg = document.getElementById('taskView');
    filterSeg && filterSeg.addEventListener('eco:change', (e) => { view = e.detail; render(); });
    const prioFilterBtn = $('[data-role="prio-filter"]', root);
    const renderPrioFilter = () => {
      prioFilterBtn.innerHTML = `${icon('list-filter', 'icon icon--sm')}<span>${prioFilter === 'all' ? 'All priorities' : priorityLabel(prioFilter)}</span>${icon('chevron-down', 'icon icon--xs')}`;
      prioFilterBtn.classList.toggle('is-active', prioFilter !== 'all');
    };
    renderPrioFilter();
    prioFilterBtn.addEventListener('click', () => {
      if (prioFilterBtn.getAttribute('aria-expanded') === 'true') { Eco.closePopover(); return; }
      Eco.menu(prioFilterBtn, [{ label: 'All priorities', value: 'all', selected: prioFilter === 'all' }, { sep: true }, ...PRIORITIES.map((p) => ({ ...p, selected: prioFilter === p.value }))], (v) => { prioFilter = v; renderPrioFilter(); render(); }, { role: 'listbox', placement: 'bottom-end' });
    });

    bindRows(board);

    function group(title, tasks, { tone = '', note = '', collapsible = false } = {}) {
      if (!tasks.length) return '';
      return `
        <section class="task-group${tone ? ` task-group--${tone}` : ''}">
          <header class="task-group__head">
            <h2 class="task-group__title">${title}</h2>
            <span class="task-group__count num">${tasks.length}</span>
            ${note ? `<span class="task-group__note">${note}</span>` : ''}
          </header>
          <ul class="tasks" role="list">${tasks.map((t) => rowHTML(t)).join('')}</ul>
        </section>`;
    }

    function render() {
      if (store.error) {
        board.innerHTML = `<div class="empty"><div class="empty__glyph">${icon('circle-alert', 'icon icon--lg')}</div><p class="empty__title">Tasks could not be loaded</p><p class="empty__text">${esc(store.error)}</p><div class="empty__actions"><button type="button" class="btn btn--sm" data-role="retry">${icon('rotate-ccw', 'icon icon--sm')}Try again</button></div></div>`;
        $('[data-role="retry"]', board).addEventListener('click', () => store.load());
        return;
      }
      const byPrio = (t) => prioFilter === 'all' || t.priority === prioFilter;
      const open = store.pending.filter(byPrio);
      const done = store.done.filter(byPrio);
      const buckets = { overdue: [], today: [], upcoming: [], none: [] };
      open.forEach((t) => { const k = due(t).kind; (buckets[k === 'soon' ? 'today' : k] || buckets.none).push(t); });

      // metrics
      const counts = { open: store.pending.length, overdue: 0, today: 0, done: store.done.length };
      store.pending.forEach((t) => { const k = due(t).kind; if (k === 'overdue') counts.overdue++; if (k === 'today' || k === 'soon') counts.today++; });
      Object.entries(counts).forEach(([k, v]) => { const el = $(`[data-metric="${k}"]`, root); if (el) { el.textContent = v; el.closest('.metric').classList.toggle('is-alert', k === 'overdue' && v > 0); } });
      capacity.style.setProperty('--w', `${Math.min(100, (store.total / LIMIT) * 100)}%`);
      capacity.style.setProperty('--fill', store.total >= LIMIT ? 'var(--red)' : store.total >= LIMIT - 5 ? 'var(--amber)' : 'var(--fg-3)');
      $('[data-role="capacity-label"]', root).textContent = `${store.total} of ${LIMIT} slots used`;

      let html = '';
      if (view === 'open' || view === 'all') {
        html += group('Overdue', buckets.overdue, { tone: 'red' });
        html += group('Today', buckets.today, { tone: 'amber' });
        html += group('Upcoming', buckets.upcoming);
        html += group('No deadline', buckets.none);
      }
      if (view === 'done' || view === 'all') html += group('Completed', done, { tone: 'done' });

      if (!html) {
        const filtered = prioFilter !== 'all';
        const title = filtered ? `No ${priorityLabel(prioFilter).toLowerCase()} priority tasks here` : view === 'done' ? 'Nothing completed yet' : store.done.length ? 'All clear' : 'No tasks yet';
        const body = filtered ? 'Try another priority or clear the filter.' : view === 'done' ? 'Tasks you check off will collect here.' : store.done.length ? 'Every open task is done. Add the next thing when it comes up.' : 'Add your first task above. Give it a priority and, if it matters, a deadline.';
        html = `<div class="empty"><div class="empty__glyph">${icon(view === 'done' ? 'circle-check' : 'list-checks', 'icon icon--lg')}</div><p class="empty__title">${title}</p><p class="empty__text">${body}</p>${filtered ? '<div class="empty__actions"><button type="button" class="btn btn--sm" data-role="clear-filter">Clear filter</button></div>' : ''}</div>`;
      }
      board.innerHTML = html;
      const clear = $('[data-role="clear-filter"]', board);
      clear && clear.addEventListener('click', () => { prioFilter = 'all'; renderPrioFilter(); render(); });
    }
    store.subscribe(render);
    ensureLoaded();
    Eco.onKey('n', () => { text.focus(); text.scrollIntoView({ block: 'center', behavior: Eco.reduceMotion() ? 'auto' : 'smooth' }); });
    // Refresh relative deadline labels once a minute.
    setInterval(() => store.loaded && store.emit(), 60000);
  }

  Eco.tasks = { store, due, priorityGlyph, mountCompact, mountBoard };

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-tasks-compact]').forEach(mountCompact);
    const board = $('[data-tasks-board]');
    board && mountBoard(board);
  });
})();
