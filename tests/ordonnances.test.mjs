// ═══════════════════════════════════════════════════════════
// Ordonnances du podologue — modèles réutilisables et ordonnances par patient
// ═══════════════════════════════════════════════════════════
// Fonctions EXTRAITES de js/biomeca.js ; aucun réseau. Données FICTIVES.

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
  '_ordoSansAccent',
  '_ordoDateValide',
  '_ordoAujourdhui',
  '_ordoVariables',
  '_ordoOrigineTropAncienne',
  '_alertesOrdonnance',
  '_ordoEmetteur',
  '_ordoPatientInstantane',
  '_ordoLignesNettoyees',
  '_ordonnanceDepuisEtat',
  '_validerOrdonnance',
  '_ordoSignature',
  '_ordoPraticienParId',
  '_ordoPraticienParDefaut',
  '_ordoModelesDe',
  '_ordoCible',
  'nouvelleOrdonnance',
  'modifierOrdonnance',
  'dupliquerOrdonnance',
  'fermerOrdonnance',
  'voirOrdonnance',
  'supprimerOrdonnance',
  'modifierChampOrdonnance',
  'modifierLigneOrdonnance',
  'ajouterLigneOrdonnance',
  'retirerLigneOrdonnance',
  '_majAlertesOrdonnance',
  '_htmlAlertesOrdonnance',
  'appliquerModeleOrdonnance',
  '_ordoRecordCourant',
  'visualiserOrdonnance',
  'fermerApercuOrdonnance',
  'enregistrerOrdonnance',
  'ouvrirModelesOrdonnance',
  'nouveauModeleOrdonnance',
  'modifierModeleOrdonnance',
  '_validerModeleOrdonnance',
  'enregistrerModeleOrdonnance',
  'supprimerModeleOrdonnance',
  'annulerModeleOrdonnance',
  '_htmlLignesOrdonnance',
  '_htmlProduitsOrdonnance',
  'ajouterProduitOrdonnance',
  '_htmlTypeOrdonnance',
  '_htmlRenouvellementOrdonnance',
  '_htmlEditeurOrdonnance',
  '_htmlCorpsOrdonnance',
  '_htmlApercuOrdonnance',
  '_htmlOrdonnanceEnregistree',
  '_htmlListeOrdonnances',
  '_htmlListeModelesOrdonnance',
  '_htmlEditeurModeleOrdonnance',
  'renderOrdonnancesPage',
  '_htmlPageImpressionOrdonnance',
  'imprimerOrdonnance',
  '_accessPermetCreationDocument',
  '_dateFr',
  '_emetteurDepuisPraticien',
  '_praticienParDefaut',
  '_normaliserIban',
];
const CONSTS = [
  'ORDO_LIGNES_MAX',
  'ORDO_TEXTE_MAX',
  'ORDO_DUREE_MAX',
  'ORDO_MODELES_MAX',
  'ORDO_RENOUV_ANS',
  '_ORDO_RE_DIABETIQUE',
  '_ORDO_RE_ANTI_INFL',
  '_ORDO_RE_HORS_COMPETENCE',
  '_CSS_BTN',
  '_chiffresSeuls',
];

