// ═══════════════════════════════════════════════════════════
// Traçabilité de stérilisation — registre des cycles, sets, appareils, soins
// ═══════════════════════════════════════════════════════════
// Section EXTRAITE de js/biomeca.js (du titre « Traçabilité de stérilisation » à « STRIPE ») ;
// aucun réseau. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const debut = SRC_BIOMECA.indexOf('// Traçabilité de stérilisation — registre');
const fin = SRC_BIOMECA.indexOf('\n// ===== STRIPE + MODULES =====');
const SECTION = SRC_BIOMECA.slice(debut, fin);
const NOMS_HELPERS = [
  '_ordoDateValide',
  '_ordoAujourdhui',
  '_dateFr',
  '_accessPermetCreationDocument',
];

function monter(o = {}) {
  const alertes = [];
  const modales = [];
  const sauv = { patients: 0, praticiens: 0 };
  const champs = {};
  const sortie = { html: '' };
  const coches = [];
  const ecrit = [];
  const imprime = [];
  const confirms = [];
  const telecharges = [];
  const document = {
    getElementById: (id) => {
      if (id === 'ster-contenu') {
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
    querySelectorAll: (sel) => (sel === '.ster-soin-chk' ? coches : []),
    createElement: (t) => {
      const f = {
        style: {},
        setAttribute() {},
        remove() {},
        click() {
          telecharges.push(f.download);
        },
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
    body: { appendChild() {}, removeChild() {} },
  };
  const corps = [
    'let currentPatient = __patient; const praticiens = __prats; const patients = [__patient];',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'const window = { _accessLevel: __acces };',
    'const nav = () => {}; const selectPatient = (p) => { currentPatient = p; };',
    'const _praticienParDefaut = (p) => praticiens.find((x) => x.id == p?.pratId) || praticiens[0] || null;',
    'const _CSS_BTN = "font-size:12px;padding:5px 12px;";',
    'const showAccessRestrictedModal = (r) => __modales.push(r);',
    'const savePatients = () => { __sauv.patients++; return true; };',
    'const savePraticiens = () => { __sauv.praticiens++; };',
    'const confirm = (m) => { __confirms.push(m); return true; };',
    'const crypto = { randomUUID: (() => { let n = 0; return () => "id-" + (++n); })() };',
    'const URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} }; const Blob = function (p) { this.p = p; };',
    'const setTimeout = (f) => { f(); };',
    ...NOMS_HELPERS.map(fonction),
    SECTION,
    `return { ${[...SECTION.matchAll(/\nfunction (\w+)/g)].map((m) => m[1]).join(', ')},
      prats: praticiens, etat: () => ({ vue: _sterVue, brouillon: _sterBrouillon, soin: _sterSoinBrouillon }), patient: () => currentPatient };`,
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
    '__confirms',
    corps
  )(
    document,
    (m) => alertes.push(m),
    o.patient || { id: 42, nom: 'Martin', prenom: 'Paul', pratId: 7 },
    o.prats || [{ id: 7, nom: 'Dr Fictif', cabinet: 'Cabinet Test' }],
    o.acces,
    modales,
    sauv,
    confirms
  );
  return {
    f,
    alertes,
    modales,
    sauv,
    champs,
    sortie,
    coches,
    ecrit,
    imprime,
    confirms,
    telecharges,
  };
}
const champ = (v) => ({ value: v });
const AP = { type: 'Autoclave', nom: 'Autoclave 18 L', serie: 'SN-1' };

function avecAutoclave(o) {
  const m = monter(o);
  m.champs['ster-ap-type'] = champ('Autoclave');
  m.champs['ster-ap-nom'] = champ(AP.nom);
  m.champs['ster-ap-serie'] = champ(AP.serie);
  m.champs['ster-ap-mise'] = champ('2026-01-10');
  m.f.ajouterAppareilSterilisation();
  return m;
}
function enregistrerCycle(m, date, extra = {}) {
  m.f.nouveauCycleSterilisation();
  m.champs['ster-cy-date'] = champ(date);
  m.champs['ster-cy-app'] = champ(m.f.etat().brouillon.appareilId);
  m.champs['ster-cy-type'] = champ('134 °C — 18 min');
  m.champs['ster-cy-res'] = champ(extra.res || 'conforme');
  m.champs['ster-cy-bd'] = champ(extra.bd || 'conforme');
  m.champs['ster-cy-hx'] = champ('non_fait');
  m.champs['ster-cy-c6'] = champ('conforme');
  m.champs['ster-cy-op'] = champ('Dr Fictif');
  m.champs['ster-cy-obs'] = champ(extra.obs || '');
  m.f.ajouterSachetCycle(extra.lib1 ?? 'Set soins');
  m.f.ajouterSachetCycle('Set verrues');
  m.f.enregistrerCycleSterilisation();
}

describe('Stérilisation — registre', () => {
  it('ajoute un appareil dans le blob du praticien (savePraticiens, jamais savePatients)', () => {
    const m = avecAutoclave();
    expect(m.sauv).toEqual({ patients: 0, praticiens: 1 });
    expect(m.alertes).toEqual([]);
  });

  it('numérote les cycles sans trou et attribue les sachets', () => {
    const m = avecAutoclave();
    enregistrerCycle(m, '2026-10-01');
    enregistrerCycle(m, '2026-10-02');
    const d = readBlob(m);
    expect(d.cycles.map((c) => c.numero)).toEqual([1, 2]);
    expect(d.cycles[0].sachets.map((x) => x.ref)).toEqual(['C0001-01', 'C0001-02']);
    expect(d.dernierNumero).toBe(2);
    m.f.sterAller('cycles');
    expect(m.sortie.html).toContain('N° 1 · 01/10/2026');
    expect(m.sortie.html).toContain('N° 2 · 02/10/2026');
    expect(m.f._sterRefSachet(12, 3)).toBe('C0012-03');
    expect(m.sauv.praticiens).toBe(3);
  });

  it('un cycle sans appareil ou sans date est refusé (seuls blocages)', () => {
    const m = avecAutoclave();
    const v = m.f._sterValiderCycle(
      { date: 'xx', appareilId: 'a', sachets: [] },
      { appareils: [] }
    );
    expect(v.ok).toBe(false);
    const v2 = m.f._sterValiderCycle(
      { date: '2026-10-01', appareilId: 'inconnu', sachets: [] },
      { appareils: [{ id: 'a' }] }
    );
    expect(v2.ok).toBe(false);
  });

  it("les alertes sont des avertissements : le cycle s'enregistre après confirmation", () => {
    const m = avecAutoclave();
    const a = m.f._sterAlertesCycle(
      {
        resultat: 'non_conforme',
        bowie: 'non_fait',
        operateur: '',
        sachets: [],
        date: '2999-01-01',
      },
      '2026-10-01'
    );
    expect(a.length).toBe(5);
    enregistrerCycle(m, '2026-10-03', { bd: 'non_fait' });
    expect(m.confirms.some((c) => c.includes('Bowie-Dick'))).toBe(true);
    m.f.sterAller('cycles');
    expect(m.sortie.html).toContain('N° 1');
  });

  it('rappels : Bowie-Dick trop ancien, aucun test, contrôle annuel dépassé, cycle non conforme', () => {
    const d = {
      appareils: [{ id: 'a', type: 'Autoclave', nom: 'Auto', miseEnService: '2024-01-01' }],
      cycles: [
        {
          id: 'c',
          appareilId: 'a',
          date: '2026-09-01',
          bowie: 'conforme',
          resultat: 'non_conforme',
          numero: 4,
        },
      ],
      maintenance: [],
    };
    const r = m0().f._sterRappels(d, '2026-10-21');
    const t = r.map((x) => x.texte).join('|');
    expect(t).toContain('il y a 50 jours');
    expect(t).toContain('dernier contrôle');
    expect(r.some((x) => x.niveau === 'alerte')).toBe(true);
    d.cycles = [];
    expect(
      m0()
        .f._sterRappels(d, '2026-10-21')
        .map((x) => x.texte)
        .join('|')
    ).toContain('aucun test de Bowie-Dick');
    d.appareils[0].finExploitation = '2026-01-01';
    expect(m0().f._sterRappels(d, '2026-10-21')).toEqual([]);
  });

  it('CSV : BOM, séparateur ;, formules neutralisées, filtre de période', () => {
    const m = avecAutoclave();
    enregistrerCycle(m, '2026-10-01', { obs: '=HYPERLINK("http://x")', lib1: '+cmd' });
    enregistrerCycle(m, '2026-11-01');
    const lignes = m.f._sterLignesRegistre(readBlob(m), '2026-10-01', '2026-10-31');
    expect(lignes.length).toBe(1);
    const csv = m.f._sterCsv(lignes);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain('N° cycle;Date;Appareil');
    expect(m.f._sterCsvCellule('+cmd')).toBe("'+cmd");
    expect(m.f._sterCsvCellule('a;b')).toBe('"a;b"');
  });

  it("impression : sans nom de patient, sans garde d'abonnement, avec témoin de fin de chemin", () => {
    const m = avecAutoclave();
    enregistrerCycle(m, '2026-10-01');
    m.f.sterAller('soin');
    m.f.nouveauSoinSterilisation();
    m.champs['ster-soin-date'] = champ('2026-10-02');
    m.champs['ster-soin-note'] = champ('');
    m.champs['ster-soin-libre'] = champ('C0001-01');
    m.f.enregistrerSoinSterilisation();
    m.champs['ster-du'] = champ('');
    m.champs['ster-au'] = champ('');
    m.f.imprimerRegistreSterilisation();
    expect(m.imprime.length).toBe(1);
    expect(m.ecrit.join('')).toContain('Cahier de stérilisation');
    expect(m.ecrit.join('')).not.toContain('Martin');
  });

  it('abonnement terminé : création bloquée, consultation / impression / export possibles', () => {
    const m = monter({ acces: 'readonly' });
    m.f.nouveauCycleSterilisation();
    m.f.ajouterAppareilSterilisation();
    expect(m.modales).toEqual(['create_sterilisation', 'create_sterilisation']);
    expect(m.sauv).toEqual({ patients: 0, praticiens: 0 });
    m.f.sterAller('cycles');
    expect(m.sortie.html).toContain('consulter, imprimer et exporter');
    expect(m.sortie.html).not.toContain('nouveauCycleSterilisation');
  });

  it("XSS : le contenu saisi est échappé à l'affichage", () => {
    const m = avecAutoclave();
    enregistrerCycle(m, '2026-10-01', { lib1: '<img src=x onerror=alert(1)>' });
    m.f.voirCycleSterilisation('id-2');
    expect(m.sortie.html).not.toContain('<img src=x');
    expect(m.sortie.html).toContain('&lt;img src=x');
  });

  it('sources officielles citées dans la page, en avertissements', () => {
    const m = avecAutoclave();
    m.f.sterAller('cycles');
    expect(m.sortie.html).toContain('Ordre national des pédicures-podologues');
    expect(m.sortie.html).toContain('R5211-5');
    expect(m.sortie.html).toContain('circulaire DGS/DHOS n° 138 du 14 mars 2001');
    expect(m.sortie.html).toContain('jamais des blocages');
  });
});

describe('Stérilisation — lien patient', () => {
  function pret() {
    const m = avecAutoclave();
    enregistrerCycle(m, new Date().toISOString().slice(0, 10));
    return m;
  }
  const cocher = (m, refs) => {
    m.coches.length = 0;
    refs.forEach((r) => m.coches.push({ checked: true, value: r }));
  };
  it('enregistre les sachets sur le patient via savePatients et retrouve les patients du cycle', () => {
    const m = pret();
    const avant = m.sauv.patients;
    m.f.sterAller('soin');
    m.f.nouveauSoinSterilisation();
    m.champs['ster-soin-date'] = champ('2026-10-05');
    m.champs['ster-soin-note'] = champ('Soin test');
    m.champs['ster-soin-libre'] = champ('');
    cocher(m, ['C0001-01']);
    m.f.enregistrerSoinSterilisation();
    expect(m.sauv.patients).toBe(avant + 1);
    const soins = m.f.patient().soinsSterilisation;
    expect(soins.length).toBe(1);
    expect(soins[0]).toMatchObject({
      date: '2026-10-05',
      sachets: ['C0001-01'],
      registrePratId: 7,
    });
    m.f.voirCycleSterilisation('id-2');
    expect(m.sortie.html).toContain('05/10/2026 : Paul Martin');
    m.f.sterAller('soin');
    expect(m.sortie.html).toContain('cycle n° 1');
  });

  it('avertit (sans bloquer) : sachet hors registre, non conforme, déjà utilisé, trop ancien', () => {
    const m = pret();
    const prat = {
      id: 7,
      nom: 'x',
      sterilisation: {
        appareils: [],
        sets: [],
        maintenance: [],
        dernierNumero: 3,
        cycles: [
          {
            id: 'a',
            numero: 1,
            date: '2026-01-01',
            resultat: 'conforme',
            sachets: [{ ref: 'C0001-01' }],
          },
          {
            id: 'b',
            numero: 2,
            date: '2026-10-20',
            resultat: 'non_conforme',
            sachets: [{ ref: 'C0002-01' }],
          },
        ],
      },
    };
    const m2 = monter({ prats: [prat] });
    const a = m2.f
      ._sterAlertesSoin(['C0001-01', 'C0002-01', 'ZZ'], 7, '2026-10-21', null)
      .join('|');
    expect(a).toContain('plus de 60 jours');
    expect(a).toContain('NON CONFORME');
    expect(a).toContain('absente du registre');
    expect(m.sauv.patients).toBe(0);
  });

  it('refuse de retirer un sachet déjà lié à un soin', () => {
    const m = pret();
    m.f.nouveauSoinSterilisation();
    m.champs['ster-soin-date'] = champ('2026-10-05');
    m.champs['ster-soin-note'] = champ('');
    m.champs['ster-soin-libre'] = champ('');
    cocher(m, ['C0001-01']);
    m.f.enregistrerSoinSterilisation();
    m.f.modifierCycleSterilisation('id-2');
    m.f.retirerSachetCycle(0);
    expect(m.alertes.join('')).toContain('déjà lié à un soin');
    expect(m.f.etat().brouillon.sachets.length).toBe(2);
    m.f.retirerSachetCycle(1);
    expect(m.f.etat().brouillon.sachets.length).toBe(1);
  });

  it('supprime une ligne de traçabilité après confirmation', () => {
    const m = pret();
    m.f.nouveauSoinSterilisation();
    m.champs['ster-soin-date'] = champ('2026-10-05');
    m.champs['ster-soin-note'] = champ('');
    m.champs['ster-soin-libre'] = champ('');
    cocher(m, ['C0001-01']);
    m.f.enregistrerSoinSterilisation();
    const id = m.f.patient().soinsSterilisation[0].id;
    m.f.supprimerSoinSterilisation(id);
    expect(m.f.patient().soinsSterilisation).toEqual([]);
  });
});

function m0() {
  return monter();
}
function readBlob(m) {
  // relit le blob stocké en passant par l'export : le praticien est celui du harnais
  return m.f._sterDonnees(m.f.prats[0]);
}
