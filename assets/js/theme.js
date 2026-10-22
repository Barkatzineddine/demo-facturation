// Applies the saved theme before first paint (classic script, no flash of the wrong theme).
(function () {
  try {
    var t = localStorage.getItem('morel:theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* storage blocked: follow the system */ }
})();
