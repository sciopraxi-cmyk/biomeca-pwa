import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraireBloc, RACINE } from './helpers/mirror-diff.mjs';
import { computeAccessLevel } from '../js/access.mjs';

// ═══════════════════════════════════════════════════════════════════
// #261 — recherche par user_id, et séparation des trois causes d'échec
// ═══════════════════════════════════════════════════════════════════
//
// INCIDENT, mesuré le 15/09/2026 dans l'onglet Réseau : un praticien dont la
// licence et la formule étaient actives se voyait refuser l'accès avec
// « Votre essai est terminé ».
//   user_data?email=eq.<adresse avec une majuscule>  -> 200, corps vide
//   user_data?select=*                                -> 200, la ligne existe
// PostgREST traite `eq` en égalité STRICTE, sensible à la casse ; Supabase
// Auth authentifie SANS en tenir compte. La RLS n'y était pour rien.
//
// Les blocs surveillés n'ont AUCUN miroir : les marqueurs servent uniquement
// à les rendre testables (convention #132, usage n°2).

const BLOC_LECTURE = extraireBloc('js/biomeca.js', '#261 LECTURE — DÉBUT', '#261 LECTURE — FIN');
const BLOC_FETCH = extraireBloc('js/biomeca.js', '#261 FETCH — DÉBUT', '#261 FETCH — FIN');
const SRC = readFileSync(join(RACINE, 'js/biomeca.js'), 'utf8');

// Reconstitue getUserRecord hors de son fichier. Le bloc extrait est une
// MÉTHODE d'objet, pas une déclaration : on le replace donc dans un littéral.
// authFetch est injecté, ce qui permet d'observer l'URL réellement construite
// sans aucun accès réseau.
function fabriquerLecture(authFetch) {
  // eslint-disable-next-line no-new-func -- code du dépôt, jamais d'entrée externe
  const f = new Function(
    'authFetch',
    'SUPA_URL',
    `const o = { ${BLOC_LECTURE} }; return o.getUserRecord;`
  );
  return f(authFetch, 'https://exemple.test');
}

// Reconstitue fetchUserDataAtLogin avec ses deux dépendances globales.
function fabriquerFetch(pwaUser, supa) {
  // eslint-disable-next-line no-new-func -- code du dépôt, jamais d'entrée externe
  const f = new Function(
    'pwaUser',
    'supa',
    'console',
    `${BLOC_FETCH}\nreturn fetchUserDataAtLogin;`
  );
  return f(pwaUser, supa, { error() {} });
}

const reponse = (ok, corps) => ({ ok, json: async () => corps });

// ═══════════════════════════════════════════════════════════════════
// 0. GARDES PREMIÈRES
// ═══════════════════════════════════════════════════════════════════

