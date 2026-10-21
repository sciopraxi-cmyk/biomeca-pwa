// ═══════════════════════════════════════════════════════════
// Import de l'agenda Doctolib (export CSV « Historique de RDV »), lecture seule
// ═══════════════════════════════════════════════════════════
// Section EXTRAITE de js/biomeca.js (du titre « Import de l'agenda Doctolib » au repère
// « FIN IMPORT AGENDA DOCTOLIB ») ; aucun réseau. Données FICTIVES : le faux export reprend les
// colonnes documentées par Doctolib, jamais un vrai fichier.

import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const debut = SRC_BIOMECA.indexOf("// Import de l'agenda Doctolib (export");
const fin = SRC_BIOMECA.indexOf('// ===== FIN IMPORT AGENDA DOCTOLIB =====');
if (debut < 0 || fin <= debut) throw new Error('repères de la section Doctolib introuvables');
const SECTION = SRC_BIOMECA.slice(debut, fin);
const HELPERS = [
  '_csvDetectSep',
  '_csvParse',
  '_importNormName',
  '_importNormDdn',
  '_importMatchDecision',
  '_accessPermetCreationDocument',
  '_agTelSur',
  '_agInitiales',
  '_agTitrePatient',
];

function monter(o = {}) {
  const alertes = [];
  const confirms = [];
  const sauv = { praticiens: 0 };
  const corps = [
    'const window = { _accessLevel: __acces };',
    'const praticiens = __prats; const patients = __patients;',
    'const agCal = { view: "month" }; const loadAgendaCalendarEvents = () => { __sauv.recharge = (__sauv.recharge || 0) + 1; };',
    'const savePraticiens = () => { __sauv.praticiens++; if (__sauv.echec) throw new Error("echec"); };',
    'const showAccessRestrictedModal = (r) => { __sauv.modale = r; };',
    'const confirm = (m) => { __confirms.push(m); return __sauv.confirm !== false; };',
    'const notifierEvenement = (t, o) => { (__sauv.notifs = __sauv.notifs || []).push([t, o]); };',
    'const _todayISO = () => "2026-10-21";',
    'const document = { getElementById: () => null };',
    ...HELPERS.map(fonction),
    SECTION,
    `return { ${[...SECTION.matchAll(/\nfunction (\w+)/g)].map((m) => m[1]).join(', ')}, prats: praticiens };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function(
    'alert',
    '__prats',
    '__patients',
    '__acces',
    '__sauv',
    '__confirms',
    corps
  )(
    (m) => alertes.push(m),
    o.prats || [{ id: 7, nom: 'Dr Fictif' }],
    o.patients || [],
    o.acces,
    sauv,
    confirms
  );
  return { f, alertes, confirms, sauv };
}

const AUJ = '2026-10-21';
const ENTETE =
  'Id,Doctolib Patient ID,Date de début,Durée du RDV,Agenda,Motif du RDV,Notes,Date de saisie,Date de dernière mise à jour,Créé par,Statut,RDV Internet,Nouveau patient,Honoraires CB,Honoraires Total réglé,Civilité,Prénom du patient,Nom du patient,Nom de naissance,Date de naissance,Téléphone portable,Email du patient';
function ligne(o) {
  const d = {
    id: '1001',
    debut: '2026-10-22 09:00',
    duree: '30',
    agenda: 'Cabinet Test',
    motif: 'Première consultation',
    notes: 'NOTE-SECRETE',
    statut: 'Confirmé',
    prenom: 'Lucie',
    nom: 'Durand',
    nomNaissance: 'Durand',
    ddn: '1985-03-12',
    tel: '0600000000',
    mail: 'lucie@exemple.invalid',
    ...o,
  };
  return [
    d.id,
    'P' + d.id,
    d.debut,
    d.duree,
    d.agenda,
    d.motif,
    d.notes,
    '2026-10-01 10:00',
    '2026-10-01 10:00',
    'Secrétaire',
    d.statut,
    'Oui',
    'Non',
    '51',
    '51',
    'Mme',
    d.prenom,
    d.nom,
    d.nomNaissance,
    d.ddn,
    d.tel,
    d.mail,
  ]
    .map((c) => (/[",\n]/.test(c) ? '"' + String(c).replace(/"/g, '""') + '"' : c))
    .join(',');
}
const csv = (...l) => [ENTETE, ...l.map(ligne)].join('\r\n') + '\r\n';

describe('lecture des dates', () => {
  const { f } = monter();
  it.each([
    ['2026-10-22 09:00', '2026-10-22T09:00'],
    ['2026-10-22 09:00:00', '2026-10-22T09:00'],
    ['2026-10-22T09:05:00', '2026-10-22T09:05'],
    ['22/10/2026 09:00', '2026-10-22T09:00'],
    ['22/10/2026 9:05', '2026-10-22T09:05'],
    ['22/10/2026', ''],
    ['', ''],
    ['pas une date', ''],
  ])('%s → %s', (entree, attendu) => {
    expect(f._doctolibParseDebut(entree)).toBe(attendu);
  });
  it('un décalage horaire explicite est converti en heure locale', () => {
    const r = f._doctolibParseDebut('2026-10-22T09:00:00Z');
    const d = new Date('2026-10-22T09:00:00Z');
    const p = (n) => String(n).padStart(2, '0');
    expect(r).toBe(
      `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    );
  });
});

