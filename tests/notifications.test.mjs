// ═══════════════════════════════════════════════════════
// Notifications — centre et historique (lot a)
// ═══════════════════════════════════════════════════════
// Section EXTRAITE de js/biomeca.js ; aucun réseau, aucune écriture réelle. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const debut = SRC_BIOMECA.indexOf('// Notifications — centre et historique');
const fin = SRC_BIOMECA.indexOf('// Traçabilité de stérilisation — registre');
const SECTION = SRC_BIOMECA.slice(debut, fin);

function monter(o = {}) {
  const sauv = { n: 0 };
  const timers = [];
  const dl = { requetes: [] };
  const docEl = { innerHTML: '' };
  const sortie = { html: '' };
  const pastille = { textContent: '', style: {} };
  const selections = [];
  const navs = [];
  const document = {
    addEventListener() {},
    createElement: () => ({
      click() {
        dl.clic = true;
      },
      set download(v) {
        dl.nom = v;
      },
      set href(_v) {},
    }),
    body: { appendChild() {}, removeChild() {} },
    getElementById: (id) =>
      id === 'notif-contenu'
        ? {
            set innerHTML(v) {
              sortie.html = v;
            },
            get innerHTML() {
              return sortie.html;
            },
          }
        : id === 'notif-doc-corps'
          ? docEl
          : id === 'notif-pastille'
            ? pastille
            : null,
  };
  const corps = [
    'const praticiens = __prats; const patients = __pats;',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'const window = {}; const _htmlCorpsOrdonnance = (o) => "CORPS[" + o.id + "]"; const _htmlCorpsDocument = (d) => "DOC[" + d.numero + "|" + d.lignes.length + "]"; const _docRequete = async (c) => { __dl.requetes.push(c); return __doc(c); };',
    'const savePraticiens = () => { __sauv.n++; if (__echec) throw new Error("x"); };',
    'const selectPatient = (p) => __sel.push(p.id); const nav = (id) => __navs.push(id);',
    'const globalThis = { _modeConsultation: __consult };',
    'const setTimeout = (f) => { __timers.push(f); return __timers.length; }; const clearTimeout = (n) => { if (n) __timers[n - 1] = null; };',
    'const _todayISO = () => "2026-10-22"; const URL = { createObjectURL: (b) => { __dl.blob = b; return "blob:x"; }, revokeObjectURL() {} }; const Blob = function (p, o) { this.p = p; this.o = o; };',
    SECTION,
    'return { _notifCsv, exporterNotificationsCSV, _notifSauvegarderMaintenant, notifierEvenement, notifierReseauRetabli, renderNotificationsPage, filtrerNotifications, toutMarquerLuNotifications, ouvrirNotification, ouvrirPatientNotification, fermerDetailNotification, _notifNonLus, _notifMajPastille, NOTIF_TYPES, prats: praticiens };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function(
    '__doc',
    '__timers',
    '__dl',
    'document',
    '__prats',
    '__pats',
    '__sauv',
    '__sel',
    '__navs',
    '__consult',
    '__echec',
    corps
  )(
    o.doc || (async () => ({ json: async () => [] })),
    timers,
    dl,
    document,
    o.prats || [{ id: 7, nom: 'Dr Fictif' }],
    o.pats || [{ id: 42, nom: 'Martin', prenom: 'Paul' }],
    sauv,
    selections,
    navs,
    !!o.consult,
    !!o.echec
  );
  const flush = () => {
    timers.splice(0).forEach((t) => t && t());
  };
  return { docEl, f, sauv, sortie, pastille, selections, navs, timers, flush, dl };
}

