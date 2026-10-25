// Questionnaire patient (lot c, étape 1) : modèle des questions, nettoyage des réponses, accord avec la liste blanche SQL.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  erreursReponses,
  messageErreurQuestionnaire,
  modeleDe,
  nettoyerReponses,
  phraseQuestionnaire,
  questionsDe,
  questionVisible,
  valeursDepart,
} from '../patient/questionnaire-modele.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const sql = lire('supabase/migrations/portail-questionnaire-a2-validation.sql');

function tableauSql(nom) {
  const m = sql.match(new RegExp(nom + ' text\\[\\] := ARRAY\\[([^\\]]*)\\]'));
  expect(m, nom).not.toBeNull();
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

describe('modèle du questionnaire', () => {
  it('deux modèles, des questions et des clés uniques par modèle', () => {
    for (const t of ['adulte', 'enfant']) {
      const cles = questionsDe(t).map((x) => x.cle);
      expect(cles.length).toBeGreaterThan(10);
      expect(new Set(cles).size).toBe(cles.length);
    }
    expect(modeleDe('adulte')).not.toBeNull();
    expect(modeleDe('inconnu')).toBeNull();
    expect(questionsDe('inconnu')).toEqual([]);
  });

  it('adulte : 20 questions de la liste validée (sans les sous-questions « précisez »)', () => {
    const q = questionsDe('adulte');
    for (const cle of [
      'motif',
      'premiere_fois',
      'douleur',
      'douleur_zones',
      'douleur_quand',
      'eva',
      'chg_blessure',
      'chg_operation',
      'chg_maladie_types',
      'chg_examens',
      'chg_traitements_txt',
      'allergies_txt',
      'atcd_familiaux_txt',
      'poids',
      'taille',
      'metier_txt',
      'position',
      'chaussures',
      'appareillage',
      'sport_pratique',
      'sport_txt',
      'sport_freq_txt',
      'sport_duree_txt',
      'sport_niveau',
      'sport_objectif_txt',
      'sport_chaussures_txt',
      'notes_txt',
    ]) {
      expect(
        q.some((x) => x.cle === cle),
        cle
      ).toBe(true);
    }
  });

  it('chaque clé du modèle est acceptée par la liste blanche SQL pour son type, et rien d’autre', () => {
    const commun = new Set([
      ...tableauSql('c_txt'),
      ...tableauSql('c_on'),
      ...tableauSql('c_arr'),
      'eva',
      'poids',
      'taille',
    ]);
    const adulte = new Set([
      ...commun,
      ...tableauSql('a_txt'),
      'sport_pratique',
      'position',
      'sport_niveau',
    ]);
    const enfant = new Set([
      ...commun,
      ...tableauSql('e_txt'),
      'premature',
      'age_marche_mois',
      'terme_sa',
    ]);
    const sur = { adulte, enfant };
    // Seule exception documentée : la liste SQL commune accepte chg_maladie_types, que le questionnaire enfant n'utilise pas (texte libre à la place).
    const inutilises = { adulte: new Set(), enfant: new Set(['chg_maladie_types']) };
    for (const t of ['adulte', 'enfant']) {
      const cles = new Set(questionsDe(t).map((x) => x.cle));
      for (const c of cles) expect(sur[t].has(c), `${t} : ${c} absent de la liste SQL`).toBe(true);
      for (const c of sur[t])
        expect(cles.has(c) || inutilises[t].has(c), `${t} : ${c} (SQL) absent du modèle`).toBe(
          true
        );
    }
  });

  it('options : valeurs en minuscules sans espace (motif accepté par le contrôle SQL)', () => {
    for (const t of ['adulte', 'enfant']) {
      for (const qu of questionsDe(t)) {
        if (qu.type !== 'multi') continue;
        for (const o of qu.options) expect(o.v).toMatch(/^[a-z_]{1,40}$/);
        expect(qu.options.length).toBeLessThanOrEqual(12);
      }
    }
  });

  it('les questions conditionnelles dépendent d’une question qui existe avant elles', () => {
    for (const t of ['adulte', 'enfant']) {
      const q = questionsDe(t);
      q.forEach((qu, i) => {
        if (!qu.si) return;
        const j = q.findIndex((x) => x.cle === qu.si.cle);
        expect(j, `${t} : ${qu.cle}`).toBeGreaterThan(-1);
        expect(j, `${t} : ${qu.cle}`).toBeLessThan(i);
      });
    }
  });
});

describe('visibilité et nettoyage', () => {
  const adulte = (cle) => questionsDe('adulte').find((x) => x.cle === cle);

  it('questionVisible : égal, contient, rempli', () => {
    expect(questionVisible(adulte('douleur_zones'), {})).toBe(false);
    expect(questionVisible(adulte('douleur_zones'), { douleur: 'non' })).toBe(false);
    expect(questionVisible(adulte('douleur_zones'), { douleur: 'oui' })).toBe(true);
    expect(questionVisible(adulte('motif_autre_txt'), { motif: ['suivi'] })).toBe(false);
    expect(questionVisible(adulte('motif_autre_txt'), { motif: ['suivi', 'autre'] })).toBe(true);
    expect(questionVisible(adulte('chg_maladie_txt'), { chg_maladie_types: [] })).toBe(false);
    expect(questionVisible(adulte('chg_maladie_txt'), { chg_maladie_types: ['nerfs'] })).toBe(true);
    expect(questionVisible(adulte('motif'), {})).toBe(true);
  });

  it('nettoyerReponses : retire le vide, le masqué, l’inconnu et borne les nombres', () => {
    const r = nettoyerReponses('adulte', {
      motif: ['douleur', 'pirate'],
      douleur: 'non',
      douleur_zones: ['talon'], // masquée : douleur = non
      eva: 7, // masquée aussi
      chg_blessure: 'oui',
      chg_blessure_txt: '  Entorse D  ',
      chg_operation_txt: 'x', // masquée : chg_operation absent
      poids: '74,5',
      taille: '999', // hors limites
      notes_txt: '   ',
      position: 'couché', // hors liste
      cle_inconnue: 'x',
    });
    expect(r).toEqual({
      motif: ['douleur'],
      douleur: 'non',
      chg_blessure: 'oui',
      chg_blessure_txt: 'Entorse D',
      poids: 74.5,
    });
  });

  it('nettoyerReponses : EVA 0 conservé (une douleur à 0 est une réponse)', () => {
    expect(nettoyerReponses('adulte', { douleur: 'oui', eva: 0 })).toEqual({
      douleur: 'oui',
      eva: 0,
    });
  });

  it('nettoyerReponses : tout est vide → objet vide ; type inconnu → objet vide', () => {
    expect(nettoyerReponses('adulte', {})).toEqual({});
    expect(nettoyerReponses('adulte', undefined)).toEqual({});
    expect(nettoyerReponses('inconnu', { douleur: 'oui' })).toEqual({});
  });

  it('un enfant n’envoie pas de clé adulte', () => {
    const r = nettoyerReponses('enfant', {
      premature: 'oui',
      terme_sa: 32,
      metier_txt: 'x',
      age_marche_mois: 14,
    });
    expect(r).toEqual({ premature: 'oui', terme_sa: 32, age_marche_mois: 14 });
  });

  it('erreursReponses : nombre hors limites et texte trop long', () => {
    expect(erreursReponses('adulte', { poids: '74', taille: '178' })).toEqual([]);
    expect(erreursReponses('adulte', { poids: 'abc' }).length).toBe(1);
    expect(erreursReponses('adulte', { taille: '5' }).length).toBe(1);
    expect(erreursReponses('adulte', { notes_txt: 'x'.repeat(1001) }).length).toBe(1);
    expect(erreursReponses('adulte', { poids: '' })).toEqual([]);
  });
});

describe('valeurs de départ (fiche en lecture seule)', () => {
  const fiche = {
    antecedents: 'Entorse 2015',
    examens: 'Radio 2019',
    sport: 'Course',
    metier: 'Infirmier',
    poids: 72,
    taille: 178,
  };
  it('pré-remplit poids, taille, métier, sport depuis la fiche', () => {
    const r = valeursDepart('adulte', {}, fiche);
    expect(r.poids).toBe('72');
    expect(r.taille).toBe('178');
    expect(r.metier_txt).toBe('Infirmier');
    expect(r.sport_pratique).toBe('oui');
    expect(r.sport_txt).toBe('Course');
  });
  it('ne remplace jamais une réponse déjà donnée', () => {
    const r = valeursDepart('adulte', { poids: 75, sport_txt: 'Trail' }, fiche);
    expect(r.poids).toBe(75);
    expect(r.sport_txt).toBe('Trail');
  });
  it('fiche vide : rien n’est inventé', () => {
    expect(valeursDepart('adulte', {}, {})).toEqual({});
    expect(valeursDepart('adulte', undefined, undefined)).toEqual({});
  });
  it('les antécédents de la fiche ne deviennent jamais une réponse (lecture seule)', () => {
    const r = valeursDepart('adulte', {}, fiche);
    expect(r.chg_blessure_txt).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('Entorse 2015');
  });
});

describe('textes', () => {
  it('phrase de la carte', () => {
    expect(phraseQuestionnaire(null)).toMatch(/Rien à remplir/);
    expect(phraseQuestionnaire({ modifiable: true, rempli_at: null })).toMatch(/À remplir/);
    expect(phraseQuestionnaire({ modifiable: true, rempli_at: 'x' })).toMatch(/modifier/);
    expect(phraseQuestionnaire({ modifiable: false, rempli_at: 'x' })).toMatch(/merci/);
    expect(phraseQuestionnaire({ modifiable: false, rempli_at: null })).toMatch(/dépassé/);
  });
  it('messages d’erreur', () => {
    expect(messageErreurQuestionnaire(0, null)).toMatch(/internet/);
    expect(messageErreurQuestionnaire(400, { message: 'delai_depasse' })).toMatch(/passé/);
    expect(messageErreurQuestionnaire(400, { message: 'reponses_vides' })).toMatch(/au moins une/);
    expect(messageErreurQuestionnaire(500, null)).toMatch(/souci/);
    expect(messageErreurQuestionnaire(400, { message: 'autre' })).toMatch(/erreur/);
  });
});

describe('câblage (garde de source)', () => {
  it('le service worker patient met le module en cache et la version a changé', () => {
    const sw = lire('patient/sw.js');
    expect(sw).toMatch(/questionnaire-modele\.mjs/);
    expect(sw).toMatch(/verticy-patient-v20/);
  });
  it('la carte « Mon questionnaire » est un bouton, plus un « Bientôt disponible »', () => {
    const h = lire('patient/index.html');
    expect(h).toMatch(/id="carte-questionnaire"/);
    expect(h).not.toMatch(/Mon questionnaire<\/strong><small>Bientôt disponible/);
    expect(h).toMatch(/id="ecran-questionnaire"/);
  });
  it('le portail patient construit le formulaire sans innerHTML (réponses du patient)', () => {
    const js = lire('patient/patient.js');
    const debut = js.indexOf('// ─── Questionnaire de pré-consultation');
    const fin = js.indexOf('// ─── Démarrage ───');
    expect(debut).toBeGreaterThan(-1);
    expect(fin).toBeGreaterThan(debut);
    expect(js.slice(debut, fin)).not.toMatch(/innerHTML/);
  });
  it('côté praticien : notification, envoi, retrait et vérification toutes les 30 s', () => {
    const js = lire('js/biomeca.js');
    expect(js).toMatch(/questionnaire_a_notifier/);
    expect(js).toMatch(/notifierEvenement\('patient_questionnaire'/);
    expect(js).toMatch(/questionnaire_demander/);
    expect(js).toMatch(/questionnaire_retirer/);
    const i = js.indexOf('function _portailVerifierNotifications()');
    expect(i).toBeGreaterThan(-1);
    expect(js.slice(i, i + 800)).toMatch(/_portailVerifierQuestionnaires/);
  });
  it('blocs SQL : moins de 4000 caractères chacun (collage dans l’éditeur Supabase)', () => {
    for (const f of [
      'a1-tables',
      'a2-validation',
      'b-patient',
      'c1-praticien',
      'c2-notification',
    ]) {
      expect(lire(`supabase/migrations/portail-questionnaire-${f}.sql`).length, f).toBeLessThan(
        4000
      );
    }
  });
});

// ── Côté praticien : les vraies fonctions de js/biomeca.js, exécutées avec des faux (réseau, page, notifications) ──
function extraireFonction(src, nom) {
  const m = new RegExp('(?:async )?function ' + nom + '\\(').exec(src);
  if (!m) throw new Error('fonction absente : ' + nom);
  let i = src.indexOf('{', m.index + m[0].length);
  let prof = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('accolade non fermée : ' + nom);
}
const biomeca = readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
const NOMS = [
  '_portailHtmlQuestionnaire',
  '_portailDateHeureFr',
  '_portailChargerQuestionnaire',
  'portailEnvoyerQuestionnaire',
  'portailRetirerQuestionnaire',
  '_portailVerifierQuestionnaires',
];
const corpsFonctions = NOMS.map((n) => extraireFonction(biomeca, n)).join('\n');

function monde(opts = {}) {
  globalThis._modeConsultation = !!opts.consultation; // le code lit globalThis (remis à false après chaque test)
  const j = {
    rpc: [],
    fetch: [],
    events: [],
    zone: { innerHTML: '', textContent: '', ajouts: [] },
  };
  j.zone.insertAdjacentHTML = (_p, h) => j.zone.ajouts.push(h);
  const doc = {
    getElementById: (id) =>
      id === 'portail-questionnaire'
        ? j.zone
        : id === 'portail-q-rdv'
          ? opts.champRdv || null
          : null,
  };
  const globals = {
    patients: opts.patients || [{ id: 'p1', _cloudId: 'c1' }],
    pwaUser: opts.pwaUser === undefined ? { id: 'u' } : opts.pwaUser,
    document: doc,
    SUPA_URL: 'https://x.test',
    _escHtml: (s) =>
      String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    _portailRpc: async (nom, corps) => {
      j.rpc.push({ nom, corps });
      const r = (opts.rpc || {})[nom];
      if (r instanceof Error) throw r;
      return typeof r === 'function' ? r(corps) : r;
    },
    authFetch: async (url, init) => {
      j.fetch.push({ url, init });
      return opts.fetchRep || { ok: true, json: async () => null };
    },
    notifierEvenement: (t, o) => j.events.push([t, o]),
    showAccessRestrictedModal: () => j.events.push(['restreint']),
    confirm: () => (opts.confirm === undefined ? true : opts.confirm),
    _horsConnexion: () => !!opts.horsConnexion,
    _modeConsultation: !!opts.consultation,
    patientsGlobal: null,
  };
  const noms = Object.keys(globals);
  const fabrique = new Function(
    ...noms,
    `let _qstEnCours = false;\n${corpsFonctions}\nreturn { ${NOMS.join(', ')}, etat: () => _qstEnCours };`
  );
  const api = fabrique(
    ...noms.map((n) => (n === '_modeConsultation' ? globals._modeConsultation : globals[n]))
  );
  return { j, api, globals };
}
afterEach(() => {
  globalThis._modeConsultation = false;
});
const Q = (o = {}) => ({
  id: 'q-1',
  type: 'adulte',
  rdv_at: null,
  envoye_at: '2026-10-26T08:00:00Z',
  rempli_at: null,
  modifie_at: null,
  integre_at: null,
  retire_at: null,
  reponses: {},
  ...o,
});

describe('praticien : vérification des questionnaires remplis (vraie fonction)', () => {
  it('notifie une fois par questionnaire connu, avec l’identifiant de la fiche locale', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_a_notifier: [{ id: 'q-1', patient_id: 'c1' }],
        questionnaire_notifie: true,
      },
    });
    await api._portailVerifierQuestionnaires();
    expect(j.rpc.map((r) => r.nom)).toEqual(['questionnaire_a_notifier', 'questionnaire_notifie']);
    expect(j.rpc[1].corps).toEqual({ p_id: 'q-1' });
    expect(j.events).toEqual([['patient_questionnaire', { patientId: 'p1' }]]);
  });
  it('déjà notifié ailleurs (le serveur répond false) : aucune notification', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_a_notifier: [{ id: 'q-1', patient_id: 'c1' }],
        questionnaire_notifie: false,
      },
    });
    await api._portailVerifierQuestionnaires();
    expect(j.events).toEqual([]);
  });
  it('fiche inconnue sur cet appareil : on ne marque pas « notifié » (un autre appareil s’en charge)', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_a_notifier: [{ id: 'q-9', patient_id: 'inconnu' }],
        questionnaire_notifie: true,
      },
    });
    await api._portailVerifierQuestionnaires();
    expect(j.rpc.map((r) => r.nom)).toEqual(['questionnaire_a_notifier']);
    expect(j.events).toEqual([]);
  });
  it('mode consultation, hors connexion, non connecté : rien n’est appelé', async () => {
    for (const o of [{ consultation: true }, { horsConnexion: true }, { pwaUser: null }]) {
      const { j, api } = monde({ ...o, rpc: { questionnaire_a_notifier: [] } });
      await api._portailVerifierQuestionnaires();
      expect(j.rpc).toEqual([]);
    }
  });
  it('erreur réseau : avalée, et la vérification suivante repart', async () => {
    const { j, api } = monde({ rpc: { questionnaire_a_notifier: new Error('réseau') } });
    await api._portailVerifierQuestionnaires();
    expect(api.etat()).toBe(false);
    await api._portailVerifierQuestionnaires();
    expect(j.rpc.length).toBe(2);
  });
  it('plusieurs questionnaires : un événement par patient connu', async () => {
    const { j, api } = monde({
      patients: [
        { id: 'p1', _cloudId: 'c1' },
        { id: 'p2', _cloudId: 'c2' },
      ],
      rpc: {
        questionnaire_a_notifier: [
          { id: 'a', patient_id: 'c1' },
          { id: 'b', patient_id: 'c2' },
        ],
        questionnaire_notifie: true,
      },
    });
    await api._portailVerifierQuestionnaires();
    expect(j.events.map((e) => e[1].patientId)).toEqual(['p1', 'p2']);
  });
});

