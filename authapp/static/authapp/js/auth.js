/* Ecosystem — signed-out forms: show/hide password, live signup rules, required-field checks. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    $$('[data-pw-toggle]').forEach((btn) => {
      const input = btn.closest('.input-group').querySelector('input');
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.querySelector('use').setAttribute('href', show ? '#i-eye-off' : '#i-eye');
        input.focus();
      });
    });

    $$('form[data-auth-form]').forEach((form) => {
      const err = $('[data-auth-error]', form);
      const signup = form.hasAttribute('data-signup');
      const user = $('#username', form);
      const pw = $('#password', form), confirm = $('#confirm_password', form);
      const rule = (name, state) => { const r = $(`[data-rule="${name}"]`, form); if (r) { r.classList.toggle('is-ok', state === true); r.classList.toggle('is-bad', state === false); } };
      const check = (final) => {
        if (!signup) return true;
        const u = user.value.trim();
        const lenOk = u.length >= 3 && u.length <= 12, charsOk = /^[A-Za-z0-9]*$/.test(u);
        rule('length', u ? lenOk : (final ? false : null));
        rule('chars', u ? charsOk : null);
        const match = confirm.value ? pw.value === confirm.value : null;
        rule('match', match === null ? (final && pw.value ? false : null) : match);
        return lenOk && charsOk && pw.value && pw.value === confirm.value;
      };
      form.addEventListener('input', () => { err.hidden = true; check(false); });
      form.addEventListener('submit', (e) => {
        const missing = $$('input[required]', form).find((i) => !i.value.trim());
        if (missing) {
          e.preventDefault();
          const label = form.querySelector(`label[for="${missing.id}"]`);
          err.innerHTML = `${Eco.icon('circle-alert', 'icon icon--sm')}Enter your ${(label ? label.childNodes[0].textContent : 'details').trim().toLowerCase()}.`;
          err.hidden = false;
          missing.focus();
          return;
        }
        if (!check(true)) { e.preventDefault(); err.innerHTML = `${Eco.icon('circle-alert', 'icon icon--sm')}Fix the highlighted rules first.`; err.hidden = false; return; }
        $('[type="submit"]', form).classList.add('is-busy');
      });
    });
  });
})();