describe('analyse du fichier', () => {
  it('lit un rendez-vous et ne garde que les champs utiles', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(csv({}), [], AUJ);
    expect(r.rdv).toHaveLength(1);
    expect(r.rdv[0]).toEqual({
      id: '1001',
      debut: '2026-10-22T09:00',
      duree: 30,
      agenda: 'Cabinet Test',
      motif: 'Première consultation',
      statut: 'Confirmé',
      nom: 'Durand',
      prenom: 'Lucie',
      tel: '0600000000',
      patientId: null,
    });
    const brut = JSON.stringify(r);
    for (const secret of [
      'NOTE-SECRETE',
      'lucie@exemple.invalid',
      '1985-03-12',
      '51',
      'Secrétaire',
    ]) {
      expect(brut).not.toContain(secret);
    }
  });
  it('lit aussi les séparateurs « ; » et les dates françaises', () => {
    const { f } = monter();
    const texte = csv({ debut: '22/10/2026 14:30' }).replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g, ';');
    const r = f._doctolibAnalyser(texte, [], AUJ);
    expect(r.rdv[0].debut).toBe('2026-10-22T14:30');
  });
  it('exclut les annulés, les doublons d’identifiant, les dates illisibles et les lignes hors période', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(
      csv(
        { id: '1' },
        { id: '2', statut: 'Annulé', debut: '2026-10-23 10:00' },
        { id: '1', debut: '2026-10-24 10:00' },
        { id: '4', debut: 'pas une date' },
        { id: '5', debut: '2020-01-01 10:00' },
        { id: '6', debut: '2030-01-01 10:00' },
        { id: '7', debut: '2026-10-25 11:00', statut: 'Absent' }
      ),
      [],
      AUJ
    );
    expect(r.rdv.map((x) => x.id)).toEqual(['1', '7']);
    expect(r.stats).toMatchObject({ annules: 1, doublons: 1, illisibles: 1, hors: 2 });
  });
  it('la fenêtre va de 14 jours en arrière à 180 jours en avant', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(
      csv(
        { id: 'a', debut: '2026-10-07 09:00' },
        { id: 'b', debut: '2026-10-06 09:00' },
        { id: 'c', debut: '2027-04-19 09:00' },
        { id: 'd', debut: '2027-04-20 09:00' }
      ),
      [],
      AUJ
    );
    expect(r.rdv.map((x) => x.id)).toEqual(['a', 'c']);
  });
  it('durée absente ou absurde → 30 minutes', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(
      csv({ id: 'a', duree: '' }, { id: 'b', duree: '99999', debut: '2026-10-23 09:00' }),
      [],
      AUJ
    );
    expect(r.rdv.map((x) => x.duree)).toEqual([30, 30]);
  });
  it('sans colonne « Date de début » → erreur lisible', () => {
    const { f } = monter();
    expect(f._doctolibAnalyser('Nom;Prénom\nDurand;Lucie\n', [], AUJ).erreur).toMatch(
      /Date de début/
    );
    expect(f._doctolibAnalyser('', [], AUJ).erreur).toMatch(/vide/);
  });
  it('identifiant absent → identifiant stable calculé', () => {
    const { f } = monter();
    const sansId = csv({ id: '' });
    const a = f._doctolibAnalyser(sansId, [], AUJ).rdv[0].id;
    const b = f._doctolibAnalyser(sansId, [], AUJ).rdv[0].id;
    expect(a).toBe(b);
    expect(a).toMatch(/^h[a-z0-9]+$/);
  });
  it('un identifiant piégé est nettoyé (il finit dans un attribut onclick)', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(csv({ id: "x');alert(1);//" }), [], AUJ);
    expect(r.rdv[0].id).toBe('xalert1');
  });
});

