// Company, catalogue, VAT rates, statuses, staff accounts and permissions. Money is in integer cents.

export const COMPANY = {
  name: 'Morel Agencement',
  legal: 'SARL au capital de 10 000 €',
  activity: 'Menuiserie et agencement sur mesure',
  address: '12 rue des Menuisiers', zip: '33000', city: 'Bordeaux',
  phone: '05 36 49 12 34', email: 'contact@morel-agencement.example',
  siret: '123 456 789 00012', vat: 'FR00 123456789', rcs: 'RCS Bordeaux 123 456 789',
  iban: 'FR76 3000 0000 0000 0000 0000 000', bic: 'DEMOFRPPXXX',
} as const;

export const UNITS = ['u', 'forfait', 'h', 'm²', 'ml'] as const;
export type Unit = (typeof UNITS)[number];
export const VAT_RATES = [20, 10, 5.5] as const;
export type VatRate = (typeof VAT_RATES)[number];

/** Quote and invoice content stays in French: they are French legal documents. */
export const CATALOG: readonly { label: string; unit: Unit; price: number }[] = [
  { label: 'Cuisine sur mesure, façades chêne massif', unit: 'forfait', price: 680000 },
  { label: 'Plan de travail chêne huilé', unit: 'ml', price: 32000 },
  { label: 'Dressing sur mesure', unit: 'ml', price: 89000 },
  { label: 'Bibliothèque murale en noyer', unit: 'ml', price: 76000 },
  { label: 'Fourniture parquet chêne massif 14 mm', unit: 'm²', price: 5400 },
  { label: 'Pose de parquet chêne, collé', unit: 'm²', price: 3800 },
  { label: 'Ponçage et vitrification', unit: 'm²', price: 2400 },
  { label: 'Escalier quart tournant en hêtre', unit: 'forfait', price: 540000 },
  { label: 'Comptoir d’accueil sur mesure', unit: 'forfait', price: 420000 },
  { label: 'Banquette coffre sur mesure', unit: 'ml', price: 54000 },
  { label: 'Porte intérieure chêne, pose comprise', unit: 'u', price: 69000 },
  { label: 'Quincaillerie Blum (lot)', unit: 'u', price: 18500 },
  { label: 'Main-d’œuvre menuisier', unit: 'h', price: 5200 },
  { label: 'Déplacement et protection du chantier', unit: 'forfait', price: 9000 },
];

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'refused'] as const;
export const INVOICE_STATUSES = ['draft', 'issued', 'paid'] as const;
/** What the interface shows: "expired" and "late" are computed from the dates, never stored. */
export type QuoteView = (typeof QUOTE_STATUSES)[number] | 'expired';
export type InvoiceView = (typeof INVOICE_STATUSES)[number] | 'late';
export const PAY_METHODS = ['transfer', 'card', 'cheque', 'cash'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];

export const VALIDITY_DAYS = 30;
export const PAYMENT_DAYS = 30;

export const HISTORY_TYPES = ['created', 'sent', 'viewed', 'accepted', 'refused', 'converted', 'issued', 'paid', 'reminded', 'duplicated'] as const;

// ---------- staff (demo accounts: the passwords are public, the hashes are what is stored) ----------
export type StaffRole = 'owner' | 'accountant';
export interface StaffAccount { id: string; name: string; role: StaffRole; email: string; salt: string; hash: string }

export const STAFF: readonly StaffAccount[] = [
  { id: 'staff-antoine', name: 'Antoine Morel', role: 'owner', email: 'antoine@morel-agencement.example', salt: '2e304cb87f88090fc88f0177b60d47dc', hash: 'bc459db8fcfea508ebef30720cfdd85e3a7be31c3192fd7b0272f37984eba29b' },
  { id: 'staff-claire', name: 'Claire Vidal', role: 'accountant', email: 'compta@morel-agencement.example', salt: '3b6b907cbb314b57a49b0704fb07f3b1', hash: 'f9de296357b7427589a3c40d06120761534a5b53e490a60ff9dda983e039d43c' },
];

export const DEMO_LOGINS: readonly { role: StaffRole; email: string; password: string }[] = [
  { role: 'owner', email: 'antoine@morel-agencement.example', password: 'morel-gerant' },
  { role: 'accountant', email: 'compta@morel-agencement.example', password: 'morel-compta' },
];

// ---------- permissions: checked by the state functions, not only hidden in the interface ----------
const ALLOWED = {
  owner: ['docs.edit', 'docs.send', 'docs.issue', 'clients.edit', 'payments', 'reminders', 'export'],
  accountant: ['payments', 'reminders', 'export'],
} as const satisfies Record<StaffRole, readonly string[]>;
export type Permission = (typeof ALLOWED)['owner'][number];
export const can = (role: StaffRole | null | undefined, permission: Permission): boolean =>
  !!role && (ALLOWED[role] as readonly string[]).includes(permission);
