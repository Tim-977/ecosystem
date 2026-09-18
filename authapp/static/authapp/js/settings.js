/* Ecosystem — settings: change tracking per form, theme picker, section scroll-spy. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const dock = $('#settingsDock');
    const forms = $$('form[data-track]');
    let active = null; // the form with unsaved changes (only one at a time)

    forms.forEach((form) => {
      const fields = $$('input[name]:not([type="hidden"][name="csrfmiddlewaretoken"]), select[name]', form);
      const initial = new Map(fields.map((f) => [f, f.value]));
      const save = $('[data-save]', form), cancel = $('[data-cancel]', form), text = $('[data-state-text]', form);
      const isDirty = () => fields.some((f) => f.value !== initial.get(f));
      const update = () => {
        const dirty = isDirty();
        save.disabled = !dirty; cancel.disabled = !dirty;
        text.textContent = dirty ? 'Unsaved changes' : 'No changes';
        text.classList.toggle('is-dirty', dirty);
        if (dirty) active = form; else if (active === form) active = null;
        forms.forEach((f) => { if (f !== form && dirty) f.classList.add('is-muted'); else f.classList.remove('is-muted'); });
        dock.hidden = !active;
        if (active) $('#settingsDockText').textContent = `Unsaved changes in ${active.closest('section').querySelector('h2').textContent}`;
      };
      form.addEventListener('input', update);
      form.addEventListener('change', update);
      form.addEventListener('reset', (e) => {
        e.preventDefault();
        fields.forEach((f) => { f.value = initial.get(f); if (f.tagName === 'SELECT' && f._eco) f._eco.render(); });
        $$('[data-datefield]', form).forEach((b) => b._df && b._df.render());
        $$('[aria-invalid]', form).forEach((f) => f.removeAttribute('aria-invalid'));
        $$('[data-count-for]', form).forEach((c) => document.getElementById(c.dataset.countFor).dispatchEvent(new Event('input')));
        update();
      });
      form.addEventListener('submit', () => { form._submitting = true; save.classList.add('is-busy'); });
      form._update = update;
    });

    $('#settingsDiscard').addEventListener('click', () => active && active.reset());
    $('#settingsSave').addEventListener('click', () => active && active.requestSubmit($('[data-save]', active)));
    Eco.onKey('mod+s', () => active && active.requestSubmit($('[data-save]', active)));
    window.addEventListener('beforeunload', (e) => { if (active && !active._submitting) { e.preventDefault(); e.returnValue = ''; } });

    // Username rule feedback as you type (the server check stays authoritative)
    const username = $('#id_username');
    if (username) username.addEventListener('input', () => {
      const ok = /^[A-Za-z0-9]{3,12}$/.test(username.value.trim());
      username.setAttribute('aria-invalid', ok ? 'false' : 'true');
    });

    // theme
    const picker = $('#themePicker');
    const renderTheme = () => $$('.theme-option', picker).forEach((o) => o.setAttribute('aria-checked', o.dataset.value === Eco.theme.get()));
    picker.addEventListener('click', (e) => { const o = e.target.closest('.theme-option'); if (o) { Eco.theme.set(o.dataset.value); renderTheme(); } });
    picker.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      Eco.theme.toggle(); renderTheme(); $('[aria-checked="true"]', picker).focus(); e.preventDefault();
    });
    document.addEventListener('eco:theme', renderTheme);
    renderTheme();

    // cursor glow
    const glowToggle = $('#cursorGlowToggle');
    if (glowToggle) {
      glowToggle.checked = Eco.cursorGlow.get();
      glowToggle.addEventListener('change', () => Eco.cursorGlow.set(glowToggle.checked));
    }

    // mood & productivity format: saved as soon as it's picked
    const format = $('#ratingFormat');
    if (format) {
      const hint = $('[data-rating-hint]');
      const HINT = { numbers: 'On a scale from 1 to 10.', words: 'In words, from “Terrible” to “Excellent!”' };
      let saved = $('[aria-checked="true"]', format).dataset.value;
      format.addEventListener('eco:change', async (e) => {
        const value = e.detail;
        if (value === saved) return;
        const res = await Eco.api(format.dataset.url, { method: 'POST', json: { format: value } });
        if (res.ok) {
          saved = value;
          document.body.dataset.rating = value;
          hint.textContent = HINT[value];
          Eco.toast(value === 'words' ? 'Check-ins now use words.' : 'Check-ins now use numbers.', { type: 'success' });
        } else {
          Eco.segmented(format).select($(`[data-value="${saved}"]`, format), false);
          Eco.toast('That didn’t save. Try again in a moment.', { type: 'error' });
        }
      });
    }

    // scroll-spy
    const links = $$('.settings-nav__link');
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${en.target.id}`));
    }), { rootMargin: '-35% 0px -60% 0px' });
    $$('.settings-section').forEach((s) => io.observe(s));

    // after a failed save, bring the form with errors into view
    const err = $('.settings-section .has-error, .settings-section .alert--error');
    if (err) err.closest('.settings-section').scrollIntoView({ block: 'start' });
  });
})();
