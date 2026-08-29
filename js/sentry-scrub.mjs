// ⚠️ CE MODULE EST LA SOURCE TESTÉE. Le runtime réel est la copie inline
// dans index.html (bloc Sentry.init), qui ne peut pas importer de module
// ES avant le chargement du bundle. Une divergence rend les tests VERTS
// alors que la prod fuit.
// Toute modification doit être faite dans les DEUX fichiers.
//
// Pattern test-mirror identique à js/access.mjs, js/auth-error.mjs,
// js/subscription.mjs.
//
// ═══════════════════════════════════════════════════════════════════
// #47 — aucune donnée de santé ni donnée personnelle vers Sentry
// ═══════════════════════════════════════════════════════════════════
//
// Obligation du contrat HDS (matrice de responsabilités, point 4).
//
// Le dispositif précédent ne protégeait RIEN :
//   - `sendDefaultPii: false` était INERTE — la chaîne n'existe pas dans
//     le bundle @sentry/browser 8.55.0 embarqué (vérifié : 0 occurrence
//     dans assets/vendor/sentry/bundle.min.js). L'option était ignorée
//     en silence.
//   - le beforeSend ne lisait que les noms de fichiers de la pile pour
//     écarter les extensions de navigateur. Ni message, ni breadcrumbs,
//     ni URL n'étaient inspectés : un captureMessage passait entier.
//
// PRINCIPE DIRECTEUR — on masque, on ne supprime pas en silence.
// Un message tronqué sans marque est indistinguable d'un message qui ne
// contenait rien de sensible. Chaque valeur retirée laisse un marqueur
// lisible. Un rapport d'erreur inutilisable ne vaut pas mieux que pas de
// rapport : codes de statut, codes d'erreur PostgREST, noms de fonctions
// et piles d'appel sont conservés intacts.

// Marqueurs de masquage. Volontairement explicites et accentués : on doit
// les repérer d'un coup d'œil dans l'interface Sentry.
export const MASQUE_EMAIL = '<email-masqué>';
export const MASQUE_UUID = '<uuid-masqué>';
export const MASQUE_JETON = '<jeton-masqué>';
export const MASQUE_QUERY = '<query-masquée>';
export const MASQUE_FRAGMENT = '<fragment-masqué>';
export const MASQUE_TITRE = '<titre-masqué>';

// Adresse e-mail. Couvre l'e-mail praticien loggé par les console.* et
// celui de la query PostgREST ?email=eq.<email>.
const RE_EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

// UUID v4 — user_id, patient_id, bilan_id. Présents dans les chemins
// Storage ({user_id}/{patient_id}/{type}/{bilan_id}/) et dans les URL
// PostgREST. Seuls ou combinés ils ré-identifient un patient.
const RE_UUID = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g;

// JWT (en-tête base64url de '{"' → toujours 'eyJ'). Couvre le jeton de
// récupération #access_token=… : index.html charge Sentry AVANT que
// js/biomeca.js ne nettoie le fragment, donc une erreur survenue dans cet
// intervalle expédierait un jeton VALIDE. Le retrait du fragment d'URL le
// couvre déjà, ce motif est la ceinture en plus des bretelles — un jeton
// recopié dans un message d'erreur ne passerait pas par scrubUrl.
const RE_JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;

// Profondeur maximale d'exploration de event.extra et des données de
// breadcrumb. Au-delà, la valeur est laissée telle quelle : mieux vaut une
// borne franche qu'une récursion non maîtrisée sur une structure cyclique.
const PROFONDEUR_MAX = 4;

// Niveaux de breadcrumb console conservés.
//
// ⚠️ Sentry NORMALISE console.warn en 'warning', PAS 'warn'. Écrire 'warn'
// ici laisserait tomber tous les avertissements de synchronisation sans que
// rien ne le signale — d'où un cas de test dédié sur 'warning'.
//
// log/info/debug sont écartés : aucune valeur de diagnostic, surface
// d'exposition pure. C'est ce niveau-là qui transportait l'e-mail praticien.
export const NIVEAUX_CONSOLE_GARDES = ['error', 'warning'];

// Nettoie une chaîne : e-mails, UUID et JWT remplacés par leur marqueur.
// Toute autre valeur est renvoyée inchangée (y compris null/undefined) —
// le nettoyage ne doit jamais transformer un type.
export function scrubText(valeur) {
  if (typeof valeur !== 'string' || valeur === '') return valeur;
  return valeur
    .replace(RE_JWT, MASQUE_JETON)
    .replace(RE_EMAIL, MASQUE_EMAIL)
    .replace(RE_UUID, MASQUE_UUID);
}