describe('praticien : bloc « Questionnaire avant le rendez-vous » (vraies fonctions)', () => {
  it('aucun questionnaire ouvert : champ de rendez-vous + bouton d’envoi', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_lire_praticien: [
          Q({ integre_at: '2026-10-01T00:00:00Z' }),
          Q({ id: 'q-0', retire_at: '2026-10-02T00:00:00Z' }),
        ],
      },
    });
    await api._portailChargerQuestionnaire(0);
    expect(j.rpc[0]).toEqual({ nom: 'questionnaire_lire_praticien', corps: { p_patient: 'c1' } });
    expect(j.zone.innerHTML).toMatch(/portailEnvoyerQuestionnaire\(0\)/);
    expect(j.zone.innerHTML).toMatch(/datetime-local/);
    expect(j.zone.innerHTML).not.toMatch(/Retirer/);
  });
  it('envoyé, pas rempli : « En attente du patient » et bouton Retirer', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_lire_praticien: [Q({ type: 'enfant', rdv_at: '2026-10-29T09:00:00Z' })],
      },
    });
    await api._portailChargerQuestionnaire(0);
    expect(j.zone.innerHTML).toMatch(/Questionnaire enfant envoyé le/);
    expect(j.zone.innerHTML).toMatch(/En attente du patient/);
    expect(j.zone.innerHTML).toMatch(/modifiable par le patient jusqu/);
    expect(j.zone.innerHTML).toMatch(/portailRetirerQuestionnaire\(0,'q-1'\)/);
  });
  it('rempli (puis modifié) : date de remplissage et de modification', async () => {
    const { j, api } = monde({
      rpc: {
        questionnaire_lire_praticien: [
          Q({ rempli_at: '2026-10-27T10:00:00Z', modifie_at: '2026-10-28T11:00:00Z' }),
        ],
      },
    });
    await api._portailChargerQuestionnaire(0);
    expect(j.zone.innerHTML).toMatch(/Rempli le/);
    expect(j.zone.innerHTML).toMatch(/modifié le/);
    expect(j.zone.innerHTML).not.toMatch(/En attente/);
  });
  it('un identifiant piégé est neutralisé dans le gestionnaire de clic', async () => {
    const { j, api } = monde({
      rpc: { questionnaire_lire_praticien: [Q({ id: "x');alert(1);('" })] },
    });
    await api._portailChargerQuestionnaire(0);
    expect(j.zone.innerHTML).not.toContain("x');alert(1)");
  });
  it('lecture impossible : message, pas d’exception', async () => {
    const { j, api } = monde({ rpc: { questionnaire_lire_praticien: new Error('503') } });
    await api._portailChargerQuestionnaire(0);
    expect(j.zone.textContent).toMatch(/Lecture impossible/);
  });
  it('fiche sans identifiant cloud : aucun appel', async () => {
    const { j, api } = monde({ patients: [{ id: 'p1' }] });
    await api._portailChargerQuestionnaire(0);
    expect(j.rpc).toEqual([]);
  });
});

