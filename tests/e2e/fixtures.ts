// Shared Playwright fixtures: any console error or uncaught exception fails the test, so a CSP or
// Trusted Types violation anywhere in a flow is caught, not just in the tests written for it.
import { test as base, expect, type Page } from '@playwright/test';

export const test = base.extend<{ allowedConsole: RegExp | null; consoleErrors: string[] }>({
  allowedConsole: [null, { option: true }],
  // a first visit starts on the inert pre-rendered copy (build/prerender.ts): navigations wait until the
  // app has replaced it, as a person would, unless a test asks to look at the copy (waitUntil: 'commit')
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    const live = async (waitUntil?: string) => { if (waitUntil !== 'commit') await page.locator('[data-prerendered]').waitFor({ state: 'detached' }); };
    page.goto = async (url, options) => { const response = await goto(url, options); await live(options?.waitUntil); return response; };
    page.reload = async (options) => { const response = await reload(options); await live(options?.waitUntil); return response; };
    await use(page);
  },
  consoleErrors: [async ({ page, allowedConsole }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !(allowedConsole?.test(m.text()))) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
    await use(errors);
    expect(errors, 'console errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

/** Staff login with the public demo accounts. Local preview only: never run against the live site. */
export async function login(page: Page, role: 'owner' | 'accountant' = 'owner'): Promise<void> {
  await page.goto('./');
  await page.locator('.demo-logins button').nth(role === 'owner' ? 0 : 1).click();
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.locator('.kpis')).toBeVisible();
}

/** Reads the stored state (what the app saved in localStorage). */
export async function stored<T>(page: Page, pick: (s: { clients: { id: string; token: string; name: string; contact: string }[]; docs: { id: string; kind: string; status: string; number: string; client: string; validUntil?: string; fingerprint?: string; lines: { price: number }[] }[] }) => T): Promise<T> {
  const raw = await page.evaluate(() => localStorage.getItem('morel:v2') ?? '{}');
  return pick(JSON.parse(raw));
}

/** Creates and sends a quote through the editor; returns its id and number. */
export async function createAndSendQuote(page: Page): Promise<{ id: string; number: string }> {
  await page.goto('./#/devis/nouveau');
  await expect(page.getByRole('heading', { name: 'Nouveau devis' })).toBeVisible();
  await page.getByLabel('Client').selectOption({ label: 'Bistrot du Quai' });
  await page.getByLabel('Objet').fill('Banquette et comptoir');
  await page.getByLabel('Ajouter depuis le catalogue…').selectOption({ index: 10 });
  await page.getByRole('button', { name: 'Envoyer au client' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.locator('.page-head h1')).toHaveText(/^Devis D-\d{4}-\d{4}$/);
  const number = ((await page.locator('.page-head h1').textContent()) ?? '').replace('Devis ', '');
  const id = page.url().split('/').pop() ?? '';
  return { id, number };
}
