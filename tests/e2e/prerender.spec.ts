import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

// this app's home heading, and a route that is not the home page
const HEADING = /Connexion/;
const DEEP_LINK = './#/securite';

/** The home heading, found by element: the copy is inert, so it is not in the accessibility tree. */
const heading = (page: Page) => page.locator('main h1', { hasText: HEADING });

/** Holds the app's script until release(), so the pre-rendered page can be looked at on its own. */
async function holdApp(page: Page): Promise<() => void> {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/\/assets\/index-[\w-]+\.js$/, async (route) => { await gate; await route.continue(); });
  return release;
}

/** The page's text, minus what the copy leaves to the app (what depends on the moment, deferred drawings). */
const stableText = (page: Page) => page.locator('#root').evaluate((root) => {
  const copy = root.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-volatile], [data-defer]').forEach((el) => { el.remove(); });
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
});

test.describe('pre-rendered first screen', () => {
  test.use({ serviceWorkers: 'block' }); // every request goes through the routes below

  test('is in the HTML itself', async ({ request }) => {
    const html = await (await request.get('./')).text();
    expect(html).toContain('<div data-prerendered inert>');
    expect(html).toMatch(HEADING);
  });

  test('shows before the app starts, which then takes over with the same content and no replayed animation', async ({ page }) => {
    const release = await holdApp(page);
    await page.goto('./', { waitUntil: 'commit' }); // the held script also holds the load event
    await expect(heading(page)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-prerender', 'shown');
    const before = await stableText(page);

    release();
    await expect(page.locator('[data-prerendered]')).toHaveCount(0); // replaced by the app's first render
    expect(await stableText(page)).toBe(before);
    const replaying = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length);
    expect(replaying).toBe(0);
    // entrance animations come back for the next screens
    await expect(page.locator('html')).not.toHaveAttribute('data-prerender', /./, { timeout: 5000 });
  });

  test('stays hidden on a deep link', async ({ page }) => {
    const release = await holdApp(page);
    await page.goto(DEEP_LINK, { waitUntil: 'commit' });
    await expect(page.locator('html')).toHaveAttribute('data-prerender', 'skip');
    await expect(heading(page)).toBeHidden();
    release();
    await expect(page.locator('[data-prerendered]')).toHaveCount(0);
  });

  test('stays hidden on a returning visit, which may hold saved data', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('[data-prerendered]')).toHaveCount(0); // the app ran and saved its data
    const release = await holdApp(page);
    await page.reload({ waitUntil: 'commit' });
    await expect(page.locator('html')).toHaveAttribute('data-prerender', 'skip');
    await expect(heading(page)).toBeHidden();
    release();
    await expect(heading(page)).toBeVisible();
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the first screen still reads', async ({ page }) => {
    await page.goto('./');
    await expect(heading(page)).toBeVisible();
  });
});