describe('praticien : envoi et retrait (vraies fonctions)', () => {
  it('envoi avec date de RDV : p_rdv en ISO, puis rechargement', async () => {
    const { j, api } = monde({
      champRdv: { value: '2026-10-29T09:30' },
      rpc: { questionnaire_lire_praticien: [] },
    });
    await api.portailEnvoyerQuestionnaire(0);
    expect(j.fetch[0].url).toBe('https://x.test/rest/v1/rpc/questionnaire_demander');
    const corps = JSON.parse(j.fetch[0].init.body);
    expect(corps.p_patient).toBe('c1');
    expect(corps.p_rdv).toBe(new Date('2026-10-29T09:30').toISOString());
    expect(j.rpc.map((r) => r.nom)).toEqual(['questionnaire_lire_praticien']);
  });
  it('envoi sans date : p_rdv null', async () => {
    const { j, api } = monde({
      champRdv: { value: '' },
      rpc: { questionnaire_lire_praticien: [] },
    });
    await api.portailEnvoyerQuestionnaire(0);
    expect(JSON.parse(j.fetch[0].init.body).p_rdv).toBeNull();
  });
  it('refus du serveur : messages clairs, pas de rechargement', async () => {
    for (const [code, motif] of [
      ['questionnaire_deja_ouvert', /déjà en cours/],
      ['rdv_passe', /déjà passée/],
      ['autre', /Envoi impossible/],
    ]) {
      const { j, api } = monde({
        champRdv: { value: '' },
        fetchRep: { ok: false, json: async () => ({ message: code }) },
      });
      await api.portailEnvoyerQuestionnaire(0);
      expect(j.zone.ajouts.join('')).toMatch(motif);
      expect(j.rpc).toEqual([]);
    }
  });
  it('mode consultation : refusé sans appel', async () => {
    const { j, api } = monde({ consultation: true });
    await api.portailEnvoyerQuestionnaire(0);
    expect(j.fetch).toEqual([]);
    expect(j.events).toEqual([['restreint']]);
  });
  it('retrait : confirmation refusée = rien ; acceptée = retirer puis recharger', async () => {
    const non = monde({ confirm: false });
    await non.api.portailRetirerQuestionnaire(0, 'q-1');
    expect(non.j.rpc).toEqual([]);
    const oui = monde({ rpc: { questionnaire_retirer: true, questionnaire_lire_praticien: [] } });
    await oui.api.portailRetirerQuestionnaire(0, 'q-1');
    expect(oui.j.rpc.map((r) => r.nom)).toEqual([
      'questionnaire_retirer',
      'questionnaire_lire_praticien',
    ]);
    expect(oui.j.rpc[0].corps).toEqual({ p_id: 'q-1' });
  });
});