function monter(o = {}) {
  const alertes = [];
  const modales = [];
  const sauvegardes = { patients: 0, praticiens: 0 };
  const ecrit = [];
  const imprime = [];
  const champs = {};
  const sortie = { html: '' };
  const document = {
    getElementById: (id) => {
      if (id === 'ordonnances-contenu') {
        return {
          set innerHTML(v) {
            sortie.html = v;
          },
          get innerHTML() {
            return sortie.html;
          },
        };
      }
      return id in champs ? champs[id] : null;
    },
    querySelectorAll: () => [],
    createElement: () => {
      const f = {
        style: {},
        setAttribute() {},
        remove() {},
        contentWindow: {
          focus() {},
          print() {
            imprime.push(1);
          },
        },
      };
      f.contentDocument = { open() {}, write: (h) => ecrit.push(h), close() {} };
      return f;
    },
    body: { appendChild() {} },
  };
  const corps = [
    'let currentPatient = __patient; const praticiens = __prats; const patients = [__patient];',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'let _ordoEdition = null, _ordoApercu = false, _ordoVueId = null, _ordoModeles = false, _ordoModele = null;',
    'const window = { _accessLevel: __acces };',
    'const nav = () => {}; const selectPatient = (p) => { currentPatient = p; };',
    'const showAccessRestrictedModal = (r) => __modales.push(r);',
    'const savePatients = () => { __sauv.patients++; return __sauvOk(); };',
    'const savePraticiens = () => { __sauv.praticiens++; };',
    'const notifierEvenement = (t, o) => { (__sauv.notifs = __sauv.notifs || []).push([t, o]); };',
    'const confirm = (m) => __confirm(m);',
    constBloc('ORDO_CATEGORIES'),
    ...CONSTS.map(constLigne),
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, ORDO_CATEGORIES,
      etat: () => ({ edition: _ordoEdition, vueId: _ordoVueId, modele: _ordoModele, modeles: _ordoModeles, apercu: _ordoApercu }),
      patient: () => currentPatient };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function(
    'document',
    'alert',
    '__patient',
    '__prats',
    '__acces',
    '__modales',
    '__sauv',
    '__sauvOk',
    '__confirm',
    corps
  )(
    document,
    (m) => alertes.push(m),
    o.patient || {
      id: 42,
      civilite: 'M.',
      nom: 'Martin',
      prenom: 'Paul',
      ddn: '1980-02-03',
      pratId: 7,
    },
    o.prats || [
      {
        id: 7,
        nom: 'Dr Fictif',
        titre: 'Pédicure-podologue',
        cabinet: 'Cabinet Test',
        adresse: '1 rue de Test, 75000 Paris',
        tel: '0100000000',
        email: 'fictif@example.test',
        siret: '12345678900012',
        rpps: '10001234567',
        iban: 'FR7630006000011234567890189',
        bic: 'AGRIFRPP',
      },
    ],
    o.acces,
    modales,
    sauvegardes,
    o.sauvOk || (() => true),
    o.confirm || (() => true)
  );
  return { f, alertes, modales, sauvegardes, ecrit, imprime, sortie };
}
const CHAMPS = (f) => ({ texte: f.etat().edition.lignes[0].texte });

function saisir(f, o = {}) {
  f.nouvelleOrdonnance();
  const e = f.etat().edition;
  e.categorie = o.categorie || 'topiques';
  e.lignes = o.lignes || [{ texte: 'Solution antiseptique, matin et soir', duree: '15 jours' }];
  if (o.renouv) Object.assign(e.renouv, o.renouv);
  if (o.date) e.date = o.date;
  return e;
}

describe('utilitaires', () => {
  const { f } = monter();
  it('variables {nom} {prenom} {date}', () => {
    expect(
      f._ordoVariables(
        'Pour {prenom} {nom} le {date}',
        { nom: 'Martin', prenom: 'Paul' },
        '2026-10-21'
      )
    ).toBe('Pour Paul Martin le 21/10/2026');
    expect(f._ordoVariables('x {date}', {}, 'pas-une-date')).toBe('x ');
  });
  it('date valide : rejette le 31 février', () => {
    expect(f._ordoDateValide('2026-02-28')).toBe(true);
    expect(f._ordoDateValide('2026-02-31')).toBe(false);
    expect(f._ordoDateValide('')).toBe(false);
  });
  it("ordonnance d'origine : 3 ans pile = trop ancienne, la veille = valable", () => {
    expect(f._ordoOrigineTropAncienne('2023-10-21', '2026-10-21')).toBe(true);
    expect(f._ordoOrigineTropAncienne('2023-10-22', '2026-10-21')).toBe(false);
    expect(f._ordoOrigineTropAncienne('', '2026-10-21')).toBe(false);
  });
});

