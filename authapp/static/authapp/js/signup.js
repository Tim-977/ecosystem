/* Ecosystem — sign up. Carries the onboarding answers over from the
   visitor's browser and keeps the same scene running beside the form.
   Validation and submission stay in auth.js. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;
  const STORE = 'eco-onboarding';

  document.addEventListener('DOMContentLoaded', () => {
    const form = $('form[data-signup]');
    if (!form) return;
    const page = $('[data-su]');

    /* the cluster keeps floating — same module as the onboarding flow */
    const orb = Eco.widgets ? Eco.widgets($('[data-orbit]', page), { spot: $('[data-spot]', page), live: page }) : null;

    /* ---------- bring the onboarding answers with us ---------- */
    let answers = null;
    try { answers = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { /* private mode */ }
    const answered = answers && Object.keys(answers).some((k) => {
      const v = answers[k];
      return Array.isArray(v) ? v.length : v && (typeof v !== 'object' || Object.keys(v).length);
    });

    const hidden = $('[data-su-onboarding]', form);
    if (answered && hidden) hidden.value = JSON.stringify(answers);

    if (answered) {
      const name = typeof answers.name === 'string' ? answers.name.trim().slice(0, 24) : '';
      const title = $('[data-su-title]'), sub = $('[data-su-sub]'), from = $('[data-su-from]');
      if (name) {
        title.innerHTML = `Almost there,<em> ${Eco.esc(name)}.</em>`;
        sub.textContent = 'Create the account and today becomes the first day you log.';
      } else {
        sub.textContent = 'Last step. Your answers come with you.';
      }
      from.innerHTML = `${Eco.icon('circle-check', 'icon icon--sm')}Your setup is saved`;
      from.hidden = false;

      // the cluster keeps showing the rating style they picked a screen ago
      const score = answers.rating && answers.rating.mood;
      if (orb && score) orb.mood(score, answers.scale === 'words');
    }

    /* ---------- the line fills as the four fields come good ---------- */
    const bar = $('[data-su-bar]');
    const user = $('#username', form), email = $('#email', form);
    const pw = $('#password', form), confirm = $('#confirm_password', form);
    const update = () => {
      const done = [
        /^[A-Za-z0-9]{3,12}$/.test(user.value.trim()),
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()),
        pw.value.length > 0,
        confirm.value.length > 0 && confirm.value === pw.value,
      ].filter(Boolean).length;
      bar.parentElement.style.setProperty('--p', (done / 4).toFixed(2));
    };
    form.addEventListener('input', update);
    update();
    // the browser copy is cleared on the welcome page, not here — a rejected
    // signup comes back to this form and still needs the answers.
  });
})();