// ── Étapes 2 et 3 : lecture des réponses et intégration au bilan (vraies fonctions de js/biomeca.js) ──
import * as MODELE from '../patient/questionnaire-modele.mjs';

function extraireConst(src, nom) {
  const m = new RegExp('const ' + nom + ' = \\{[^\\n]*\\};').exec(src);
  if (!m) throw new Error('constante absente : ' + nom);
  return m[0];
}
const NOMS_QST = [
  '_qstNorm',
  '_qstDateFr',
  '_qstAjouter',
  '_qstRemplacer',
  '_qstOpt',
  '_qstLib',
  '_qstFormaterReponses',
  '_qstFaits',
  '_qstPlan',
];
const CONSTS_QST = [
  '_QST_PODO_MOTIF',
  '_QST_PODO_ZONE',
  '_QST_PODO_QUAND',
  '_QST_PODO_EXAM',
  '_QST_PODO_CHAUSS',
  '_QST_PED_MOTIF',
  '_QST_PED_ATCD',
  '_QST_PED_CHAUSS',
  '_QST_PED_POS',
];
const codeQst = [
  ...CONSTS_QST.map((c) => extraireConst(biomeca, c)),
  ...NOMS_QST.map((n) => extraireFonction(biomeca, n)),
].join('\n');
const QST = new Function(`${codeQst}\nreturn { ${NOMS_QST.join(', ')} };`)();