describe('avertissements (jamais bloquants)', () => {
  const { f } = monter();
  const al = (lignes, categorie = 'topiques', renouv = {}, date = '2026-10-21') =>
    f._alertesOrdonnance({
      categorie,
      date,
      lignes,
      renouv: { dateOrigine: '', medecin: '', informe: true, exclu: false, ...renouv },
    });
  it('texte courant autorisé : aucune alerte', () => {
    expect(al([{ texte: 'Solution antiseptique, matin et soir', duree: '15 jours' }])).toEqual([]);
    expect(
      al([{ texte: 'Compresses stériles de gaze hydrophile', duree: '2 boîtes' }], 'pansements')
    ).toEqual([]);
    expect(al([{ texte: 'Orthèses plantaires, 1 paire', duree: '' }], 'appareillages')).toEqual([]);
  });
  it('hors compétence : médicament par voie générale, imagerie, arrêt de travail…', () => {
    for (const t of [
      'Amoxicilline antibiotique 1 g',
      'Paracétamol comprimé',
      'Radiographie du pied',
      'IRM de la cheville',
      'Arrêt de travail 3 jours',
      'Séances de kinésithérapie',
      'Prise de sang',
    ]) {
      expect(al([{ texte: t, duree: '' }]).join(' '), t).toContain('hors du champ du podologue');
    }
  });
  it('pansement diabétique : renouvellement et pose seulement', () => {
    for (const t of [
      'hydrocolloïde',
      'Charbon actif',
      'tulle vaseliné',
      'hydrofibre',
      'Hydrogel',
      'alginate de calcium',
    ]) {
      expect(al([{ texte: t, duree: '' }], 'pansements').join(' '), t).toContain('diabétique');
    }
  });
  it('anti-inflammatoire : seulement local, hallux valgus et ongle incarné', () => {
    expect(al([{ texte: 'Gel anti-inflammatoire local', duree: '' }]).join(' ')).toContain(
      'hallux valgus'
    );
  });
  it('renouvellement : date manquante, trop ancienne, exclusion, médecin non informé', () => {
    expect(al([{ texte: 'Orthèses', duree: '' }], 'renouvellement', {}).join(' ')).toContain(
      "date de l'ordonnance médicale d'origine"
    );
    expect(
      al([{ texte: 'Orthèses', duree: '' }], 'renouvellement', { dateOrigine: '2023-01-01' }).join(
        ' '
      )
    ).toContain("n'est pas possible");
    expect(
      al([{ texte: 'Orthèses', duree: '' }], 'renouvellement', {
        dateOrigine: '2025-01-01',
        exclu: true,
      }).join(' ')
    ).toContain('exclu le renouvellement');
    expect(
      al([{ texte: 'Orthèses', duree: '' }], 'renouvellement', {
        dateOrigine: '2025-01-01',
        informe: false,
      }).join(' ')
    ).toContain('doit être informé');
    expect(
      al([{ texte: 'Orthèses', duree: '' }], 'renouvellement', { dateOrigine: '2025-01-01' })
    ).toEqual([]);
  });
});

describe('validation et copie figée', () => {
  it('refuse : pas de RPPS, pas de ligne, date invalide, ligne vide, type inconnu', () => {
    const { f } = monter();
    const e = saisir(f);
    const ok = f._ordonnanceDepuisEtat(e, f.patient(), f._ordoPraticienParId(7));
    expect(f._validerOrdonnance(ok).ok).toBe(true);
    expect(
      f._validerOrdonnance({ ...ok, emetteur: { ...ok.emetteur, rpps: '' } }).erreur
    ).toContain('RPPS');
    expect(f._validerOrdonnance({ ...ok, lignes: [] }).erreur).toContain('au moins une ligne');
    expect(f._validerOrdonnance({ ...ok, date: '2026-13-01' }).erreur).toContain('Date');
    expect(f._validerOrdonnance({ ...ok, categorie: 'ordonnance-libre' }).erreur).toContain('type');
    expect(
      f._validerOrdonnance({ ...ok, lignes: [{ texte: 'x'.repeat(301), duree: '' }] }).erreur
    ).toContain('300');
    expect(f._validerOrdonnance({ ...ok, emetteur: { ...ok.emetteur, nom: '' } }).erreur).toContain(
      'praticien'
    );
  });
  it('la copie ne contient ni SIRET ni coordonnées bancaires', () => {
    const { f } = monter();
    const e = saisir(f);
    const o = f._ordonnanceDepuisEtat(e, f.patient(), f._ordoPraticienParId(7));
    const txt = JSON.stringify(o);
    expect(txt).not.toContain('12345678900012');
    expect(txt).not.toContain('FR76');
    expect(txt).not.toContain('AGRIFRPP');
    expect(o.emetteur.rpps).toBe('10001234567');
  });
  it("variables résolues à l'enregistrement", () => {
    const { f } = monter();
    const e = saisir(f, {
      lignes: [{ texte: 'Pour {prenom} {nom}, début le {date}', duree: '' }],
      date: '2026-10-21',
    });
    const o = f._ordonnanceDepuisEtat(e, f.patient(), f._ordoPraticienParId(7));
    expect(o.lignes[0].texte).toBe('Pour Paul Martin, début le 21/10/2026');
  });
});

