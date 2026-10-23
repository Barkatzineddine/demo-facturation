// Service worker registration under Trusted Types: register() is a script-URL sink, so the URL goes
// through the only policy the CSP allows ("sw-url"), which accepts exactly one address.
interface TrustedTypesLike {
  createPolicy: (name: string, rules: { createScriptURL: (url: string) => string }) => { createScriptURL: (url: string) => unknown };
}

export function registerServiceWorker(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;
  const url = `${import.meta.env.BASE_URL}sw.js`;
  const tt = (window as unknown as { trustedTypes?: TrustedTypesLike }).trustedTypes;
  const scriptUrl = tt
    ? tt.createPolicy('sw-url', {
      createScriptURL: (candidate) => {
        if (candidate !== url) throw new TypeError(`Script URL refused: ${candidate}`);
        return candidate;
      },
    }).createScriptURL(url)
    : url;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(scriptUrl as string, { scope: import.meta.env.BASE_URL }).catch(() => { /* offline support is optional */ });
  });
}

/** "Install the app" prompt (Chromium): resolves with a function to show it, or null. */
export function onInstallPrompt(callback: (show: (() => Promise<void>) | null) => void): () => void {
  const handler = (event: Event) => {
    event.preventDefault();
    const prompt = event as Event & { prompt: () => Promise<void> };
    callback(async () => { await prompt.prompt(); callback(null); });
  };
  window.addEventListener('beforeinstallprompt', handler);
  return () => window.removeEventListener('beforeinstallprompt', handler);
}
