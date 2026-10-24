// Devis automatique à l'import Doctolib : planification (pure) + création/émission contre un faux serveur
// en mémoire (unicité par rendez-vous). Données FICTIVES.
import { describe, it, expect } from 'vitest';
import { fonction, ligneConst, objet } from './helpers/extraire-biomeca.mjs';

const PURES = [
  '_importNormName',
  '_ligneDepuisActe',
  '_praticienParDefaut',
  '_centimesVersEuros',
  '_dateFr',
  '_doctolibDateFr',
  '_eurosVersCentimes',
  '_devisAutoPlanifier',
  '_devisAutoResume',
  '_validerParametresDevisAuto',
];
const POUR_CREATION = [
  '_ligneBaseDocument',
  '_emetteurDepuisPraticien',
  '_patientInstantane',
  '_mentionTva',
  '_calculerDocument',
  '_partsRemboursement',
  '_validerDocument',
  '_erreurCoordonneesBancaires',
  '_normaliserIban',
  '_praticienDuDocument',
  '_docRequete',
  '_devisAutoCreerUn',
  '_devisAutoApresImport',
  '_doctolibStock',
];

function monter(o = {}) {
  const srv = {
    docs: [],
    numero: 0,
    emis: [],
    partages: [],
    notifs: [],
    alertes: [],
    confirms: [],
    statutPost: null,
    erreurEmission: false,
  };
  const corps = [
    'const ACTE_MONTANT_MAX_CENTS = 10000000;',
    ligneConst('MENTION_TVA_DEFAUT'),
    ligneConst('FRANCHISE_ACTE_CENTS'),
    ligneConst('FRANCHISE_JOUR_MAX_CENTS'),
    ligneConst('DOC_LIGNES_MAX'),
    objet('REGIMES_REMBOURSEMENT'),
    ligneConst('_chiffresSeuls'),
    'const _ENTETES_JSON = {};',
    'const SUPA_URL = "https://x.invalid";',
    'const praticiens = __prats; const patients = __patients; let _actesCache = [];',
    'const _todayISO = () => "2026-10-24";',
    'const globalThis_ = {};',
    'const _accessPermetCreationDocument = () => true;',
    'const _horsConnexion = () => false;',
    'const chargerActes = async () => { _actesCache = __actes; return _actesCache; };',
    'const confirm = (m) => { __srv.confirms.push(m); return __srv.confirmer !== false; };',
    'const alert = (m) => { __srv.alertes.push(m); };',
    'const notifierEvenement = (t, o) => { __srv.notifs.push([t, o]); };',
    'const _portailPartagerAuto = (g, p, d) => { __srv.partages.push(d.numero); };',
    'const authFetch = __authFetch;',
    ...PURES.concat(POUR_CREATION).map(fonction),
    `return { ${PURES.concat(POUR_CREATION).join(', ')}, setRdv: (r) => { __prats[0].agendaDoctolib = { rdv: r }; } };`,
  ].join('\n');
  const reponse = (status, data) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  });
  const authFetch = async (url, opt = {}) => {
    const m = opt.method || 'GET';
    if (url.includes('/devis_auto_parametres')) return reponse(200, o.params ? [o.params] : []);
    if (url.includes('/rpc/emettre_document')) {
      if (srv.erreurEmission) return reponse(500, { message: 'panne' });
      const { p_id } = JSON.parse(opt.body);
      const d = srv.docs.find((x) => x.id === p_id);
      d.statut = 'emis';
      d.numero = 'D-2026-' + String(++srv.numero).padStart(4, '0');
      srv.emis.push(d);
      return reponse(200, d);
    }
    if (url.includes('source_rdv=not.is.null'))
      return reponse(
        200,
        srv.masquerDeja
          ? []
          : srv.docs.filter((d) => d.source_rdv).map((d) => ({ source_rdv: d.source_rdv }))
      );
    if (url.endsWith('/documents_facturation') && m === 'POST') {
      const b = JSON.parse(opt.body);
      if (b.source_rdv && srv.docs.some((d) => d.source_rdv === b.source_rdv))
        return reponse(409, { message: 'duplicate' });
      const d = Object.assign({ id: 'doc' + (srv.docs.length + 1), statut: 'brouillon' }, b);
      srv.docs.push(d);
      return reponse(201, [d]);
    }
    return reponse(404, {});
  };
  const f = new Function(
    '__prats',
    '__patients',
    '__actes',
    '__srv',
    '__authFetch',
    'pwaUser',
    corps
  )(
    o.prats || [
      { id: 7, nom: 'Dr Fictif', titre: 'Podologue', siret: '12345678901234', rpps: '12345678901' },
    ],
    o.patients || [
      { id: 'p1', nom: 'Martin', prenom: 'Lea', ddn: '2015-01-01', pratId: 7 },
      { id: 'p2', nom: 'Durand', prenom: 'Paul', ddn: '1980-02-02', pratId: 7 },
    ],
    o.actes || [],
    srv,
    authFetch,
    { id: 'u1' }
  );
  return { f, srv };
}