describe('enregistrement', () => {
  it('enregistre dans le dossier du patient, sauvegarde une fois', () => {
    const { f, sauvegardes, alertes } = monter({ acces: 'full' });
    saisir(f);
    f.enregistrerOrdonnance(false);
    expect(alertes).toEqual([]);
    expect(f.patient().ordonnances).toHaveLength(1);
    expect(sauvegardes.patients).toBe(1);
    expect(f.etat().edition).toBe(null);
    expect(f.etat().vueId).toBe(f.patient().ordonnances[0].id);
  });
  it('une NOUVELLE ordonnance crée une notification (patient seulement) ; une modification, un échec : aucune', () => {
    const { f, sauvegardes } = monter({ acces: 'full' });
    saisir(f);
    f.enregistrerOrdonnance(false);
    expect(sauvegardes.notifs).toEqual([
      [
        'ordonnance_creee',
        { patientId: f.patient().id, ordonnanceId: f.patient().ordonnances[0].id },
      ],
    ]);
    const id = f.patient().ordonnances[0].id;
    f.modifierOrdonnance(id);
    f.enregistrerOrdonnance(false);
    expect(sauvegardes.notifs).toHaveLength(1);
    const e = monter({ acces: 'full', sauvOk: () => false });
    saisir(e.f);
    e.f.enregistrerOrdonnance(false);
    expect(e.sauvegardes.notifs).toBeUndefined();
  });
  it('modifier une ordonnance enregistrée la remplace (pas de doublon)', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f);
    f.enregistrerOrdonnance(false);
    const id = f.patient().ordonnances[0].id;
    f.modifierOrdonnance(id);
    f.etat().edition.lignes[0].texte = 'Autre texte';
    f.enregistrerOrdonnance(false);
    expect(f.patient().ordonnances).toHaveLength(1);
    expect(f.patient().ordonnances[0].lignes[0].texte).toBe('Autre texte');
    expect(f.patient().ordonnances[0].id).toBe(id);
  });
  it('échec de la sauvegarde : mémoire remise comme avant, message clair', () => {
    const { f, alertes } = monter({ acces: 'full', sauvOk: () => false });
    saisir(f);
    f.enregistrerOrdonnance(false);
    expect(f.patient().ordonnances).toBeUndefined();
    expect(alertes.join(' ')).toContain('non enregistrée');
    expect(f.etat().edition).not.toBe(null);
  });
  it('échec sur un dossier qui avait déjà des ordonnances : la liste précédente est restaurée', () => {
    const m = monter({ acces: 'full' });
    saisir(m.f);
    m.f.enregistrerOrdonnance(false);
    const avant = m.f.patient().ordonnances;
    const m2 = monter({
      acces: 'full',
      sauvOk: () => false,
      patient: { id: 1, nom: 'Durand', prenom: 'Léa', ordonnances: avant },
    });
    saisir(m2.f);
    m2.f.enregistrerOrdonnance(false);
    expect(m2.f.patient().ordonnances).toEqual(avant);
    expect(m2.f.patient().ordonnances).toHaveLength(1);
  });
  it("abonnement terminé : création refusée (fenêtre), rien n'est écrit", () => {
    const { f, modales, sauvegardes } = monter({ acces: 'readonly' });
    f.nouvelleOrdonnance();
    expect(modales).toEqual(['create_ordonnance']);
    expect(f.etat().edition).toBe(null);
    expect(sauvegardes.patients).toBe(0);
  });
  it("abonnement terminé : une ordonnance déjà enregistrée se consulte et s'imprime", () => {
    const m = monter({ acces: 'full' });
    saisir(m.f);
    m.f.enregistrerOrdonnance(false);
    const p = m.f.patient();
    const ro = monter({ acces: 'readonly', patient: p });
    ro.f.voirOrdonnance(p.ordonnances[0].id);
    ro.f.renderOrdonnancesPage();
    expect(ro.sortie.html).toContain('ORDONNANCE');
    ro.f.imprimerOrdonnance(p.ordonnances[0].id);
    return new Promise((r) => setTimeout(r, 400)).then(() => {
      expect(ro.imprime).toHaveLength(1);
      expect(ro.sauvegardes.patients).toBe(0);
    });
  });
  it('suppression : confirmation obligatoire, annulée = rien ne change', () => {
    const { f, sauvegardes } = monter({ acces: 'full', confirm: () => false });
    saisir(f);
    f.enregistrerOrdonnance(false);
    const n = sauvegardes.patients;
    f.supprimerOrdonnance(f.patient().ordonnances[0].id);
    expect(f.patient().ordonnances).toHaveLength(1);
    expect(sauvegardes.patients).toBe(n);
  });
  it('suppression confirmée : retirée et sauvegardée', () => {
    const { f, sauvegardes } = monter({ acces: 'full' });
    saisir(f);
    f.enregistrerOrdonnance(false);
    const n = sauvegardes.patients;
    f.supprimerOrdonnance(f.patient().ordonnances[0].id);
    expect(f.patient().ordonnances).toHaveLength(0);
    expect(sauvegardes.patients).toBe(n + 1);
  });
  it('dupliquer : mêmes lignes, date du jour, médecin non informé', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, {
      categorie: 'renouvellement',
      lignes: [{ texte: 'Orthèses plantaires', duree: '1 paire' }],
      renouv: { dateOrigine: '2025-06-01', medecin: 'Dr X', informe: true },
      date: '2026-01-05',
    });
    f.enregistrerOrdonnance(false);
    f.dupliquerOrdonnance(f.patient().ordonnances[0].id);
    const e = f.etat().edition;
    expect(e.id).toBe(null);
    expect(e.categorie).toBe('renouvellement');
    expect(e.lignes[0].texte).toBe('Orthèses plantaires');
    expect(e.renouv.informe).toBe(false);
    expect(e.renouv.dateOrigine).toBe('2025-06-01');
    expect(e.date).not.toBe('2026-01-05');
  });
});

