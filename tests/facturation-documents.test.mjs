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
  'basculerTotalFixeDocument',
  'modifierChampDocument',
  '_preparerDocument',
  'enregistrerBrouillonDocument',
  'emettreDocumentCourant',
  'supprimerBrouillonDocument',
  'enregistrerReglementDocument',
  'creerFactureDepuisDevis',
  'ouvrirDocumentsPatient',
  '_htmlDocumentEmis',
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
  const document = {
    getElementById: (id) => (id in champs ? champs[id] : null),
    querySelectorAll: () => [],
  };
  const corps = [
    'const SUPA_URL = "https://x.supabase.co";',
    'const ACTE_MONTANT_MAX_CENTS = 10000000;',
    'let _actesCache = __actes, _docListe = __liste, _docEdition = null, _docVue = null;',
    'let currentPatient = __patient; const praticiens = __prats;',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'const nav = () => {}; const selectPatient = (p) => { currentPatient = p; };',
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
      etat: () => ({ edition: _docEdition, vue: _docVue, liste: _docListe }),
      setEdition: (v) => { _docEdition = v; }, setListe: (v) => { _docListe = v; } };`,
  ].join('\n');
  const rendus = [];
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
    rendus
  );
  return { f, appels, alertes, rendus };
}

const HARNAIS = monter();
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

describe('édition : cases à cocher, lignes, forfait', () => {
  it('cocher ajoute la ligne au prix du catalogue ; décocher la retire ; doublon impossible', () => {
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
  it("le prix de la ligne est modifiable par le praticien ; illisible = null, refusé à l'enregistrement", () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-lpp', true);
    e.f.modifierLigneDocument(0, 'prix', '150');
    expect(e.f.etat().edition.lignes[0].prix_cents).toBe(15000);
    e.f.modifierLigneDocument(0, 'prix', '15x');
    expect(e.f.etat().edition.lignes[0].prix_cents).toBeNull();
    e.f.modifierLigneDocument(0, 'qte', '2');
    expect(e.f.etat().edition.lignes[0].qte).toBe(2);
    for (const q of ['0', '', 'a', '100', '1.5']) {
      e.f.modifierLigneDocument(0, 'qte', q);
      expect(e.f.etat().edition.lignes[0].qte, q).toBeNull();
    }
  });
  it('forfait : coché il reprend la somme des lignes ; décoché il revient à la somme ; saisie illisible = null', () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.basculerTotalFixeDocument(true);
    expect(e.f.etat().edition).toMatchObject({ forfait: true, totalFixeCents: 3000 });
    e.f.modifierTotalFixeDocument('45,50');
    expect(e.f.etat().edition.totalFixeCents).toBe(4550);
    e.f.modifierTotalFixeDocument('abc');
    expect(e.f.etat().edition.totalFixeCents).toBeNull();
    e.f.basculerTotalFixeDocument(false);
    expect(e.f.etat().edition).toMatchObject({ forfait: false, totalFixeCents: null });
  });
  it('un forfait coché dont le total est illisible est refusé, jamais ignoré en silence', async () => {
    const e = monter();
    e.f.nouveauDocument('facture');
    e.f.basculerActeDocument('a-pod1', true);
    e.f.basculerTotalFixeDocument(true);
    e.f.modifierTotalFixeDocument('abc');
    await e.f.enregistrerBrouillonDocument();
    expect(e.alertes[0]).toMatch(/Total fixé invalide/);
    expect(e.appels).toHaveLength(0);
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
    e.f.modifierLigneDocument(1, 'prix', '150');
    e.f.basculerTotalFixeDocument(true);
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
    expect(e.f.etat().edition).toMatchObject({ id: 'b', regime: 'ald', forfait: false, pratId: 7 });
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
    expect(h).toContain('Total des lignes');
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
