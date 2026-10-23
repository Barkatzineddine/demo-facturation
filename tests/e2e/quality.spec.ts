import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { createAndSendQuote, expect, login, stored, test } from './fixtures';

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
const serious = (r: Awaited<ReturnType<typeof axe>>) =>
  r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);

test.describe('accessibility (axe, WCAG 2.2 AA)', () => {
  test('sign-in page', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(serious(await axe(page))).toEqual([]);
  });
  for (const [name, path] of [['dashboard', './#/'], ['quotes', './#/devis'], ['invoices', './#/factures'], ['clients', './#/clients'], ['portal picker', './#/portail'], ['security', './#/securite']] as const) {
    test(name, async ({ page }) => {
      await login(page);
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForTimeout(800);
      expect(serious(await axe(page))).toEqual([]);
    });
  }
  test('document view, editor and client portal', async ({ page }) => {
    await login(page);
    const invoice = await stored(page, (s) => s.docs.find((d) => d.kind === 'invoice' && d.status === 'issued')?.id ?? '');
    await page.goto(`./#/factures/${invoice}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(serious(await axe(page))).toEqual([]);
    await page.goto('./#/devis/nouveau');
    await expect(page.getByRole('heading', { name: 'Nouveau devis' })).toBeVisible();
    expect(serious(await axe(page))).toEqual([]);
    const token = await stored(page, (s) => s.clients[0]?.token ?? '');
    await page.goto(`./#/portail/${token}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(serious(await axe(page))).toEqual([]);
  });
  test('dark theme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await login(page);
    await page.waitForTimeout(800);
    expect(serious(await axe(page))).toEqual([]);
  });
});

test.describe('security', () => {
  test('ships a strict CSP with Trusted Types', async ({ page }) => {
    await page.goto('./');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("require-trusted-types-for 'script'");
  });

  test.describe('with the violation expected', () => {
    test.use({ allowedConsole: /TrustedHTML|Trusted Type/ });
    test('the browser refuses raw HTML injection', async ({ page }) => {
      await page.goto('./');
      const result = await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-properties -- this test proves the browser blocks it
        try { document.createElement('div').innerHTML = '<img src=x onerror=alert(1)>'; return 'allowed'; } catch { return 'blocked'; }
      });
      expect(result).toBe('blocked');
    });
  });

  test('a signed quote edited afterwards is flagged by its proof', async ({ page, context, isMobile }) => {
    test.skip(isMobile, 'two tabs');
    await login(page);
    const quote = await createAndSendQuote(page);
    const token = await stored(page, (s) => s.clients.find((c) => c.name === 'Bistrot du Quai')?.token ?? '');
    const client = await context.newPage();
    await client.goto(`./#/portail/${token}`);
    const card = client.locator('.quote-card', { hasText: quote.number });
    await card.getByLabel('Nom et prénom du signataire').fill('Julien Maréchal');
    await card.getByLabel(/Bon pour accord/).check();
    await card.getByRole('button', { name: 'Signer et accepter' }).click();
    await page.bringToFront();
    await expect(page.locator('.proof-status')).toContainText('Empreinte vérifiée', { timeout: 10_000 });
    // someone lowers a price directly in storage, around the rules
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('morel:v2') ?? '{}') as { docs: { id: string; lines: { price: number }[] }[] };
      const d = s.docs.find((x) => x.id === id);
      if (d?.lines[0]) d.lines[0].price = 100;
      localStorage.setItem('morel:v2', JSON.stringify(s));
    }, quote.id);
    await page.reload();
    await expect(page.locator('.proof-status')).toContainText('L’empreinte ne correspond plus');
  });

  test('a revoked portal link stops working at once', async ({ page }) => {
    await login(page);
    const client = await stored(page, (s) => s.clients[0]);
    await page.goto(`./#/clients/${client?.id ?? ''}`);
    await page.getByRole('button', { name: /Révoquer le lien du portail/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Révoquer' }).click();
    await page.goto(`./#/portail/${client?.token ?? ''}`);
    await expect(page.getByRole('heading', { name: 'Lien invalide' })).toBeVisible();
  });
});

test('works offline once visited (service worker)', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'same code path as desktop');
  await login(page);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
  await page.getByRole('link', { name: 'Clients' }).first().click(); // lazy-loaded screen, precached
  await expect(page.getByRole('heading', { name: 'Clients', level: 1 })).toBeVisible();
  await context.setOffline(false);
});
