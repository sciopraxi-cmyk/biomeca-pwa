// ═══════════════════════════════════════════════════════════════════
// Facturation, étape 2b-1 — devis et factures par patient
// ═══════════════════════════════════════════════════════════════════
// Fonctions EXTRAITES de js/biomeca.js ; réseau simulé. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const constLigne = (nom) => {
  const m = new RegExp(`\\nconst ${nom} = [^\\n]*;\\n`).exec(SRC_BIOMECA);
  if (!m) throw new Error(nom + ' introuvable');
  return m[0].trim();
};
const constBloc = (nom) => {
  const tete = `\nconst ${nom} = `;
  const i = SRC_BIOMECA.indexOf(tete);
  const fin = SRC_BIOMECA.indexOf('\n};\n', i);
  if (i < 0 || fin < 0) throw new Error(nom + ' introuvable');
  return SRC_BIOMECA.slice(i + 1, fin + 3);
};
const NOMS = [
  '_partsRemboursement',
  '_eurosVersCentimes',
  '_centimesVersEuros',
  '_calculerDocument',
  '_ligneDepuisActe',
  '_mentionTva',
  '_emetteurDepuisPraticien',
  '_patientInstantane',
  '_validerDocument',
  '_dateFr',
  '_netDocument',
  '_ligneBaseDocument',
  '_docRequete',
  '_praticienParDefaut',
  '_praticienDuDocument',
  'chargerDocuments',
  'nouveauDocument',
  'ouvrirDocument',
  'fermerDocument',
  'basculerActeDocument',
  'retirerLigneDocument',
  'modifierLigneDocument',
  'modifierTotalFixeDocument',
  'revenirALaSommeDocument',
  '_htmlPartsLigne',
  '_ecartTotalDocument',
  '_eurSigne',
  '_majResumeDocument',
  'modifierChampDocument',
  '_preparerDocument',
  'enregistrerBrouillonDocument',
  'emettreDocumentCourant',
  'supprimerBrouillonDocument',
  'enregistrerReglementDocument',
  'creerFactureDepuisDevis',
  'ouvrirDocumentsPatient',
  '_htmlCorpsDocument',
  '_htmlDocumentEmis',
  '_htmlApercuDocument',
  '_htmlPageImpressionDocument',
  '_accessPermetCreationDocument',
  '_normaliserIban',
  '_ibanValide',
  '_bicValide',
  '_formaterIban',
  '_erreurCoordonneesBancaires',
  'chargerDocumentsEmis',
  '_htmlRecuperationDocuments',
  'ouvrirRecuperationDocuments',
  '_showAccessOverlay',
  'imprimerDocument',
  'visualiserBrouillonDocument',
  'fermerApercuDocument',
  '_htmlListeDocuments',
  '_htmlEditeurDocument',
  '_rendreLignesDocument',
  '_majTotauxDocument',
];

const PRAT = {
  id: 7,
  nom: 'Dr Fictif',
  titre: 'Pédicure-podologue',
  cabinet: 'Cabinet Test',
  adresse: '1 rue de Test, 75000 Paris',
  tel: '0100000000',
  email: 'fictif@example.test',
  siret: '123 456 789 00012',
  rpps: '10001234567',
};
const PATIENT = {
  id: 42,
  civilite: 'M.',
  nom: 'Martin',
  prenom: 'Paul',
  adresse: '2 rue Z',
  cp: '75001',
  ville: 'Paris',
  pratId: 7,
};
const ACTES = [
  {
    id: 'a-pod117',
    code: 'POD-1,17',
    libelle: 'Séance bilan et soins',
    cotation: 'POD 1,17',
    montant_cents: 3510,
    base_remboursable_cents: 3510,
    franchise: true,
    actif: true,
  },
  {
    id: 'a-pod1',
    code: 'POD-1',
    libelle: 'Séance de soins',
    cotation: 'POD 1',
    montant_cents: 3000,
    base_remboursable_cents: 3000,
    franchise: true,
    actif: true,
  },
  {
    id: 'a-c2s',
    code: null,
    libelle: 'Séance cabinet C2S',
    cotation: 'POD 1',
    montant_cents: 3500,
    base_remboursable_cents: 3000,
    franchise: true,
    regime_defaut: 'c2s',
    perso: true,
    actif: true,
  },
  {
    id: 'a-lpp',
    code: 'LPP-2122121',
    libelle: 'Semelles 28 à 37',
    cotation: 'LPP 2122121',
    montant_cents: 2804,
    base_remboursable_cents: 2804,
    franchise: false,
    actif: true,
  },
  {
    id: 'a-perso',
    code: null,
    libelle: 'Consultation',
    cotation: null,
    montant_cents: 4550,
    base_remboursable_cents: null,
    franchise: true,
    actif: true,
    perso: true,
  },
  { id: 'a-off', code: 'X', libelle: 'Désactivé', montant_cents: 100, actif: false },
];