const ACTES = [
  {
    id: 'a1',
    libelle: 'Consultation de podologie',
    montant_cents: 3500,
    sync_doctolib: true,
    devis_mode: 'simple',
    actif: true,
  },
  {
    id: 'a2',
    libelle: 'Bilan podologique',
    montant_cents: 6000,
    sync_doctolib: true,
    devis_mode: 'semelles',
    actif: true,
  },
  {
    id: 'a3',
    libelle: 'Acte non synchronisé',
    montant_cents: 1000,
    sync_doctolib: false,
    actif: true,
  },
  { id: 'a4', libelle: 'Acte désactivé', montant_cents: 1000, sync_doctolib: true, actif: false },
];
const PARAMS = {
  secu_semelles_cents: 13500,
  secu_semelles_date: '2026-10-01',
  secu_semelles_source: 'Avenant fictif',
  complement_cents: 2500,
};
const rdv = (id, motif, patientId = 'p1', debut = '2026-10-27T10:00') => ({
  id,
  motif,
  patientId,
  debut,
});

describe('planification', () => {
  const { f } = monter({ actes: ACTES });
  const ctx = (p = {}) =>
    Object.assign(
      {
        actes: ACTES,
        params: PARAMS,
        patients: [{ id: 'p1', nom: 'M', prenom: 'L', pratId: 7 }],
        deja: new Set(),
        aujourdhui: '2026-10-24',
      },
      p
    );

  it('intitulé reconnu (accents/casse ignorés) → devis au montant de l\u2019acte', () => {
    const r = f._devisAutoPlanifier([rdv('r1', 'CONSULTATION de Podologie')], ctx());
    expect(r.creer).toHaveLength(1);
    expect(r.creer[0].total).toBe(3500);
  });
  it('semelles : bilan + Sécu + complément = total, note avec source et date', () => {
    const r = f._devisAutoPlanifier([rdv('r1', 'bilan podologique')], ctx());
    expect(r.creer[0].etat.lignes.map((l) => l.prix_cents)).toEqual([6000, 13500, 2500]);
    expect(r.creer[0].total).toBe(22000);
    expect(r.creer[0].etat.note).toContain('Avenant fictif');
    expect(r.creer[0].etat.note).toContain('01/10/2026');
  });
  it('semelles sans montant Sécu saisi → rien créé, raison explicite', () => {
    const r = f._devisAutoPlanifier([rdv('r1', 'Bilan podologique')], ctx({ params: null }));
    expect(r.creer).toHaveLength(0);
    expect(r.ignores[0].raison).toMatch(/Sécu/);
  });
  it('complément à zéro : pas de ligne de complément', () => {
    const r = f._devisAutoPlanifier(
      [rdv('r1', 'Bilan podologique')],
      ctx({ params: Object.assign({}, PARAMS, { complement_cents: 0 }) })
    );
    expect(r.creer[0].etat.lignes).toHaveLength(2);
  });
  it('intitulé inconnu, acte non synchronisé ou désactivé → ignoré', () => {
    const r = f._devisAutoPlanifier(
      [rdv('r1', 'Autre'), rdv('r2', 'Acte non synchronisé'), rdv('r3', 'Acte désactivé')],
      ctx()
    );
    expect(r.creer).toHaveLength(0);
    expect(r.ignores).toHaveLength(3);
  });
  it('patient introuvable ou non rapproché → ignoré', () => {
    const r = f._devisAutoPlanifier(
      [rdv('r1', 'Consultation de podologie', null), rdv('r2', 'Consultation de podologie', 'zzz')],
      ctx()
    );
    expect(r.ignores.map((i) => i.raison)).toEqual(['patient introuvable', 'patient introuvable']);
  });
  it('rendez-vous passé ou déjà devisé → écarté sans bruit', () => {
    const r = f._devisAutoPlanifier(
      [
        rdv('r1', 'Consultation de podologie', 'p1', '2026-10-20T09:00'),
        rdv('r2', 'Consultation de podologie'),
      ],
      ctx({ deja: new Set(['r2']) })
    );
    expect(r.creer).toHaveLength(0);
    expect(r.ignores).toHaveLength(0);
  });
  it('deux rendez-vous le même jour → deux devis', () => {
    const r = f._devisAutoPlanifier(
      [rdv('r1', 'Consultation de podologie'), rdv('r2', 'Consultation de podologie')],
      ctx()
    );
    expect(r.creer).toHaveLength(2);
  });
  it('résumé : nombre, total et rappel du retrait par 🔑', () => {
    const r = f._devisAutoPlanifier([rdv('r1', 'Consultation de podologie')], ctx());
    const t = f._devisAutoResume(r);
    expect(t).toMatch(/1 devis/);
    expect(t).toMatch(/35,00/);
    expect(t).toMatch(/🔑/);
  });
});