// Nettoie une URL : ne conserve que le chemin, puis masque les UUID qu'il
// contient (chemins Storage). La chaîne de requête et le fragment sont
// retirés EN BLOC — ils portent ?email=eq.<email> et #access_token=… — mais
// remplacés par un marqueur : savoir qu'il Y AVAIT des paramètres est un
// renseignement de diagnostic, le contenu n'en est pas un.
export function scrubUrl(url) {
  if (typeof url !== 'string' || url === '') return url;

  let reste = url;
  let fragment = '';
  const posFragment = reste.indexOf('#');
  if (posFragment !== -1) {
    fragment = '#' + MASQUE_FRAGMENT;
    reste = reste.slice(0, posFragment);
  }

  let query = '';
  const posQuery = reste.indexOf('?');
  if (posQuery !== -1) {
    query = '?' + MASQUE_QUERY;
    reste = reste.slice(0, posQuery);
  }

  return scrubText(reste) + query + fragment;
}

// Nettoie récursivement une valeur quelconque (chaîne, tableau, objet
// simple). Les types non parcourus (nombre, booléen, null, fonction) sont
// renvoyés tels quels.
export function scrubValue(valeur, profondeur = 0) {
  if (profondeur > PROFONDEUR_MAX) return valeur;
  if (typeof valeur === 'string') return scrubText(valeur);
  if (Array.isArray(valeur)) return valeur.map((v) => scrubValue(v, profondeur + 1));
  if (valeur && typeof valeur === 'object') {
    const sortie = {};
    for (const cle of Object.keys(valeur)) {
      sortie[cle] = scrubValue(valeur[cle], profondeur + 1);
    }
    return sortie;
  }
  return valeur;
}

// Retire la valeur de l'attribut title d'un message de breadcrumb ui.click.
// Sentry sérialise la cible sous forme de sélecteur, par exemple :
//   div.pastille[title="Dupont Jean — 14h30"]
// L'intitulé de rendez-vous EST en pratique le nom du patient
// (js/biomeca.js pose e.summary dans title sur chaque pastille d'agenda).
//
// CHOIX : on masque le title, on ne jette PAS le breadcrumb. Savoir que
// l'utilisateur a cliqué une pastille d'agenda est souvent LE déclencheur
// de l'erreur ; jeter le breadcrumb perdrait ce fil. Le sélecteur, lui
// (balise, classe), n'est pas identifiant et reste diagnostiquement utile.
// Le nom du patient, lui, n'a aucune valeur de diagnostic.
export function scrubTitleAttr(message) {
  if (typeof message !== 'string' || message === '') return message;
  return message.replace(/\[title="[^"]*"\]/g, '[title="' + MASQUE_TITRE + '"]');
}

// Décide du sort d'un breadcrumb AVANT accumulation, donc avant même qu'il
// puisse partir avec un événement ultérieur.
// Retourne le breadcrumb nettoyé, ou null pour l'écarter.
export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || typeof breadcrumb !== 'object') return breadcrumb;

  const categorie = breadcrumb.category || '';

  // Breadcrumbs console : l'intégration capture chaque console.* AVEC ses
  // arguments objets. On ne garde que les niveaux qui portent un
  // diagnostic — le bruit (log/info/debug) n'en porte aucun et multiplie
  // la surface d'exposition : c'est lui qui transportait l'e-mail praticien.
  //
  // `warning` est CONSERVÉ à dessein : les avertissements de synchronisation
  // (#102 Phase 2a, js/biomeca.js ~957 et ~1190) sont des console.warn, et
  // ce sont précisément les traces qui servent au diagnostic. Ils ne
  // portent plus le corps PostgREST brut depuis #47, seulement statut et
  // SQLSTATE — les garder est donc sans risque.
  if (categorie === 'console' && !NIVEAUX_CONSOLE_GARDES.includes(breadcrumb.level)) {
    return null;
  }

  const sortie = Object.assign({}, breadcrumb);

  if (typeof sortie.message === 'string') {
    sortie.message =
      categorie === 'ui.click'
        ? scrubText(scrubTitleAttr(sortie.message))
        : scrubText(sortie.message);
  }

  if (sortie.data && typeof sortie.data === 'object') {
    const data = Object.assign({}, sortie.data);
    // Breadcrumbs fetch/xhr : l'URL est capturée telle quelle.
    if (typeof data.url === 'string') data.url = scrubUrl(data.url);
    // Breadcrumbs console : les arguments sérialisés (profondeur 3).
    if (data.arguments !== undefined) data.arguments = scrubValue(data.arguments);
    for (const cle of Object.keys(data)) {
      if (cle !== 'url' && cle !== 'arguments') data[cle] = scrubValue(data[cle]);
    }
    sortie.data = data;
  }

  return sortie;
}

