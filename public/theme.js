// Applies the saved theme before the first paint (a classic script: no flash of the wrong theme).
(function () {
  try {
    var t = localStorage.getItem('morel:theme');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch { /* storage blocked: follow the system */ }
})();