// Faux bilan : un dictionnaire { 'genre:champ': valeur } ; null = champ absent de la page.
function faussePage(init, absents) {
  const etat = { ...(init || {}) };
  const lire = (champ, genre) => {
    if ((absents || []).includes(champ)) return null;
    const cle = genre + ':' + champ;
    if (genre === 'coche') return !!etat[cle];
    return etat[cle] === undefined ? '' : etat[cle];
  };
  const ecrire = (bilan) =>
    bilan.forEach((o) => {
      etat[o.genre + ':' + o.champ] = o.genre === 'coche' ? true : o.apres;
    });
  return { etat, lire, ecrire };
}
const REMPLI = '2026-10-26T09:16:00Z';
const D = new Date(REMPLI).toLocaleDateString('fr-FR');
const QA = (reponses, o) => ({
  type: 'adulte',
  rempli_at: REMPLI,
  modifie_at: null,
  reponses,
  ...(o || {}),
});
const FICHE = {
  antecedents: 'Entorse 2015',
  examens: 'Radio 2019',
  sport: 'Course à pied',
  metier: 'Infirmier',
  poids: '72',
  taille: '178',
};
const plan = (module, q, page, fiche) =>
  QST._qstPlan(MODELE, module, q, page.lire, fiche === undefined ? FICHE : fiche);
const fic = (p, champ) => p.fiche.filter((o) => o.champ === champ).pop(); // le dernier gagne (comme à l'écriture)
const bil = (p, champ, genre) =>
  p.bilan.filter((o) => o.champ === champ && (!genre || o.genre === genre));

describe('intégration : fonctions de texte', () => {
  it('_qstAjouter : ajoute à la suite, daté, sans doublon (accents et casse ignorés)', () => {
    expect(
      QST._qstAjouter('Entorse 2015', 'Blessure : cheville', ' ; ', ' (déclaré le 26/10/2026)')
    ).toBe('Entorse 2015 ; Blessure : cheville (déclaré le 26/10/2026)');
    expect(QST._qstAjouter('', 'Blessure : cheville', ' ; ', ' (x)')).toBe(
      'Blessure : cheville (x)'
    );
    expect(
      QST._qstAjouter(
        'blessure : CHEVILLE (déclaré le 01/01/2026)',
        'Blessure : chevillé',
        ' ; ',
        ' (x)'
      )
    ).toBeNull();
    expect(QST._qstAjouter('abc', '   ')).toBeNull();
    expect(QST._qstAjouter('abc', null)).toBeNull();
    expect(QST._qstAjouter('a', 'b', '\n')).toBe('a\nb');
  });
  it('_qstRemplacer : vide → remplit ; copie de la fiche → met à jour ; saisie du praticien → ajoute', () => {
    expect(QST._qstRemplacer('', 'Trail', 'Course')).toBe('Trail');
    expect(QST._qstRemplacer('Course', 'Trail', 'course')).toBe('Trail');
    expect(QST._qstRemplacer('Course + yoga (saisi par le praticien)', 'Trail', 'Course')).toBe(
      'Course + yoga (saisi par le praticien) ; Trail'
    );
    expect(QST._qstRemplacer('Trail', 'Trail', 'Course')).toBeNull();
    expect(QST._qstRemplacer('Trail 3 fois', 'trail', 'Course')).toBeNull();
    expect(QST._qstRemplacer('x', '', 'Course')).toBeNull();
  });
});