describe('modèles réutilisables', () => {
  it('créer un modèle : enregistré sur le praticien, sauvegardé', () => {
    const { f, sauvegardes } = monter({ acces: 'full' });
    f.ouvrirModelesOrdonnance();
    f.nouveauModeleOrdonnance(false);
    const m = f.etat().modele;
    m.titre = 'Soin antiseptique';
    m.categorie = 'topiques';
    m.lignes = [{ texte: 'Antiseptique pour {nom}', duree: '10 jours' }];
    f.enregistrerModeleOrdonnance();
    const pr = f._ordoPraticienParId(7);
    expect(pr.modelesOrdonnance).toHaveLength(1);
    expect(pr.modelesOrdonnance[0].titre).toBe('Soin antiseptique');
    expect(sauvegardes.praticiens).toBe(1);
    expect(f.etat().modele).toBe(null);
  });
  it('un modèle sans nom ou sans ligne est refusé', () => {
    const { f, alertes, sauvegardes } = monter({ acces: 'full' });
    f.nouveauModeleOrdonnance(false);
    f.enregistrerModeleOrdonnance();
    expect(alertes.join(' ')).toContain('nom au modèle');
    f.etat().modele.titre = 'X';
    f.etat().modele.lignes = [{ texte: '', duree: '' }];
    f.enregistrerModeleOrdonnance();
    expect(alertes.join(' ')).toContain('au moins une ligne');
    expect(sauvegardes.praticiens).toBe(0);
  });
  it('appliquer un modèle : type, lignes et variables du patient', () => {
    const { f } = monter({ acces: 'full' });
    f.nouveauModeleOrdonnance(false);
    Object.assign(f.etat().modele, {
      titre: 'M',
      categorie: 'pansements',
      lignes: [{ texte: 'Compresses pour {prenom} {nom}', duree: '2 boîtes' }],
    });
    f.enregistrerModeleOrdonnance();
    f.nouvelleOrdonnance();
    f.appliquerModeleOrdonnance(f._ordoPraticienParId(7).modelesOrdonnance[0].id);
    const e = f.etat().edition;
    expect(e.categorie).toBe('pansements');
    expect(e.lignes).toEqual([{ texte: 'Compresses pour Paul Martin', duree: '2 boîtes' }]);
  });
  it('« enregistrer comme modèle » depuis une ordonnance en cours', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, {
      lignes: [
        { texte: 'Solution A', duree: '5 j' },
        { texte: '', duree: '' },
      ],
    });
    f.nouveauModeleOrdonnance(true);
    expect(f.etat().modele.lignes).toEqual([{ texte: 'Solution A', duree: '5 j' }]);
    f.etat().modele.titre = 'A';
    f.enregistrerModeleOrdonnance();
    expect(f._ordoPraticienParId(7).modelesOrdonnance).toHaveLength(1);
    expect(f.etat().edition).not.toBe(null); // retour à l'ordonnance en cours
    expect(f.etat().modeles).toBe(false);
  });
  it('supprimer un modèle : confirmation, ordonnances existantes inchangées', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f);
    f.enregistrerOrdonnance(false);
    f.nouveauModeleOrdonnance(false);
    Object.assign(f.etat().modele, { titre: 'M', lignes: [{ texte: 'a', duree: '' }] });
    f.enregistrerModeleOrdonnance();
    const id = f._ordoPraticienParId(7).modelesOrdonnance[0].id;
    f.supprimerModeleOrdonnance(id);
    expect(f._ordoPraticienParId(7).modelesOrdonnance).toHaveLength(0);
    expect(f.patient().ordonnances).toHaveLength(1);
  });
  it('abonnement terminé : aucun modèle créé', () => {
    const { f, modales, sauvegardes } = monter({ acces: 'blocked' });
    f.nouveauModeleOrdonnance(false);
    expect(modales).toEqual(['create_ordonnance']);
    expect(sauvegardes.praticiens).toBe(0);
  });
});