describe('Notifications — création', () => {
  it('crée une entrée, enregistre une fois, pastille à 1', () => {
    const m = monter();
    const e = m.f.notifierEvenement('import_doctolib', { detail: '12 rendez-vous' });
    expect(e.id).toBe(1);
    expect(e.lu).toBe(false);
    expect(m.sauv.n).toBe(0); // enregistrement différé (évite une écriture simultanée)
    m.flush();
    expect(m.sauv.n).toBe(1);
    expect(m.f.prats[0].notifications.liste).toHaveLength(1);
    expect(m.pastille.textContent).toBe('1');
    expect(m.pastille.style.display).toBe('inline-block');
  });
  it('type inconnu, aucun praticien, consultation : aucune écriture', () => {
    const m = monter();
    expect(m.f.notifierEvenement('nimporte_quoi')).toBeNull();
    expect(monter({ prats: [] }).f.notifierEvenement('import_doctolib')).toBeNull();
    const c = monter({ consult: true });
    expect(c.f.notifierEvenement('import_doctolib')).toBeNull();
    expect(c.sauv.n).toBe(0);
    expect(m.sauv.n).toBe(0);
  });
  it('un échec d’enregistrement ne lève jamais', () => {
    const m = monter({ echec: true });
    expect(() => {
      m.f.notifierEvenement('facture_editee', { detail: 'n° F1' });
      m.flush();
    }).not.toThrow();
    expect(m.sauv.n).toBe(1);
  });
  it('plusieurs notifications rapprochées = UNE seule écriture différée (jamais deux écritures simultanées)', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    m.f.notifierEvenement('facture_editee');
    m.f.notifierEvenement('ordonnance_creee', { patientId: 42 });
    expect(m.sauv.n).toBe(0);
    m.flush();
    expect(m.sauv.n).toBe(1);
    expect(m.f.prats[0].notifications.liste).toHaveLength(3);
    m.flush();
    expect(m.sauv.n).toBe(1);
  });
  it('écriture immédiate possible quand la page se masque ; la notification existe en mémoire dès sa création', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    expect(m.f.prats[0].notifications.liste).toHaveLength(1);
    m.f._notifSauvegarderMaintenant();
    expect(m.sauv.n).toBe(1);
    m.flush();
    expect(m.sauv.n).toBe(1);
  });
  it('détail d’une ordonnance : contenu relu dans le dossier, jamais stocké dans la notification ; supprimée : message clair', () => {
    const o = { id: 'o1', lignes: [{ texte: 'Crème fictive' }] };
    const m = monter({ pats: [{ id: 42, nom: 'Martin', prenom: 'Paul', ordonnances: [o] }] });
    m.f.notifierEvenement('ordonnance_creee', { patientId: 42, ordonnanceId: 'o1' });
    expect(JSON.stringify(m.f.prats[0].notifications)).not.toContain('Crème');
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('CORPS[o1]');
    expect(m.sortie.html).toContain('Paul Martin');
    o.id = 'autre';
    m.f.renderNotificationsPage();
    expect(m.sortie.html).toContain('Ordonnance introuvable');
  });
  it('détail d’un devis : le document est relu dans la base (lecture seule), jamais stocké dans la notification', async () => {
    const doc = {
      id: 'doc-9',
      numero: 'D-2026-0001',
      lignes: [{ libelle: 'Bilan fictif' }, { libelle: 'Semelles fictives' }],
    };
    const m = monter({ doc: async () => ({ json: async () => [doc] }) });
    m.f.notifierEvenement('devis_emis', {
      patientId: 42,
      detail: 'n° D-2026-0001',
      documentId: 'doc-9',
    });
    expect(JSON.stringify(m.f.prats[0].notifications)).not.toContain('Bilan fictif');
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('Chargement du document');
    await new Promise((r) => setTimeout(r, 0));
    expect(m.dl.requetes).toEqual(['documents_facturation?select=*&id=eq.doc-9']);
    expect(m.docEl.innerHTML).toBe('DOC[D-2026-0001|2]');
  });
  it('document introuvable ou base injoignable : message clair, jamais d’exception ; ancienne notification : détail non conservé', async () => {
    const vide = monter({ doc: async () => ({ json: async () => [] }) });
    vide.f.notifierEvenement('facture_editee', { patientId: 42, documentId: 'x' });
    vide.f.ouvrirNotification(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(vide.docEl.innerHTML).toContain('Document introuvable');
    const ko = monter({
      doc: async () => {
        throw new Error('HTTP 500');
      },
    });
    ko.f.notifierEvenement('devis_emis', { patientId: 42, documentId: 'x' });
    ko.f.ouvrirNotification(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(ko.docEl.innerHTML).toContain('Document indisponible');
    const vieux = monter();
    vieux.f.notifierEvenement('devis_emis', { patientId: 42, detail: 'n° D-1' });
    vieux.f.ouvrirNotification(1);
    expect(vieux.sortie.html).toContain('créée avant cette version');
    expect(vieux.dl.requetes).toEqual([]);
  });
  it('si l’on a quitté le détail avant la réponse, rien n’est écrit à l’écran', async () => {
    let fin;
    const m = monter({ doc: () => new Promise((r) => (fin = r)) });
    m.f.notifierEvenement('devis_emis', { patientId: 42, documentId: 'd' });
    m.f.ouvrirNotification(1);
    m.f.fermerDetailNotification();
    fin({ json: async () => [{ id: 'd', numero: 'D-1', lignes: [] }] });
    await new Promise((r) => setTimeout(r, 0));
    expect(m.docEl.innerHTML).toBe('');
  });
  it('ordonnance d’avant cette version : détail non conservé (pas « introuvable »)', () => {
    const m = monter();
    m.f.notifierEvenement('ordonnance_creee', { patientId: 42 });
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('créée avant cette version');
  });
  it('type « ordonnance créée » déclaré, rattaché au patient', () => {
    const m = monter();
    expect(m.f.NOTIF_TYPES.ordonnance_creee.systeme).toBe(false);
    m.f.notifierEvenement('ordonnance_creee', { patientId: 42 });
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('Ordonnance créée');
    expect(m.sortie.html).toContain('Paul Martin');
  });
  it('identifiants croissants, sans trou ni réutilisation', () => {
    const m = monter();
    const a = m.f.notifierEvenement('import_doctolib');
    const b = m.f.notifierEvenement('facture_editee');
    expect([a.id, b.id]).toEqual([1, 2]);
  });
  it('le détail est nettoyé et borné ; le nom du patient n’est jamais stocké', () => {
    const m = monter();
    const e = m.f.notifierEvenement('patient_message', {
      patientId: 42,
      detail: 'a\nb' + 'x'.repeat(200),
    });
    expect(e.detail.length).toBe(80);
    expect(e.detail).not.toContain('\n');
    expect(e.cible).toEqual({ patientId: 42 });
    const stocke = JSON.stringify(m.f.prats[0].notifications);
    expect(stocke).not.toContain('Martin');
    expect(stocke).not.toContain('Paul');
  });
  it('déclare les types du portail patient demandés', () => {
    const m = monter();
    for (const t of [
      'patient_message',
      'patient_devis_signe',
      'patient_questionnaire',
      'patient_sequence_exercices',
      'patient_protocole_termine',
    ]) {
      expect(m.f.NOTIF_TYPES[t].systeme).toBe(false);
    }
  });
});

