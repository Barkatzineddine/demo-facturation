// Runs before the first paint, inlined in the HTML at build and allowed by its CSP hash.
// - The saved theme, so the page never flashes the wrong one.
// - index.html carries a pre-rendered sign-in page: what a first visit shows (build/prerender.ts).
//   Any other visit (a route in the address, saved data or settings) hides it rather than flash the
//   wrong screen until the app starts.
(function () {
  var html = document.documentElement;
  var show = !/^#\/./.test(location.hash);
  try {
    var theme = localStorage.getItem('morel:theme');
    if (theme === 'light' || theme === 'dark') html.setAttribute('data-theme', theme);
    for (var i = 0; i < localStorage.length; i++) if ((localStorage.key(i) || '').indexOf('morel:') === 0) show = false;
  } catch { show = false; }
  html.setAttribute('data-prerender', show ? 'shown' : 'skip');
})();