describe('document imprimé', () => {
  const rendu = (o = {}, apercu = false) => {
    const { f } = monter({ acces: 'full' });
    const e = saisir(f, o);
    const rec = f._ordonnanceDepuisEtat(e, f.patient(), f._ordoPraticienParId(7));
    return { f, rec, html: f._htmlCorpsOrdonnance(rec, apercu) };
  };
  it('mentions de base : praticien, RPPS, date, patient, signature', () => {
    const { html } = rendu({ date: '2026-10-21' });
    expect(html).toContain('Dr Fictif');
    expect(html).toContain('RPPS / ADELI 10001234567');
    expect(html).toContain('21/10/2026');
    expect(html).toContain('Paul Martin');
    expect(html).toContain('03/02/1980');
    expect(html).toContain('Signature et cachet');
    expect(html).toContain('ORDONNANCE');
  });
  it('phrase de remboursement selon le type', () => {
    expect(rendu({ categorie: 'topiques' }).html).toContain('liste des médicaments remboursables');
    expect(rendu({ categorie: 'pansements' }).html).toContain('inscrit à la LPP');
    expect(rendu({ categorie: 'appareillages' }).html).not.toContain('Remboursé seulement');
  });
  it("renouvellement : date d'origine, médecin, information du médecin", () => {
    const { html } = rendu({
      categorie: 'renouvellement',
      renouv: { dateOrigine: '2025-06-01', medecin: 'Dr Fictif Bis', informe: true },
    });
    expect(html).toContain('Renouvellement de la prescription médicale');
    expect(html).toContain('01/06/2025');
    expect(html).toContain('Dr Fictif Bis');
    expect(html).toContain('est informé');
  });
  it('échappe le HTML saisi', () => {
    const { html } = rendu({ lignes: [{ texte: '<script>alert(1)</script>', duree: '<b>x</b>' }] });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('aperçu : bandeau « non enregistrée » ; version enregistrée : sans bandeau', () => {
    expect(rendu({}, true).html).toContain('APERÇU');
    expect(rendu({}, false).html).not.toContain('APERÇU');
  });
  it("page d'impression : A4, fond blanc, titre daté pour le nom du PDF", () => {
    const { f, rec } = rendu({ date: '2026-10-21' });
    const h = f._htmlPageImpressionOrdonnance(rec);
    expect(h).toContain('@page{size:A4');
    expect(h).toContain('<title>Ordonnance 21/10/2026</title>');
    expect(h).toContain('ORDONNANCE');
    expect(h).not.toContain('APERÇU');
  });
  it("liste : la plus récente d'abord", () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, { date: '2026-01-01', lignes: [{ texte: 'Ancienne', duree: '' }] });
    f.enregistrerOrdonnance(false);
    saisir(f, { date: '2026-06-01', lignes: [{ texte: 'Récente', duree: '' }] });
    f.enregistrerOrdonnance(false);
    const h = f._htmlListeOrdonnances();
    expect(h.indexOf('Récente')).toBeLessThan(h.indexOf('Ancienne'));
  });
});

describe('câblage et garde-fous', () => {
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  const bloc = SRC_BIOMECA.slice(
    SRC_BIOMECA.indexOf('// Ordonnances du podologue'),
    SRC_BIOMECA.indexOf('// ===== STRIPE + MODULES =====')
  );
  it('page, bouton par patient et ouverture par nav', () => {
    expect(html).toContain('id="pg-ordonnances"');
    expect(html).toContain('class="page page-claire" id="pg-ordonnances"');
    expect(html).toContain('id="ordonnances-contenu"');
    expect(fonction('renderPatientList')).toContain('ouvrirOrdonnancesPatient(${i})');
    expect(fonction('nav')).toContain("id === 'pg-ordonnances'");
    expect(fonction('nav')).toContain("'pg-ordonnances':'tn-patients'");
  });
  it("le bloc existe et n'utilise AUCUN réseau, e-mail ni SMS (hors connexion, HDS)", () => {
    expect(bloc.length).toBeGreaterThan(5000);
    expect(bloc).toContain('function enregistrerOrdonnance');
    expect(bloc).not.toMatch(
      /authFetch|fetch\(|supa\.|SUPA_URL|mailto|sms:|XMLHttpRequest|sendBeacon/
    );
  });
  it('aucune écriture directe : tout passe par savePatients / savePraticiens', () => {
    expect(bloc).not.toMatch(/localStorage|saveToSupabase/);
  });
  it('mode consultation : la page des ordonnances est inaccessible', () => {
    // eslint-disable-next-line no-new-func -- extraction contrôlée
    const nav = new Function(
      constLigne('_CONSULT_PAGES') +
        '\n' +
        fonction('_consultationNavAutorisee') +
        '\nreturn _consultationNavAutorisee;'
    )();
    expect(nav('pg-ordonnances')).toBe(false);
  });
  it("« Création d'ordonnances » connue de la fenêtre d'accès restreint", () => {
    expect(fonction('showAccessRestrictedModal')).toContain(
      "create_ordonnance: 'Création d\\'ordonnances'"
    );
  });
  it('chaque type est décrit et les catégories sont celles de la liste réglementaire fournie', () => {
    const { f } = monter();
    expect(Object.keys(f.ORDO_CATEGORIES)).toEqual([
      'topiques',
      'pansements',
      'appareillages',
      'chaussures',
      'renouvellement',
    ]);
    for (const c of Object.values(f.ORDO_CATEGORIES)) expect(c.aide.length).toBeGreaterThan(20);
  });
  it('éditeur : champs attendus', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, { categorie: 'renouvellement' });
    const h = f._htmlEditeurOrdonnance();
    for (const t of [
      'Praticien',
      'Date',
      'Type de prescription',
      'Lignes de prescription',
      'Durée / quantité',
      'médecin prescripteur',
      'exclu le renouvellement',
      'Enregistrer comme modèle',
      'Aperçu',
    ]) {
      expect(h.toLowerCase(), t).toContain(t.toLowerCase());
    }
  });
});