describe('reconnaissance des patients (nom + prénom + date de naissance)', () => {
  const patients = [
    { id: 11, nom: 'Durand', prenom: 'Lucie', ddn: '1985-03-12' },
    { id: 12, nom: 'Martin', prenom: 'Paul', ddn: '1970-01-01' },
    { id: 13, nom: 'Martin', prenom: 'Paul', ddn: '1999-09-09' },
    { id: 14, nom: 'Bernard', prenom: 'Zoé', ddn: '' },
    { id: 15, nom: 'Bernard', prenom: 'Zoé', ddn: '' },
  ];
  it('reconnu, homonyme départagé par la date de naissance, absent, ambigu', () => {
    const { f } = monter();
    const r = f._doctolibAnalyser(
      csv(
        { id: '1' },
        { id: '2', nom: 'MARTIN', prenom: 'paul', ddn: '01/01/1970', debut: '2026-10-23 09:00' },
        { id: '3', nom: 'Inconnu', prenom: 'Jean', ddn: '1960-06-06', debut: '2026-10-24 09:00' },
        { id: '4', nom: 'Bernard', prenom: 'Zoé', ddn: '', debut: '2026-10-25 09:00' }
      ),
      patients,
      AUJ
    );
    expect(r.rdv.map((x) => x.patientId)).toEqual([11, 12, null, null]);
    expect(r.stats).toMatchObject({ reconnus: 2, sansFiche: 1, ambigus: 1 });
  });
  it('ne crée jamais de patient et ne modifie pas la liste', () => {
    const copie = JSON.parse(JSON.stringify(patients));
    const { f } = monter({ patients });
    f._doctolibAnalyser(csv({}), patients, AUJ);
    expect(patients).toEqual(copie);
  });
});

