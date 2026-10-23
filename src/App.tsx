import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { can, type StaffAccount } from './domain/catalog';
import { totals } from './domain/rules';
import { useFormat } from './format';
import { app, sealSeed, useBooks } from './state/app';
import { setStaff, useStaff } from './state/session';
import { Link, match, navigate, useLocation, useScrollOnNavigate } from './shared/router';
import { onInstallPrompt } from './shared/sw';
import { CommandPalette, type Command } from './shared/ui/CommandPalette';
import { FeedbackProvider, useFeedback } from './shared/ui/Feedback';
import { docPath } from './ui/common';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const DocList = lazy(() => import('./pages/DocList'));
const DocPage = lazy(() => import('./pages/DocPage'));
const ClientList = lazy(() => import('./pages/Clients').then((m) => ({ default: m.ClientList })));
const ClientPage = lazy(() => import('./pages/Clients').then((m) => ({ default: m.ClientPage })));
const Portal = lazy(() => import('./pages/Portal').then((m) => ({ default: m.Portal })));
const PortalPicker = lazy(() => import('./pages/Portal').then((m) => ({ default: m.PortalPicker })));
const Security = lazy(() => import('./pages/Security'));
const Login = lazy(() => import('./pages/Login'));

export function App() {
  const { t } = useFormat();
  return (
    <FeedbackProvider closeLabel={t('common.close')}>
      <Shell />
    </FeedbackProvider>
  );
}

function Shell() {
  const location = useLocation();
  useScrollOnNavigate(location);
  const staff = useStaff((s) => s.staff);
  const { path } = location;
  const portal = match('/portail/:token', path);
  const fallback = <div className="route-loading" aria-hidden="true" />;

  // the client portal is public (the private link is the credential); everything else needs a staff session
  if (portal?.token) {
    return (
      <div className="portal-mode">
        <DemoBar />
        <main id="contenu" tabIndex={-1} className="portal-main"><Suspense fallback={fallback}><Portal token={portal.token} /></Suspense></main>
        <LiveNotifications staff={null} />
      </div>
    );
  }
  if (!staff) {
    return (
      <>
        <DemoBar />
        <main id="contenu" tabIndex={-1} className="login-main"><Suspense fallback={fallback}>{path === '/securite' ? <div className="wrap-narrow"><Security /></div> : <Login />}</Suspense></main>
      </>
    );
  }
  return (
    <div className="layout">
      <SkipLink />
      <DemoBar />
      <Sidebar staff={staff} />
      <main id="contenu" tabIndex={-1} className="view">
        <Suspense fallback={fallback}><Routes staff={staff} /></Suspense>
      </main>
      <LiveNotifications staff={staff} />
    </div>
  );
}

function Routes({ staff }: { staff: StaffAccount }) {
  const { path } = useLocation();
  const quote = match('/devis/:id', path);
  const invoice = match('/factures/:id', path);
  const client = match('/clients/:id', path);
  if (quote?.id) return <DocPage key={quote.id} kind="quote" id={quote.id} staff={staff} />;
  if (invoice?.id) return <DocPage key={invoice.id} kind="invoice" id={invoice.id} staff={staff} />;
  if (client?.id) return <ClientPage key={client.id} id={client.id} staff={staff} />;
  if (path === '/devis') return <DocList key="q" kind="quote" staff={staff} />;
  if (path === '/factures') return <DocList key="i" kind="invoice" staff={staff} />;
  if (path === '/clients') return <ClientList staff={staff} />;
  if (path === '/portail') return <PortalPicker />;
  if (path === '/securite') return <Security />;
  return <Dashboard staff={staff} />;
}

function SkipLink() {
  const { t } = useFormat();
  return <a className="skip" href="#contenu">{t('nav.skip')}</a>;
}

type Theme = 'auto' | 'light' | 'dark';
function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try { const v = localStorage.getItem('morel:theme'); return v === 'light' || v === 'dark' ? v : 'auto'; } catch { return 'auto'; }
  });
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try { if (theme === 'auto') localStorage.removeItem('morel:theme'); else localStorage.setItem('morel:theme', theme); } catch { /* storage blocked */ }
  }, [theme]);
  const order: Theme[] = ['auto', 'light', 'dark'];
  return [theme, () => setTheme(order[(order.indexOf(theme) + 1) % order.length] ?? 'auto')];
}