describe('signature et tampon du praticien', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const prat = (extra) => ({ id: 7, nom: 'Dr Fictif', rpps: '10001234567', ...extra });
  const rendu = (extra) => {
    const { f } = monter({ acces: 'full', prats: [prat(extra)] });
    const e = saisir(f);
    const rec = f._ordonnanceDepuisEtat(e, f.patient(), f._ordoPraticienParId(7));
    return { rec, html: f._htmlCorpsOrdonnance(rec, false), f };
  };
  it('image enregistrée sur la fiche : imprimée dans le cadre, à la place du texte', () => {
    const { html } = rendu({ signature: PNG });
    expect(html).toContain('class="ordo-signature"');
    expect(html).toContain(PNG);
    expect(html).not.toContain('Signature et cachet');
  });
  it('sans image : le cadre « Signature et cachet » reste', () => {
    const { html } = rendu({});
    expect(html).toContain('Signature et cachet');
    expect(html).not.toContain('ordo-signature');
  });
  it("la signature n'est jamais copiée dans l'ordonnance enregistrée (dossier patient léger)", () => {
    const { rec } = rendu({ signature: PNG });
    expect(JSON.stringify(rec)).not.toContain('data:image');
  });
  it("une valeur qui n'est pas une image data: est ignorée (aucune injection)", () => {
    for (const mauvais of [
      'javascript:alert(1)',
      'https://exemple.invalid/x.png',
      'data:text/html;base64,AAAA',
      PNG + '"onerror="x',
    ]) {
      const { html } = rendu({ signature: mauvais });
      expect(html, mauvais).not.toContain('ordo-signature');
    }
  });
  it("page d'impression : la signature y figure aussi", () => {
    const { f, rec } = rendu({ signature: PNG });
    expect(f._htmlPageImpressionOrdonnance(rec)).toContain(PNG);
  });
  it('formulaire praticien : sélecteur, aperçu, retrait, et enregistrement à la création et à la modification', () => {
    const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
    for (const id of ['pr-signature-input', 'pr-signature-preview', 'pr-signature-remove'])
      expect(html, id).toContain(`id="${id}"`);
    expect(fonction('createPraticien')).toContain('signature:_pratSignatureDataUrl');
    expect(fonction('createPraticien')).toContain('removePraticienSignature()');
    expect(fonction('editPraticien')).toContain('_pratSignatureDataUrl = pr.signature');
    expect(fonction('saveEditPraticien')).toContain('pr.signature = _pratSignatureDataUrl');
    expect(fonction('saveEditPraticien')).toContain('removePraticienSignature()');
  });
});

