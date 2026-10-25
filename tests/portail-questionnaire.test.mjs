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
