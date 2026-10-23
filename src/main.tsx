// Entry point: the stylesheet, then the app (src/start.tsx). The app's code downloads with the page
// (modulepreload, see build/plugins.ts), but on a pre-rendered first visit (src/boot.js) it runs only
// after that page has painted: evaluating it first would hold the paint until it is done.
import './styles/global.css';

const start = () => { void import('./start'); };

if (document.documentElement.dataset.prerender === 'shown') {
  let started = false;
  const once = () => { if (!started) { started = true; start(); } };
  requestAnimationFrame(() => { setTimeout(once); });
  setTimeout(once, 100); // hidden tabs get no animation frame
} else start();
