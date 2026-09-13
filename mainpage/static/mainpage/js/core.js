/* Ecosystem — shared runtime: theme, navigation, dock, overlays, feedback,
   network helpers and the enhanced form controls every page builds on.
   Everything is progressive: without JS the server-rendered forms still work. */
(function () {
  'use strict';

  const Eco = (window.Eco = window.Eco || {});
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  Eco.$ = $;
  Eco.$$ = $$;
  Eco.reduceMotion = () => reduceMotion.matches;

  const pad = (n) => String(n).padStart(2, '0');
  Eco.pad = pad;
  Eco.icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  Eco.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------- dates (always the browser's local calendar) ---------------- */
  Eco.today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  Eco.iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  Eco.parseISO = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  Eco.fmt = (d, opts) => d.toLocaleDateString(undefined, opts);
  Eco.dayUrl = (d) => `/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}/`;
  Eco.fillTemplate = (tpl, d = new Date()) => tpl
    .replace('{yyyy}', d.getFullYear()).replace('{m}', d.getMonth() + 1).replace('{d}', d.getDate())
    .replace('{mm}', pad(d.getMonth() + 1)).replace('{dd}', pad(d.getDate()));

  function wireTodayLinks(root = document) {
    $$('[data-today-href]', root).forEach((a) => { a.href = Eco.fillTemplate(a.dataset.todayHref); });
  }

  /* ---------------- theme ---------------- */
  Eco.theme = {
    get: () => document.documentElement.dataset.theme || 'dark',
    set(theme) {
      document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('eco-theme', theme); } catch (e) { /* storage unavailable */ }
      document.dispatchEvent(new CustomEvent('eco:theme', { detail: theme }));
    },
    toggle() { this.set(this.get() === 'dark' ? 'light' : 'dark'); },
  };

  /* ---------------- sliding indicators (nav + segmented) ---------------- */
  function placeIndicator(container, indicator, target, animate) {
    if (!target) { indicator.style.opacity = '0'; return; }
    const c = container.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    if (!animate) container.classList.add('no-anim');
    indicator.style.width = `${t.width}px`;
    indicator.style.transform = `translateX(${t.left - c.left}px)`;
    indicator.style.opacity = '';
    if (!animate) { indicator.getBoundingClientRect(); requestAnimationFrame(() => container.classList.remove('no-anim')); }
  }

  function initNav() {
    const links = $('.nav__links');
    if (!links) return;
    const indicator = $('.nav__indicator', links);
    const active = $('[aria-current="page"]', links);
    // Glide from the previously active item so navigation feels continuous.
    let prev = null;
    try { prev = JSON.parse(sessionStorage.getItem('eco-nav') || 'null'); } catch (e) { /* ignore */ }
    const from = prev && $(`[data-nav="${prev}"]`, links);
    if (from && active && from !== active && !reduceMotion.matches) {
      placeIndicator(links, indicator, from, false);
      requestAnimationFrame(() => requestAnimationFrame(() => placeIndicator(links, indicator, active, true)));
    } else {
      placeIndicator(links, indicator, active, false);
    }
    links.classList.add('is-ready');
    try { sessionStorage.setItem('eco-nav', JSON.stringify(active ? active.dataset.nav : null)); } catch (e) { /* ignore */ }
    window.addEventListener('resize', () => placeIndicator(links, indicator, $('[aria-current="page"]', links), false));
    document.fonts && document.fonts.ready.then(() => placeIndicator(links, indicator, $('[aria-current="page"]', links), false));
  }

  Eco.segmented = function (el) {
    if (el._seg) return el._seg;
    let thumb = $('.segmented__thumb', el);
    if (!thumb) { thumb = document.createElement('span'); thumb.className = 'segmented__thumb'; el.prepend(thumb); }
    const selected = () => $('[aria-checked="true"], [aria-selected="true"], [aria-current="page"]', el);
    const api = {
      update(animate = true) { placeIndicator(el, thumb, selected(), animate); },
      select(opt, emit = true) {
        $$('.segmented__opt', el).forEach((o) => {
          const on = o === opt;
          if (o.hasAttribute('aria-checked')) o.setAttribute('aria-checked', on);
          if (o.hasAttribute('aria-selected')) o.setAttribute('aria-selected', on);
          o.tabIndex = on ? 0 : -1;
        });
        api.update(true);
        if (emit) el.dispatchEvent(new CustomEvent('eco:change', { detail: opt.dataset.value, bubbles: true }));
      },
    };
    el._seg = api;
    if (el.getAttribute('role') === 'radiogroup' || el.getAttribute('role') === 'tablist') {
      el.addEventListener('click', (e) => {
        const opt = e.target.closest('.segmented__opt');
        if (opt && !opt.disabled && el.contains(opt)) api.select(opt);
      });
      el.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        const opts = $$('.segmented__opt:not(:disabled)', el);
        const i = opts.indexOf(document.activeElement);
        if (i < 0) return;
        const next = opts[(i + (e.key === 'ArrowRight' ? 1 : -1) + opts.length) % opts.length];
        next.focus();
        api.select(next);
        e.preventDefault();
      });
    }
    requestAnimationFrame(() => api.update(false));
    document.fonts && document.fonts.ready.then(() => api.update(false));
    window.addEventListener('resize', () => api.update(false));
    return api;
  };

  /* ---------------- tooltips ---------------- */
  let tipEl, tipTimer, tipTarget;
  function tip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tooltip'; tipEl.setAttribute('role', 'tooltip'); document.body.appendChild(tipEl); }
    return tipEl;
  }
  function positionFloating(el, anchorRect, placement = 'top', gap = 8) {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let top = placement === 'top' ? anchorRect.top - r.height - gap : anchorRect.bottom + gap;
    if (placement === 'top' && top < 8) top = anchorRect.bottom + gap;
    if (placement !== 'top' && top + r.height > vh - 8) top = anchorRect.top - r.height - gap;
    let left = anchorRect.left + anchorRect.width / 2 - r.width / 2;
    left = Math.max(8, Math.min(left, vw - r.width - 8));
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
  }
  Eco.positionFloating = positionFloating;
  function showTip(target) {
    const t = tip();
    const kbd = target.dataset.kbd ? ` <kbd>${Eco.esc(target.dataset.kbd)}</kbd>` : '';
    t.innerHTML = `<span>${Eco.esc(target.dataset.tip)}</span>${kbd}`;
    t.classList.add('is-visible');
    positionFloating(t, target.getBoundingClientRect(), target.dataset.tipPlacement || 'top');
    tipTarget = target;
  }
  function hideTip() { clearTimeout(tipTimer); tipTarget = null; if (tipEl) tipEl.classList.remove('is-visible'); }
  Eco.chartTip = {
    show(html, x, y) {
      const t = tip();
      t.classList.add('tooltip--chart', 'is-visible');
      t.innerHTML = html;
      positionFloating(t, { left: x, width: 0, top: y, bottom: y }, 'top', 14);
    },
    hide() { if (tipEl) { tipEl.classList.remove('is-visible'); setTimeout(() => tipEl && !tipEl.classList.contains('is-visible') && tipEl.classList.remove('tooltip--chart'), 150); } },
  };
  function initTooltips() {
    document.addEventListener('pointerover', (e) => {
      const target = e.target.closest('[data-tip]');
      if (!target || target === tipTarget) return;
      clearTimeout(tipTimer);
      tipTimer = setTimeout(() => showTip(target), tipEl && tipEl.classList.contains('is-visible') ? 0 : 380);
    });
    document.addEventListener('pointerout', (e) => {
      const target = e.target.closest('[data-tip]');
      if (target && !target.contains(e.relatedTarget)) hideTip();
    });
    document.addEventListener('focusin', (e) => { const t = e.target.closest('[data-tip]'); if (t && t.matches(':focus-visible')) showTip(t); });
    document.addEventListener('focusout', hideTip);
    document.addEventListener('pointerdown', hideTip);
    window.addEventListener('scroll', hideTip, { passive: true });
  }

  /* ---------------- toasts ---------------- */
  Eco.toast = function (message, { type = 'info', action, duration = 3800 } = {}) {
    let host = $('.toasts');
    if (!host) { host = document.createElement('div'); host.className = 'toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
    const icon = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' }[type] || 'info';
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${Eco.icon(icon)}<span></span>`;
    el.querySelector('span').textContent = message;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action.label;
      b.addEventListener('click', () => { action.onClick(); dismiss(); });
      el.appendChild(b);
    }
    host.appendChild(el);
    const dismiss = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 200); };
    setTimeout(dismiss, duration);
    return dismiss;
  };

  function flashMessages() {
    $$('[data-flash]').forEach((m) => {
      const tags = m.dataset.flash || '';
      const type = /error/.test(tags) ? 'error' : /success/.test(tags) ? 'success' : /warning/.test(tags) ? 'warning' : 'info';
      Eco.toast(m.textContent.trim(), { type, duration: type === 'error' ? 6000 : 4000 });
    });
  }

  /* ---------------- confirm dialog ---------------- */
  Eco.confirm = function ({ title, text, confirm = 'Confirm', danger = false, icon }) {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'dialog';
      d.innerHTML = `
        <div class="dialog__body">
          <div class="dialog__icon ${danger ? 'dialog__icon--danger' : ''}">${Eco.icon(icon || (danger ? 'triangle-alert' : 'info'), 'icon icon--lg')}</div>
          <h2 class="dialog__title"></h2>
          <p class="dialog__text"></p>
        </div>
        <div class="dialog__foot">
          <button type="button" class="btn" value="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn--danger-solid' : 'btn--primary'}" value="ok"></button>
        </div>`;
      d.querySelector('.dialog__title').textContent = title;
      d.querySelector('.dialog__text').textContent = text || '';
      d.querySelector('[value="ok"]').textContent = confirm;
      document.body.appendChild(d);
      let result = false;
      d.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) { result = b.value === 'ok'; d.close(); }
        else if (e.target === d) d.close();
      });
      d.addEventListener('close', () => { resolve(result); setTimeout(() => d.remove(), 50); });
      d.showModal();
      d.querySelector('[value="cancel"]').focus();
    });
  };

  function initConfirmForms() {
    document.addEventListener('submit', async (e) => {
      const form = e.target;
      if (!form.matches('form[data-confirm]') || form._confirmed) return;
      e.preventDefault();
      const submitter = e.submitter;
      const ok = await Eco.confirm({
        title: form.dataset.confirm,
        text: form.dataset.confirmText,
        confirm: form.dataset.confirmLabel || 'Confirm',
        danger: form.hasAttribute('data-danger'),
      });
      if (ok) { form._confirmed = true; form.requestSubmit(submitter); }
    });
  }

  /* ---------------- popovers ---------------- */
  let openPop = null;
  Eco.popover = function (anchor, content, { placement = 'bottom-start', onClose, className = '', gap = 6, focus = true } = {}) {
    Eco.closePopover();
    const el = document.createElement('div');
    el.className = `popover ${className}`;
    if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
    document.body.appendChild(el);
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      let top = placement.startsWith('top') ? a.top - r.height - gap : a.bottom + gap;
      let origin = placement.startsWith('top') ? 'bottom' : 'top';
      if (!placement.startsWith('top') && top + r.height > vh - 12 && a.top - r.height - gap > 12) { top = a.top - r.height - gap; origin = 'bottom'; }
      if (placement.startsWith('top') && top < 12) { top = a.bottom + gap; origin = 'top'; }
      let left = placement.endsWith('end') ? a.right - r.width : placement.endsWith('center') ? a.left + a.width / 2 - r.width / 2 : a.left;
      left = Math.max(12, Math.min(left, vw - r.width - 12));
      el.style.top = `${Math.round(top)}px`;
      el.style.left = `${Math.round(left)}px`;
      el.style.setProperty('--origin', `${origin} ${placement.endsWith('end') ? 'right' : 'left'}`);
    };
    place();
    // controls measured during the entrance scale settle once it finishes
    el.addEventListener('animationend', () => $$('.segmented', el).forEach((sg) => sg._seg && sg._seg.update(false)), { once: true });
    const onDoc = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) Eco.closePopover(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); Eco.closePopover(); anchor.focus(); } };
    const onScroll = (e) => { if (!el.contains(e.target)) place(); };
    setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', place);
    anchor.setAttribute('aria-expanded', 'true');
    openPop = {
      el, anchor,
      close() {
        document.removeEventListener('pointerdown', onDoc);
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', place);
        anchor.setAttribute('aria-expanded', 'false');
        el.classList.add('is-closing');
        setTimeout(() => el.remove(), 110);
        onClose && onClose();
      },
      place,
    };
    if (focus) { const f = el.querySelector('[autofocus], [aria-selected="true"], input, button, [tabindex="0"]'); f && f.focus({ preventScroll: true }); }
    return openPop;
  };
  Eco.closePopover = function () { if (openPop) { const p = openPop; openPop = null; p.close(); } };

  /* Build a keyboard-navigable menu. items: [{label, value, icon, swatch, selected, danger, meta, sep, heading}] */
  Eco.menu = function (anchor, items, onPick, opts = {}) {
    const list = document.createElement('div');
    list.className = 'menu';
    list.setAttribute('role', opts.role || 'menu');
    items.forEach((it) => {
      if (it.sep) { list.insertAdjacentHTML('beforeend', '<div class="menu__sep" role="separator"></div>'); return; }
      if (it.heading) { const h = document.createElement('div'); h.className = 'menu__label eyebrow'; h.textContent = it.heading; list.appendChild(h); return; }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `menu__item${it.danger ? ' menu__item--danger' : ''}`;
      b.setAttribute('role', opts.role === 'listbox' ? 'option' : 'menuitem');
      if (it.selected !== undefined) b.setAttribute('aria-selected', it.selected ? 'true' : 'false');
      b.tabIndex = -1;
      b.innerHTML = `${it.swatch ? `<span class="swatch" style="background:${Eco.esc(it.swatch)}"></span>` : ''}${it.icon ? Eco.icon(it.icon) : ''}<span class="menu__text"></span>${it.meta ? `<span class="menu__meta">${Eco.esc(it.meta)}</span>` : ''}`;
      b.querySelector('.menu__text').textContent = it.label;
      b.addEventListener('click', () => { Eco.closePopover(); onPick(it.value, it); });
      list.appendChild(b);
    });
    list.addEventListener('keydown', (e) => {
      const btns = $$('.menu__item', list);
      let i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { btns[(i + 1) % btns.length].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { btns[(i - 1 + btns.length) % btns.length].focus(); e.preventDefault(); }
      else if (e.key === 'Home') { btns[0].focus(); e.preventDefault(); }
      else if (e.key === 'End') { btns[btns.length - 1].focus(); e.preventDefault(); }
      else if (e.key === 'Tab') { Eco.closePopover(); }
      else if (e.key.length === 1 && /\S/.test(e.key)) {
        const k = e.key.toLowerCase();
        const start = i + 1;
        const found = btns.slice(start).concat(btns.slice(0, start)).find((b) => b.textContent.trim().toLowerCase().startsWith(k));
        found && found.focus();
      }
    });
    const pop = Eco.popover(anchor, list, { placement: opts.placement || 'bottom-start', className: opts.className || '' });
    const first = list.querySelector('[aria-selected="true"]') || list.querySelector('.menu__item');
    first && first.focus({ preventScroll: true });
    if (opts.minWidth) pop.el.style.minWidth = typeof opts.minWidth === 'number' ? `${opts.minWidth}px` : `${anchor.getBoundingClientRect().width}px`;
    pop.place();
    return pop;
  };

  function initMenus() {
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-menu]');
      if (!trigger) return;
      const tpl = document.getElementById(trigger.dataset.menu);
      if (!tpl) return;
      if (trigger.getAttribute('aria-expanded') === 'true') { Eco.closePopover(); return; }
      const content = tpl.content.cloneNode(true);
      const wrap = document.createElement('div');
      wrap.className = 'menu'; wrap.setAttribute('role', 'menu');
      wrap.appendChild(content);
      $$('.menu__item', wrap).forEach((m) => { m.tabIndex = -1; m.setAttribute('role', 'menuitem'); });
      wrap.addEventListener('keydown', (ev) => {
        const items = $$('.menu__item', wrap);
        const i = items.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') { items[(i + 1) % items.length].focus(); ev.preventDefault(); }
        if (ev.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length].focus(); ev.preventDefault(); }
      });
      Eco.popover(trigger, wrap, { placement: trigger.dataset.menuPlacement || 'bottom-end' });
      const first = wrap.querySelector('.menu__item');
      first && first.focus({ preventScroll: true });
    });
  }

  /* ---------------- network ---------------- */
  Eco.csrf = function () {
    const input = $('input[name="csrfmiddlewaretoken"]');
    if (input) return input.value;
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  };
  Eco.api = async function (url, { method = 'GET', json } = {}) {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (method !== 'GET') headers['X-CSRFToken'] = Eco.csrf();
    if (json !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(url, { method, headers, credentials: 'same-origin', body: json !== undefined ? JSON.stringify(json) : undefined });
    } catch (err) {
      return { ok: false, status: 0, data: { error: 'You appear to be offline. Check your connection and try again.' } };
    }
    if (res.redirected && /\/auth\/login\//.test(res.url)) { window.location.href = res.url; return { ok: false, status: 401, data: {} }; }
    let data = {};
    try { data = await res.json(); } catch (e) { data = { error: `Unexpected response (${res.status}).` }; }
    return { ok: res.ok && !data.error, status: res.status, data };
  };

  /* ---------------- keyboard shortcuts ---------------- */
  const isTyping = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  Eco.shortcuts = new Map();
  Eco.onKey = (combo, fn) => Eco.shortcuts.set(combo, fn);
  function initShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const combo = `${mod ? 'mod+' : ''}${e.shiftKey && e.key.length > 1 ? 'shift+' : ''}${key}`;
      if (!mod && (isTyping(e.target) || e.altKey)) return;
      const fn = Eco.shortcuts.get(combo);
      if (fn) { e.preventDefault(); fn(e); return; }
      if (mod) return;
      const el = document.querySelector(`[data-shortcut="${CSS.escape(key)}"]`);
      if (el && !el.closest('[hidden]') && el.getAttribute('aria-disabled') !== 'true') { e.preventDefault(); el.click(); }
    });
  }

  /* ---------------- animated numbers ---------------- */
  Eco.countUp = function (el) {
    const target = parseFloat(el.dataset.countTo);
    if (Number.isNaN(target)) return;
    const decimals = +(el.dataset.decimals || 0);
    if (reduceMotion.matches) { el.textContent = target.toFixed(decimals); return; }
    const t0 = performance.now(), dur = 700;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(decimals);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  function initCounters(root = document) {
    const els = $$('[data-count-to]', root);
    if (!els.length) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { Eco.countUp(en.target); io.unobserve(en.target); } }), { threshold: 0.3 });
    els.forEach((el) => io.observe(el));
  }

  /* ================= enhanced controls ================= */

  /* Slider: a real <input type=range> for keyboard/AT, paired with a hidden
     form input so "not rated" stays representable as an empty value. */
  Eco.slider = function (root) {
    const range = $('input[type="range"]', root);
    const hidden = $('input[type="hidden"]', root);
    const out = $('[data-slider-out]', root);
    const clear = $('.slider__clear', root);
    const min = +range.min, max = +range.max;
    const scale = root.dataset.scale;
    const color = (v) => {
      const p = (v - min) / (max - min);
      if (scale === 'mood') return 'var(--green)';
      if (scale === 'sky') return 'var(--sky)';
      return 'var(--indigo)';
    };
    const render = () => {
      const empty = hidden.value === '';
      const v = empty ? Math.round((min + max) / 2) : +hidden.value;
      if (!empty) range.value = v;
      root.classList.toggle('is-empty', empty);
      root.style.setProperty('--pct', empty ? '0%' : `${((v - min) / (max - min)) * 100}%`);
      root.style.setProperty('--fill', color(v));
      out.textContent = empty ? '–' : v;
      range.setAttribute('aria-valuetext', empty ? 'Not rated' : `${v} of ${max}`);
    };
    const commit = () => {
      hidden.value = range.value;
      render();
      hidden.dispatchEvent(new Event('input', { bubbles: true }));
    };
    range.addEventListener('input', commit);
    range.addEventListener('pointerdown', () => { if (hidden.value === '') requestAnimationFrame(commit); });
    range.addEventListener('keydown', (e) => { if (hidden.value === '' && /Arrow|Page|Home|End/.test(e.key)) { hidden.value = range.value; } });
    clear && clear.addEventListener('click', () => { hidden.value = ''; render(); hidden.dispatchEvent(new Event('input', { bubbles: true })); range.focus(); });
    render();
    return { render };
  };

  /* Time field: two numeric segments (HH:MM, 24h) that write "HH:MM" or "" to a hidden input. */
  Eco.timefield = function (root) {
    const [hh, mm] = $$('.timefield__seg', root);
    const hidden = $('input[type="hidden"]', root);
    const clearBtn = $('.timefield__clear', root);
    const setFromHidden = () => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(hidden.value || '');
      hh.value = m ? pad(+m[1]) : '';
      mm.value = m ? m[2] : '';
      root.classList.toggle('is-empty', !m);
    };
    const sync = (fillMissing) => {
      if (fillMissing) {
        if (hh.value && !mm.value) mm.value = '00';
        if (mm.value && !hh.value) hh.value = '00';
        if (hh.value) hh.value = pad(Math.min(23, +hh.value));
        if (mm.value) mm.value = pad(Math.min(59, +mm.value));
      }
      const next = hh.value && mm.value && hh.value.length === 2 && mm.value.length === 2 ? `${hh.value}:${mm.value}` : (!hh.value && !mm.value ? '' : hidden.value);
      root.classList.toggle('is-empty', !hh.value && !mm.value);
      if (next !== hidden.value) { hidden.value = next; hidden.dispatchEvent(new Event('input', { bubbles: true })); }
    };
    const seg = (el, max, step) => {
      let typed = '';
      el.addEventListener('focus', () => { typed = ''; requestAnimationFrame(() => el.select()); });
      el.addEventListener('blur', () => { typed = ''; sync(true); });
      el.addEventListener('beforeinput', (e) => e.preventDefault());
      el.addEventListener('paste', (e) => {
        e.preventDefault();
        const m = /(\d{1,2}):?(\d{2})/.exec(e.clipboardData.getData('text'));
        if (m) { hidden.value = `${pad(Math.min(23, +m[1]))}:${pad(Math.min(59, +m[2]))}`; setFromHidden(); hidden.dispatchEvent(new Event('input', { bubbles: true })); }
      });
      el.addEventListener('keydown', (e) => {
        if (/^\d$/.test(e.key)) {
          typed = (typed + e.key).slice(-2);
          let v = +typed;
          if (typed.length === 1 && v * 10 > max) { el.value = pad(v); typed = ''; sync(false); if (el === hh) mm.focus(); }
          else if (typed.length === 2) { el.value = pad(Math.min(v, max)); typed = ''; sync(false); if (el === hh) mm.focus(); }
          else { el.value = pad(v); }
          e.preventDefault();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          const d = (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? step * 3 : step);
          const cur = el.value === '' ? (el === hh ? 22 : 0) : +el.value;
          el.value = pad((cur + d + max + 1) % (max + 1));
          sync(true);
          el.select();
          e.preventDefault();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          el.value = ''; typed = ''; sync(false); if (el === mm && e.key === 'Backspace') hh.focus();
          e.preventDefault();
        } else if (e.key === ':' || (e.key === 'ArrowRight' && el === hh)) { mm.focus(); e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && el === mm) { hh.focus(); e.preventDefault(); }
        else if (e.key.length === 1) { e.preventDefault(); }
      });
    };
    seg(hh, 23, 1);
    seg(mm, 59, 5);
    root.addEventListener('mousedown', (e) => { if (e.target === root) { e.preventDefault(); hh.focus(); } });
    clearBtn && clearBtn.addEventListener('click', () => { hidden.value = ''; setFromHidden(); hidden.dispatchEvent(new Event('input', { bubbles: true })); hh.focus(); });
    setFromHidden();
    return { set(v) { hidden.value = v || ''; setFromHidden(); } };
  };

  /* Date picker popover bound to a button + hidden YYYY-MM-DD input. */
  Eco.datefield = function (btn) {
    const hidden = document.getElementById(btn.dataset.datefield);
    const label = $('.select-btn__value', btn);
    const placeholder = btn.dataset.placeholder || 'Pick a date';
    const minD = Eco.parseISO(btn.dataset.min), maxD = Eco.parseISO(btn.dataset.max);
    const render = () => {
      const d = Eco.parseISO(hidden.value);
      label.textContent = d ? Eco.fmt(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : placeholder;
      label.classList.toggle('is-placeholder', !d);
    };
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-expanded') === 'true') { Eco.closePopover(); return; }
      const selected = Eco.parseISO(hidden.value);
      let view = selected ? new Date(selected) : Eco.today();
      view.setDate(1);
      const el = document.createElement('div');
      el.className = 'cal';
      const draw = () => {
        const y = view.getFullYear(), m = view.getMonth();
        const first = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
        const days = new Date(y, m + 1, 0).getDate();
        const today = Eco.iso(Eco.today());
        let cells = '';
        for (let i = 0; i < first; i++) cells += '<span></span>';
        for (let d = 1; d <= days; d++) {
          const date = new Date(y, m, d);
          const iso = Eco.iso(date);
          const disabled = (minD && date < minD) || (maxD && date > maxD);
          cells += `<button type="button" class="cal__day${iso === today ? ' is-today' : ''}" data-iso="${iso}" aria-selected="${hidden.value === iso}" ${disabled ? 'disabled' : ''} tabindex="${hidden.value === iso || (!hidden.value && iso === today) ? 0 : -1}" aria-label="${Eco.fmt(date, { dateStyle: 'full' })}">${d}</button>`;
        }
        el.innerHTML = `
          <div class="cal__head">
            <span class="cal__title">${Eco.fmt(view, { month: 'long', year: 'numeric' })}</span>
            <span style="display:flex;gap:2px">
              <button type="button" class="icon-btn icon-btn--sm" data-step="-1" aria-label="Previous month">${Eco.icon('chevron-left')}</button>
              <button type="button" class="icon-btn icon-btn--sm" data-step="1" aria-label="Next month">${Eco.icon('chevron-right')}</button>
            </span>
          </div>
          <div class="cal__grid">${['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((x) => `<span class="cal__dow">${x}</span>`).join('')}${cells}</div>
          <div class="cal__foot">
            <button type="button" class="btn btn--ghost btn--sm" data-act="clear">Clear</button>
            <button type="button" class="btn btn--sm" data-act="today">Today</button>
          </div>`;
      };
      const pick = (iso) => { hidden.value = iso; render(); hidden.dispatchEvent(new Event('input', { bubbles: true })); Eco.closePopover(); btn.focus(); };
      el.addEventListener('click', (e) => {
        const step = e.target.closest('[data-step]');
        if (step) { view.setMonth(view.getMonth() + +step.dataset.step); draw(); el.querySelector(`[data-step="${step.dataset.step}"]`).focus(); return; }
        const day = e.target.closest('.cal__day');
        if (day) { pick(day.dataset.iso); return; }
        const act = e.target.closest('[data-act]');
        if (act && act.dataset.act === 'clear') pick('');
        if (act && act.dataset.act === 'today') pick(Eco.iso(Eco.today()));
      });
      el.addEventListener('keydown', (e) => {
        const cur = e.target.closest('.cal__day');
        if (!cur) return;
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
        if (!delta) return;
        e.preventDefault();
        const d = Eco.parseISO(cur.dataset.iso); d.setDate(d.getDate() + delta);
        if (d.getMonth() !== view.getMonth()) { view = new Date(d.getFullYear(), d.getMonth(), 1); draw(); }
        const t = el.querySelector(`[data-iso="${Eco.iso(d)}"]`); t && t.focus();
      });
      draw();
      Eco.popover(btn, el, { placement: 'bottom-start', className: 'popover--pad', focus: false });
      const f = el.querySelector('.cal__day[tabindex="0"]') || el.querySelector('.cal__day');
      f && f.focus({ preventScroll: true });
    });
    render();
    return { render };
  };

  /* Select: replaces a native <select data-select> with a listbox button, keeping the select as the form value. */
  Eco.select = function (select) {
    if (select._eco) return select._eco;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `select-btn ${select.dataset.selectClass || ''}`;
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    if (select.id) { btn.id = `${select.id}-btn`; const lab = document.querySelector(`label[for="${select.id}"]`); if (lab) { lab.htmlFor = btn.id; } }
    btn.innerHTML = `<span class="select-btn__value"></span>${Eco.icon('chevron-down')}`;
    select.hidden = true;
    select.tabIndex = -1;
    select.after(btn);
    const render = () => {
      const opt = select.selectedOptions[0];
      const v = $('.select-btn__value', btn);
      v.textContent = opt ? opt.textContent : '';
      v.classList.toggle('is-placeholder', !opt || opt.value === '');
    };
    btn.addEventListener('click', () => {
      if (btn.getAttribute('aria-expanded') === 'true') { Eco.closePopover(); return; }
      const items = Array.from(select.options).map((o) => ({ label: o.textContent, value: o.value, selected: o.selected, swatch: o.dataset.swatch }));
      Eco.menu(btn, items, (value) => { select.value = value; render(); select.dispatchEvent(new Event('change', { bubbles: true })); select.dispatchEvent(new Event('input', { bubbles: true })); btn.focus(); }, { role: 'listbox', minWidth: true });
    });
    btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); btn.click(); } });
    select.addEventListener('change', render);
    render();
    select._eco = { render, btn };
    return select._eco;
  };

  Eco.autosize = function (ta) {
    const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight + 2}px`; };
    ta.addEventListener('input', fit);
    fit();
    document.fonts && document.fonts.ready.then(fit);
    return fit;
  };

  Eco.counter = function (el) {
    const field = document.getElementById(el.dataset.countFor);
    const max = +el.dataset.max;
    if (!field) return;
    const update = () => {
      const left = max - field.value.length;
      el.textContent = left;
      el.classList.toggle('is-near', left <= Math.max(3, Math.round(max * 0.15)) && left > 0);
      el.classList.toggle('is-full', left <= 0);
      el.setAttribute('aria-label', `${left} characters remaining`);
    };
    field.addEventListener('input', update);
    update();
  };

  Eco.initControls = function (root = document) {
    $$('[data-slider]', root).forEach((el) => el._slider || (el._slider = Eco.slider(el)));
    $$('[data-timefield]', root).forEach((el) => el._tf || (el._tf = Eco.timefield(el)));
    $$('[data-datefield]', root).forEach((el) => el._df || (el._df = Eco.datefield(el)));
    $$('select[data-select]', root).forEach((el) => Eco.select(el));
    $$('textarea[data-autosize]', root).forEach((el) => el._fit || (el._fit = Eco.autosize(el)));
    $$('[data-count-for]', root).forEach((el) => Eco.counter(el));
    $$('.segmented', root).forEach((el) => Eco.segmented(el));
    wireTodayLinks(root);
    initCounters(root);
  };

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initTooltips();
    initMenus();
    initShortcuts();
    initConfirmForms();
    Eco.initControls();
    $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => Eco.theme.toggle()));
    flashMessages();
    if (!$('.dock')) document.body.classList.add('no-dock');
  });
})();