describe('intégration : scénario de Joël (sport, bilan de contrôle)', () => {
  const rep = {
    motif: ['semelles'],
    premiere_fois: 'non',
    douleur: 'oui',
    douleur_zones: ['talon', 'genou'],
    douleur_quand: ['matin', 'effort'],
    eva: 6,
    chg_blessure: 'oui',
    chg_blessure_txt: 'Entorse cheville D',
    chg_operation: 'oui',
    chg_operation_txt: 'Ménisque genou G',
    chg_examens: ['irm'],
    chg_examens_txt: 'IRM genou 2026',
    chg_traitements_txt: 'Anti-inflammatoires',
    allergies_txt: 'Pénicilline',
    poids: 74.5,
    taille: 178,
    metier_txt: 'Infirmier',
    position: 'debout',
    chaussures: ['ville', 'sport'],
    appareillage: 'oui',
    appareillage_txt: 'Semelles 2024',
    sport_pratique: 'oui',
    sport_txt: 'Trail',
    sport_freq_txt: '3',
    sport_niveau: 'loisir',
    sport_objectif_txt: 'Marathon en mars',
    sport_chaussures_txt: 'Hoka Speedgoat',
    notes_txt: 'Douleur en descente',
  };
  const page = () =>
    faussePage({
      'texte:antecedents': 'Entorse 2015',
      'texte:examens': 'Radio 2019',
      'texte:sport_detail': 'Course à pied',
      'texte:travail': 'Infirmier',
    });

  it('fiche : antécédents AJOUTÉS (datés), poids REMPLACÉ, sport REMPLACÉ, taille et métier inchangés', () => {
    const p = plan('sport', QA(rep), page());
    expect(fic(p, 'antecedents').apres).toBe(
      `Entorse 2015 ; Blessure : Entorse cheville D (déclaré le ${D}) ; Opération : Ménisque genou G (déclaré le ${D})`
    );
    expect(fic(p, 'examens').apres).toBe(
      `Radio 2019 ; Examens : IRM — IRM genou 2026 (déclaré le ${D})`
    );
    expect(fic(p, 'poids')).toMatchObject({ avant: '72', apres: '74.5' });
    expect(fic(p, 'sport')).toMatchObject({ avant: 'Course à pied', apres: 'Trail' });
    expect(fic(p, 'taille')).toBeUndefined();
    expect(fic(p, 'metier')).toBeUndefined();
  });
  it('bilan sport : anamnèse remplie (motif, douleur, EVA, 1re intention, antécédents ajoutés, sport remplacé)', () => {
    const p = plan('sport', QA(rep), page());
    expect(bil(p, 'motif')[0].apres).toBe('Semelles à renouveler');
    expect(bil(p, 'douleur_oui_non')[0]).toMatchObject({ genre: 'radio', apres: 'oui' });
    expect(bil(p, 'douleur', 'texte')[0].apres).toBe(
      'Zones : Talon, Genou · Moments : Le matin, À l’effort'
    );
    expect(bil(p, 'eva')[0]).toMatchObject({ genre: 'range', apres: 6 });
    expect(bil(p, '1ere_intention')[0]).toMatchObject({ apres: 'non' });
    const atcd = bil(p, 'antecedents');
    expect(atcd.length).toBe(2);
    expect(atcd[atcd.length - 1].apres).toBe(
      `Entorse 2015\nBlessure : Entorse cheville D (déclaré le ${D})\nOpération : Ménisque genou G (déclaré le ${D})`
    );
    expect(bil(p, 'sport_detail').pop().apres).toBe(
      'Trail ; fréquence par semaine : 3 ; niveau : Loisir'
    );
    expect(bil(p, 'objectif_sportif')[0].apres).toBe('Marathon en mars');
    expect(bil(p, 'chaussage_sportif')[0].apres).toBe('Hoka Speedgoat');
    expect(bil(p, 'appareillage')[0].apres).toBe('Semelles 2024');
    expect(bil(p, 'activite_quot')[0].apres).toBe('Position dans la journée : Debout');
    expect(bil(p, 'travail')).toEqual([]);
  });
  it('bilan sport : ce qui n’a pas de champ (chaussures du quotidien, traitements, allergies, message) va dans les notes', () => {
    const p = plan('sport', QA(rep), page());
    const notes = bil(p, 'notes_generales').pop().apres;
    expect(notes).toContain('Chaussures du quotidien : Ville, Sport');
    expect(notes).toContain('Traitements : Anti-inflammatoires ; Allergies : Pénicilline');
    expect(notes).toContain('Message du patient : Douleur en descente');
  });
  it('idempotence : après écriture, un second plan ne propose plus rien (aucun doublon)', () => {
    const pg = page();
    const p1 = plan('sport', QA(rep), pg);
    pg.ecrire(p1.bilan);
    const fiche2 = { ...FICHE };
    p1.fiche.forEach((o) => (fiche2[o.champ] = o.apres));
    const p2 = QST._qstPlan(MODELE, 'sport', QA(rep), pg.lire, fiche2);
    expect(p2.bilan).toEqual([]);
    expect(p2.fiche).toEqual([]);
  });
  it('la date de déclaration est celle de la dernière modification du patient', () => {
    const p = plan('sport', QA(rep, { modifie_at: '2026-10-28T10:00:00Z' }), page());
    expect(fic(p, 'antecedents').apres).toContain(
      '(déclaré le ' + new Date('2026-10-28T10:00:00Z').toLocaleDateString('fr-FR') + ')'
    );
  });
  it('jamais d’écrasement : radio / EVA déjà renseignés autrement → listés « à saisir à la main »', () => {
    const pg = faussePage({ 'radio:douleur_oui_non': 'non', 'range:eva': '4' });
    const p = plan('sport', QA(rep), pg);
    expect(bil(p, 'douleur_oui_non')).toEqual([]);
    expect(bil(p, 'eva')).toEqual([]);
    expect(
      p.hors
        .filter((h) => /déjà renseigné/.test(h.raison))
        .map((h) => h.libelle)
        .sort()
    ).toEqual(['Douleur présente', 'EVA douleur']);
  });
  it('un champ absent de la page n’est jamais proposé : il est listé', () => {
    const pg = faussePage({}, ['appareillage']);
    const p = plan('sport', QA(rep), pg);
    expect(bil(p, 'appareillage')).toEqual([]);
    expect(p.hors.some((h) => h.libelle === 'Appareillage' && /aucune case/.test(h.raison))).toBe(
      true
    );
  });
  it('« rien de nouveau » : « non » partout ne propose rien', () => {
    const p = plan(
      'sport',
      QA({
        douleur: 'non',
        chg_blessure: 'non',
        chg_operation: 'non',
        appareillage: 'non',
        sport_pratique: 'non',
      }),
      faussePage({}),
      { antecedents: '', examens: '', sport: '', metier: '', poids: '', taille: '' }
    );
    expect(p.fiche).toEqual([]);
    expect(p.bilan.filter((o) => o.genre !== 'radio')).toEqual([]);
  });
  it('sport « non » alors que la fiche en indique un : jamais effacé, signalé', () => {
    const p = plan('sport', QA({ sport_pratique: 'non' }), page());
    expect(fic(p, 'sport')).toBeUndefined();
    expect(p.hors.some((h) => h.libelle === 'Sport' && /ne plus pratiquer/.test(h.valeur))).toBe(
      true
    );
  });
  it('poids de la fiche avec virgule ou égal : pas de changement ; fiche sans poids : ajouté', () => {
    expect(fic(plan('sport', QA({ poids: 72 }), faussePage({})), 'poids')).toBeUndefined();
    expect(
      fic(plan('sport', QA({ poids: 72 }), faussePage({}), { ...FICHE, poids: '72,0' }), 'poids')
    ).toBeUndefined();
    expect(
      fic(plan('sport', QA({ poids: 72 }), faussePage({}), { ...FICHE, poids: '' }), 'poids')
    ).toMatchObject({ avant: '', apres: '72' });
  });
  it('saisie du praticien conservée : sport déjà modifié dans le bilan → la nouvelle info est AJOUTÉE', () => {
    const pg = faussePage({ 'texte:sport_detail': 'Course + yoga (praticien)' });
    const p = plan('sport', QA({ sport_pratique: 'oui', sport_txt: 'Trail' }), pg);
    expect(bil(p, 'sport_detail')[0].apres).toBe('Course + yoga (praticien)\nTrail');
  });
});