function monter(o = {}) {
  const appels = [];
  const alertes = [];
  const champs = o.champs || {};
  const authFetch = async (url, options = {}) => {
    const appel = {
      url,
      methode: options.method || 'GET',
      corps: options.body && JSON.parse(options.body),
    };
    appels.push(appel);
    const r = o.reponse ? o.reponse(appel) : { status: 200, json: [] };
    return { ok: r.status < 400, status: r.status, json: async () => r.json };
  };
  const ecrit = [];
  const imprime = [];
  const iframes = [];
  const document = {
    getElementById: (id) => (id in champs ? champs[id] : null),
    querySelectorAll: (sel) =>
      sel === 'iframe.doc-impression' ? iframes.filter((f) => !f.retire) : [],
    createElement: () => {
      const f = {
        style: {},
        setAttribute() {},
        remove() {
          f.retire = true;
        },
        contentWindow: {
          focus() {},
          print() {
            imprime.push(f);
          },
        },
      };
      f.contentDocument = { open() {}, write: (h) => ecrit.push(h), close() {} };
      iframes.push(f);
      return f;
    },
    body: { appendChild() {} },
  };
  const corps = [
    'const SUPA_URL = "https://x.supabase.co";',
    'const ACTE_MONTANT_MAX_CENTS = 10000000;',
    'let _actesCache = __actes, _docListe = __liste, _docEdition = null, _docVue = null, _docApercu = false;',
    'let currentPatient = __patient; const praticiens = __prats;',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'const window = { _accessLevel: __acces }; const _accessPermetImpression = () => { const l = window._accessLevel; return !l || l === "full" || l === "readonly"; }; const showAccessRestrictedModal = (r) => __modales.push(r);',
    'const nav = () => {}; const selectPatient = (p) => { currentPatient = p; };',
    'const notifierEvenement = (t, o) => { __rendus.notifs = (__rendus.notifs || []).concat([[t, o]]); };',
    'const patients = [__patient]; async function renderDocumentsPage() { __rendus.push(1); } async function chargerActes() { return _actesCache; }',
    constBloc('REGIMES_REMBOURSEMENT'),
    ...[
      'MENTION_TVA_DEFAUT',
      'MODES_PAIEMENT',
      'FRANCHISE_ACTE_CENTS',
      'FRANCHISE_JOUR_MAX_CENTS',
      'DOC_LIGNES_MAX',
      '_chiffresSeuls',
      '_ENTETES_JSON',
      '_eur',
      '_CSS_BTN',
    ].map(constLigne),
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, MODES_PAIEMENT, MENTION_TVA_DEFAUT,
      etat: () => ({ edition: _docEdition, vue: _docVue, liste: _docListe, apercu: _docApercu }),
      setEdition: (v) => { _docEdition = v; }, setListe: (v) => { _docListe = v; } };`,
  ].join('\n');
  const rendus = [];
  const modales = [];
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function(
    'authFetch',
    'document',
    'alert',
    'confirm',
    '__actes',
    '__liste',
    '__patient',
    '__prats',
    '__rendus',
    '__acces',
    '__modales',
    corps
  )(
    authFetch,
    document,
    (m) => alertes.push(m),
    () => o.confirme !== false,
    ACTES.map((a) => ({ ...a })),
    o.liste || [],
    PATIENT,
    o.prats || [PRAT],
    rendus,
    o.acces,
    modales
  );
  return { f, appels, alertes, rendus, ecrit, imprime, iframes, modales };
}

const HARNAIS = monter();
const f0 = () => HARNAIS.f;
const L = (acte, qte = 1, prix) => ({
  ...HARNAIS.f._ligneDepuisActe(acte),
  qte,
  ...(prix !== undefined ? { prix_cents: prix } : {}),
});
const acte = (id) => ACTES.find((a) => a.id === id);

describe('totaux et remboursement indicatif', () => {
  const { f } = monter();
  const bilanEtSemelles = () => [L(acte('a-pod117')), L(acte('a-lpp'), 1, 15000)];
  it('bilan POD 1,17 + semelles à 150 € : lignes, Sécu sur la BASE (pas sur le prix), franchise, reste', () => {
    const c = f._calculerDocument(bilanEtSemelles(), 'standard', null);
    expect(c).toMatchObject({
      sousTotalCents: 18510,
      totalCents: 18510,
      baseTotal: 6314,
      secuTotal: 2106 + 1682,
      franchise: 100, // une seule franchise : la semelle (LPP) n'y est pas soumise
      secuNette: 3688,
      tmTotal: 1404 + 1122,
      horsBase: 12196,
      resteApresSecu: 14822,
    });
  });
  it('total fixé par le praticien (forfait) : remplace la somme, le détail des lignes reste', () => {
    const c = f._calculerDocument(bilanEtSemelles(), 'standard', 16000);
    expect(c.totalCents).toBe(16000);
    expect(c.sousTotalCents).toBe(18510);
    expect(c.horsBase).toBe(16000 - 6314);
    expect(f._calculerDocument(bilanEtSemelles(), 'standard', 0).totalCents).toBe(0);
  });
  it('ALD : 100 % de la base, ticket modérateur nul ; Alsace-Moselle 90 %', () => {
    const ald = f._calculerDocument(bilanEtSemelles(), 'ald', null);
    expect(ald).toMatchObject({ secuTotal: 6314, tmTotal: 0, franchise: 100, secuNette: 6214 });
    const am = f._calculerDocument([L(acte('a-pod1'))], 'alsace_moselle', null);
    expect(am).toMatchObject({ secuTotal: 2700, tmTotal: 300 });
  });
  it('quantité : la Sécu, le ticket modérateur et la franchise se multiplient', () => {
    const c = f._calculerDocument([L(acte('a-pod1'), 2)], 'standard', null);
    expect(c).toMatchObject({ totalCents: 6000, secuTotal: 3600, franchise: 200, secuNette: 3400 });
  });
  it('franchise plafonnée à 4 € par jour et jamais supérieure à la part Sécu', () => {
    expect(f._calculerDocument([L(acte('a-pod1'), 6)], 'standard', null).franchise).toBe(400);
    const petit = { ...acte('a-pod1'), id: 'p', base_remboursable_cents: 50, montant_cents: 50 };
    expect(f._calculerDocument([L(petit)], 'standard', null).franchise).toBe(30);
  });
  it('acte sans base (consultation libre) : tout est « hors base », aucun remboursement inventé', () => {
    const c = f._calculerDocument([L(acte('a-perso'))], 'standard', null);
    expect(c).toMatchObject({
      totalCents: 4550,
      baseTotal: 0,
      secuTotal: 0,
      franchise: 0,
      horsBase: 4550,
      resteApresSecu: 4550,
    });
  });
  it('quantité ou prix illisible (null) : compté pour 0, jamais NaN', () => {
    const c = f._calculerDocument(
      [
        { ...L(acte('a-pod1')), qte: null },
        { ...L(acte('a-pod1')), prix_cents: null },
      ],
      'standard',
      null
    );
    expect(Number.isNaN(c.totalCents)).toBe(false);
    expect(c.totalCents).toBe(0);
  });
  it('le forfait inférieur à la Sécu ne donne jamais un reste négatif', () => {
    expect(f._calculerDocument([L(acte('a-pod1'))], 'ald', 100).resteApresSecu).toBe(0);
  });
});

describe('validation', () => {
  const { f } = monter();
  const doc = (o = {}) => ({
    type: 'facture',
    patient_ref: '42',
    regime: 'standard',
    lignes: [L(acte('a-pod1'))],
    totalFixeCents: null,
    emetteur: f._emetteurDepuisPraticien(PRAT),
    ...o,
  });
  it('document valide : brouillon et émission', () => {
    expect(f._validerDocument(doc(), false)).toEqual({ ok: true });
    expect(f._validerDocument(doc(), true)).toEqual({ ok: true });
  });
  it('type, patient, régime, lignes : refusés avec un message', () => {
    for (const d of [
      doc({ type: 'avoir' }),
      doc({ patient_ref: '' }),
      doc({ regime: 'x' }),
      doc({ lignes: [] }),
      doc({ lignes: Array.from({ length: 51 }, () => L(acte('a-pod1'))) }),
    ]) {
      const r = f._validerDocument(d, false);
      expect(r.ok).toBe(false);
      expect(r.erreur).toBeTruthy();
    }
  });
  it('quantité (1 à 99), prix et titre invalides refusés', () => {
    for (const l of [
      { qte: 0 },
      { qte: 100 },
      { qte: null },
      { qte: 1.5 },
      { prix_cents: null },
      { prix_cents: -1 },
      { prix_cents: 10000001 },
      { libelle: ' ' },
      { libelle: 'x'.repeat(121) },
    ]) {
      expect(
        f._validerDocument(doc({ lignes: [{ ...L(acte('a-pod1')), ...l }] }), false).ok,
        JSON.stringify(l)
      ).toBe(false);
    }
    expect(
      f._validerDocument(doc({ lignes: [{ ...L(acte('a-pod1')), prix_cents: 0 }] }), false).ok
    ).toBe(true);
  });
  it('total fixé : entier borné ; total général ≤ 100 000 €', () => {
    expect(f._validerDocument(doc({ totalFixeCents: 15000 }), false).ok).toBe(true);
    expect(f._validerDocument(doc({ totalFixeCents: -1 }), false).ok).toBe(false);
    expect(f._validerDocument(doc({ totalFixeCents: 10000001 }), false).ok).toBe(false);
    expect(
      f._validerDocument(
        doc({ lignes: [{ ...L(acte('a-pod1'), 99), prix_cents: 9000000 }] }),
        false
      ).ok
    ).toBe(false);
  });
  it('émission : SIRET (14 chiffres) et RPPS (11) ou ADELI (9) obligatoires, pas pour un brouillon', () => {
    const sans = (o) => doc({ emetteur: { ...f._emetteurDepuisPraticien(PRAT), ...o } });
    expect(f._validerDocument(sans({ siret: '' }), true).erreur).toMatch(/SIRET/);
    expect(f._validerDocument(sans({ siret: '1234567890123' }), true).ok).toBe(false);
    expect(f._validerDocument(sans({ rpps: '' }), true).erreur).toMatch(/RPPS/);
    expect(f._validerDocument(sans({ rpps: '1234567890' }), true).ok).toBe(false);
    expect(f._validerDocument(sans({ rpps: '123456789' }), true).ok).toBe(true); // ADELI
    expect(f._validerDocument(sans({ siret: '', rpps: '' }), false).ok).toBe(true);
    expect(f._validerDocument(sans({ nom: '' }), false).ok).toBe(false);
  });
});

describe('instantanés et mentions', () => {
  const { f } = monter();
  it('émetteur : chiffres nettoyés (espaces, points, tirets), champs bornés', () => {
    const e = f._emetteurDepuisPraticien({
      ...PRAT,
      siret: '123.456 789-00012',
      rpps: ' 1000 1234567 ',
    });
    expect(e.siret).toBe('12345678900012');
    expect(e.rpps).toBe('10001234567');
    expect(f._emetteurDepuisPraticien({ nom: 'x'.repeat(500) }).nom).toHaveLength(120);
  });
  it('mention de TVA : celle du praticien, sinon la mention légale par défaut', () => {
    expect(f._mentionTva({})).toBe(f.MENTION_TVA_DEFAUT);
    expect(f.MENTION_TVA_DEFAUT).toMatch(/261-4-1°/);
    expect(f._mentionTva({ mentionTva: '  Autre mention  ' })).toBe('Autre mention');
  });
  it('ligne de base de données : instantané, patient_ref texte, jamais de user_id ni de numéro', () => {
    const etat = {
      type: 'devis',
      regime: 'ald',
      lignes: [L(acte('a-pod1'))],
      totalFixeCents: 2500,
      note: ' Merci ',
      devisNumero: null,
    };
    const row = f._ligneBaseDocument(etat, PATIENT, PRAT);
    expect(row).toMatchObject({
      type: 'devis',
      patient_ref: '42',
      regime: 'ald',
      total_fixe: true,
      total_cents: 2500,
      note: 'Merci',
      mention_tva: f.MENTION_TVA_DEFAUT,
      devis_numero: null,
    });
    expect(row.patient).toEqual({
      civilite: 'M.',
      nom: 'Martin',
      prenom: 'Paul',
      adresse: '2 rue Z',
      cp: '75001',
      ville: 'Paris',
    });
    expect(row.emetteur.siret).toBe('12345678900012');
    for (const k of ['user_id', 'numero', 'statut', 'emis_at', 'date_document'])
      expect(row).not.toHaveProperty(k);
    expect(row.lignes[0]).toMatchObject({
      libelle: 'Séance de soins',
      qte: 1,
      prix_cents: 3000,
      base_remboursable_cents: 3000,
      franchise: true,
    });
  });
  it('sans forfait : total_fixe faux et total = somme des lignes', () => {
    const row = f._ligneBaseDocument(
      { type: 'facture', regime: 'standard', lignes: [L(acte('a-pod1'), 2)], totalFixeCents: null },
      PATIENT,
      PRAT
    );
    expect(row).toMatchObject({ total_fixe: false, total_cents: 6000 });
  });
});

describe("tiers payant : le document n'indique que le montant dû par le patient", () => {
  const f = () => HARNAIS.f;
  const etat = (o = {}) => ({
    type: 'facture',
    regime: 'standard',
    lignes: [L(acte('a-pod117')), L(acte('a-lpp'))],
    totalFixeCents: 16000,
    ...o,
  });
  it('exemple : bilan + semelles, total 160 € : la Sécu paie 36,88 € (franchise déduite), le patient 123,12 €', () => {
    const row = f()._ligneBaseDocument(etat({ tiersPayant: true }), PATIENT, PRAT);
    expect(row).toMatchObject({ tiers_payant: true, part_secu_cents: 3688, total_cents: 16000 });
    expect(f()._netDocument(row)).toBe(12312);
  });
  it('sans tiers payant : part Sécu nulle, le patient paie le total', () => {
    for (const tp of [false, undefined]) {
      const row = f()._ligneBaseDocument(etat({ tiersPayant: tp }), PATIENT, PRAT);
      expect(row).toMatchObject({ tiers_payant: false, part_secu_cents: 0 });
      expect(f()._netDocument(row)).toBe(16000);
    }
  });
  it('ALD : seule la franchise de 1 € reste due par le patient', () => {
    const row = f()._ligneBaseDocument(
      etat({
        tiersPayant: true,
        regime: 'ald',
        lignes: [L(acte('a-pod117'))],
        totalFixeCents: null,
      }),
      PATIENT,
      PRAT
    );
    expect(row.part_secu_cents).toBe(3410);
    expect(f()._netDocument(row)).toBe(100);
  });
  it('total fixé inférieur à la part Sécu : la part est plafonnée au total, net jamais négatif', () => {
    const row = f()._ligneBaseDocument(
      etat({
        tiersPayant: true,
        regime: 'ald',
        lignes: [L(acte('a-pod117'))],
        totalFixeCents: 1000,
      }),
      PATIENT,
      PRAT
    );
    expect(row.part_secu_cents).toBe(1000);
    expect(f()._netDocument(row)).toBe(0);
  });
  it('acte non remboursable (consultation libre) : tiers payant sans effet, le patient paie tout', () => {
    const row = f()._ligneBaseDocument(
      etat({ tiersPayant: true, lignes: [L(acte('a-perso'))], totalFixeCents: null }),
      PATIENT,
      PRAT
    );
    expect(row.part_secu_cents).toBe(0);
    expect(f()._netDocument(row)).toBe(4550);
  });
  it("la case se coche dans l'éditeur, est enregistrée et reprise par le devis → facture", async () => {
    const reponse = (a) =>
      a.methode === 'POST' ? { status: 201, json: [{ id: 'd1' }] } : { status: 200, json: [] };
    const e = monter({ reponse });
    e.f.nouveauDocument('devis');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.modifierChampDocument('tiers', true);
    expect(e.f.etat().edition.tiersPayant).toBe(true);
    await e.f.enregistrerBrouillonDocument();
    expect(e.appels[0].corps).toMatchObject({ tiers_payant: true, part_secu_cents: 1700 });
    const devis = {
      id: 'dv',
      type: 'devis',
      statut: 'emis',
      numero: 'D-1',
      regime: 'standard',
      lignes: [L(acte('a-pod1'))],
      total_fixe: false,
      total_cents: 3000,
      tiers_payant: true,
      part_secu_cents: 1700,
      emetteur: { nom: 'Dr Fictif' },
    };
    const e2 = monter({ reponse, liste: [devis] });
    await e2.f.creerFactureDepuisDevis('dv');
    expect(e2.appels[0].corps).toMatchObject({ type: 'facture', tiers_payant: true });
  });
  it('document émis en tiers payant : total des actes, part Sécu déduite, NET à payer par le patient', () => {
    const d = {
      id: 'i',
      type: 'facture',
      statut: 'emis',
      numero: 'F-2026-0007',
      date_document: '2026-10-20',
      emetteur: { nom: 'Dr Fictif' },
      patient: { nom: 'Martin' },
      regime: 'standard',
      lignes: [L(acte('a-pod117')), { ...L(acte('a-lpp')) }],
      total_fixe: true,
      total_cents: 16000,
      tiers_payant: true,
      part_secu_cents: 3688,
      mention_tva: 'TVA non applicable',
    };
    const h = f()._htmlDocumentEmis(d);
    expect(h).toContain('Total des actes : 160,00');
    expect(h).toContain('(tiers payant) : − 36,88');
    expect(h).toContain('Net à payer par le patient : 123,12');
    expect(h).not.toContain('Total à payer :');
    const sans = f()._htmlDocumentEmis({ ...d, tiers_payant: false, part_secu_cents: 0 });
    expect(sans).toContain('Total à payer : 160,00');
    expect(sans).not.toContain('Net à payer');
  });
  it('liste : le montant affiché est celui du patient, avec la mention « tiers payant »', () => {
    const e = monter({
      liste: [
        {
          id: 'z',
          type: 'facture',
          statut: 'emis',
          numero: 'F-1',
          date_document: '2026-10-20',
          total_cents: 16000,
          part_secu_cents: 3688,
          tiers_payant: true,
        },
      ],
    });
    const h = e.f._htmlListeDocuments();
    expect(h).toContain('123,12');
    expect(h).toContain('tiers payant');
  });
});

describe('édition : cases à cocher, quantité, total à payer', () => {
  it('le premier acte coché reprend sa prise en charge par défaut ; ensuite le choix du praticien prime', () => {
    const e = monter();
    e.f.nouveauDocument('devis');
    expect(e.f.etat().edition.regime).toBe('standard');
    e.f.basculerActeDocument('a-c2s', true);
    expect(e.f.etat().edition.regime).toBe('c2s');
    e.f.modifierChampDocument('regime', 'ald');
    e.f.basculerActeDocument('a-pod1', true);
    expect(e.f.etat().edition.regime).toBe('ald');
  });
  it('cocher ajoute la ligne au tarif du catalogue ; décocher la retire ; doublon impossible', () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.basculerActeDocument('a-pod1', true);
    e.f.basculerActeDocument('a-lpp', true);
    expect(e.f.etat().edition.lignes.map((l) => [l.code, l.prix_cents])).toEqual([
      ['POD-1', 3000],
      ['LPP-2122121', 2804],
    ]);
    e.f.basculerActeDocument('a-pod1', false);
    expect(e.f.etat().edition.lignes.map((l) => l.code)).toEqual(['LPP-2122121']);
  });
  it("la quantité se modifie (1 à 99) ; illisible = null, refusée à l'enregistrement ; le tarif ne se modifie pas ligne par ligne", async () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.modifierLigneDocument(0, 'qte', '2');
    expect(e.f.etat().edition.lignes[0].qte).toBe(2);
    e.f.modifierLigneDocument(0, 'prix', '1');
    expect(e.f.etat().edition.lignes[0].prix_cents).toBe(3000);
    for (const q of ['0', '', 'a', '100', '1.5']) {
      e.f.modifierLigneDocument(0, 'qte', q);
      expect(e.f.etat().edition.lignes[0].qte, q).toBeNull();
    }
    await e.f.enregistrerBrouillonDocument();
    expect(e.alertes[0]).toMatch(/Quantité invalide/);
    expect(e.appels).toHaveLength(0);
  });
  it('total à payer : vide = somme des actes ; valeur = fixé par le praticien ; illisible signalé', () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    expect(e.f.etat().edition).toMatchObject({ totalFixeCents: null, totalIllisible: false });
    e.f.modifierTotalFixeDocument('45,50');
    expect(e.f.etat().edition).toMatchObject({ totalFixeCents: 4550, totalIllisible: false });
    e.f.modifierTotalFixeDocument('abc');
    expect(e.f.etat().edition).toMatchObject({ totalFixeCents: null, totalIllisible: true });
    e.f.modifierTotalFixeDocument('');
    expect(e.f.etat().edition).toMatchObject({ totalFixeCents: null, totalIllisible: false });
    e.f.modifierTotalFixeDocument('160');
    e.f.revenirALaSommeDocument();
    expect(e.f.etat().edition).toMatchObject({ totalFixeCents: null, totalIllisible: false });
  });
  it("un total illisible est refusé à l'enregistrement, jamais ignoré en silence", async () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.modifierTotalFixeDocument('abc');
    await e.f.enregistrerBrouillonDocument();
    expect(e.alertes[0]).toMatch(/Total des actes invalide/);
    expect(e.appels).toHaveLength(0);
  });
  it('total égal à la somme des actes : pas de « total fixé » ; différent : total_fixe', () => {
    const lignes = [L(acte('a-pod1'))];
    const base = { type: 'facture', regime: 'standard', lignes };
    expect(
      f0()._ligneBaseDocument({ ...base, totalFixeCents: 3000 }, PATIENT, PRAT).total_fixe
    ).toBe(false);
    expect(
      f0()._ligneBaseDocument({ ...base, totalFixeCents: 2500 }, PATIENT, PRAT).total_fixe
    ).toBe(true);
    expect(
      f0()._ligneBaseDocument({ ...base, totalFixeCents: null }, PATIENT, PRAT).total_fixe
    ).toBe(false);
  });
  it("FRAPPE DANS LE TOTAL : le champ n'est jamais réécrit (sinon un seul chiffre se tape) ; le résumé, si", () => {
    const ecritures = [];
    const input = {};
    Object.defineProperty(input, 'value', { get: () => '', set: (v) => ecritures.push(v) });
    const resume = { innerHTML: '' };
    const bouton = { style: {} };
    const champs = { 'doc-total-input': input, 'doc-resume': resume, 'doc-total-somme': bouton };
    const e = monter({ champs });
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    ecritures.length = 0;
    for (const saisie of ['1', '16', '160', '160,', '160,5']) e.f.modifierTotalFixeDocument(saisie);
    expect(ecritures).toEqual([]);
    expect(resume.innerHTML).toMatch(/Reste à charge avant mutuelle/);
    expect(bouton.style.display).toBe('');
  });
  it("le champ suit la somme des actes tant que rien n'est fixé, puis garde le montant du praticien", () => {
    const input = { value: '' };
    const champs = {
      'doc-total-input': input,
      'doc-resume': { innerHTML: '' },
      'doc-total-somme': { style: {} },
      'doc-lignes': { innerHTML: '' },
    };
    const e = monter({ champs });
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod117', true);
    expect(input.value).toBe('35,10');
    e.f.basculerActeDocument('a-lpp', true);
    expect(input.value).toBe('63,14');
    e.f.modifierTotalFixeDocument('160');
    e.f.basculerActeDocument('a-pod1', true);
    expect(input.value).toBe('160,00'); // le praticien a fixé : les actes ajoutés ne le changent pas
    e.f.revenirALaSommeDocument();
    expect(input.value).toBe('93,14');
  });
  it('le praticien par défaut est celui du patient ; changement de régime et de note pris en compte', () => {
    const e = monter({ prats: [{ ...PRAT, id: 1, nom: 'Autre' }, PRAT] });
    e.f.nouveauDocument('devis');
    expect(e.f.etat().edition.pratId).toBe(7);
    e.f.modifierChampDocument('regime', 'ald');
    e.f.modifierChampDocument('regime', 'inconnu');
    e.f.modifierChampDocument('note', 'Bonjour');
    expect(e.f.etat().edition).toMatchObject({ regime: 'ald', note: 'Bonjour' });
  });
});

describe('enregistrement, émission, suppression, règlement', () => {
  const brouillonPret = (e) => {
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod117', true);
    e.f.basculerActeDocument('a-lpp', true);
    e.f.modifierTotalFixeDocument('160');
  };
  const reponse = (a) => {
    if (a.methode === 'POST' && a.url.endsWith('rpc/emettre_document'))
      return { status: 200, json: { id: 'doc-1', statut: 'emis', numero: 'F-2026-0001' } };
    if (a.methode === 'POST') return { status: 201, json: [{ id: 'doc-1', statut: 'brouillon' }] };
    if (a.methode === 'PATCH') return { status: 200, json: [{ id: 'doc-1' }] };
    return { status: 200, json: [] };
  };
  it('brouillon : POST puis PATCH ciblé (id + statut brouillon) ; total et forfait enregistrés', async () => {
    const e = monter({ reponse });
    brouillonPret(e);
    await e.f.enregistrerBrouillonDocument();
    const post = e.appels.find((a) => a.methode === 'POST');
    expect(post.url).toMatch(/documents_facturation$/);
    expect(post.corps).toMatchObject({
      type: 'facture',
      total_fixe: true,
      total_cents: 16000,
      patient_ref: '42',
    });
    expect(post.corps.lignes).toHaveLength(2);
    expect(post.corps).not.toHaveProperty('user_id');
    await e.f.enregistrerBrouillonDocument();
    const patch = e.appels.find((a) => a.methode === 'PATCH');
    expect(patch.url).toMatch(/documents_facturation\?id=eq\.doc-1&statut=eq\.brouillon$/);
  });
  it('lignes invalides : alerte, aucun appel réseau', async () => {
    const e = monter({ reponse });
    e.f.nouveauDocument('facture');
    await e.f.enregistrerBrouillonDocument();
    expect(e.alertes[0]).toMatch(/au moins un acte/);
    expect(e.appels).toHaveLength(0);
  });
  it("émission : brouillon enregistré PUIS appel de la fonction de la base avec l'id (jamais de numéro côté navigateur)", async () => {
    const e = monter({ reponse });
    brouillonPret(e);
    await e.f.emettreDocumentCourant();
    const urls = e.appels.map(
      (a) => a.methode + ' ' + a.url.replace('https://x.supabase.co/rest/v1/', '')
    );
    expect(urls).toEqual(['POST documents_facturation', 'POST rpc/emettre_document']);
    expect(e.appels[1].corps).toEqual({ p_id: 'doc-1' });
    for (const a of e.appels) expect(JSON.stringify(a.corps)).not.toMatch(/"numero"|"statut"/);
    expect(e.f.etat()).toMatchObject({ edition: null, vue: 'doc-1' });
  });
  it('émission réussie : une notification « facture éditée » (numéro seulement) ; émission refusée : aucune', async () => {
    const e = monter({ reponse });
    brouillonPret(e);
    await e.f.emettreDocumentCourant();
    expect(e.rendus.notifs).toHaveLength(1);
    expect(e.rendus.notifs[0][0]).toMatch(/^(facture_editee|devis_emis)$/);
    expect(e.rendus.notifs[0][1].patientId).toBe(PATIENT.id);
    expect(e.rendus.notifs[0][1].documentId).toBe('doc-1');
    const r = monter({ reponse, prats: [{ ...PRAT, siret: '' }] });
    brouillonPret(r);
    await r.f.emettreDocumentCourant();
    expect(r.rendus.notifs).toBeUndefined();
  });
  it('émission refusée sans SIRET / RPPS : explication, aucun appel réseau', async () => {
    const e = monter({ reponse, prats: [{ ...PRAT, siret: '' }] });
    brouillonPret(e);
    await e.f.emettreDocumentCourant();
    expect(e.alertes[0]).toMatch(/SIRET/);
    expect(e.appels).toHaveLength(0);
  });
  it("émission annulée par le praticien (confirmation refusée) : rien n'est envoyé", async () => {
    const e = monter({ reponse, confirme: false });
    brouillonPret(e);
    await e.f.emettreDocumentCourant();
    expect(e.appels).toHaveLength(0);
  });
  it("échec de l'émission : message clair, le brouillon est conservé", async () => {
    const e = monter({
      reponse: (a) =>
        a.url.endsWith('rpc/emettre_document')
          ? { status: 400, json: { message: 'boom' } }
          : reponse(a),
    });
    brouillonPret(e);
    await e.f.emettreDocumentCourant();
    expect(e.alertes.at(-1)).toMatch(/Le brouillon est conservé/);
    expect(e.f.etat().vue).toBeNull();
  });
  it("suppression : brouillon seulement (filtre statut) ; jamais d'appel pour un document sans id", async () => {
    const e = monter({ reponse });
    brouillonPret(e);
    await e.f.enregistrerBrouillonDocument();
    await e.f.supprimerBrouillonDocument();
    const del = e.appels.find((a) => a.methode === 'DELETE');
    expect(del.url).toMatch(/\?id=eq\.doc-1&statut=eq\.brouillon$/);
    const e2 = monter({ reponse });
    e2.f.nouveauDocument('devis');
    await e2.f.supprimerBrouillonDocument();
    expect(e2.appels).toHaveLength(0);
  });
  it('règlement : PATCH ciblé facture émise, mode et date seulement ; mode ou date invalides refusés', async () => {
    const champs = {
      'doc-reglement-mode': { value: 'cheque' },
      'doc-reglement-date': { value: '2026-10-20' },
    };
    const e = monter({ reponse, champs });
    await e.f.enregistrerReglementDocument('doc-9');
    const p = e.appels[0];
    expect(p.url).toMatch(/\?id=eq\.doc-9&type=eq\.facture&statut=eq\.emis$/);
    expect(p.corps).toEqual({ paiement_mode: 'cheque', paiement_date: '2026-10-20' });
    for (const c of [
      { 'doc-reglement-mode': { value: 'bitcoin' }, 'doc-reglement-date': { value: '2026-10-20' } },
      { 'doc-reglement-mode': { value: 'carte' }, 'doc-reglement-date': { value: '20/10/2026' } },
      { 'doc-reglement-mode': { value: 'carte' }, 'doc-reglement-date': { value: '2026-13-45' } },
    ]) {
      const x = monter({ reponse, champs: c });
      await x.f.enregistrerReglementDocument('d');
      expect(x.appels).toHaveLength(0);
      expect(x.alertes).toHaveLength(1);
    }
  });
  it('facture depuis un devis émis : copie des lignes et du forfait, devis_numero, brouillon de type facture', async () => {
    const devis = {
      id: 'dv-1',
      type: 'devis',
      statut: 'emis',
      numero: 'D-2026-0003',
      regime: 'ald',
      lignes: [L(acte('a-pod1'))],
      total_fixe: true,
      total_cents: 2500,
      note: 'n',
      emetteur: { nom: 'Dr Fictif' },
    };
    const e = monter({ reponse, liste: [devis] });
    await e.f.creerFactureDepuisDevis('dv-1');
    const post = e.appels.find((a) => a.methode === 'POST');
    expect(post.corps).toMatchObject({
      type: 'facture',
      devis_numero: 'D-2026-0003',
      regime: 'ald',
      total_fixe: true,
      total_cents: 2500,
    });
    const brouillon = monter({ reponse, liste: [{ ...devis, statut: 'brouillon' }] });
    await brouillon.f.creerFactureDepuisDevis('dv-1');
    expect(brouillon.appels).toHaveLength(0);
  });
  it('un document émis ne se rouvre pas en édition (lecture seule) ; un brouillon se rouvre', () => {
    const liste = [
      {
        id: 'a',
        type: 'facture',
        statut: 'emis',
        numero: 'F-1',
        emetteur: {},
        lignes: [],
        regime: 'standard',
      },
      {
        id: 'b',
        type: 'facture',
        statut: 'brouillon',
        emetteur: { nom: 'Dr Fictif' },
        lignes: [L(acte('a-pod1'))],
        regime: 'ald',
        total_fixe: false,
        total_cents: 3000,
        note: null,
      },
    ];
    const e = monter({ liste });
    e.f.ouvrirDocument('a');
    expect(e.f.etat()).toMatchObject({ edition: null, vue: 'a' });
    e.f.ouvrirDocument('b');
    expect(e.f.etat().edition).toMatchObject({
      id: 'b',
      regime: 'ald',
      totalFixeCents: null,
      totalIllisible: false,
      pratId: 7,
    });
  });
  it('liste : seuls les documents du patient (filtre patient_ref) sont demandés', async () => {
    const e = monter({ reponse });
    await e.f.chargerDocuments(PATIENT);
    expect(e.appels[0].url).toMatch(/patient_ref=eq\.42$/);
  });
});

describe('affichage', () => {
  const doc = (o = {}) => ({
    id: 'i-1',
    type: 'facture',
    statut: 'emis',
    numero: 'F-2026-0001',
    date_document: '2026-10-20',
    emetteur: { nom: 'Dr <b>Fictif</b>', siret: '12345678900012', rpps: '10001234567' },
    patient: {
      civilite: 'M.',
      nom: 'Mar<script>x</script>tin',
      prenom: 'Paul',
      cp: '75001',
      ville: 'Paris',
    },
    regime: 'standard',
    lignes: [
      L(acte('a-pod117')),
      { ...L(acte('a-lpp')), prix_cents: 15000, libelle: 'Semelles <img src=x onerror=alert(1)>' },
    ],
    total_fixe: true,
    total_cents: 16000,
    mention_tva: 'TVA non applicable, article 261-4-1° du CGI',
    note: '<i>x</i>',
    ...o,
  });
  const { f } = monter();
  it('document émis : numéro, mention de TVA, détail ET total fixé, remboursement indicatif, HTML échappé', () => {
    const h = f._htmlDocumentEmis(doc());
    expect(h).toContain('FACTURE F-2026-0001');
    expect(h).toContain('20/10/2026');
    expect(h).toContain('TVA non applicable, article 261-4-1° du CGI');
    // lignes 35,10 + 150,00 = 185,10 € vendues 160 € : une ligne « Remise » de − 25,10 €
    expect(h).toContain('Remise (prix de l&#39;ensemble fixé par le praticien)');
    expect(h).toContain('− 25,10');
    expect(h).toContain('Tarif de convention 35,10');
    expect(h).toMatch(/Sécu 21,06[^<]*mutuelle 14,04/);
    expect(h).toContain('Non remboursé par la Sécurité sociale'.slice(0, 0));
    expect(h).toContain('160,00');
    expect(h).toContain('Remboursement estimé (indicatif)');
    expect(h).toContain('SIRET 12345678900012');
    expect(h).not.toMatch(/<script|<img|<b>Fictif|<i>x/);
    expect(h).toContain('&lt;script&gt;');
  });
  it('facture non réglée : formulaire de règlement ; réglée : mention « Acquittée »', () => {
    expect(f._htmlDocumentEmis(doc())).toMatch(/Facture non réglée[\s\S]*Enregistrer le règlement/);
    const h = f._htmlDocumentEmis(doc({ paiement_mode: 'carte', paiement_date: '2026-10-21' }));
    expect(h).toContain('Acquittée le 21/10/2026');
    expect(h).toContain('Carte bancaire');
  });
  it('devis : validité, bouton de création de facture, aucun formulaire de règlement', () => {
    const h = f._htmlDocumentEmis(
      doc({
        type: 'devis',
        numero: 'D-2026-0001',
        valide_jusqu_au: '2027-01-18',
        total_fixe: false,
        total_cents: 18510,
      })
    );
    expect(h).toContain('DEVIS D-2026-0001');
    expect(h).toContain("Valable jusqu'au 18/01/2027");
    expect(h).toContain('Créer la facture depuis ce devis');
    expect(h).not.toContain('doc-reglement-mode');
  });
  it('liste : brouillon sans numéro, facture réglée ou non', () => {
    const e = monter({
      liste: [
        doc({ id: 'x', paiement_mode: 'cheque', paiement_date: '2026-10-21' }),
        doc({
          id: 'y',
          numero: null,
          statut: 'brouillon',
          date_document: null,
          created_at: '2026-10-19T10:00:00Z',
        }),
      ],
    });
    const h = e.f._htmlListeDocuments();
    expect(h).toContain('réglée');
    expect(h).toContain('(brouillon)');
    expect(h).toContain('Voir');
    expect(h).toContain('Modifier');
  });
});

describe("écart entre le prix de l'ensemble et la somme des tarifs : une ligne explicite", () => {
  const f = () => HARNAIS.f;
  const lignesSemelles = () => [
    {
      ...L(acte('a-lpp')),
      prix_cents: 2886,
      base_remboursable_cents: 2886,
      libelle: 'Semelles > 37',
    },
    { ...L(acte('a-perso')), prix_cents: 9000, libelle: 'Bilan postural' },
  ];
  it('exemple du praticien : 28,86 + 90,00 = 118,86 € vendus 160 € → ligne « complément » de + 41,14 €, les lignes font 160 €', () => {
    const lignes = lignesSemelles();
    const e = f()._ecartTotalDocument(lignes, 16000, true);
    expect(e.cents).toBe(4114);
    expect(e.libelle).toMatch(/Complément d'honoraires/);
    const somme = f()._calculerDocument(lignes, 'standard', null).sousTotalCents;
    expect(somme + e.cents).toBe(16000);
  });
  it('total inférieur à la somme : ligne « Remise » négative ; total égal ou non fixé : aucune ligne', () => {
    const lignes = lignesSemelles();
    const r = f()._ecartTotalDocument(lignes, 10000, true);
    expect(r.cents).toBe(-1886);
    expect(r.libelle).toMatch(/^Remise/);
    expect(f()._ecartTotalDocument(lignes, 11886, true)).toBeNull();
    expect(f()._ecartTotalDocument(lignes, 16000, false)).toBeNull();
  });
  it('signe affiché : + 41,14 € / − 18,86 €', () => {
    expect(f()._eurSigne(4114)).toBe('+ 41,14\u00a0€');
    expect(f()._eurSigne(-1886)).toBe('− 18,86\u00a0€');
  });
  it('le document (émis et aperçu) montre la ligne de complément dans le tableau, au même format que les actes', () => {
    const d = {
      id: 'i',
      type: 'facture',
      statut: 'emis',
      numero: 'F-1',
      date_document: '2026-10-20',
      emetteur: { nom: 'x' },
      patient: { nom: 'y' },
      regime: 'standard',
      lignes: lignesSemelles(),
      total_fixe: true,
      total_cents: 16000,
      tiers_payant: true,
      part_secu_cents: 1632,
      mention_tva: 'm',
    };
    for (const h of [f()._htmlDocumentEmis(d), f()._htmlCorpsDocument(d, true)]) {
      expect(h).toContain(
        'Complément d&#39;honoraires (prix de l&#39;ensemble fixé par le praticien)'
      );
      expect(h).toContain('+ 41,14');
      expect(h).toContain('Total des actes : 160,00');
      expect(h).not.toContain('Somme des actes');
    }
    const sans = f()._htmlDocumentEmis({
      ...d,
      total_fixe: false,
      total_cents: 11886,
      tiers_payant: false,
      part_secu_cents: 0,
    });
    expect(sans).not.toContain('Complément d&#39;honoraires');
  });
  it("l'éditeur annonce la ligne de complément dès que le total est fixé", () => {
    const resume = { innerHTML: '' };
    const e = monter({ champs: { 'doc-resume': resume, 'doc-total-somme': { style: {} } } });
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-lpp', true);
    e.f.basculerActeDocument('a-perso', true);
    e.f.modifierTotalFixeDocument('160');
    expect(resume.innerHTML).toContain('Complément d&#39;honoraires');
    expect(resume.innerHTML).toMatch(/il figurera sur une ligne du document/);
    e.f.revenirALaSommeDocument();
    expect(resume.innerHTML).not.toContain('Complément d&#39;honoraires');
  });
});

describe("impression d'un document émis (facture ou devis)", () => {
  const emis = (o = {}) => ({
    id: 'e1',
    type: 'facture',
    statut: 'emis',
    numero: 'F-2026-0007',
    date_document: '2026-10-20',
    emetteur: { nom: 'Dr <b>Fictif</b>', siret: '12345678900012', rpps: '10001234567' },
    patient: { nom: 'Martin', prenom: 'Paul' },
    regime: 'standard',
    lignes: [L(acte('a-lpp')), { ...L(acte('a-perso')), prix_cents: 9000 }],
    total_fixe: true,
    total_cents: 16000,
    tiers_payant: true,
    part_secu_cents: 1632,
    mention_tva: 'TVA non applicable, article 261-4-1° du CGI',
    ...o,
  });
  it('le bouton « 🖨 Imprimer » est sur la facture émise ET sur le devis émis, avec le bon identifiant', () => {
    for (const d of [emis(), emis({ id: 'd9', type: 'devis', numero: 'D-2026-0002' })]) {
      const h = f0()._htmlDocumentEmis(d);
      expect(h).toContain("imprimerDocument('" + d.id + "')");
      expect(h).toContain('🖨 Imprimer');
    }
  });
  it("ni l'éditeur ni l'aperçu d'un brouillon n'ont de bouton imprimer (rien n'est émis)", () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    expect(e.f._htmlEditeurDocument()).not.toContain('imprimerDocument');
    e.f.visualiserBrouillonDocument();
    expect(e.f._htmlApercuDocument()).not.toContain('imprimerDocument');
  });
  it("page imprimée : même contenu que l'écran, fond blanc, A4, titre = nom du fichier PDF, sans bouton ni formulaire de règlement", () => {
    const d = emis();
    const h = f0()._htmlPageImpressionDocument(d);
    expect(h).toContain('<title>Facture F-2026-0007</title>');
    expect(h).toContain('@page{size:A4');
    expect(h).toContain('background:#fff');
    expect(h).toContain('FACTURE F-2026-0007');
    expect(h).toContain('Net à payer par le patient');
    expect(h).toContain('Complément d&#39;honoraires');
    expect(h).toContain('TVA non applicable');
    expect(h).toContain('SIRET 12345678900012');
    expect(h).not.toMatch(/<button|<select|doc-reglement|Retour à la liste|APERÇU/);
    expect(h).not.toContain('<b>Fictif</b>');
    // variables du thème redéfinies : l'iframe n'hérite de rien
    for (const v of ['--bord', '--mut', '--txt']) expect(h).toContain(v + ':');
    // une seule carte, bien fermée
    expect((h.match(/<div/g) || []).length).toBe((h.match(/<\/div>/g) || []).length);
  });
  it('titre du devis ; titre échappé', () => {
    expect(
      f0()._htmlPageImpressionDocument(emis({ type: 'devis', numero: 'D-2026-0002' }))
    ).toContain('<title>Devis D-2026-0002</title>');
    expect(f0()._htmlPageImpressionDocument(emis({ numero: 'F<x>' }))).toContain(
      '<title>Facture F&lt;x&gt;</title>'
    );
  });
  it("imprimerDocument : écrit la page dans un iframe caché puis lance l'impression", async () => {
    const e = monter({ liste: [emis()] });
    e.f.imprimerDocument('e1');
    await new Promise((r) => setTimeout(r, 400));
    expect(e.ecrit).toHaveLength(1);
    expect(e.ecrit[0]).toContain('FACTURE F-2026-0007');
    expect(e.imprime).toHaveLength(1);
    expect(e.iframes[0].style.cssText).toMatch(/width:0;height:0/);
  });
  it("un second clic remplace l'iframe précédent (pas d'accumulation)", async () => {
    const e = monter({ liste: [emis()] });
    e.f.imprimerDocument('e1');
    e.f.imprimerDocument('e1');
    await new Promise((r) => setTimeout(r, 400));
    expect(e.iframes.filter((f) => !f.retire)).toHaveLength(1);
  });
  it("brouillon, identifiant inconnu : rien n'est imprimé", async () => {
    const e = monter({ liste: [emis({ id: 'b1', statut: 'brouillon', numero: null })] });
    e.f.imprimerDocument('b1');
    e.f.imprimerDocument('inconnu');
    await new Promise((r) => setTimeout(r, 400));
    expect(e.ecrit).toHaveLength(0);
    expect(e.imprime).toHaveLength(0);
  });
  it("l'impression d'un document ÉMIS n'est jamais refusée : abonné actif, ancien abonné (lecture seule) et compte bloqué", async () => {
    for (const acces of [undefined, 'full', 'readonly', 'blocked']) {
      const e = monter({ liste: [emis()], acces });
      e.f.imprimerDocument('e1');
      await new Promise((r) => setTimeout(r, 400));
      expect(e.imprime, String(acces)).toHaveLength(1);
      expect(e.modales, String(acces)).toEqual([]);
    }
  });
});

describe('aperçu du brouillon : ce que recevra le patient, avant émission', () => {
  const preparer = (o = {}) => {
    const e = monter(o);
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod117', true);
    e.f.basculerActeDocument('a-lpp', true);
    e.f.modifierTotalFixeDocument('160');
    e.f.modifierChampDocument('tiers', true);
    return e;
  };
  it("le bouton « Visualiser le brouillon » est dans l'éditeur ; « Émettre » n'y est plus (on émet depuis l'aperçu)", () => {
    const e = preparer();
    const h = e.f._htmlEditeurDocument();
    expect(h).toContain('visualiserBrouillonDocument()');
    expect(h).toContain('Visualiser le brouillon');
    expect(h).not.toContain('emettreDocumentCourant()');
  });
  it('aperçu : mention « APERÇU », numéro non attribué, mêmes montants que le document émis', () => {
    const e = preparer();
    e.f.visualiserBrouillonDocument();
    expect(e.f.etat().apercu).toBe(true);
    const h = e.f._htmlApercuDocument();
    expect(h).toContain('APERÇU — brouillon non émis');
    expect(h).toContain("numéro attribué à l'émission");
    expect(h).toContain('id="doc-apercu"');
    expect(h).toContain('Total des actes : 160,00');
    expect(h).toContain('− 36,88');
    expect(h).toContain('Net à payer par le patient : 123,12');
    expect(h).toContain('TVA non applicable');
    expect(h).toContain('Tarif de convention 35,10');
    expect(h).toContain('Modifier le brouillon');
    expect(h).toContain('Valider et émettre cette facture');
    expect(h).not.toMatch(/FACTURE F-/);
  });
  it('le devis annonce sa validité de 90 jours sans date inventée', () => {
    const e = monter();
    e.f.nouveauDocument('devis');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.visualiserBrouillonDocument();
    const h = e.f._htmlApercuDocument();
    expect(h).toContain('DEVIS');
    expect(h).toContain("Valable 90 jours à partir de l'émission");
    expect(h).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
  it('balises équilibrées : une seule carte, bien fermée (aperçu et document émis)', () => {
    const e = preparer();
    e.f.visualiserBrouillonDocument();
    const compte = (h, t) => [
      (h.match(new RegExp('<' + t + '[ >]', 'g')) || []).length,
      (h.match(new RegExp('</' + t + '>', 'g')) || []).length,
    ];
    for (const h of [
      e.f._htmlApercuDocument(),
      e.f._htmlDocumentEmis({
        id: 'i',
        type: 'facture',
        statut: 'emis',
        numero: 'F-1',
        date_document: '2026-10-20',
        emetteur: { nom: 'x' },
        patient: { nom: 'y' },
        regime: 'standard',
        lignes: [L(acte('a-pod1'))],
        total_cents: 3000,
        mention_tva: 'm',
      }),
    ]) {
      const [o, c] = compte(h, 'div');
      expect(o).toBe(c);
      expect(h.match(/class="card"/g)).toHaveLength(1);
    }
  });
  it('document incomplet (sans SIRET ni RPPS) : aperçu possible, ce qui manque est affiché, « émettre » désactivé', () => {
    const e = preparer({ prats: [{ ...PRAT, siret: '', rpps: '' }] });
    e.f.visualiserBrouillonDocument();
    expect(e.f.etat().apercu).toBe(true);
    const h = e.f._htmlApercuDocument();
    expect(h).toContain('Pour émettre, il manque');
    expect(h).toContain('SIRET');
    expect(h).toMatch(/<button[^>]*disabled[^>]*>✓ Valider et émettre/);
  });
  it("document complet : « Valider et émettre » actif, sans message d'erreur", () => {
    const e = preparer();
    e.f.visualiserBrouillonDocument();
    const h = e.f._htmlApercuDocument();
    expect(h).not.toContain('Pour émettre, il manque');
    expect(h).not.toMatch(/<button[^>]*disabled/);
  });
  it('aperçu refusé (alerte, rien ne change) si le brouillon est invalide : aucun acte, total illisible', () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.visualiserBrouillonDocument();
    expect(e.alertes[0]).toMatch(/au moins un acte/);
    expect(e.f.etat().apercu).toBe(false);
    e.f.basculerActeDocument('a-pod1', true);
    e.f.modifierTotalFixeDocument('abc');
    e.f.visualiserBrouillonDocument();
    expect(e.alertes[1]).toMatch(/Total des actes invalide/);
    expect(e.f.etat().apercu).toBe(false);
  });
  it("l'aperçu n'écrit rien (aucun appel réseau) ; « Modifier » retrouve le brouillon intact", () => {
    const e = preparer();
    const avant = JSON.stringify(e.f.etat().edition);
    e.f.visualiserBrouillonDocument();
    e.f.fermerApercuDocument();
    expect(e.appels).toHaveLength(0);
    expect(e.f.etat().apercu).toBe(false);
    expect(JSON.stringify(e.f.etat().edition)).toBe(avant);
  });
  it("l'aperçu est quitté par un nouveau document, la fermeture et l'ouverture d'un autre", () => {
    const e = preparer({
      liste: [
        {
          id: 'b',
          type: 'facture',
          statut: 'brouillon',
          emetteur: { nom: 'Dr Fictif' },
          lignes: [L(acte('a-pod1'))],
          regime: 'standard',
          total_cents: 3000,
        },
      ],
    });
    e.f.visualiserBrouillonDocument();
    e.f.fermerDocument();
    expect(e.f.etat().apercu).toBe(false);
    e.f.visualiserBrouillonDocument();
    e.f.nouveauDocument('devis');
    expect(e.f.etat().apercu).toBe(false);
    e.f.basculerActeDocument('a-pod1', true);
    e.f.visualiserBrouillonDocument();
    e.f.ouvrirDocument('b');
    expect(e.f.etat().apercu).toBe(false);
  });
  it("l'émission depuis l'aperçu : même parcours qu'avant (brouillon enregistré puis fonction de la base)", async () => {
    const reponse = (a) => {
      if (a.url.endsWith('rpc/emettre_document'))
        return { status: 200, json: { id: 'd1', statut: 'emis', numero: 'F-2026-0001' } };
      return { status: 201, json: [{ id: 'd1' }] };
    };
    const e = preparer({ reponse });
    e.f.visualiserBrouillonDocument();
    await e.f.emettreDocumentCourant();
    expect(e.appels.map((a) => a.methode + ' ' + a.url.split('/rest/v1/')[1])).toEqual([
      'POST documents_facturation',
      'POST rpc/emettre_document',
    ]);
    expect(e.f.etat()).toMatchObject({ edition: null, vue: 'd1', apercu: false });
  });
  it("la page affiche l'aperçu tant que le brouillon est en aperçu (branchement du rendu)", () => {
    const rendu = fonction('renderDocumentsPage');
    expect(rendu).toContain('_docEdition && _docApercu');
    expect(rendu).toContain('_htmlApercuDocument()');
  });
});

describe('abonnement terminé : consulter et imprimer, ne plus créer', () => {
  const emis = (o = {}) => ({
    id: 'e1',
    type: 'facture',
    statut: 'emis',
    numero: 'F-2026-0007',
    date_document: '2026-10-20',
    emetteur: { nom: 'Dr Fictif' },
    patient: { nom: 'Martin', prenom: 'Paul' },
    regime: 'standard',
    lignes: [L(acte('a-pod1'))],
    total_fixe: false,
    total_cents: 3000,
    tiers_payant: false,
    part_secu_cents: 0,
    mention_tva: 'm',
    ...o,
  });
  const brouillon = {
    id: 'b1',
    type: 'facture',
    statut: 'brouillon',
    emetteur: { nom: 'Dr Fictif' },
    lignes: [L(acte('a-pod1'))],
    regime: 'standard',
    total_cents: 3000,
  };
  it('niveaux autorisés à créer : abonné actif (ou niveau inconnu historique) ; refusés : lecture seule, bloqué, en chargement', () => {
    const ok = (acces) => monter({ acces }).f._accessPermetCreationDocument();
    expect(ok(undefined)).toBe(true);
    expect(ok('full')).toBe(true);
    for (const n of ['readonly', 'blocked', 'loading']) expect(ok(n), n).toBe(false);
  });
  it('ancien abonné (lecture seule) : nouveau devis, nouvelle facture, brouillon, enregistrement, émission, facture depuis devis refusés', async () => {
    const devis = emis({ id: 'dv', type: 'devis', numero: 'D-1' });
    const e = monter({ acces: 'readonly', liste: [brouillon, devis] });
    e.f.nouveauDocument('devis');
    e.f.nouveauDocument('facture');
    e.f.ouvrirDocument('b1');
    await e.f.creerFactureDepuisDevis('dv');
    e.f.setEdition({
      id: null,
      type: 'facture',
      pratId: 7,
      regime: 'standard',
      lignes: [L(acte('a-pod1'))],
      totalFixeCents: null,
      totalIllisible: false,
      note: '',
    });
    await e.f.enregistrerBrouillonDocument();
    await e.f.emettreDocumentCourant();
    expect(e.modales).toEqual(Array(6).fill('create_document'));
    expect(e.appels).toHaveLength(0);
  });
  it("compte bloqué : mêmes refus (le bouton n'est de toute façon pas atteignable)", () => {
    const e = monter({ acces: 'blocked' });
    e.f.nouveauDocument('facture');
    expect(e.modales).toEqual(['create_document']);
    expect(e.f.etat().edition).toBeNull();
  });
  it('ancien abonné : peut OUVRIR un document émis et enregistrer un règlement sur une facture émise', async () => {
    const champs = {
      'doc-reglement-mode': { value: 'virement' },
      'doc-reglement-date': { value: '2026-10-21' },
    };
    const e = monter({
      acces: 'readonly',
      liste: [emis()],
      champs,
      reponse: () => ({ status: 200, json: [] }),
    });
    e.f.ouvrirDocument('e1');
    expect(e.f.etat().vue).toBe('e1');
    await e.f.enregistrerReglementDocument('e1');
    expect(e.appels[0].corps).toEqual({ paiement_mode: 'virement', paiement_date: '2026-10-21' });
    expect(e.modales).toEqual([]);
  });
  it('abonné actif : rien ne change (création possible)', () => {
    const e = monter({ acces: 'full' });
    e.f.nouveauDocument('facture');
    expect(e.modales).toEqual([]);
    expect(e.f.etat().edition).not.toBeNull();
  });
  it('page des documents : boutons « + Nouveau » seulement pour un abonné actif, sinon un message explicite', () => {
    const src = fonction('renderDocumentsPage');
    expect(src).toContain('_accessPermetCreationDocument()');
    expect(src).toContain('Votre abonnement est terminé');
    expect(src).toContain('consulter et imprimer');
    expect(src).toContain("window._accessLevel === 'readonly'");
  });
  it('fenêtre de refus : intitulé « Création de devis et de factures »', () => {
    expect(fonction('showAccessRestrictedModal')).toContain(
      "create_document: 'Création de devis et de factures'"
    );
  });
  it("récupération depuis l'écran bloqué : liste de TOUS les documents émis du compte (aucun filtre patient), triés du plus récent", async () => {
    const e = monter({ reponse: () => ({ status: 200, json: [emis()] }) });
    await e.f.chargerDocumentsEmis();
    expect(e.appels[0].url).toMatch(
      /documents_facturation\?select=\*&statut=eq\.emis&order=emis_at\.desc$/
    );
    expect(e.appels[0].url).not.toContain('patient_ref');
  });
  it('liste de récupération : numéro, date, patient, net à payer, bouton imprimer ; HTML échappé ; vide = message', () => {
    const h = monter().f._htmlRecuperationDocuments([
      emis(),
      emis({
        id: 'x2',
        type: 'devis',
        numero: 'D-1',
        patient: { nom: '<b>X</b>', prenom: 'Y' },
        tiers_payant: true,
        part_secu_cents: 1800,
      }),
    ]);
    expect(h).toContain('Facture F-2026-0007');
    expect(h).toContain('Devis D-1');
    expect(h).toContain('20/10/2026');
    expect(h).toContain('Paul Martin');
    expect(h).toContain('12,00');
    expect(h).toContain("imprimerDocument('e1')");
    expect(h).not.toContain('<b>X</b>');
    expect(monter().f._htmlRecuperationDocuments([])).toContain('Aucun document émis');
  });
  it("ouvrirRecuperationDocuments : charge puis affiche la liste ; en cas d'échec, message clair", async () => {
    const e = monter({ reponse: () => ({ status: 200, json: [emis()] }) });
    await e.f.ouvrirRecuperationDocuments();
    const modale = e.iframes.at(-1);
    expect(modale.id).toBe('modal-recuperation-documents');
    expect(modale.style.display).toBe('flex');
    expect(modale.innerHTML).toContain('Facture F-2026-0007');
    const ko = monter({ reponse: () => ({ status: 500, json: { message: 'panne' } }) });
    await ko.f.ouvrirRecuperationDocuments();
    expect(ko.iframes.at(-1).innerHTML).toMatch(/Documents indisponibles \(panne\)/);
  });
  it("fenêtre d'abonnement terminé : bloc « Récupérer mes données » (essai expiré, ancien abonné), jamais quand le compte est illisible", () => {
    const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
    expect(html).toContain('id="overlay-recuperation"');
    expect(html).toContain('onclick="ouvrirRecuperationDocuments()"');
    const essai = (cause) => {
      const bloc = { style: { display: 'none' } };
      const wrapper = { children: [{}, { textContent: '' }, { textContent: '' }] };
      const overlay = { style: {}, firstElementChild: wrapper };
      const e = monter({
        champs: { 'trial-expired-overlay': overlay, 'overlay-recuperation': bloc },
      });
      e.f._showAccessOverlay({ cause });
      return bloc.style.display;
    };
    expect(essai('trial_expired')).toBe('');
    expect(essai('subscription_ended')).toBe('');
    expect(essai('never_paid')).toBe('none');
    expect(essai('donnees_indisponibles')).toBe('none');
    expect(essai('inconnue')).toBe('none');
  });
});

describe('coordonnées bancaires du praticien (IBAN, BIC) sur les devis et factures', () => {
  const f = () => HARNAIS.f;
  const IBAN = 'FR76 3000 6000 0112 3456 7890 189';
  it("clé de contrôle IBAN : exemples publics valides acceptés, une erreur d'un chiffre refusée", () => {
    for (const ok of [
      IBAN,
      'fr76300060000112345678901 89',
      'GB82 WEST 1234 5698 7654 32',
      'DE89 3704 0044 0532 0130 00',
    ])
      expect(f()._ibanValide(ok), ok).toBe(true);
    for (const ko of [
      'FR76 3000 6000 0112 3456 7890 188',
      'FR76',
      '',
      'XX00',
      '1234 5678',
      'FR76 3000 6000 0112 3456 7890 18!',
    ])
      expect(f()._ibanValide(ko), ko).toBe(false);
  });
  it('BIC : 8 ou 11 caractères', () => {
    for (const ok of ['BNPAFRPP', 'bnpafrpp', 'BNPAFRPPXXX'])
      expect(f()._bicValide(ok), ok).toBe(true);
    for (const ko of ['', 'BNPAFR', 'BNPAFRPPX', '1234FRPP', 'BNPA1RPP'])
      expect(f()._bicValide(ko), ko).toBe(false);
  });
  it('affichage en groupes de quatre ; normalisation (espaces, minuscules)', () => {
    expect(f()._formaterIban('fr7630006000011234567890189')).toBe(
      'FR76 3000 6000 0112 3456 7890 189'
    );
    expect(f()._normaliserIban(' fr76 3000 ')).toBe('FR763000');
  });
  it('message de la fiche praticien : IBAN faux, BIC faux, BIC sans IBAN ; rien ou tout bon : aucune erreur', () => {
    expect(f()._erreurCoordonneesBancaires(IBAN, 'BNPAFRPP')).toBeNull();
    expect(f()._erreurCoordonneesBancaires('', '')).toBeNull();
    expect(f()._erreurCoordonneesBancaires(IBAN, '')).toBeNull();
    expect(f()._erreurCoordonneesBancaires('FR76 3000 6000 0112 3456 7890 188', '')).toMatch(
      /IBAN invalide/
    );
    expect(f()._erreurCoordonneesBancaires(IBAN, 'XX')).toMatch(/BIC invalide/);
    expect(f()._erreurCoordonneesBancaires('', 'BNPAFRPP')).toMatch(/BIC sans IBAN/);
  });
  it("l'émetteur copié dans le document porte l'IBAN et le BIC normalisés", () => {
    const e = f()._emetteurDepuisPraticien({
      ...PRAT,
      iban: IBAN.toLowerCase(),
      bic: ' bnpafrpp ',
    });
    expect(e.iban).toBe('FR7630006000011234567890189');
    expect(e.bic).toBe('BNPAFRPP');
    expect(f()._emetteurDepuisPraticien(PRAT)).toMatchObject({ iban: '', bic: '' });
  });
  it('validation du document : coordonnées bancaires fausses refusées (brouillon comme émission) ; absentes acceptées', () => {
    const doc = (o) => ({
      type: 'facture',
      patient_ref: '42',
      regime: 'standard',
      lignes: [L(acte('a-pod1'))],
      emetteur: { ...f()._emetteurDepuisPraticien(PRAT), ...o },
    });
    expect(f()._validerDocument(doc({}), true).ok).toBe(true);
    expect(
      f()._validerDocument(doc({ iban: IBAN.replace(/ /g, ''), bic: 'BNPAFRPP' }), true).ok
    ).toBe(true);
    for (const pour of [false, true]) {
      const r = f()._validerDocument(doc({ iban: 'FR7630006000011234567890188' }), pour);
      expect(r.ok).toBe(false);
      expect(r.erreur).toMatch(/IBAN invalide/);
    }
  });
  it('devis ET facture (émis et aperçu) affichent « Règlement par virement » avec IBAN groupé et BIC ; sans IBAN, rien', () => {
    const base = {
      id: 'i',
      statut: 'emis',
      numero: 'N-1',
      date_document: '2026-10-20',
      patient: { nom: 'y' },
      regime: 'standard',
      lignes: [L(acte('a-pod1'))],
      total_cents: 3000,
      mention_tva: 'm',
    };
    const avec = {
      ...base.emetteur,
      nom: 'Dr',
      iban: 'FR7630006000011234567890189',
      bic: 'BNPAFRPP',
    };
    for (const type of ['facture', 'devis']) {
      const d = { ...base, type, emetteur: avec };
      for (const h of [
        f()._htmlDocumentEmis(d),
        f()._htmlCorpsDocument(d, true),
        f()._htmlPageImpressionDocument(d),
      ]) {
        expect(h, type).toContain('Règlement par virement');
        expect(h, type).toContain('IBAN FR76 3000 6000 0112 3456 7890 189');
        expect(h, type).toContain('BIC BNPAFRPP');
      }
    }
    const sans = f()._htmlDocumentEmis({ ...base, type: 'facture', emetteur: { nom: 'Dr' } });
    expect(sans).not.toContain('Règlement par virement');
    const sansBic = f()._htmlDocumentEmis({
      ...base,
      type: 'facture',
      emetteur: { nom: 'Dr', iban: 'FR7630006000011234567890189' },
    });
    expect(sansBic).toContain('IBAN FR76');
    expect(sansBic).not.toContain('BIC');
  });
  it("l'IBAN affiché est échappé", () => {
    const h = f()._htmlDocumentEmis({
      id: 'i',
      type: 'facture',
      statut: 'emis',
      numero: 'N',
      patient: {},
      regime: 'standard',
      lignes: [L(acte('a-pod1'))],
      total_cents: 3000,
      mention_tva: 'm',
      emetteur: { nom: 'Dr', iban: '<script>x</script>' },
    });
    expect(h).not.toContain('<script>');
  });
  it('la fiche praticien : champs IBAN et BIC, enregistrés, rechargés et contrôlés avant sauvegarde', () => {
    const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
    for (const id of ['pr-iban', 'pr-bic']) {
      expect(html, id).toContain(`id="${id}"`);
      expect(fonction('createPraticien'), id).toContain(id);
      expect(fonction('editPraticien'), id).toContain(id);
      expect(fonction('saveEditPraticien'), id).toContain(id);
    }
    for (const n of ['createPraticien', 'saveEditPraticien']) {
      expect(fonction(n), n).toContain('_erreurCoordonneesBancaires(');
      expect(fonction(n), n).toContain('if (errBanque) { alert(errBanque); return; }');
    }
  });
});

describe('migration SQL du tiers payant', () => {
  const sql = readFileSync(
    join(RACINE, 'supabase/migrations/facturation-tiers-payant.sql'),
    'utf8'
  );
  it('colonnes, contrainte de cohérence, net calculé par la base, idempotente', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS tiers_payant boolean NOT NULL DEFAULT false/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS part_secu_cents integer NOT NULL DEFAULT 0/);
    expect(sql).toMatch(
      /part_secu_cents <= total_cents AND \(tiers_payant OR part_secu_cents = 0\)/
    );
    expect(sql).toMatch(
      /net_cents integer GENERATED ALWAYS AS \(total_cents - part_secu_cents\) STORED/
    );
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS documents_tiers_payant_coherent/);
  });
  it("tiers payant et part Sécu rejoignent les champs figés d'un document émis", () => {
    expect(sql).toMatch(/NEW\.tiers_payant <> OLD\.tiers_payant/);
    expect(sql).toMatch(/NEW\.part_secu_cents <> OLD\.part_secu_cents/);
    expect(sql).toContain("current_setting('verticy.emission', true)");
    expect(sql).toContain('seul le règlement peut être modifié');
  });
});

describe('migration SQL, formulaire praticien et branchement', () => {
  const sql = readFileSync(join(RACINE, 'supabase/migrations/facturation-documents.sql'), 'utf8');
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  it('RLS, aucune policy anonyme, insertion en brouillon sans numéro, suppression des brouillons seulement', () => {
    expect(sql).toMatch(/ALTER TABLE public\.documents_facturation ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(
      /insert_own[\s\S]*WITH CHECK \(auth\.uid\(\) = user_id AND statut = 'brouillon' AND numero IS NULL\)/
    );
    expect(sql).toMatch(
      /delete_brouillon_own[\s\S]*USING \(auth\.uid\(\) = user_id AND statut = 'brouillon'\)/
    );
    expect(sql).toMatch(/REVOKE ALL ON public\.documents_facturation FROM anon/);
    expect(sql).not.toMatch(/TO anon/);
  });
  it('numérotation : compteurs inaccessibles, fonction SECURITY DEFINER à search_path figé, exécution refusée à anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.documents_numerotation FROM anon, authenticated/);
    expect(sql).toMatch(/emettre_document[\s\S]*SECURITY DEFINER SET search_path = public/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.emettre_document\(uuid\) FROM PUBLIC, anon/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.emettre_document\(uuid\) TO authenticated/
    );
    expect(sql).toMatch(/UNIQUE INDEX IF NOT EXISTS documents_user_numero_uniq/);
    expect(sql).toContain("lpad(v_n::text, 4, '0')");
    expect(sql).toMatch(/'D'[\s\S]*'F'/);
  });
  it('garde : document émis figé, émission impossible à la main, patient sans clé étrangère', () => {
    expect(sql).toContain("current_setting('verticy.emission', true)");
    expect(sql).toContain('seul le règlement peut être modifié');
    expect(sql).toMatch(/patient_ref\s+text NOT NULL/);
    expect(sql).not.toMatch(/REFERENCES public\.patients/);
    expect(sql).toMatch(/documents_statut_numero CHECK/);
    expect(sql).toMatch(/documents_paiement_facture_emise CHECK/);
    for (const col of [
      'lignes',
      'patient',
      'emetteur',
      'total_cents',
      'mention_tva',
      'numero',
      'date_document',
    ])
      expect(sql, col).toMatch(new RegExp(`NEW\\.${col}\\s+(IS DISTINCT FROM|<>) OLD\\.${col}`));
  });
  it('formulaire praticien : SIRET, RPPS/ADELI et mention de TVA, enregistrés à la création et à la modification', () => {
    for (const id of ['pr-siret', 'pr-rpps', 'pr-mention-tva']) {
      expect(html, id).toContain(`id="${id}"`);
      expect(fonction('createPraticien'), id).toContain(id);
      expect(fonction('editPraticien'), id).toContain(id);
      expect(fonction('saveEditPraticien'), id).toContain(id);
    }
  });
  it('page des documents, bouton « 🧾 » par patient, ouverture par nav', () => {
    expect(html).toContain('id="pg-documents"');
    expect(html).toContain('id="documents-contenu"');
    expect(fonction('renderPatientList')).toContain('ouvrirDocumentsPatient(${i})');
    expect(fonction('nav')).toContain("id === 'pg-documents'");
    expect(fonction('nav')).toContain("'pg-documents':'tn-patients'");
  });
});