describe('#261 extraction', () => {
  it('0. Les deux blocs sortent de l’extraction et portent le bon code', () => {
    expect(BLOC_LECTURE).toContain('async getUserRecord(userId)');
    expect(BLOC_FETCH).toContain('async function fetchUserDataAtLogin');
    expect(typeof fabriquerLecture(async () => reponse(true, []))).toBe('function');
  });

  it('0b. L’extraction ÉCHOUE si un marqueur manque', () => {
    expect(() =>
      extraireBloc('js/biomeca.js', '#261 MARQUEUR-INEXISTANT', '#261 LECTURE — FIN')
    ).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 1. La clé de requête
// ═══════════════════════════════════════════════════════════════════

describe('#261 la requête est bâtie sur user_id', () => {
  it('1. L’URL porte user_id et JAMAIS email', async () => {
    let vue = null;
    const getUserRecord = fabriquerLecture(async (url) => {
      vue = url;
      return reponse(true, [{ licence_payee: true }]);
    });
    await getUserRecord('abc-123');
    expect(vue).toContain('user_id=eq.abc-123');
    expect(vue).not.toContain('email=');
  });

  it('1b. TÉMOIN — l’observation de l’URL fonctionne', async () => {
    // Sans ce témoin, `vue` pourrait rester null et les deux assertions
    // ci-dessus échoueraient bruyamment plutôt que de passer à tort — mais on
    // vérifie quand même que le substitut d'authFetch est bien appelé.
    let appels = 0;
    const getUserRecord = fabriquerLecture(async () => {
      appels++;
      return reponse(true, []);
    });
    await getUserRecord('abc-123');
    expect(appels).toBe(1);
  });

  it('2. Sans identifiant, la requête part SANS FILTRE et n’est pas abandonnée', async () => {
    // Le cas existe par construction : pwaLogin pose `email` depuis le
    // formulaire (toujours présent) mais `id` depuis body.user?.id, en
    // chaînage optionnel. Abandonner bloquerait un praticien qui fonctionnait
    // la veille. Sans filtre est sûr : la RLS ne rend que sa ligne.
    let vue = null;
    let appels = 0;
    const getUserRecord = fabriquerLecture(async (url) => {
      vue = url;
      appels++;
      return reponse(true, [{ licence_payee: true }]);
    });
    const r = await getUserRecord(undefined);
    expect(appels, 'la requête doit PARTIR').toBe(1);
    expect(vue).not.toContain('user_id=eq.undefined');
    expect(vue).not.toContain('email=');
    expect(vue).toContain('select=*');
    expect(r).toEqual({ ok: true, row: { licence_payee: true } });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2bis. LE CONTRAT — rien ne change pour un compte dont la casse concorde
// ═══════════════════════════════════════════════════════════════════

describe('#261 contrat : aucun changement quand la casse concordait déjà', () => {
  // Simulation du serveur. La RLS user_data (select_own : auth.uid() =
  // user_id) restreint DÉJÀ l'ensemble visible aux lignes du porteur du jeton :
  // la table vue par le client est donc au plus un singleton. On la modélise
  // ainsi, puis on applique les deux filtres — l'ancien et le nouveau.
  const UID = 'uid-abc-123';
  const visibleParRLS = [{ user_id: UID, email: 'praticien@exemple.fr', licence_payee: true }];
  const filtreAncien = (adresse) => visibleParRLS.filter((r) => r.email === adresse);
  const filtreNouveau = (id) => visibleParRLS.filter((r) => r.user_id === id);

  // authFetch qui SIMULE LE SERVEUR : la RLS ne rend que le singleton du
  // porteur du jeton, quelle que soit l'URL demandée — c'est exactement son
  // comportement. Les tests ci-dessous font tourner le VRAI getUserRecord
  // contre lui.
  const serveurRLS = (journal) => async (url) => {
    journal.push(url);
    return { ok: true, json: async () => visibleParRLS };
  };

  it('2c. CODE RÉEL, avec identifiant : la ligne est rendue, l’URL porte user_id', async () => {
    const urls = [];
    const getUserRecord = fabriquerLecture(serveurRLS(urls));
    const r = await getUserRecord(UID);
    expect(r.ok).toBe(true);
    expect(r.row).toEqual(visibleParRLS[0]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('user_id=eq.' + UID);
  });

  it('2d. CODE RÉEL, sans identifiant : la ligne est rendue AUSSI, sans filtre', async () => {
    // Un praticien dont l'identifiant manque — cas possible par construction —
    // ne doit pas être bloqué. La RLS fait déjà le tri.
    const urls = [];
    const getUserRecord = fabriquerLecture(serveurRLS(urls));
    const r = await getUserRecord(undefined);
    expect(r.ok).toBe(true);
    expect(r.row).toEqual(visibleParRLS[0]);
    expect(urls[0]).not.toContain('user_id=eq.');
    expect(urls[0]).not.toContain('email=');
  });

  it('2e. MODÈLE — ce que faisait PostgREST, pour mémoire', () => {
    // Ce test ne porte PAS sur le dépôt : il modélise l'égalité stricte de
    // PostgREST pour consigner le mécanisme de l'incident. La vérification du
    // code réel est au-dessus, tests 2c et 2d.
    expect(filtreAncien('praticien@exemple.fr')).toHaveLength(1);
    expect(filtreAncien('Praticien@exemple.fr')).toHaveLength(0);
    expect(filtreNouveau(UID)).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Les trois états
// ═══════════════════════════════════════════════════════════════════

describe('#261 trois causes, trois états distincts', () => {
  const CAS = [
    ['requête en échec (HTTP)', () => reponse(false, null), { ok: false, row: null }],
    ['requête OK, aucune ligne', () => reponse(true, []), { ok: true, row: null }],
    [
      'requête OK, ligne trouvée',
      () => reponse(true, [{ formule: 'formule_5' }]),
      { ok: true, row: { formule: 'formule_5' } },
    ],
  ];

  it('3. getUserRecord distingue les trois', async () => {
    let executes = 0;
    for (const [nom, rep, attendu] of CAS) {
      const getUserRecord = fabriquerLecture(async () => rep());
      expect(await getUserRecord('abc'), nom).toEqual(attendu);
      executes++;
    }
    expect(executes).toBe(CAS.length);
  });

  it('3b. Une exception réseau rend le même état qu’un échec HTTP', async () => {
    const getUserRecord = fabriquerLecture(async () => {
      throw new Error('réseau');
    });
    expect(await getUserRecord('abc')).toEqual({ ok: false, row: null });
  });

  it('4. fetchUserDataAtLogin produit trois valeurs DISTINCTES de user_data', async () => {
    const attendus = [
      ['échec', { ok: false, row: null }, null],
      ['aucune ligne', { ok: true, row: null }, {}],
      ['ligne', { ok: true, row: { licence_payee: true } }, { licence_payee: true }],
    ];
    let executes = 0;
    const obtenus = [];
    for (const [nom, retour, attendu] of attendus) {
      const pwaUser = { id: 'abc', email: 'x' };
      const fn = fabriquerFetch(pwaUser, { getUserRecord: async () => retour });
      await fn();
      expect(pwaUser.user_data, nom).toEqual(attendu);
      obtenus.push(pwaUser.user_data);
      executes++;
    }
    expect(executes).toBe(3);
    // Les trois valeurs OBSERVÉES doivent être distinctes deux à deux : c'est
    // le défaut d'origine — `row || {}` confondait l'échec et l'absence de
    // ligne. On compare ce que le code a produit, pas des littéraux.
    const distinctes = new Set(obtenus.map((v) => JSON.stringify(v)));
    expect(distinctes.size).toBe(obtenus.length);
  });

  it('4b. TÉMOIN — le test 4 rougirait si l’échec redevenait {}', async () => {
    // On rejoue le cas « échec » avec l'ANCIEN comportement, reproduit ici,
    // et on vérifie qu'il ne satisfait pas l'attendu. Sans cela, le test 4
    // serait vert sur une implémentation qui n'a pas changé.
    const ancien = (retour) => retour.row || {};
    expect(ancien({ ok: false, row: null })).toEqual({});
    expect(ancien({ ok: false, row: null })).not.toEqual(null);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. computeAccessLevel sur les trois états
// ═══════════════════════════════════════════════════════════════════

describe('#261 computeAccessLevel face aux trois états', () => {
  const MAINTENANT = Date.parse('2026-09-15T12:00:00Z');
  it('5. null -> blocked, {} -> blocked, licence+formule -> full', () => {
    const cas = [
      ['lecture en échec', null, 'blocked'],
      ['aucune entrée payante', {}, 'blocked'],
      ['licence + formule', { licence_payee: true, formule: 'formule_5' }, 'full'],
    ];
    let executes = 0;
    for (const [nom, userData, attendu] of cas) {
      expect(computeAccessLevel({ isAdmin: false, meta: {}, userData }, MAINTENANT), nom).toBe(
        attendu
      );
      executes++;
    }
    expect(executes).toBe(3);
  });

  it('5b. Une licence CORROMPUE ne vaut pas une licence', () => {
    // C'est la raison d'être de l'égalité stricte : ces valeurs s'affichaient
    // « ✅ Licence » dans le panneau admin tout en valant false pour l'accès.
    let executes = 0;
    for (const corrompu of ['true', 1, 't', 'TRUE', {}]) {
      expect(
        computeAccessLevel(
          { isAdmin: false, meta: {}, userData: { licence_payee: corrompu, formule: 'formule_5' } },
          MAINTENANT
        ),
        `licence_payee = ${JSON.stringify(corrompu)}`
      ).toBe('blocked');
      executes++;
    }
    expect(executes).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. Les prédicats licence_payee
// ═══════════════════════════════════════════════════════════════════

// Classificateur UNIQUE, appelé par le test et par son témoin. L'écrire deux
// fois ferait du témoin la validation d'une copie — un miroir manuel, soit
// précisément ce que la convention #132 cherche à éliminer.
function estConforme(ligne) {
  const nu = ligne.trim();
  if (nu.startsWith('//')) return true; // commentaire
  if (ligne.includes('licence_payee ===')) return true; // strict, conforme
  if (ligne.includes('licence_payee:')) return true; // écriture d'objet, pas une lecture
  return false;
}

describe('#261 les lecteurs de licence_payee sont alignés', () => {
  it('6. Toute lecture de licence_payee est stricte, sauf l’exception documentée', () => {
    // Balayage du fichier plutôt qu'une liste écrite à la main : un septième
    // lecteur ajouté demain serait attrapé.
    const suspectes = [];
    SRC.split('\n').forEach((l, i) => {
      if (!l.includes('licence_payee')) return;
      if (estConforme(l)) return;
      suspectes.push({ ligne: i + 1, texte: l.trim() });
    });
    // L'UNIQUE exception : la garde de l'auto-essai, qui protège une ÉCRITURE.
    // Aligner ce prédicat ferait partir un essai gratuit sur un enregistrement
    // porteur d'une licence malformée.
    expect(suspectes).toHaveLength(1);
    expect(suspectes[0].texte).toContain('!userData.licence_payee');
  });

  it('6b. TÉMOIN — le MÊME classificateur repère une lecture non stricte', () => {
    // Appelle estConforme, pas une copie : si le classificateur évolue, ce
    // témoin suit, et le test 6 ne peut pas devenir aveugle sans que ce test
    // le voie.
    for (const l of ['if (u.licence_payee) {', 'const x = !!u.licence_payee;']) {
      expect(estConforme(l), l).toBe(false);
    }
    // Contre-épreuve : une lecture stricte, une écriture d'objet et un
    // commentaire ne sont PAS signalés — sinon le test 6 échouerait à tort et
    // on serait tenté de l'assouplir.
    for (const l of [
      '  const a = u.licence_payee === true;',
      '  // licence_payee commenté',
      '  const update = { licence_payee: true };',
    ]) {
      expect(estConforme(l), l).toBe(true);
    }
  });

  it('6c. Pourquoi la forme stricte s’impose — documenté, pas supposé', () => {
    // Ce test ne vérifie pas le dépôt : les tests 6 et 5b s'en chargent, sur le
    // code réel. Il CONSIGNE le fait qui a motivé l'alignement — sur quelles
    // valeurs les deux familles divergeaient. Sur true et false elles
    // s'accordaient déjà ; ce sont les valeurs corrompues qui les séparaient.
    const acces = (v) => v === true; // computeAccessLevel
    const ancien = (v) => !!v; // les quatre lecteurs, avant #261
    const VALEURS = [true, false, null, undefined, 'true', 'false', 1, 0, 't', 'f', ''];
    const divergentes = VALEURS.filter((v) => ancien(v) !== acces(v));
    expect(divergentes).toEqual(['true', 'false', 1, 't', 'f']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 7. Les causes d'overlay
// ═══════════════════════════════════════════════════════════════════

describe('#261 toute cause émise est une cause traitée', () => {
  // Comparaison d'ENSEMBLES, pas de liste écrite à la main : c'est elle qui
  // attrapera le prochain ajout de cause sans libellé.
  // Deux formes d'émission, toutes deux ancrées sur un motif PRÉCIS :
  //   _showAccessOverlay({ cause: 'x' })  — littéral passé directement
  //   const cause = … 'a' … 'b' …         — la déclaration, et elle seule
  // Un motif plus lâche (`cause\s*=`) attraperait n'importe quelle affectation
  // dont le nom contient « cause » et peuplerait l'ensemble de fantômes.
  const emises = new Set();
  for (const m of SRC.matchAll(/_showAccessOverlay\(\{\s*cause:\s*'([a-z_]+)'/g)) emises.add(m[1]);
  for (const m of SRC.matchAll(/\bconst cause\s*=([\s\S]*?);/g)) {
    for (const s of m[1].matchAll(/'([a-z_]+)'/g)) emises.add(s[1]);
  }
  const traitees = new Set([...SRC.matchAll(/cause === '([a-z_]+)'/g)].map((m) => m[1]));
  const lisible = (s) => [...s].sort().join(', ') || '(vide)';

  it('7. L’ensemble des causes émises est inclus dans celui des causes traitées', () => {
    expect(emises.size, 'aucune cause émise détectée — mesure non concluante').toBeGreaterThan(0);
    expect(traitees.size, 'aucune cause traitée détectée').toBeGreaterThan(0);
    const orphelines = [...emises].filter((c) => !traitees.has(c));
    expect(orphelines, `émises = {${lisible(emises)}} | traitées = {${lisible(traitees)}}`).toEqual(
      []
    );
  });

  it('7d. La mesure a capté les causes ATTENDUES, et rien d’autre', () => {
    // Sans ce contrôle, une regex trop large pourrait faire coïncider les deux
    // ensembles par accident, ou faire échouer le test 7 pour une raison
    // fausse. On vérifie que l'extraction a vu exactement ce qu'on connaît.
    expect([...emises].sort(), `émises = {${lisible(emises)}}`).toEqual([
      'donnees_indisponibles',
      'never_paid',
      'trial_expired',
    ]);
  });

  it('7b. La cause donnees_indisponibles est bien émise ET traitée', () => {
    expect(emises.has('donnees_indisponibles')).toBe(true);
    expect(traitees.has('donnees_indisponibles')).toBe(true);
  });

  it('7c. Une cause inconnue tombe dans un repli qui journalise', () => {
    // Sans ce repli, les deux éléments du DOM garderaient le texte de
    // l'affichage précédent : le praticien lirait un message sans rapport,
    // et rien ne le signalerait.
    const i = SRC.indexOf('function _showAccessOverlay');
    expect(i).toBeGreaterThan(-1);
    const bloc = SRC.slice(i, SRC.indexOf('\n}', i));
    expect(bloc).toContain('} else {');
    expect(bloc).toContain('cause inattendue');
  });
});
