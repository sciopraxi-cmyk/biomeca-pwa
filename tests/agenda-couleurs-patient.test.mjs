// ═══════════════════════════════════════════════════════════
// Agenda : couleurs par compte, patient lié à un événement, téléphone
// ═══════════════════════════════════════════════════════════
// Section EXTRAITE de js/biomeca.js (« Agenda : couleurs par compte » → « FIN AGENDA COULEURS »).
// Aucun réseau. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const debut = SRC_BIOMECA.indexOf('// ===== Agenda : couleurs par compte');
const fin = SRC_BIOMECA.indexOf('// ===== FIN AGENDA COULEURS');
if (debut < 0 || fin <= debut) throw new Error('repères de la section agenda introuvables');
const SECTION = SRC_BIOMECA.slice(debut, fin);

function monter(o = {}) {
  const sauv = { n: 0, modale: null, rendus: 0 };
  const corps = [
    'const window = { _accessLevel: __acces };',
    'let praticiens = __prats; let patients = __patients;',
    'const agCal = { googleConnections: __cx, appleConnected: false };',
    'const savePraticiens = () => { __sauv.n++; };',
    'const showAccessRestrictedModal = (r) => { __sauv.modale = r; };',
    'const renderAgendaCalendar = () => { __sauv.rendus++; };',
    'const _escHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));',
    'const _accessPermetCreationDocument = () => { const l = window._accessLevel; return !l || l === "full"; };',
    'const _doctolibStock = () => ({ rdv: [] });',
    'const document = { getElementById: () => null };',
    SECTION,
    `return { ${[...SECTION.matchAll(/\nfunction (\w+)/g)].map((m) => m[1]).join(', ')}, AG_PALETTE, AG_MOTIFS, prats: praticiens };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function('__prats', '__patients', '__cx', '__acces', '__sauv', corps)(
    o.prats || [{ id: 7 }],
    o.patients || [],
    o.cx || [],
    o.acces,
    sauv
  );
  return { f, sauv };
}
const CX = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];

describe('couleurs par compte', () => {
  it('chaque compte a une couleur par défaut distincte, lisible (encre foncée)', () => {
    const { f } = monter({ cx: CX });
    const cles = ['google:c1', 'google:c2', 'google:c3', 'apple', 'doctolib'];
    const fg = cles.map((c) => f._agCouleur(c).fg);
    expect(new Set(fg).size).toBe(cles.length);
    for (const c of f.AG_PALETTE) {
      const n = parseInt(c.fg.slice(1), 16);
      const lum =
        (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
      expect(lum).toBeLessThan(0.45); // texte foncé sur fond clair (le bug : texte bleu sur vert sombre)
    }
    expect(f._agCouleur('google:c1').bg).toMatch(/^rgba\(\d+,\d+,\d+,0\.15\)$/);
  });
  it('le choix du praticien prime, une valeur invalide est ignorée', () => {
    const { f } = monter({
      cx: CX,
      prats: [{ id: 7, agendaCouleurs: { 'google:c1': 2, apple: 99, doctolib: 'x' } }],
    });
    expect(f._agIndexCouleur('google:c1')).toBe(2);
    expect(f._agIndexCouleur('apple')).toBe(4);
    expect(f._agIndexCouleur('doctolib')).toBe(5);
  });
  it('style d’événement : variables CSS pour google, apple, doctolib ; rien pour une source inconnue', () => {
    const { f } = monter({ cx: CX });
    expect(f._agEventAccentStyle({ source: 'google', connectionId: 'c2' })).toContain(
      '--ev-fg:' + f.AG_PALETTE[1].fg
    );
    expect(f._agEventAccentStyle({ source: 'apple' })).toContain('--ev-bg:');
    expect(f._agEventAccentStyle({ source: 'doctolib' })).toContain('--ev-fg-hover:#fff');
    expect(f._agEventAccentStyle({ source: 'autre' })).toBe('');
  });
  it('agChoisirCouleur : écrit par savePraticiens, refuse clé et indice invalides', () => {
    const { f, sauv } = monter({ cx: CX });
    f.agChoisirCouleur('google:c1', 3);
    expect(f.prats[0].agendaCouleurs).toEqual({ 'google:c1': 3 });
    expect(sauv.n).toBe(1);
    f.agChoisirCouleur('google:c1', 99);
    f.agChoisirCouleur("x');alert(1);//", 1);
    f.agChoisirCouleur('google:c1', 1.5);
    expect(f.prats[0].agendaCouleurs).toEqual({ 'google:c1': 3 });
    expect(sauv.n).toBe(1);
    f.agChoisirCouleur('doctolib', 0);
    expect(f.prats[0].agendaCouleurs).toEqual({ 'google:c1': 3, doctolib: 0 });
  });
  it('abonnement terminé : aucun changement de couleur', () => {
    const { f, sauv } = monter({ acces: 'readonly' });
    f.agChoisirCouleur('apple', 1);
    expect(f.prats[0].agendaCouleurs).toBeUndefined();
    expect(sauv.modale).toBe('create_document');
  });
});

describe('titre Google = initiales seulement', () => {
  it.each([
    ['Durand', 'Lucie', 'L.D.'],
    ['martin', 'paul', 'P.M.'],
    ['Éluard', 'Émile', 'É.É.'],
    ['Durand', '', 'D.'],
    ['', '', ''],
  ])('%s %s → %s', (nom, prenom, attendu) => {
    const { f } = monter();
    expect(f._agInitiales(nom, prenom)).toBe(attendu);
  });
  it('« initiales – motif », sans nom complet ni téléphone', () => {
    const { f } = monter();
    const t = f._agTitrePatient(
      { nom: 'Durand', prenom: 'Lucie', tel: '0600000000' },
      'Bilan podologique'
    );
    expect(t).toBe('L.D. – Bilan podologique');
    expect(t).not.toMatch(/Durand|Lucie|0600/);
    expect(f._agTitrePatient({ nom: 'Durand', prenom: 'Lucie' }, '')).toBe('L.D.');
    expect(f._agTitrePatient(null, '')).toBe('RDV');
  });
  it('le motif est borné', () => {
    const { f } = monter();
    expect(f._agTitrePatient({ nom: 'A', prenom: 'B' }, 'x'.repeat(500)).length).toBeLessThan(100);
  });
});

describe('lien patient ↔ événement et téléphone', () => {
  const P = [
    { id: 11, nom: 'Durand', prenom: 'Lucie', ddn: '1985-03-12', tel: '06 00 00 00 00' },
    { id: 12, nom: 'Martin', prenom: 'Paul', ddn: '', tel: '' },
  ];
  it('nom complet et motif affichés dans Verticy seulement pour un événement lié', () => {
    const { f } = monter({
      patients: P,
      prats: [{ id: 7, agendaLiens: { ev1: { patientId: 11, motif: 'Suivi' } } }],
    });
    const ev = f._agEnrichir([
      { id: 'ev1', summary: 'L.D. – Suivi', source: 'google' },
      { id: 'ev2', summary: 'Réunion', source: 'google' },
      { id: 'ev1', summary: 'ev1 apple', source: 'apple' },
    ]);
    expect(f._agLabel(ev[0])).toBe('Durand Lucie – Suivi');
    expect(f._agLabel(ev[1])).toBe('Réunion');
    expect(f._agLabel(ev[2])).toBe('ev1 apple');
    expect(f._agTelDe(ev[0])).toBe('06 00 00 00 00');
  });
  it('patient supprimé : retombe sur le titre Google sans exception', () => {
    const { f } = monter({
      patients: [],
      prats: [{ id: 7, agendaLiens: { ev1: { patientId: 11, motif: 'Suivi' } } }],
    });
    const ev = f._agEnrichir([{ id: 'ev1', summary: 'L.D. – Suivi', source: 'google' }]);
    expect(f._agLabel(ev[0])).toBe('L.D. – Suivi');
  });
  it('téléphone : celui de l’événement (Doctolib) d’abord, sinon celui de la fiche', () => {
    const { f } = monter({ patients: P });
    expect(f._agTelDe({ tel: '0611111111', patientId: 11 })).toBe('0611111111');
    expect(f._agTelDe({ tel: '', patientId: 11 })).toBe('06 00 00 00 00');
    expect(f._agTelDe({ tel: '', patientId: 12 })).toBe('');
    expect(f._agTelDe({})).toBe('');
  });
  it('téléphone nettoyé : pas de balise ni de caractère injectable', () => {
    const { f } = monter();
    expect(f._agTelSur('<img src=x onerror=alert(1)>06')).toMatch(/^[0-9+ .()-]*$/);
    expect(f._agTelSur('+33 6 00 00 00 00\'"')).toBe('+33 6 00 00 00 00');
    expect(f._agTelSur(null)).toBe('');
    const bloc = f._agBlocContact({ tel: '06 00 00 00 00' });
    expect(bloc).toContain('href="tel:0600000000"');
    expect(f._agBlocContact({ tel: '' })).toBe('');
  });
  it('écriture du lien : savePraticiens seulement, retrait sans écriture inutile', () => {
    const { f, sauv } = monter({ patients: P });
    f._agEcrireLien('ev9', null, '');
    expect(sauv.n).toBe(0);
    f._agEcrireLien('ev9', 11, 'Suivi');
    expect(f.prats[0].agendaLiens).toEqual({ ev9: { patientId: 11, motif: 'Suivi' } });
    expect(sauv.n).toBe(1);
    f._agEcrireLien('ev9', null, '');
    expect(f.prats[0].agendaLiens).toEqual({});
    expect(sauv.n).toBe(2);
  });
  it('liste de patients triée, avec la date de naissance pour départager les homonymes', () => {
    const { f } = monter({
      patients: [
        { id: 2, nom: 'Martin', prenom: 'Paul', ddn: '1999-09-09' },
        { id: 1, nom: 'Martin', prenom: 'Paul', ddn: '1970-01-01' },
        { id: 3, nom: 'Bernard', prenom: 'Zoé' },
        { id: 4, nom: '', prenom: '' },
      ],
    });
    expect(f._agPatientChoix().map((x) => x.label)).toEqual([
      'Bernard Zoé',
      'Martin Paul – 01/01/1970',
      'Martin Paul – 09/09/1999',
    ]);
  });
});

describe('bandeau d’échec Google', () => {
  it('raison lisible selon le message du serveur', () => {
    const { f } = monter();
    expect(f._agRaisonEchecGoogle('token refresh failed: invalid_grant')).toMatch(/expiré|retirée/);
    expect(f._agRaisonEchecGoogle('Token has been expired or revoked.')).toMatch(/expiré|retirée/);
    expect(f._agRaisonEchecGoogle('Rate Limit Exceeded')).toMatch(/limite/);
    expect(f._agRaisonEchecGoogle('???')).toMatch(/refusé/);
  });
});

describe('contrat', () => {
  it('aucun réseau, aucun stockage direct dans la section', () => {
    expect(SECTION).not.toMatch(
      /\bfetch\s*\(|authFetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|saveToSupabase/
    );
    expect(SECTION).toMatch(/savePraticiens\(\)/);
  });
  it('le titre envoyé à Google passe par les initiales (pas de nom complet dans le corps de requête)', () => {
    const i = SRC_BIOMECA.indexOf('async function saveAgendaEvent()');
    const corps = SRC_BIOMECA.slice(i, SRC_BIOMECA.indexOf('async function deleteAgendaEvent()'));
    expect(corps).toMatch(/_agTitrePatient\(patient, motif\)/);
    expect(corps).not.toMatch(/patient\.nom|patient\.prenom|patient\.tel/);
  });
});