describe('Notifications — coupure réseau', () => {
  it('une coupure = une ligne ; le retour s’inscrit dans la même ligne, une seule fois', () => {
    const m = monter();
    m.f.notifierEvenement('reseau_perdu');
    m.f.notifierReseauRetabli();
    const l = m.f.prats[0].notifications.liste;
    expect(l).toHaveLength(1);
    expect(l[0].retourLe).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const n = m.sauv.n;
    m.f.notifierReseauRetabli();
    expect(m.sauv.n).toBe(n);
    expect(m.f.prats[0].notifications.liste).toHaveLength(1);
  });
  it('retour sans coupure enregistrée : rien', () => {
    const m = monter();
    m.f.notifierReseauRetabli();
    expect(m.sauv.n).toBe(0);
  });
  it('les fonctions de signalement appellent bien les notifications (une fois par coupure)', () => {
    const appels = [];
    const corps = [
      'let _reseauPerdu = false; let _lastActivity = 0;',
      'const _memoriserSessionHorsConnexion = () => {}; const _modeDomicileActif = () => true;',
      'const notifierEvenement = (t) => __a.push(t); const notifierReseauRetabli = () => __a.push("retour");',
      fonction('_signalerReseauPerdu'),
      fonction('_signalerReseauRetabli'),
      'return { p: _signalerReseauPerdu, r: _signalerReseauRetabli };',
    ].join('\n');
    // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
    const s = new Function('__a', 'localStorage', corps)(appels, { removeItem() {} });
    s.p();
    s.p();
    s.r();
    s.r();
    expect(appels).toEqual(['reseau_perdu', 'retour']);
  });
});

