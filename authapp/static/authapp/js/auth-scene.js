/* Ecosystem — sign in. Keeps the same scene running as the onboarding and
   signup screens: the widget cluster floats, the cursor light follows, the
   cards glow as you pass them. Form behaviour stays in auth.js. */
(function () {
  'use strict';
  const Eco = window.Eco;
  const { $, $$ } = Eco;

  document.addEventListener('DOMContentLoaded', () => {
    const scene = $('[data-scene]');
    if (!scene || !Eco.widgets) return;
    Eco.widgets($('[data-orbit]', scene), { spot: $('[data-spot]', scene), live: scene });
    const fx = Eco.fx || {};
    if (fx.glow) fx.glow($$('[data-glow]', scene), { radius: 340 });
  });
})();
