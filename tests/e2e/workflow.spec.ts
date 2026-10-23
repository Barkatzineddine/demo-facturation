import { createAndSendQuote, expect, login, stored, test } from './fixtures';

test('quote sent, signed by the client in their portal, seen live, invoiced, paid', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'two tabs side by side');
  await login(page);
  const quote = await createAndSendQuote(page);
  const token = await stored(page, (s) => s.clients.find((c) => c.name === 'Bistrot du Quai')?.token ?? '');

  // the client opens the private link in another tab (no staff session there)
  const client = await context.newPage();
  await client.goto(`./#/portail/${token}`);
  await expect(client.getByRole('heading', { name: 'Bonjour Julien' })).toBeVisible();
  await page.bringToFront();
  await expect(page.locator('.toast', { hasText: `Bistrot du Quai vient d’ouvrir le Devis ${quote.number}` })).toBeVisible({ timeout: 10_000 });

  const card = client.locator('.quote-card', { hasText: quote.number });
  await card.getByRole('button', { name: 'Signer et accepter' }).click();
  await expect(card.getByText('Indiquez votre prénom et votre nom.')).toBeVisible();
  await card.getByLabel('Nom et prénom du signataire').fill('Julien Maréchal');
  await card.getByLabel(/Bon pour accord/).check();
  await card.getByRole('button', { name: 'Signer et accepter' }).click();
  await expect(client.locator('.toast', { hasText: 'Devis accepté' })).toBeVisible();

  // the office tab hears about it and shows the verified proof
  await page.bringToFront();
  await expect(page.locator('.toast', { hasText: `Bistrot du Quai a accepté le Devis ${quote.number}` })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.proof-status')).toContainText('Empreinte vérifiée');
  await expect(page.locator('.history')).toContainText('Accepté en ligne par Julien Maréchal');

  await page.getByRole('button', { name: 'Convertir en facture' }).click();
  await expect(page.getByRole('heading', { name: 'Nouvelle facture' })).toBeVisible();
  await page.getByRole('button', { name: 'Émettre la facture' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Émettre' }).click();
  await expect(page.locator('.page-head h1')).toHaveText(/^Facture F-\d{4}-\d{4}$/);
  await expect(page.getByRole('button', { name: 'Émettre la facture' })).toHaveCount(0); // frozen now

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Télécharger le PDF' }).click()]);
  expect(pdf.suggestedFilename()).toMatch(/^facture-f-\d{4}-\d{4}-bistrot-du-quai\.pdf$/);
  const path = await pdf.path();
  const head = (await import('node:fs')).readFileSync(path).subarray(0, 8).toString('latin1');
  expect(head).toBe('%PDF-1.4');

  await page.getByRole('button', { name: 'Enregistrer un paiement' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer le paiement' }).click();
  await expect(page.locator('.page-head .chip')).toHaveText(/Payée/);
});

test('lines reorder with the mouse and with the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'same component, pointer path covered on desktop');
  await login(page);
  await page.goto('./#/devis/nouveau');
  await page.getByLabel('Ajouter depuis le catalogue…').selectOption('2'); // catalogue item 2: Dressing sur mesure
  const labels = () => page.locator('.le-row textarea').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  expect(await labels()).toEqual(['Main-d’œuvre menuisier', 'Dressing sur mesure']);

  // keyboard: focus the handle, Space, ArrowUp, Space
  await page.getByRole('button', { name: 'Déplacer la ligne 2' }).focus();
  // each key waits for the previous step to land: a slow runner otherwise drops the line before it has moved
  const dragged = page.locator('.le-row.is-dragging');
  await page.keyboard.press('Space');
  await expect(dragged).toHaveCount(1);
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => dragged.evaluate((el) => el.style.transform)).toMatch(/translate3d\([^,]+, -/);
  await page.keyboard.press('Space');
  await expect.poll(labels).toEqual(['Dressing sur mesure', 'Main-d’œuvre menuisier']);

  // mouse: drag the second handle above the first row
  const handle = page.getByRole('button', { name: 'Déplacer la ligne 2' });
  const box = await handle.boundingBox();
  const first = await page.locator('.le-row').first().boundingBox();
  if (!box || !first) throw new Error('editor not rendered');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 10, { steps: 4 });
  await expect(page.locator('.le-row.is-dragging')).toHaveCount(1); // past the 5 px activation distance: the drag is on
  await page.mouse.move(box.x + box.width / 2, first.y + 4, { steps: 16 });
  await page.waitForTimeout(200); // let the sortable settle on its target before dropping
  await page.mouse.up();
  await expect.poll(labels).toEqual(['Main-d’œuvre menuisier', 'Dressing sur mesure']);
  await expect(page.getByText('Modifications non enregistrées')).toBeVisible();
});

test('signed quotes of the demo data carry a verified fingerprint', async ({ page }) => {
  await login(page);
  const id = await stored(page, (s) => s.docs.find((d) => d.kind === 'quote' && d.status === 'accepted')?.id ?? '');
  await expect.poll(() => stored(page, (s) => s.docs.find((d) => d.id === id)?.fingerprint ?? '')).toMatch(/^[0-9a-f]{64}$/);
  await page.goto(`./#/devis/${id}`);
  await expect(page.locator('.proof-status')).toContainText('Empreinte vérifiée');
});

test('the accountant records payments but cannot create, send or issue', async ({ page }) => {
  await login(page, 'accountant');
  await expect(page.getByRole('link', { name: '+ Nouveau devis' })).toHaveCount(0);
  await page.goto('./#/factures');
  await page.getByRole('button', { name: /^À payer/ }).click();
  await page.locator('.doc-link').first().click();
  await expect(page.getByRole('button', { name: 'Enregistrer un paiement' })).toBeVisible();
  await page.goto('./#/devis/nouveau'); // typed by hand
  await expect(page.locator('.toast-err')).toContainText('Votre rôle ne permet pas cette action.');
  await expect(page).toHaveURL(/#\/devis$/);
  const draftId = await stored(page, (s) => s.docs.find((d) => d.status === 'draft')?.id ?? '');
  await page.goto(`./#/devis/${draftId}`);
  await expect(page.getByRole('button', { name: 'Envoyer au client' })).toHaveCount(0); // read-only view for her
});

test('portal: unknown link, refusal with a note, simulated payment', async ({ page }) => {
  await page.goto('./#/portail/AAAAAAAAAAAAAAAA');
  await expect(page.getByRole('heading', { name: 'Lien invalide' })).toBeVisible();
  await page.goto('./');
  const target = await stored(page, (s) => {
    const today = new Date().toISOString().slice(0, 10);
    const q = s.docs.find((d) => d.kind === 'quote' && d.status === 'sent' && (d.validUntil ?? '') >= today);
    const c = s.clients.find((x) => x.id === q?.client);
    return { token: c?.token ?? '', number: q?.number ?? '' };
  });
  await page.goto(`./#/portail/${target.token}`);
  const card = page.locator('.quote-card', { hasText: target.number });
  await card.getByRole('button', { name: 'Refuser' }).click();
  await page.getByRole('dialog').getByLabel(/Une précision/).fill('Moins cher ici : https://exemple.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Refuser le devis' }).click();
  await expect(page.locator('.toast-err')).toContainText('Les liens ne sont pas acceptés');
  await page.getByRole('dialog').getByLabel(/Une précision/).fill('Budget trop élevé pour cette année.');
  await page.getByRole('dialog').getByRole('button', { name: 'Refuser le devis' }).click();
  await expect(page.locator('.toast', { hasText: 'Votre réponse a été transmise.' })).toBeVisible();
  await expect(page.locator('.quote-card', { hasText: target.number })).toHaveCount(0);

  const payer = await stored(page, (s) => s.clients.find((c) => s.docs.some((d) => d.client === c.id && d.kind === 'invoice' && d.status === 'issued'))?.token ?? '');
  await page.goto(`./#/portail/${payer}`);
  await expect(page.getByRole('button', { name: /^Payer/ }).first()).toBeVisible(); // the portal loads on demand
  const before = await page.getByRole('button', { name: /^Payer/ }).count();
  await page.getByRole('button', { name: /^Payer/ }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Simuler le paiement' }).click();
  await expect(page.locator('.toast', { hasText: 'Paiement reçu' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Payer/ })).toHaveCount(before - 1);
});

test('the language switch translates the interface, documents stay French', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'English' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  await page.goto('./#/factures');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Invoices');
  await expect(page.locator('.doc-link').first()).toContainText(/F-\d{4}-\d{4}/);
});
