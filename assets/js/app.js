import { $, $$, h, mount, demoBanner } from './core.js';
import { pageHead } from './state.js';
import { render as dashboard } from './dashboard.js';
import { renderList as docList, renderDoc } from './docs.js';
import { renderList as clientList, renderOne as clientOne } from './clients.js';
import { renderPicker as portalPicker, render as portal } from './portal.js';

demoBanner({ prefix: 'morel:' });

// ---------- Theme: auto (system) -> light -> dark ----------
const THEMES = [['auto', 'auto'], ['light', 'clair'], ['dark', 'sombre']];
const themeBtn = $('.theme-btn');
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  themeBtn.textContent = `Thème : ${THEMES.find(([id]) => id === t)[1]}`;
}
let theme = 'auto';
try { theme = ['light', 'dark'].includes(localStorage.getItem('morel:theme')) ? localStorage.getItem('morel:theme') : 'auto'; } catch { /* blocked */ }
applyTheme(theme);
themeBtn.addEventListener('click', () => {
  theme = THEMES[(THEMES.findIndex(([id]) => id === theme) + 1) % THEMES.length][0];
  try { if (theme === 'auto') localStorage.removeItem('morel:theme'); else localStorage.setItem('morel:theme', theme); } catch { /* blocked */ }
  applyTheme(theme);
});

function security(root) {
  const item = (title, text) => h('li', null, h('strong', null, title), ` ${text}`);
  mount(root,
    pageHead('Sécurité & confidentialité', 'Ce qui protège cette démo, et ce qu’on ajoute en production.'),
    h('div', { class: 'grid-2' },
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'Dans cette démo'),
        h('ul', { class: 'sec' },
          item('Politique de sécurité du contenu stricte.', 'Seuls les scripts de ce site s’exécutent ; aucun script, police ou image tiers, aucun cookie, aucun traceur.'),
          item('Trusted Types.', 'Le navigateur refuse toute insertion de HTML brut : chaque élément est créé par le code et le texte saisi est affiché comme du texte.'),
          item('PDF générés localement.', 'Devis et factures sont produits dans votre navigateur, sans envoyer le document à un service en ligne.'),
          item('Données vérifiées.', 'Au chargement, des données corrompues ou modifiées à la main sont rejetées plutôt que d’être affichées.'),
          item('Saisies nettoyées.', 'Caractères invisibles et inversions de sens d’écriture supprimés, longueurs limitées, formats contrôlés (e-mail, téléphone, SIRET).'),
          item('Exports CSV protégés.', 'Les cellules qui commencent par =, +, - ou @ sont neutralisées (injection de formules dans un tableur).'),
          item('Liens portail non devinables.', 'Chaque client a un jeton aléatoire de 16 caractères (environ 80 bits).'),
          item('Preuve d’acceptation.', 'Un devis signé en ligne reçoit une empreinte SHA-256 de son contenu, du signataire et de l’heure.'),
          item('Règles de facturation.', 'Numérotation chronologique sans trou, facture émise non modifiable ni supprimable.'))),
      h('section', { class: 'card' }, h('h2', { class: 'card-title' }, 'En production'),
        h('ul', { class: 'sec' },
          item('Authentification.', 'Mots de passe hachés (Argon2id), double authentification, sessions courtes.'),
          item('Contrôle d’accès côté serveur.', 'Chaque requête vérifie que le document appartient bien au client ou à l’utilisateur connecté.'),
          item('En-têtes HTTP.', 'HTTPS partout, HSTS, CSP et frame-ancestors envoyés par le serveur.'),
          item('Traçabilité et sauvegardes.', 'Journal des actions, sauvegardes chiffrées et testées.'),
          item('RGPD.', 'Registre des traitements, durées de conservation (pièces comptables : 10 ans), export et suppression des données client.'),
          item('Facturation électronique.', 'Compatibilité avec la réforme française (format Factur-X, plateforme agréée).')))),
    h('p', { class: 'muted small' }, 'Démo conçue par ', h('a', { href: 'https://barkatzineddine.github.io/#contact' }, 'Zineddine Barkat'), ', développeur web et sécurité. ',
      h('a', { href: 'https://github.com/Barkatzineddine/demo-facturation' }, 'Code source')));
}

// ---------- Router ----------
const view = $('#view');
let cleanup = null;
function route() {
  const [path] = (location.hash || '#/').slice(2).split('?');
  const [section = '', arg] = path.split('/');
  const table = {
    '': () => dashboard(view),
    devis: () => (arg ? renderDoc(view, { kind: 'devis', id: arg }) : docList(view, { kind: 'devis' })),
    factures: () => (arg ? renderDoc(view, { kind: 'facture', id: arg }) : docList(view, { kind: 'facture' })),
    clients: () => (arg ? clientOne(view, { id: arg }) : clientList(view)),
    portail: () => (arg ? portal(view, { token: arg }) : portalPicker(view)),
    securite: () => security(view),
  };
  cleanup?.();
  cleanup = (table[section] || table[''])() || null;
  $$('.nav a').forEach((a) => {
    if (a.dataset.route === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.body.classList.toggle('portal-mode', section === 'portail' && Boolean(arg));
  window.scrollTo(0, 0);
  view.querySelector('h1')?.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
route();
