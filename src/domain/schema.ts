// The persisted state, described once with Zod: the types come from the schema and every load from
// localStorage (or message from another tab) is checked against it.
import * as z from 'zod/mini';
import { HISTORY_TYPES, INVOICE_STATUSES, PAY_METHODS, QUOTE_STATUSES, UNITS } from './catalog';

// The strict CSP forbids eval: Zod must not try its compiled fast path.
z.config({ jitless: true });

const text = (max: number) => z.string().check(z.maxLength(max));
const id = z.string().check(z.regex(/^[a-zA-Z0-9]{2,20}$/));
const day = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}$/));
const stamp = z.string().check(z.regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/));
const optionalDay = z.string().check(z.regex(/^(\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?$/));

export const lineSchema = z.object({
  label: z.string().check(z.minLength(1), z.maxLength(200)),
  qty: z.number().check(z.gte(0.01), z.lte(100_000), z.refine((q) => Math.abs(Math.round(q * 100) - q * 100) < 1e-6)),
  unit: z.enum(UNITS),
  price: z.int().check(z.gte(0), z.lte(1_000_000_000)),
  vat: z.literal([20, 10, 5.5]),
});

export const historySchema = z.object({
  at: stamp, type: z.enum(HISTORY_TYPES), by: text(80), ref: text(40), note: text(300),
});

const common = {
  id, client: id, date: day, subject: text(120), notes: text(600),
  lines: z.array(lineSchema).check(z.maxLength(60)),
  history: z.array(historySchema).check(z.maxLength(200)),
};

export const quoteSchema = z.object({
  ...common,
  kind: z.literal('quote'),
  number: z.string().check(z.regex(/^(D-\d{4}-\d{4})?$/)),
  status: z.enum(QUOTE_STATUSES),
  validUntil: day,
  signedBy: text(80),
  acceptedAt: optionalDay,
  fingerprint: z.string().check(z.regex(/^([0-9a-f]{64})?$/)),
  invoice: z.optional(id),
});

export const invoiceSchema = z.object({
  ...common,
  kind: z.literal('invoice'),
  number: z.string().check(z.regex(/^(F-\d{4}-\d{4})?$/)),
  status: z.enum(INVOICE_STATUSES),
  due: day,
  quote: z.optional(id),
  paidAt: optionalDay,
  payMethod: z.union([z.literal(''), z.enum(PAY_METHODS)]),
  reminders: z.int().check(z.gte(0), z.lte(99)),
});

export const clientSchema = z.object({
  id,
  token: z.string().check(z.regex(/^[A-HJ-NP-Z2-9]{16}$/)),
  type: z.enum(['pro', 'part']),
  name: z.string().check(z.minLength(2), z.maxLength(80)),
  contact: text(80), email: text(254), phone: text(20), address: text(120),
  zip: z.string().check(z.regex(/^\d{5}$/)), city: text(60),
  siret: z.string().check(z.regex(/^(\d{3} \d{3} \d{3} \d{5})?$/)),
  created: day,
});

export const stateSchema = z.object({
  v: z.literal(2),
  clients: z.array(clientSchema).check(z.maxLength(1000)),
  docs: z.array(z.discriminatedUnion('kind', [quoteSchema, invoiceSchema])).check(z.maxLength(5000)),
  seq: z.record(z.string().check(z.regex(/^[DF]\d{4}$/)), z.int().check(z.gte(0), z.lte(9999))),
});

export type Line = z.infer<typeof lineSchema>;
export type HistoryEntry = z.infer<typeof historySchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type Doc = Quote | Invoice;
export type Client = z.infer<typeof clientSchema>;
export type State = z.infer<typeof stateSchema>;