describe('intégration : les autres bilans', () => {
  it('posturo : champs po-* (texte sur une ligne, ajout daté)', () => {
    const pg = faussePage({
      'texte:po-atcd': 'Entorse 2015',
      'texte:po-activite': 'Course à pied',
    });
    const p = plan(
      'posturo',
      QA({
        motif: ['douleur'],
        douleur: 'oui',
        eva: 3,
        chg_blessure: 'oui',
        chg_blessure_txt: 'Fracture poignet',
        sport_pratique: 'oui',
        sport_txt: 'Natation',
        chg_traitements_txt: 'Aucun nouveau',
      }),
      pg
    );
    expect(bil(p, 'po-motif')[0].apres).toBe('Douleur au pied');
    expect(bil(p, 'po-douleur')[0].apres).toBe('oui');
    expect(bil(p, 'po-eva')[0].apres).toBe(3);
    expect(bil(p, 'po-atcd')[0].apres).toBe(
      `Entorse 2015 ; Blessure : Fracture poignet (déclaré le ${D})`
    );
    expect(bil(p, 'po-activite')[0].apres).toBe('Natation');
    expect(bil(p, 'po-ttt-cours')[0].apres).toBe('Traitements : Aucun nouveau');
  });
  it('podopédiatrie (enfant) : cases cochées, EVA arrondie au pair, antécédents, âge de marche, prématurité', () => {
    const q = {
      type: 'enfant',
      rempli_at: REMPLI,
      modifie_at: null,
      reponses: {
        motif: ['pieds_plats', 'chutes'],
        douleur: 'oui',
        douleur_zones: ['talon', 'dos'],
        douleur_quand: ['effort'],
        eva: 5,
        age_marche_mois: 14,
        premature: 'oui',
        terme_sa: 32,
        atcd_medicaux_txt: 'Asthme',
        chg_blessure: 'oui',
        chg_blessure_txt: 'Fracture bras',
        chg_examens: ['radio'],
        poids: 21,
        taille: 115,
        chaussures: ['sport'],
      },
    };
    const pg = faussePage({}, ['podo_chauss_type_sport']);
    const p = QST._qstPlan(MODELE, 'podopediatrie', q, pg.lire, {
      antecedents: '',
      examens: '',
      sport: '',
      metier: '',
      poids: '',
      taille: '',
    });
    const coches = p.bilan
      .filter((o) => o.genre === 'coche')
      .map((o) => o.champ)
      .sort();
    expect(coches).toEqual([
      'podo_atcd_medicaux',
      'podo_atcd_prematurite',
      'podo_atcd_traumatiques',
      'podo_doul_horaire_effort',
      'podo_doul_loc_arrierepied',
      'podo_doul_loc_autre',
      'podo_exam_radio',
      'podo_motif_chutes',
      'podo_motif_piedsplats',
    ]);
    expect(bil(p, 'podo_douleur_eva')[0].apres).toBe(
      '4'.replace('4', String(Math.round(5 / 2) * 2))
    );
    expect(bil(p, 'podo_age_marche')[0].apres).toBe('14');
    expect(bil(p, 'podo_terme')[0].apres).toBe('32');
    expect(bil(p, 'podo_atcd_txt').pop().apres).toContain('Fracture bras');
    expect(fic(p, 'poids').apres).toBe('21');
    expect(fic(p, 'taille').apres).toBe('115');
    expect(p.hors.some((h) => h.libelle === 'Chaussures : Sport')).toBe(true);
  });
  it('pédicurie : cases (diabète, talon haut, station debout, sport), texte (profession, allergies) et le reste est listé', () => {
    const q = QA({
      motif: ['douleur', 'semelles'],
      chg_maladie_types: ['diabete', 'circulation'],
      chaussures: ['talons', 'ville'],
      chaussures_gene_txt: 'Trop étroites',
      position: 'debout',
      sport_pratique: 'oui',
      metier_txt: 'Coiffeur',
      allergies_txt: 'Latex',
      chg_traitements_txt: 'Metformine',
      chg_operation: 'oui',
      chg_operation_txt: 'Hallux 2026',
      douleur: 'oui',
      eva: 4,
      notes_txt: 'RAS',
    });
    const pg = faussePage({});
    const p = QST._qstPlan(MODELE, 'pedicurie', q, pg.lire, { ...FICHE, metier: '' });
    const coches = p.bilan
      .filter((o) => o.genre === 'coche')
      .map((o) => o.champ)
      .sort();
    expect(coches).toEqual([
      'ped_activite_sport',
      'ped_activite_station',
      'ped_atcd_diabete',
      'ped_chaussage_talon',
      'ped_motif_autre',
      'ped_motif_douleur',
    ]);
    expect(bil(p, 'ped_motif_autre_txt')[0].apres).toBe('Semelles à renouveler');
    expect(bil(p, 'ped_profession')[0].apres).toBe('Coiffeur');
    expect(bil(p, 'ped_allergies_txt')[0].apres).toBe('Latex');
    expect(bil(p, 'ped_ttt_autre_txt')[0].apres).toBe('Metformine');
    expect(bil(p, 'ped_chaussage_autre_txt')[0].apres).toBe('Trop étroites');
    const horsLib = p.hors.map((h) => h.libelle);
    expect(horsLib).toContain('Nouveau diagnostic : Circulation');
    expect(horsLib).toContain('Antécédent');
    expect(horsLib).toContain('Douleur');
    expect(horsLib).toContain('Message du patient');
  });
  it('aucune information n’est perdue : tout ce que le patient a écrit est soit intégré, soit listé', () => {
    const q = QA({
      chg_blessure: 'oui',
      chg_blessure_txt: 'Entorse',
      chg_traitements_txt: 'Doliprane',
      allergies_txt: 'Pollen',
      notes_txt: 'Merci',
      appareillage: 'oui',
      appareillage_txt: 'Orthèse',
    });
    for (const module of ['sport', 'posturo', 'podopediatrie', 'pedicurie']) {
      const p = QST._qstPlan(MODELE, module, q, faussePage({}).lire, {
        antecedents: '',
        examens: '',
        sport: '',
        metier: '',
        poids: '',
        taille: '',
      });
      const tout = JSON.stringify(p);
      for (const mot of ['Doliprane', 'Pollen', 'Merci', 'Orthèse'])
        expect(tout, module + ' / ' + mot).toContain(mot);
    }
  });
});