describe('fusion et réimport', () => {
  const R = (id, debut) => ({ id, debut, duree: 30 });
  it('remplace la période couverte par le fichier et garde le reste', () => {
    const { f } = monter();
    const anciens = [
      R('a', '2026-10-20T09:00'),
      R('b', '2026-10-22T09:00'),
      R('c', '2026-10-30T09:00'),
    ];
    const res = f._doctolibFusionner(anciens, [R('n', '2026-10-22T10:00')], {
      du: '2026-10-22',
      au: '2026-10-25',
    });
    expect(res.map((x) => x.id)).toEqual(['a', 'n', 'c']);
  });
  it('un jour entier est couvert (fin de journée comprise)', () => {
    const { f } = monter();
    expect(
      f._doctolibFusionner([R('z', '2026-10-25T23:30')], [], { du: '2026-10-25', au: '2026-10-25' })
    ).toEqual([]);
  });
  it('réimporter le même fichier donne le même résultat', () => {
    const { f, alertes, sauv } = monter({ prats: [{ id: 7 }] });
    const texte = csv({ id: '1' }, { id: '2', debut: '2026-10-23 10:00' });
    f._lancerImportDoctolib(texte);
    const une = JSON.stringify(f.prats[0].agendaDoctolib.rdv);
    f._lancerImportDoctolib(texte);
    expect(JSON.stringify(f.prats[0].agendaDoctolib.rdv)).toBe(une);
    expect(f.prats[0].agendaDoctolib.rdv).toHaveLength(2);
    expect(sauv.praticiens).toBe(2);
    expect(alertes).toEqual([]);
  });
  it('un import réussi crée une notification (nombre seulement) ; un import refusé n’en crée aucune', () => {
    const { f, sauv } = monter({ prats: [{ id: 7 }] });
    f._lancerImportDoctolib(csv({ id: '1' }, { id: '2', debut: '2026-10-23 10:00' }));
    expect(sauv.notifs).toEqual([['import_doctolib', { detail: '2 rendez-vous' }]]);
    const v = monter({ prats: [{ id: 7 }] });
    v.sauv.echec = true;
    v.f._lancerImportDoctolib(csv({ id: '1' }));
    expect(v.sauv.notifs).toBeUndefined();
  });
  it('un RDV annulé dans un nouvel export disparaît', () => {
    const { f } = monter({ prats: [{ id: 7 }] });
    f._lancerImportDoctolib(csv({ id: '1' }, { id: '2', debut: '2026-10-23 10:00' }));
    f._lancerImportDoctolib(
      csv({ id: '1' }, { id: '2', debut: '2026-10-23 10:00', statut: 'Annulé' })
    );
    expect(f.prats[0].agendaDoctolib.rdv.map((x) => x.id)).toEqual(['1']);
  });
});

describe('affichage dans l’agenda', () => {
  it('libellé « Nom Prénom – motif »', () => {
    const { f } = monter();
    expect(f._doctolibLibelle({ nom: 'Durand', prenom: 'Lucie', motif: 'Bilan' })).toBe(
      'Durand Lucie – Bilan'
    );
    expect(f._doctolibLibelle({ nom: 'Durand', prenom: 'Lucie', motif: '' })).toBe('Durand Lucie');
    expect(f._doctolibLibelle({ nom: '', prenom: '', motif: 'Bilan' })).toBe(
      'RDV Doctolib – Bilan'
    );
  });
  it('événements de la plage seulement, en lecture seule, fin = début + durée', () => {
    const { f } = monter();
    const rdvs = [
      {
        id: '1',
        debut: '2026-10-22T09:00',
        duree: 45,
        nom: 'Durand',
        prenom: 'Lucie',
        motif: 'Bilan',
        agenda: 'Cab',
        statut: 'Confirmé',
      },
      { id: '2', debut: '2026-12-22T09:00', duree: 30, nom: 'X', prenom: 'Y', motif: '' },
    ];
    const ev = f._doctolibEvenements(
      rdvs,
      new Date('2026-10-19T00:00:00'),
      new Date('2026-10-26T00:00:00')
    );
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      id: 'doctolib:1',
      summary: 'Durand Lucie – Bilan',
      source: 'doctolib',
    });
    expect(new Date(ev[0].end) - new Date(ev[0].start)).toBe(45 * 60000);
    expect(ev[0].description).toContain('Cab');
  });
  it('la grille affiche les INITIALES ; le nom complet reste dans le détail (summary)', () => {
    const { f } = monter();
    const ev = f._doctolibEvenements(
      [
        {
          id: '1',
          debut: '2026-10-22T09:00',
          duree: 30,
          nom: 'Durand',
          prenom: 'Lucie',
          motif: 'Bilan',
        },
      ],
      new Date('2026-10-19T00:00:00'),
      new Date('2026-10-26T00:00:00')
    );
    expect(ev[0].affichage).toBe('L.D. – Bilan');
    expect(ev[0].affichage).not.toMatch(/Durand|Lucie/);
    expect(ev[0].summary).toBe('Durand Lucie – Bilan');
  });
  it('des données stockées corrompues sont ignorées sans exception', () => {
    const { f } = monter();
    const ev = f._doctolibEvenements(
      [
        null,
        {},
        { id: '1', debut: 5 },
        { id: '', debut: '2026-10-22T09:00' },
        { id: '2', debut: 'zzz' },
      ],
      new Date(0),
      new Date('2100-01-01')
    );
    expect(ev).toEqual([]);
    expect(f._doctolibStock().rdv).toEqual([]);
  });
});

