/* Ecosystem — sign up. The halftone picture refines as fields become valid;
   validation and submission stay in auth.js. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('form[data-signup]');
    const visual = $('[data-signup-visual]');
    if (!form || !visual) return;

    const media = $('[data-halftone]', visual);
    const fx = Eco.fx || {};
    const print = fx.halftone ? fx.halftone(media, { img: $('.hero__img', media), hero: visual, scroll: false }) : null;
    if (fx.glow) fx.glow($$('[data-glow]'));

    const user = $('#username', form), email = $('#email', form);
    const pw = $('#password', form), confirm = $('#confirm_password', form);
    const segs = $$('[data-step-seg]');
    const bar = $('[data-focus-bar]');
    const label = $('[data-focus-label]');
    const labels = ['Out of focus', 'Coming into focus', 'Getting clearer', 'Almost sharp', 'In focus'];

    const update = () => {
      const done = [
        /^[A-Za-z0-9]{3,12}$/.test(user.value.trim()),
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
        pw.value.length > 0,
        confirm.value.length > 0 && confirm.value === pw.value,
      ];
      const n = done.filter(Boolean).length;
      segs.forEach((s, i) => s.classList.toggle('is-done', done[i]));
      bar.parentElement.style.setProperty('--p', n / 4);
      label.textContent = labels[n];
      if (print) print.setClear(n / 4);
    };
    form.addEventListener('input', update);
    update();
  });
})();