// Extrait le SEUL champ non sensible d'un corps d'erreur PostgREST.
//
// PostgREST répond par exemple :
//   {"code":"23505","details":"Key (email)=(x@y.fr) already exists.",
//    "hint":null,"message":"duplicate key value violates unique constraint"}
// `details` et `message` peuvent porter la valeur rejetée — donc, sur les
// tables patients/bilans, du CONTENU CLINIQUE. `code` est un SQLSTATE :
// il identifie la panne sans rien révéler du contenu.
//
// Retourne toujours une chaîne courte et lisible, jamais le corps brut.
export function pgrestErrorCode(body) {
  if (typeof body !== 'string' || body === '') return '(corps absent)';
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed.code === 'string' && parsed.code !== '') return parsed.code;
    return '(code absent)';
  } catch (_e) {
    // Corps non-JSON (page d'erreur HTML d'un proxy, texte brut…). On ne
    // le journalise pas : on ne sait pas ce qu'il contient.
    return '(corps non-JSON)';
  }
}

// Filtre anti-extensions de navigateur — CONSERVÉ du beforeSend d'origine.
// Une erreur dont la pile ne cite que des fichiers d'extension ne vient pas
// de notre code et n'a rien à faire dans le rapport.
export function isExtensionEvent(event) {
  let pile = '';
  try {
    const frames =
      (event &&
        event.exception &&
        event.exception.values &&
        event.exception.values[0] &&
        event.exception.values[0].stacktrace &&
        event.exception.values[0].stacktrace.frames) ||
      [];
    pile = frames.map((f) => f.filename || '').join(' ');
  } catch (_e) {
    pile = '';
  }
  return (
    pile.indexOf('extension://') !== -1 ||
    pile.indexOf('chrome-extension://') !== -1 ||
    pile.indexOf('moz-extension://') !== -1
  );
}

// Nettoyage complet d'un événement, juste avant expédition.
// Retourne l'événement nettoyé, ou null s'il doit être écarté.
//
// Ce filtre de sortie est la protection qui couvre aussi le code qu'on
// écrira demain : même si un futur console.log réintroduit une adresse,
// elle sera masquée ici.
export function scrubEvent(event) {
  if (!event || typeof event !== 'object') return event;
  if (isExtensionEvent(event)) return null;

  const sortie = Object.assign({}, event);

  if (typeof sortie.message === 'string') sortie.message = scrubText(sortie.message);

  // event.exception.values[].value — le message porté par l'exception.
  // On ne touche NI au type, NI à la pile d'appel : ils font le diagnostic.
  if (sortie.exception && Array.isArray(sortie.exception.values)) {
    sortie.exception = Object.assign({}, sortie.exception, {
      values: sortie.exception.values.map((v) =>
        v && typeof v.value === 'string' ? Object.assign({}, v, { value: scrubText(v.value) }) : v
      ),
    });
  }

  if (sortie.extra !== undefined) sortie.extra = scrubValue(sortie.extra);

  // event.request.url — porte le fragment #access_token=…&type=recovery
  // quand l'erreur survient avant le nettoyage du fragment.
  if (sortie.request && typeof sortie.request === 'object') {
    const request = Object.assign({}, sortie.request);
    if (typeof request.url === 'string') request.url = scrubUrl(request.url);
    sortie.request = request;
  }

  // Les breadcrumbs déjà accumulés repassent au nettoyage : beforeBreadcrumb
  // s'applique à l'entrée, celui-ci rattrape ce qui aurait changé depuis.
  if (Array.isArray(sortie.breadcrumbs)) {
    sortie.breadcrumbs = sortie.breadcrumbs
      .map((b) => scrubBreadcrumb(b))
      .filter((b) => b !== null);
  }

  return sortie;
}