describe('lecture des réponses', () => {
  it('_qstFormaterReponses : sections et libellés lisibles, rien d’inventé', () => {
    const s = QST._qstFormaterReponses(MODELE, 'adulte', {
      motif: ['douleur', 'suivi'],
      douleur: 'oui',
      eva: 6,
      poids: 74.5,
      sport_pratique: 'oui',
      cle_inconnue: 'x',
    });
    expect(s.map((x) => x.titre)).toEqual(['Votre consultation', 'Votre quotidien', 'Votre sport']);
    const flat = s.flatMap((x) => x.lignes);
    expect(flat.find((l) => /Pourquoi/.test(l.q)).r).toBe('Douleur au pied, Suivi');
    expect(flat.find((l) => /Avez-vous mal/.test(l.q)).r).toBe('Oui');
    expect(flat.find((l) => /Intensité/.test(l.q)).r).toBe('6/10');
    expect(flat.find((l) => /poids/.test(l.q)).r).toBe('74.5');
    expect(JSON.stringify(s)).not.toContain('cle_inconnue');
  });
  it('réponses vides ou absentes : aucune section', () => {
    expect(QST._qstFormaterReponses(MODELE, 'adulte', {})).toEqual([]);
    expect(QST._qstFormaterReponses(MODELE, 'adulte', undefined)).toEqual([]);
    expect(QST._qstFormaterReponses(MODELE, 'inconnu', { a: 1 })).toEqual([]);
  });
});

describe('câblage de l’intégration (garde de source)', () => {
  it('le bouton est injecté par JS dans le bilan EN COURS (jamais dans index.html : golden de structure)', () => {
    expect(lire('index.html')).not.toMatch(/data-qst-bouton/);
    const i = biomeca.indexOf('function _fichePrefillApply(');
    expect(i).toBeGreaterThan(-1);
    expect(biomeca.slice(i, i + 800)).toMatch(/_qstInjecterBouton\(module\)/);
    const f = extraireFonction(biomeca, '_qstInjecterBouton');
    expect(f).toMatch(/cfg\.enCours\(\)/);
    expect(f).toMatch(/_modeConsultation/);
  });
  it('rien n’est écrit avant le clic de validation : l’aperçu ne modifie ni le DOM du bilan ni la fiche', () => {
    const f = extraireFonction(biomeca, 'qstOuvrirIntegration');
    expect(f).not.toMatch(/_qstEcrireBilan|savePatients|questionnaire_integrer/);
    const v = extraireFonction(biomeca, 'qstValiderIntegration');
    expect(v.indexOf('_qstEcrireBilan')).toBeGreaterThan(-1);
    expect(v.indexOf('_qstEcrireBilan')).toBeLessThan(v.indexOf('questionnaire_integrer'));
  });
  it('les textes du patient sont toujours échappés dans les fenêtres', () => {
    for (const n of [
      '_qstHtmlReponses',
      '_qstHtmlApercu',
      '_qstAffichageOp',
      '_qstAffichageFiche',
    ]) {
      const f = extraireFonction(biomeca, n);
      expect(f, n).toMatch(/_escHtml/);
    }
  });
  it('bloc SQL D : moins de 4000 caractères', () => {
    expect(lire('supabase/migrations/portail-questionnaire-d-integration.sql').length).toBeLessThan(
      4000
    );
  });
});