describe('paramètres semelles', () => {
  const { f } = monter();
  it('montant Sécu sans date ni source refusé', () => {
    expect(
      f._validerParametresDevisAuto({ secu: '135', complement: '25', date: '', source: '' }).ok
    ).toBe(false);
  });
  it('valeurs correctes → centimes', () => {
    const r = f._validerParametresDevisAuto({
      secu: '135,50',
      complement: '25',
      date: '2026-10-01',
      source: 'avenant',
    });
    expect(r.param).toEqual({
      secu_semelles_cents: 13550,
      secu_semelles_date: '2026-10-01',
      secu_semelles_source: 'avenant',
      complement_cents: 2500,
    });
  });
  it('montants illisibles refusés', () => {
    expect(
      f._validerParametresDevisAuto({ secu: 'abc', complement: '', date: '', source: '' }).ok
    ).toBe(false);
    expect(
      f._validerParametresDevisAuto({ secu: '', complement: '-5', date: '', source: '' }).ok
    ).toBe(false);
  });
});

describe('création à l\u2019import (faux serveur)', () => {
  it('crée et émet les devis, numérotation continue, partage au portail', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    f.setRdv([rdv('r1', 'Consultation de podologie'), rdv('r2', 'Bilan podologique', 'p2')]);
    await f._devisAutoApresImport([rdv('r1', 'x'), rdv('r2', 'x')]);
    expect(srv.emis.map((d) => d.numero)).toEqual(['D-2026-0001', 'D-2026-0002']);
    expect(srv.emis.map((d) => d.total_cents)).toEqual([3500, 22000]);
    expect(srv.emis.every((d) => d.type === 'devis' && d.source_rdv)).toBe(true);
    expect(srv.partages).toHaveLength(2);
    expect(srv.confirms).toHaveLength(1);
  });
  it('réimport du même fichier : aucun doublon, aucun numéro consommé', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    await f._devisAutoApresImport([]);
    expect(srv.docs).toHaveLength(1);
    expect(srv.numero).toBe(1);
  });
  it('course (liste « déjà devisés » périmée) : le serveur refuse le doublon, sans erreur affichée', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    srv.masquerDeja = true;
    srv.alertes.length = 0;
    await f._devisAutoApresImport([]);
    expect(srv.docs).toHaveLength(1);
    expect(srv.numero).toBe(1);
    expect(srv.notifs.some((n) => n[0] === 'devis_auto_ignores')).toBe(false);
    expect(srv.alertes).toHaveLength(0);
  });
  it('refus au récapitulatif : rien n\u2019est créé', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    srv.confirmer = false;
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    expect(srv.docs).toHaveLength(0);
  });
  it('refus puis nouvel import : le rendez-vous est repris (pas perdu)', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    srv.confirmer = false;
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    srv.confirmer = true;
    await f._devisAutoApresImport([]);
    expect(srv.emis).toHaveLength(1);
  });
  it('intitulé inconnu d\u2019un NOUVEAU rendez-vous : notification, aucun devis', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    f.setRdv([rdv('r1', 'Inconnu')]);
    await f._devisAutoApresImport([rdv('r1', 'Inconnu')]);
    expect(srv.docs).toHaveLength(0);
    expect(srv.notifs[0][0]).toBe('devis_auto_ignores');
    expect(srv.notifs[0][1].rdv[0].raison).toBe('intitulé non reconnu');
  });
  it('intitulé inconnu d\u2019un rendez-vous déjà connu : pas de nouvelle notification', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    f.setRdv([rdv('r1', 'Inconnu')]);
    await f._devisAutoApresImport([]);
    expect(srv.notifs).toHaveLength(0);
  });
  it('panne à l\u2019émission : signalé, pas d\u2019alerte de succès trompeuse', async () => {
    const { f, srv } = monter({ actes: ACTES, params: PARAMS });
    srv.erreurEmission = true;
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    expect(srv.emis).toHaveLength(0);
    expect(srv.notifs.some((n) => n[0] === 'devis_auto_ignores')).toBe(true);
    expect(srv.alertes.join(' ')).toMatch(/non créé/);
  });
  it('praticien sans SIRET/RPPS : émission refusée proprement', async () => {
    const { f, srv } = monter({
      actes: ACTES,
      params: PARAMS,
      prats: [{ id: 7, nom: 'Dr Fictif' }],
    });
    f.setRdv([rdv('r1', 'Consultation de podologie')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    expect(srv.docs).toHaveLength(0);
    expect(srv.notifs[0][1].rdv[0].raison).toMatch(/SIRET/);
  });
  it('aucun acte coché « devis automatique » : rien ne se passe', async () => {
    const { f, srv } = monter({
      actes: [{ id: 'a3', libelle: 'X', montant_cents: 1, sync_doctolib: false }],
      params: PARAMS,
    });
    f.setRdv([rdv('r1', 'X')]);
    await f._devisAutoApresImport([rdv('r1', 'x')]);
    expect(srv.docs).toHaveLength(0);
    expect(srv.confirms).toHaveLength(0);
  });
});
