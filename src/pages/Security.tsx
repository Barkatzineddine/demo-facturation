import { useFormat } from '../format';
import type { Key } from '../i18n';
import { usePage } from '../shared/router';
import { PageHead } from '../ui/common';

const DEMO = ['csp', 'tt', 'pdf', 'roles', 'data', 'input', 'csv', 'token', 'proof', 'rules', 'login'] as const;
const PROD = ['auth', 'access', 'headers', 'logs', 'gdpr', 'einvoice'] as const;

export default function Security() {
  const { t } = useFormat();
  usePage(t('title.security'));
  return (
    <>
      <PageHead title={t('nav.security')} sub={t('sec.lead')} />
      <div className="grid-2">
        <section className="card"><h2 className="card-title">{t('sec.demo')}</h2>
          <ul className="sec">{DEMO.map((k) => <li key={k}><strong>{t(`sec.${k}.t` as Key)}</strong> {t(`sec.${k}.d` as Key)}</li>)}</ul></section>
        <section className="card"><h2 className="card-title">{t('sec.prod')}</h2>
          <ul className="sec">{PROD.map((k) => <li key={k}><strong>{t(`sec.${k}.t` as Key)}</strong> {t(`sec.${k}.d` as Key)}</li>)}</ul></section>
      </div>
      <p className="muted small">{t('sec.byPre')} <a href="https://barkatzineddine.github.io/#contact">Zineddine Barkat</a>{t('sec.byPost')} <a href="https://github.com/Barkatzineddine/demo-facturation">{t('sec.code')}</a></p>
    </>
  );
}
