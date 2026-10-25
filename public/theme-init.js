// Runs before the popup paints: applies the saved light/dark choice (see src/theme.js).
(function () {
  var pref = 'auto';
  try {
    pref = localStorage.getItem('piggy-theme') || 'auto';
  } catch (e) {}
  var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