describe('menu déroulant des prescriptions possibles', () => {
  const LISTE = {
    topiques: [
      'Antiseptique',
      'Antifongique',
      'Hémostatique',
      'Anesthésique',
      'Kératolytique',
      'Verrucide',
      'Produit adoucissant',
      'Produit asséchant',
      'Produit calmant',
      'Produit cicatrisant',
      'Produit révulsif',
      'Anti-inflammatoire local (uniquement hallux valgus et ongle incarné)',
    ],
    pansements: [
      'Compresses stériles de coton hydrophile',
      'Compresses stériles de gaze hydrophile',
      'Compresses non tissées stériles',
      'Compresses fibres stériles de gaze hydrophile',
      'Compresses stériles absorbantes',
      'Sparadrap élastique',
      'Sparadrap non élastique',
      'Jersey tubulaire (maintien du pansement)',
      'Pochette de suture adhésive stérile (maintien du pansement)',
      'Pansement hydrocolloïde',
      'Pansement au charbon actif',
      'Pansement vaseliné',
      'Pansement hydrofibre',
      'Pansement hydrogel',
      'Pansement alginate de calcium',
    ],
    appareillages: [
      'Orthèses plantaires',
      'Orthonyxie',
      'Orthoplastie',
      'Onychoplastie',
      'Prothèse du pied',
      'Orthèse du pied',
      'Autre appareillage podologique',
    ],
    chaussures: ['Chaussures thérapeutiques de série'],
    renouvellement: ["Renouvellement d'orthèses plantaires"],
  };
  it('chaque type propose exactement la liste fournie par le praticien', () => {
    const { f } = monter();
    for (const [k, attendu] of Object.entries(LISTE))
      expect(
        f.ORDO_CATEGORIES[k].produits.map((x) => x.texte),
        k
      ).toEqual(attendu);
  });
  it("l'ancienne phrase d'aide n'est plus affichée sous le type : un menu déroulant à la place", () => {
    const { f } = monter({ acces: 'full' });
    saisir(f);
    const h = f._htmlEditeurOrdonnance();
    expect(h).toContain('id="ordo-produit"');
    expect(h).toContain('onchange="ajouterProduitOrdonnance(this.value)"');
    expect(h).not.toContain('Antiseptiques, antifongiques, hémostatiques');
    expect(h).toContain('<option value="0">Antiseptique</option>');
  });
  it('pansements : ceux du patient diabétique sont dans un groupe à part', () => {
    const { f } = monter();
    const h = f._htmlProduitsOrdonnance('pansements');
    expect(h).toContain('<optgroup label="Patient diabétique — renouvellement et pose seulement">');
    expect(h.indexOf('hydrocolloïde')).toBeGreaterThan(h.indexOf('<optgroup'));
    expect(h.indexOf('Sparadrap élastique')).toBeLessThan(h.indexOf('<optgroup'));
    expect(f._htmlProduitsOrdonnance('topiques')).not.toContain('optgroup');
  });
  it('un choix remplit la première ligne vide, puis ajoute des lignes', () => {
    const { f } = monter({ acces: 'full' });
    f.nouvelleOrdonnance();
    f.ajouterProduitOrdonnance('0');
    expect(f.etat().edition.lignes).toEqual([{ texte: 'Antiseptique', duree: '' }]);
    f.ajouterProduitOrdonnance('1');
    expect(f.etat().edition.lignes).toEqual([
      { texte: 'Antiseptique', duree: '' },
      { texte: 'Antifongique', duree: '' },
    ]);
  });
  it('un choix ne remplace pas une ligne déjà remplie ni sa durée', () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, {
      lignes: [
        { texte: 'Ma ligne', duree: '5 j' },
        { texte: '', duree: '3 j' },
      ],
    });
    f.ajouterProduitOrdonnance('2');
    expect(f.etat().edition.lignes).toEqual([
      { texte: 'Ma ligne', duree: '5 j' },
      { texte: 'Hémostatique', duree: '3 j' },
    ]);
  });
  it('« — Choisir — » ou valeur inconnue : rien ne change', () => {
    const { f } = monter({ acces: 'full' });
    f.nouvelleOrdonnance();
    f.ajouterProduitOrdonnance('');
    f.ajouterProduitOrdonnance('99');
    f.ajouterProduitOrdonnance('abc');
    expect(f.etat().edition.lignes).toEqual([{ texte: '', duree: '' }]);
  });
  it('plafond de lignes respecté', () => {
    const { f, alertes } = monter({ acces: 'full' });
    saisir(f, { lignes: Array.from({ length: 20 }, () => ({ texte: 'x', duree: '' })) });
    f.ajouterProduitOrdonnance('0');
    expect(f.etat().edition.lignes).toHaveLength(20);
    expect(alertes.join(' ')).toContain('Au plus 20');
  });
  it("un pansement diabétique choisi déclenche l'avertissement existant", () => {
    const { f } = monter({ acces: 'full' });
    saisir(f, { categorie: 'pansements', lignes: [{ texte: '', duree: '' }] });
    const i = f.ORDO_CATEGORIES.pansements.produits.findIndex(
      (x) => x.texte === 'Pansement hydrogel'
    );
    f.ajouterProduitOrdonnance(String(i));
    expect(f._alertesOrdonnance(f.etat().edition).join(' ')).toContain('diabétique');
  });
  it("le même menu sert dans l'éditeur de modèle", () => {
    const { f } = monter({ acces: 'full' });
    f.nouveauModeleOrdonnance(false);
    f.ajouterProduitOrdonnance('0');
    expect(f.etat().modele.lignes[0].texte).toBe('Antiseptique');
    expect(f._htmlEditeurModeleOrdonnance()).toContain('id="ordo-produit"');
  });
});