function DemoBar() {
  const { t, lang, setLang } = useFormat();
  const { confirm, toast } = useFeedback();
  const [theme, nextTheme] = useTheme();
  // offered in a toast: a button appearing in the bar would push the page down (layout shift)
  useEffect(() => onInstallPrompt((show) => { if (show) toast(t('demo.installable'), 'info', { label: t('demo.install'), run: () => void show() }); }), [t, toast]);
  const reset = async () => {
    if (!(await confirm({ title: t('demo.resetTitle'), body: t('demo.resetBody'), ok: t('demo.reset'), cancel: t('common.cancel'), danger: true }))) return;
    try {
      Object.keys(localStorage).filter((k) => (k.startsWith('morel:') && k !== 'morel:lang' && k !== 'morel:theme') || k.startsWith('antispam:')).forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
    } catch { /* storage blocked */ }
    app.reset();
    await sealSeed();
    window.location.hash = '';
    window.location.reload();
  };
  return (
    <div className="demo-bar">
      <p><strong>{t('demo.label')}</strong> · {t('demo.text')} <a href="https://barkatzineddine.github.io/#contact">{t('demo.cta')}</a></p>
      <div className="demo-actions">
        <button type="button" className="demo-btn" onClick={nextTheme}>{t('theme.label', { theme: t(`theme.${theme}`) })}</button>
        <button type="button" className="demo-btn" title={t('lang.label')} lang={lang === 'fr' ? 'en' : 'fr'} onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>{t('lang.switch')}</button>
        <button type="button" className="demo-btn" onClick={() => void reset()}>{t('demo.reset')}</button>
      </div>
    </div>
  );
}

function Sidebar({ staff }: { staff: StaffAccount }) {
  const { t, money, docName } = useFormat();
  const { path } = useLocation();
  const docs = useBooks((s) => s.docs);
  const clients = useBooks((s) => s.clients);
  const section = path.split('/')[1] ?? '';
  const nav: [string, string, string][] = [['', '/', t('nav.dashboard')], ['devis', '/devis', t('nav.quotes')], ['factures', '/factures', t('nav.invoices')], ['clients', '/clients', t('nav.clients')], ['portail', '/portail', t('nav.portal')], ['securite', '/securite', t('nav.security')]];
  const icons: Record<string, string> = { '': '◧', devis: '✎', factures: '€', clients: '◉', portail: '⇄', securite: '⛨' };
  const commands = useMemo<Command[]>(() => {
    const name = (id: string) => clients.find((c) => c.id === id)?.name ?? '';
    return [
      ...(can(staff.role, 'docs.edit') ? [{ id: 'new-q', group: t('palette.actions'), label: t('docs.newQuote'), run: () => navigate('/devis/nouveau') }] : []),
      ...nav.map(([id, to, label]) => ({ id: `nav-${id}`, group: t('palette.go'), label, run: () => navigate(to) })),
      ...docs.slice(-400).reverse().map((d) => ({ id: d.id, group: t(d.kind === 'quote' ? 'nav.quotes' : 'nav.invoices'), label: `${docName(d)} · ${name(d.client)}`, hint: `${d.subject} · ${money(totals(d.lines).ttc)}`, run: () => navigate(docPath(d)) })),
      ...clients.map((c) => ({ id: c.id, group: t('nav.clients'), label: c.name, hint: `${c.contact} · ${c.city}`, run: () => navigate(`/clients/${c.id}`) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, clients, staff.role, t, money, docName]);
  return (
    <aside className="sidebar">
      <Link to="/" className="brand">
        <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M8 23V9l8 7 8-7v14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
        <span><strong>Morel Agencement</strong><span className="muted small">{t('brand.sub')}</span></span>
      </Link>
      <CommandPalette commands={commands} labels={{ title: t('palette.title'), placeholder: t('palette.placeholder'), empty: t('palette.empty'), open: t('palette.open') }} />
      <nav className="nav" aria-label={t('nav.label')}>
        {nav.map(([id, to, label]) => (
          <Link key={id} to={to} aria-current={section === id ? 'page' : undefined}><span className="nav-ic" aria-hidden="true">{icons[id]}</span><span className="nav-label">{label}</span></Link>
        ))}
      </nav>
      <div className="side-foot">
        <p className="small"><strong>{staff.name}</strong><br /><span className="muted">{t(`role.${staff.role}`)}</span></p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStaff(null)}>{t('login.logout')}</button>
      </div>
    </aside>
  );
}

/** Messages from other tabs (BroadcastChannel): the office sees clients sign, refuse, read and pay live. */
function LiveNotifications({ staff }: { staff: StaffAccount | null }) {
  const { t, docName } = useFormat();
  const { toast } = useFeedback();
  useEffect(() => app.onRemoteEvent((event) => {
    if (!staff) return;
    const d = typeof event.id === 'string' ? app.get().docs.find((x) => x.id === event.id) : undefined;
    if (!d) return;
    const client = app.get().clients.find((c) => c.id === d.client)?.name ?? '';
    const see = { label: t('live.see'), run: () => navigate(docPath(d)) };
    if (event.type === 'quote.accepted') toast(t('live.accepted', { client, doc: docName(d) }), 'info', see);
    if (event.type === 'quote.refused') toast(t('live.refused', { client, doc: docName(d) }), 'info', see);
    if (event.type === 'quote.viewed') toast(t('live.viewed', { client, doc: docName(d) }), 'info', see);
    if (event.type === 'invoice.paid') toast(t('live.paid', { client, doc: docName(d) }), 'info', see);
  }), [staff, t, toast, docName]);
  return null;
}
