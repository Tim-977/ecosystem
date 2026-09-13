/* Ecosystem — activity palette editor. Mirrors the server's rules before
   submitting (15 per month, name ≤ 15 chars, unique name and color, #rrggbb). */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  const PRESETS = ['#7c83fd', '#5fa8f5', '#4fc3d9', '#4fd1a5', '#7ccf6e', '#c5d86d', '#f2d15c', '#f5a652',
    '#f0785a', '#ec6a8c', '#d17ee8', '#9f7aea', '#8d99ae', '#c9a27e', '#e6e6e6', '#4a5568'];
  const HEX = /^#[0-9a-fA-F]{6}$/;

  const ink = (hex) => {
    const m = HEX.exec(hex || '') ? parseInt(hex.slice(1), 16) : 0x777777;
    const c = [(m >> 16) & 255, (m >> 8) & 255, m & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.36 ? 'rgba(8,8,10,0.9)' : 'rgba(255,255,255,0.96)';
  };
  const tone = (hex) => `color-mix(in oklab, ${hex} var(--act-mix), var(--bg-1))`;
  const paint = (el, hex) => { el.style.setProperty('--tone', tone(hex)); el.style.setProperty('--ink', ink(hex)); };

  document.addEventListener('DOMContentLoaded', () => {
    const root = $('#activities');
    if (!root) return;
    const cards = $$('.act-card', root);
    const acts = cards.map((c) => ({ id: c.dataset.id, name: c.dataset.name, color: c.dataset.color, el: c }));
    cards.forEach((c) => paint($('.act-card__preview', c), c.dataset.color));

    const form = $('#actForm');
    const action = $('#actAction'), idInput = $('#actId');
    const name = $('#actName'), color = $('#actColor'), wheel = $('#colorWheel');
    const nameErr = $('#actNameError'), colorErr = $('#actColorError');
    const submit = $('#actSubmit');
    const preview = $('#actPreview');
    const swatchHost = $('#swatches');
    const suggest = $('#suggestField');
    const editingId = () => (action.value === 'update' ? idInput.value : null);
    const others = () => acts.filter((a) => a.id !== editingId());

    swatchHost.innerHTML = PRESETS.map((c) => `<button type="button" class="swatch-btn" style="--c:${c}" data-color="${c}" aria-label="Color ${c}" aria-pressed="false"></button>`).join('');

    const showErr = (el, msg) => { el.hidden = !msg; el.innerHTML = msg ? `${Eco.icon('circle-alert', 'icon icon--sm')}${Eco.esc(msg)}` : ''; };
    const validate = (final) => {
      const n = name.value.trim();
      const c = color.value.trim();
      let nMsg = '', cMsg = '';
      if (!n) nMsg = final ? 'Give the activity a name.' : '';
      else if (n.length > 15) nMsg = 'Keep the name to 15 characters or fewer.';
      else if (others().some((a) => a.name === n)) nMsg = 'You already have an activity with that name this month.';
      if (!HEX.test(c)) cMsg = final || c.length >= 7 ? 'Use a hex color like #7c83fd.' : '';
      else if (others().some((a) => a.color === c)) cMsg = 'Another activity already uses this color.';
      const full = action.value === 'create' && acts.length >= 15;
      showErr(nameErr, full ? 'You can have up to 15 activities per month. Delete one to add another.' : nMsg);
      showErr(colorErr, cMsg);
      name.setAttribute('aria-invalid', !!nMsg);
      color.setAttribute('aria-invalid', !!cMsg);
      submit.disabled = full;
      return !nMsg && !cMsg && !full;
    };
    const render = () => {
      const c = color.value.trim();
      const valid = HEX.test(c);
      $('#hexPreview').style.setProperty('--c', valid ? c : 'var(--bg-3)');
      if (valid) { paint(preview, c); wheel.value = c.toLowerCase(); }
      preview.textContent = name.value.trim() || 'New activity';
      const used = new Set(others().map((a) => a.color));
      $$('.swatch-btn', swatchHost).forEach((b) => {
        b.setAttribute('aria-pressed', b.dataset.color === c);
        b.disabled = used.has(b.dataset.color);
        b.dataset.tip = b.disabled ? 'Already used this month' : b.dataset.color;
      });
      $$('.suggestions button', suggest).forEach((b) => { b.disabled = others().some((a) => a.name === b.textContent); });
      validate(false);
    };

    swatchHost.addEventListener('click', (e) => { const b = e.target.closest('.swatch-btn'); if (b && !b.disabled) { color.value = b.dataset.color; render(); } });
    wheel.addEventListener('input', () => { color.value = wheel.value.toLowerCase(); render(); });
    color.addEventListener('input', () => { if (color.value && color.value[0] !== '#') color.value = `#${color.value}`; render(); });
    name.addEventListener('input', render);
    suggest.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { name.value = b.textContent; name.dispatchEvent(new Event('input')); name.focus(); } });
    form.addEventListener('submit', (e) => {
      color.value = color.value.trim().toLowerCase();
      name.value = name.value.trim();
      if (!validate(true)) { e.preventDefault(); (nameErr.hidden ? color : name).focus(); return; }
      submit.classList.add('is-busy');
    });

    const setMode = (act) => {
      cards.forEach((c) => c.classList.toggle('is-editing', !!act && c === act.el));
      action.value = act ? 'update' : 'create';
      idInput.value = act ? act.id : '';
      name.value = act ? act.name : '';
      color.value = act ? act.color : (PRESETS.find((p) => !acts.some((a) => a.color === p)) || '#7c83fd');
      $('#actFormTitle').textContent = act ? 'Edit activity' : 'New activity';
      $('#actCancel').hidden = !act;
      suggest.hidden = !!act;
      $('span', submit).textContent = act ? 'Save changes' : 'Add activity';
      $('use', submit).setAttribute('href', act ? '#i-check' : '#i-plus');
      name.dispatchEvent(new Event('input'));
      render();
      form.scrollIntoView({ block: 'nearest', behavior: Eco.reduceMotion() ? 'auto' : 'smooth' });
      name.focus();
    };
    root.addEventListener('click', (e) => {
      const edit = e.target.closest('[data-edit]');
      if (!edit) return;
      e.preventDefault();
      setMode(acts.find((a) => a.el === edit.closest('.act-card')));
    });
    $('#actCancel').addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname); setMode(null); });
    $('#dockNewAct').addEventListener('click', () => { if (acts.length < 15) { history.replaceState(null, '', location.pathname); setMode(null); } });
    if (action.value === 'create') color.value = PRESETS.find((p) => !acts.some((a) => a.color === p)) || color.value;
    render();
  });
})();