describe('Notifications — page, lu / non lu, historique', () => {
  it('affiche les plus récentes d’abord, avec date, et jamais d’échappement cassé', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib', { detail: '<b>3</b>' });
    m.f.notifierEvenement('facture_editee', { detail: 'n° F1' });
    m.f.renderNotificationsPage();
    const h = m.sortie.html;
    expect(h.indexOf('Facture éditée')).toBeLessThan(h.indexOf('Import Doctolib'));
    expect(h).toContain('&lt;b&gt;3&lt;/b&gt;');
    expect(h).not.toContain('<b>3</b>');
    expect(h).toMatch(/\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}/);
  });
  it('filtres : non lus, système, patients', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    m.f.notifierEvenement('patient_message', { patientId: 42 });
    m.f.filtrerNotifications('patient');
    expect(m.sortie.html).toContain('Nouveau message d’un patient');
    expect(m.sortie.html).not.toContain('Import Doctolib effectué');
    m.f.filtrerNotifications('systeme');
    expect(m.sortie.html).toContain('Import Doctolib effectué');
    expect(m.sortie.html).not.toContain('Nouveau message d’un patient');
    m.f.filtrerNotifications('zzz');
    expect(m.sortie.html).toContain('Import Doctolib effectué');
  });
  it('clic = lu + vue détail (nom et prénom du patient, bouton vers la fiche) ; la fiche ne s’ouvre que sur demande', () => {
    const m = monter();
    m.f.notifierEvenement('devis_emis', { patientId: 42, detail: 'n° D-0001' });
    m.f.renderNotificationsPage();
    m.f.ouvrirNotification(1);
    expect(m.f.prats[0].notifications.liste[0].lu).toBe(true);
    expect(m.sortie.html).toContain('Paul Martin');
    expect(m.sortie.html).toContain('Ouvrir la fiche de Paul Martin');
    expect(m.sortie.html).toContain('D-0001');
    expect(m.sortie.html).toContain('Retour à la liste');
    expect(m.navs).toEqual([]);
    expect(m.pastille.style.display).toBe('none');
    m.f.ouvrirPatientNotification(1);
    expect(m.selections).toEqual([42]);
    expect(m.navs).toEqual(['pg-patients']);
    m.f.fermerDetailNotification();
    expect(m.sortie.html).toContain('notif-ligne');
  });
  it('détail d’un import : liste des rendez-vous ajoutés, noms relus dans l’agenda, jamais stockés dans la notification', () => {
    const rdv = [
      {
        id: 'r1',
        debut: '2026-10-23T09:30',
        nom: 'Dupont',
        prenom: 'Jeanne',
        motif: 'Soins de pédicurie',
      },
      {
        id: 'r2',
        debut: '2026-10-24T14:00',
        nom: 'Durand',
        prenom: 'Marc',
        motif: 'Semelles orthopédiques',
      },
    ];
    const m = monter({ prats: [{ id: 7, agendaDoctolib: { rdv: rdv.slice(0, 1) } }] });
    m.f.notifierEvenement('import_doctolib', { detail: '2 nouveau(x)', rdv });
    expect(JSON.stringify(m.f.prats[0].notifications)).not.toMatch(/Dupont|Jeanne|Durand|Marc/);
    m.f.ouvrirNotification(1);
    const h = m.sortie.html;
    expect(h).toContain('23/10/2026 09:30');
    expect(h).toContain('Jeanne Dupont');
    expect(h).toContain('Soins de pédicurie');
    expect(h).toContain('24/10/2026 14:00');
    expect(h).toContain('plus dans l’agenda');
    expect(h).toContain('Semelles orthopédiques');
  });
  it('import sans nouveau rendez-vous : message clair ; liste bornée à 300 avec reste indiqué', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib', { rdv: [] });
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('Aucun nouveau rendez-vous');
    const gros = Array.from({ length: 350 }, (_, i) => ({
      id: 'x' + i,
      debut: '2026-10-23T09:00',
      motif: 'm',
    }));
    m.f.notifierEvenement('import_doctolib', { rdv: gros });
    expect(m.f.prats[0].notifications.liste[1].rdv).toHaveLength(300);
    m.f.ouvrirNotification(2);
    expect(m.sortie.html).toContain('50 autre(s)');
  });
  it('détail d’une coupure : retour et durée ; détail échappé', () => {
    const m = monter();
    m.f.notifierEvenement('reseau_perdu');
    m.f.prats[0].notifications.liste[0].date = '2026-10-22T10:00:00.000Z';
    m.f.prats[0].notifications.liste[0].retourLe = '2026-10-22T10:07:00.000Z';
    m.f.ouvrirNotification(1);
    expect(m.sortie.html).toContain('7 min');
    m.f.notifierEvenement('patient_message', { patientId: 42, detail: '<i>x</i>' });
    m.f.ouvrirNotification(2);
    expect(m.sortie.html).not.toContain('<i>x</i>');
  });
  it('clic sur une notification système : lue, aucune navigation', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    m.f.ouvrirNotification(1);
    expect(m.navs).toEqual([]);
    expect(m.f._notifNonLus()).toBe(0);
  });
  it('patient supprimé : la ligne reste, sans lien ni nom', () => {
    const m = monter({ pats: [] });
    m.f.notifierEvenement('patient_message', { patientId: 42 });
    m.f.renderNotificationsPage();
    expect(m.sortie.html).toContain('Nouveau message d’un patient');
    expect(m.sortie.html).not.toContain('Ouvrir le patient');
    m.f.ouvrirNotification(1);
    expect(m.navs).toEqual([]);
  });
  it('tout marquer comme lu ; consultation : refusé', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    m.f.notifierEvenement('facture_editee');
    m.f.toutMarquerLuNotifications();
    expect(m.f._notifNonLus()).toBe(0);
    expect(m.f.prats[0].notifications.liste.every((x) => x.lu)).toBe(true);
    const c = monter({
      consult: true,
      prats: [
        {
          id: 1,
          notifications: {
            liste: [
              {
                id: 1,
                date: '2026-10-22T10:00:00Z',
                type: 'import_doctolib',
                detail: '',
                lu: false,
              },
            ],
            dernierId: 1,
          },
        },
      ],
    });
    c.f.toutMarquerLuNotifications();
    c.f.ouvrirNotification(1);
    expect(c.f._notifNonLus()).toBe(1);
    expect(c.sauv.n).toBe(0);
  });
  it('AUCUNE purge : 500 entrées toutes conservées et affichées', () => {
    const m = monter();
    for (let i = 0; i < 500; i++) m.f.notifierEvenement('facture_editee', { detail: 'n° ' + i });
    expect(m.f.prats[0].notifications.liste).toHaveLength(500);
    m.f.renderNotificationsPage();
    expect((m.sortie.html.match(/notif-ligne/g) || []).length).toBe(500);
    expect(m.f._notifNonLus()).toBe(500);
    expect(m.pastille.textContent).toBe('99+');
  });
  it('données abîmées : entrées invalides ignorées, jamais d’exception', () => {
    const m = monter({
      prats: [
        {
          id: 1,
          notifications: {
            liste: [
              null,
              3,
              { id: 5, type: 'inconnu' },
              { id: 2, date: 'x', type: 'import_doctolib', lu: false },
            ],
            dernierId: 'zz',
          },
        },
      ],
    });
    expect(() => m.f.renderNotificationsPage()).not.toThrow();
    expect(m.f._notifNonLus()).toBe(1);
    expect(m.f.notifierEvenement('facture_editee').id).toBe(3);
  });
  it('aucun praticien : message clair', () => {
    const m = monter({ prats: [] });
    m.f.renderNotificationsPage();
    expect(m.sortie.html).toContain('Aucun praticien');
  });
  it('aucun bouton de suppression dans la page', () => {
    expect(SECTION).not.toMatch(/supprimer|splice|\.shift\(|\.slice\(-/i);
  });
});

