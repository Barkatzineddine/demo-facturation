import { useState, type FormEvent } from 'react';
import { DEMO_LOGINS } from '../domain/catalog';
import { useFormat } from '../format';
import { attemptLogin } from '../state/session';
import { Link, usePage } from '../shared/router';
import { Field } from '../shared/ui/Field';

export default function Login() {
  const { t } = useFormat();
  usePage(t('title.login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const outcome = await attemptLogin(email, password);
    setBusy(false);
    if (!outcome.ok) setError(outcome.reason === 'locked' ? t('login.locked', { n: outcome.seconds }) : t('login.invalid'));
  };
  return (
    <div className="login-page">
      <div className="login-brand">
        <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor" /><path d="M8 23V9l8 7 8-7v14" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" /></svg>
        <span><strong>Morel Agencement</strong><span className="muted small">{t('brand.sub')}</span></span>
      </div>
      <h1 tabIndex={-1}>{t('login.title')}</h1>
      <p className="muted">{t('login.lead')}</p>
      <form className="card form" noValidate onSubmit={(e) => void submit(e)}>
        <Field label={t('field.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('login.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{t('login.submit')}</button>
      </form>
      <section className="card demo-logins">
        <h2 className="card-title">{t('login.demo')}</h2>
        <ul>
          {DEMO_LOGINS.map((d) => (
            <li key={d.email}>
              <div><strong>{t(`role.${d.role}`)}</strong> · {t(`role.${d.role}.note`)}<br /><code>{d.email}</code> / <code>{d.password}</code></div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEmail(d.email); setPassword(d.password); setError(null); }}>{t('login.use')}</button>
            </li>
          ))}
        </ul>
        <p className="muted small">{t('login.note')}</p>
      </section>
      <p className="muted small">{t('login.portalNote')} <Link to="/securite">{t('nav.security')}</Link></p>
    </div>
  );
}