describe('garde-fous et contrat', () => {
  it('erreur de fichier → rien n’est écrit, rien n’est confirmé', () => {
    const { f, alertes, sauv, confirms } = monter();
    f._lancerImportDoctolib('Nom;Prénom\nA;B\n');
    expect(alertes[0]).toMatch(/Date de début/);
    expect(sauv.praticiens).toBe(0);
    expect(confirms).toEqual([]);
  });
  it('refus à la confirmation → aucune écriture', () => {
    const { f, sauv } = monter();
    sauv.confirm = false;
    f._lancerImportDoctolib(csv({}));
    expect(sauv.praticiens).toBe(0);
    expect(f.prats[0].agendaDoctolib).toBeUndefined();
  });
  it('sans praticien : message, aucune écriture', () => {
    const { f, alertes } = monter({ prats: [] });
    f._lancerImportDoctolib(csv({}));
    expect(alertes[0]).toMatch(/praticien/);
  });
  it('échec d’enregistrement → l’état précédent est restauré', () => {
    const ancien = { importeLe: 'x', rdv: [{ id: 'old', debut: '2026-10-30T09:00', duree: 30 }] };
    const { f, sauv, alertes } = monter({ prats: [{ id: 7, agendaDoctolib: ancien }] });
    sauv.echec = true;
    f._lancerImportDoctolib(csv({}));
    expect(f.prats[0].agendaDoctolib.rdv.map((x) => x.id)).toEqual(['old']);
    expect(alertes.some((a) => /Enregistrement impossible/.test(a))).toBe(true);
  });
  it('abonnement terminé : le retrait et l’import sont bloqués', () => {
    const { f, sauv } = monter({
      acces: 'readonly',
      prats: [
        {
          id: 7,
          agendaDoctolib: { importeLe: 'x', rdv: [{ id: 'a', debut: '2026-10-30T09:00' }] },
        },
      ],
    });
    f.retirerAgendaDoctolib();
    expect(sauv.modale).toBe('create_document');
    expect(f.prats[0].agendaDoctolib.rdv).toHaveLength(1);
    const input = { files: [{}], value: 'x' };
    f.importDoctolibAgendaCSV(input);
    expect(input.value).toBe('');
    expect(sauv.praticiens).toBe(0);
  });
  it('écriture par savePraticiens seulement ; aucun réseau, aucun stockage direct', () => {
    expect(SECTION).not.toMatch(
      /\bfetch\s*\(|authFetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|saveToSupabase|mailto:/
    );
    expect(SECTION).toMatch(/savePraticiens\(\)/);
    expect(SECTION).not.toMatch(/savePatients|patients\.push/);
  });
  it('l’identifiant de rendez-vous ne contient rien d’injectable', () => {
    const { f } = monter();
    const ev = f._doctolibEvenements(
      [{ id: 'a\'b"<c>', debut: '2026-10-22T09:00', duree: 30 }],
      new Date('2026-10-01'),
      new Date('2026-11-01')
    );
    expect(ev[0].id).toBe('doctolib:abc');
  });
});