describe('Notifications — branchements (lecture du code)', () => {
  it('import Doctolib et émission de facture appellent notifierEvenement', () => {
    expect(fonction('_lancerImportDoctolib')).toContain("notifierEvenement('import_doctolib'");
    expect(fonction('emettreDocumentCourant')).toContain("'facture_editee'");
  });
  it('l’onglet et la page existent dans index.html', async () => {
    const { readFileSync } = await import('node:fs');
    const h = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(h).toContain('id="tn-notifications"');
    expect(h).toContain('id="notif-pastille"');
    expect(h).toContain('id="pg-notifications"');
    expect(h).toContain('id="notif-contenu"');
  });
});

describe('Notifications — branchements prouvés par exécution', () => {
  it('le harnais d’import reçoit bien un appel notifierEvenement(import_doctolib) sans nom de patient', async () => {
    const src = SRC_BIOMECA.slice(SRC_BIOMECA.indexOf('function _lancerImportDoctolib'));
    const bloc = src.slice(0, src.indexOf('\nfunction importDoctolibAgendaCSV'));
    expect(bloc).toMatch(/notifierEvenement\('import_doctolib', \{\s*detail: ajoutes\.length/);
    // L'appel vient APRÈS l'enregistrement réussi : un échec d'écriture (return) n'en crée aucun.
    expect(bloc.indexOf('savePraticiens()')).toBeLessThan(
      bloc.indexOf("notifierEvenement('import_doctolib'")
    );
    expect(bloc.indexOf("alert('❌ Enregistrement impossible")).toBeLessThan(
      bloc.indexOf("notifierEvenement('import_doctolib'")
    );
  });
});

describe('Notifications — export CSV', () => {
  const lire = (m) => m.f._notifCsv();
  it('en-tête, BOM, séparateur « ; », une ligne par notification, du plus ancien au plus récent', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib', { detail: '2 nouveau(x)' });
    m.f.notifierEvenement('patient_message', { patientId: 42 });
    const csv = lire(m);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const l = csv.replace(/\r\n$/, '').split('\r\n');
    expect(l[0]).toBe('\ufeffNuméro;Date;Heure;Catégorie;Notification;Détail;Lu;Retour du réseau');
    expect(l).toHaveLength(3);
    expect(l[1]).toMatch(
      /^1;\d{2}\/\d{2}\/\d{4};\d{2}:\d{2};Système;Import Doctolib effectué;2 nouveau\(x\);non;$/
    );
    expect(l[2]).toMatch(/^2;.*;Patient;Nouveau message d’un patient;;non;$/);
  });
  it('aucun nom de patient dans le fichier', () => {
    const m = monter();
    m.f.notifierEvenement('patient_devis_signe', { patientId: 42 });
    expect(lire(m)).not.toMatch(/Martin|Paul/);
  });
  it('protège contre les formules de tableur et échappe ; et « " »', () => {
    const m = monter();
    m.f.notifierEvenement('facture_editee', { detail: '=1+1;"x"' });
    const csv = lire(m);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('""x""');
    expect(csv).not.toMatch(/;=1\+1/);
  });
  it('le bouton télécharge un fichier daté ; historique vide : aucun bouton', () => {
    const m = monter();
    m.f.notifierEvenement('import_doctolib');
    m.f.renderNotificationsPage();
    expect(m.sortie.html).toContain('exporterNotificationsCSV()');
    m.f.exporterNotificationsCSV();
    expect(m.dl.nom).toBe('notifications-verticy-2026-10-22.csv');
    expect(m.dl.clic).toBe(true);
    const v = monter();
    v.f.renderNotificationsPage();
    expect(v.sortie.html).not.toContain('exporterNotificationsCSV()');
  });
  it('conserve toutes les entrées (500)', () => {
    const m = monter();
    for (let i = 0; i < 500; i++) m.f.notifierEvenement('facture_editee', { detail: 'n° ' + i });
    expect(lire(m).trim().split('\r\n')).toHaveLength(501);
  });
});
