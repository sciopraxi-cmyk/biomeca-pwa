// Lot e3b-2a : construction de la copie du programme envoyée au portail (logique pure). Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const bloc = (deb) => {
    const d = SRC_BIOMECA.indexOf(deb);
    return SRC_BIOMECA.slice(d, SRC_BIOMECA.indexOf('\n', d) + 1);
  };
  const dj = SRC_BIOMECA.indexOf('const _PIED_JOURS = [');
  const jours = SRC_BIOMECA.slice(dj, SRC_BIOMECA.indexOf('\n];', dj) + 3);
  const de = SRC_BIOMECA.indexOf('const EXERCICES_PIED_ENFANT = [');
  const exos = SRC_BIOMECA.slice(de, SRC_BIOMECA.indexOf('\n];', de) + 3);
  const dp = SRC_BIOMECA.indexOf('const _PROG_PATHO = [');
  const patho = SRC_BIOMECA.slice(dp, SRC_BIOMECA.indexOf('\n];', dp) + 3);
  const corps = [
    patho,
    jours,
    exos,
    bloc('const _PROG_TITRES_PORTAIL'),
    fonction('_progJour'),
    fonction('_progISO'),
    fonction('_progJourPied'),
    fonction('_progPeriodes'),
    fonction('_piedLib'),
    fonction('_progExosJour'),
    fonction('_progExosProgramme'),
    fonction('_progHashTexte'),
    fonction('_progExoCodes'),
    fonction('_progCircuitsDe'),
    fonction('_progPortailManques'),
    fonction('_progChronoPortail'),
    fonction('_progPortailConstruire'),
    'return { _progPortailManques, _progExoCodes, _progCircuitsDe, _progChronoPortail, _progPortailConstruire, _PIED_JOURS };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const f = monter();
const ex = (sys, sub, libre = '') => ({
  sys: [sys],
  sub: [sub],
  sysLib: ['C'],
  subLib: ['Nom ' + sub],
  libre,
});
const circ = () => ({
  c1: [ex('cat', 'a'), ex('cat', 'b'), ex('cat', 'c'), ex('cat', 'd')],
  c2: [ex('cat', 'e'), ex('cat', 'f'), ex('cat', 'g'), ex('cat', 'h')],
});
// 2026-10-26 = lundi
const prog = (extra) =>
  Object.assign(
    {
      circuits: true,
      pied: { actif: true, debut: '2026-10-26', fin: '2026-10-29' },
      express: { actif: true, debut: '2026-10-26', fin: '2026-10-29' },
      chauffe: { actif: false, debut: '', fin: '' },
    },
    extra || {}
  );
const sport = (p, j, ratio) => ({
  ttt: Object.assign(circ(), {
    programmes: p,
    jours: j || { express: [], chauffe: [] },
    ch: [{ ratio: ratio || '30/30' }],
  }),
});

describe("exercices d'un circuit", () => {
  it('1 à 3 sous-exercices, code = catégorie|exercice, perso conservé, libre sans vidéo', () => {
    const r = f._progExoCodes({
      sys: ['a', 'b', 'c', 'd'],
      sub: ['1', 'perso:uuid1', '3', '4'],
      subLib: ['N1', 'P', 'N3', 'N4'],
      libre: 'texte libre',
    });
    expect(r.codes).toEqual(['a|1', 'perso:uuid1', 'c|3']);
    expect(r.noms['a|1']).toBe('N1');
    const l = f._progExoCodes({ sys: [''], sub: [''], libre: ' Mon exo ' });
    expect(l.codes).toHaveLength(1);
    expect(l.codes[0]).toMatch(/^libre:/);
    expect(l.noms[l.codes[0]]).toBe('Mon exo');
    expect(f._progExoCodes({ sys: ['a'], sub: [''] }).codes).toEqual([]); // catégorie seule = pas d'exercice
    expect(f._progExoCodes(null).codes).toEqual([]);
  });
});
describe('copie du programme (3 formats de bilan)', () => {
  it('sport : ordre Express 1, pied, Express 2 ; jours consécutifs ; rang du pied', () => {
    const r = f._progPortailConstruire('sport', sport(prog()));
    expect(r.debut).toBe('2026-10-26');
    expect(r.fin).toBe('2026-10-29');
    expect(r.jours).toHaveLength(4);
    expect(r.jours[0].seances.map((s) => s.id)).toEqual(['express1', 'pied', 'express2']);
    expect(r.jours.map((j) => j.rang)).toEqual([1, 2, 3, 4]);
    expect(r.jours[0].seances[1].exos).toEqual(
      f._PIED_JOURS[0].map((c) => ['reeduc-pied|pied-enfant|' + c])
    );
    expect(r.jours[0].seances[0].exos).toEqual([['cat|a'], ['cat|b'], ['cat|c'], ['cat|d']]);
    expect(r.jours[0].seances[0].chrono).toEqual({ type: 'tabata', travail: 20, repos: 10 });
    expect(r.jours[0].seances[1].chrono).toEqual({ type: 'emom', travail: 45, repos: 15 });
    expect(r.noms['cat|a']).toBe('Nom a');
    expect(r.noms['reeduc-pied|pied-enfant|short-foot']).toBeTruthy();
  });
  it('Échauffement : 8 exercices (Express 1 puis 2), rythme 45/15 ou 30/30 repris du bilan', () => {
    const p = prog({ chauffe: { actif: true, debut: '2026-10-26', fin: '2026-10-29' } });
    const a = f._progPortailConstruire('sport', sport(p, null, '45/15'));
    const s0 = a.jours[0].seances;
    expect(s0.map((s) => s.id)).toEqual(['chauffe', 'express1', 'pied', 'express2']);
    expect(s0[0].exos).toHaveLength(8);
    expect(s0[0].exos[4]).toEqual(['cat|e']);
    expect(s0[0].chrono).toEqual({ type: 'emom', travail: 45, repos: 15 });
    expect(f._progPortailConstruire('sport', sport(p)).jours[0].seances[0].chrono).toEqual({
      type: 'emom',
      travail: 30,
      repos: 30,
    });
  });
  it('jours cochés : Express le lundi (1) et mercredi (3) seulement ; le pied tous les jours', () => {
    const r = f._progPortailConstruire('sport', sport(prog(), { express: [1, 3], chauffe: [] }));
    expect(r.jours.map((j) => j.seances.map((s) => s.id).join(','))).toEqual([
      'express1,pied,express2',
      'pied',
      'express1,pied,express2',
      'pied',
    ]);
  });
  it('sens inverse après le jour 28 et modifs du praticien', () => {
    const p = {
      circuits: false,
      pied: { actif: true, debut: '2026-10-26', fin: '2026-12-31', modifs: { 3: ['short-foot'] } },
      express: { actif: false },
      chauffe: { actif: false },
    };
    const r = f._progPortailConstruire('sport', { ttt: { programmes: p } });
    expect(r.jours).toHaveLength(55);
    expect(r.jours[2].seances[0].exos).toEqual([['reeduc-pied|pied-enfant|short-foot']]);
    expect(r.jours[28].seances[0].exos).toEqual(
      f._PIED_JOURS[26].map((c) => ['reeduc-pied|pied-enfant|' + c])
    ); // jour 29 = jour 27
    expect(r.jours[54].rang).toBe(55);
  });
  it('posturo et podopédiatrie : mêmes séances', () => {
    const po = {
      programmes: prog(),
      joursCircuits: { express: [], chauffe: [] },
      circ_ch_ratio: '45/15',
    };
    ['c1', 'c2'].forEach((cx) =>
      [1, 2, 3, 4].forEach((i) => {
        const k = 'circ_' + cx + '_ex' + i;
        po[k + '_sys'] = ['cat'];
        po[k + '_sub'] = [cx + i];
        po[k + '_subLib'] = ['N' + cx + i];
        po[k] = '';
      })
    );
    const a = f._progPortailConstruire('posturo', po);
    expect(a.jours[0].seances[0].exos[0]).toEqual(['cat|c11']);
    const c = circ();
    const pd = {
      programmes: prog({ chauffe: { actif: true, debut: '2026-10-26', fin: '2026-10-29' } }),
      joursCircuits: {},
      circuitsPodo: { c1: c.c1, c2: c.c2, ratio: '45/15' },
    };
    const b = f._progPortailConstruire('podopediatrie', pd);
    expect(b.jours[0].seances[0].chrono.travail).toBe(45);
    expect(b.jours[0].seances[0].exos).toHaveLength(8);
  });
  it('rien à publier : aucun programme actif, ou aucun exercice choisi', () => {
    expect(
      f._progPortailConstruire('sport', {
        ttt: { programmes: { circuits: false, pied: { actif: false }, express: {}, chauffe: {} } },
      })
    ).toBeNull();
    expect(f._progPortailConstruire('sport', {})).toBeNull();
    const vide = {
      ttt: {
        programmes: {
          express: { actif: true, debut: '2026-10-26', fin: '2026-10-27' },
          pied: { actif: false },
          chauffe: { actif: false },
        },
      },
    };
    expect(f._progPortailConstruire('sport', vide)).toBeNull();
  });
  it('chrono : Express 20/10, pied EMOM 45/15 seul', () => {
    expect(f._progChronoPortail('express2', '45/15')).toEqual({
      type: 'tabata',
      travail: 20,
      repos: 10,
    });
    expect(f._progChronoPortail('pied', '30/30')).toEqual({ type: 'emom', travail: 45, repos: 15 });
  });
});

describe('portail patient : affichage du programme (logique pure)', async () => {
  const L = await import('../patient/patient-logique.mjs');
  const contenu = {
    jours: [
      { date: '2026-10-26', rang: 1 },
      { date: '2026-10-27', rang: 2 },
      { date: '2026-10-29', rang: 4 },
    ],
  };
  it('vidéos : seuls les liens YouTube reconnus passent, par le lecteur sans cookie', () => {
    expect(L.urlLecteurVideo('https://youtu.be/AAAAAAAAAAA')).toBe(
      'https://www.youtube-nocookie.com/embed/AAAAAAAAAAA?rel=0'
    );
    expect(L.urlLecteurVideo('https://www.youtube.com/watch?v=BBBBBBBBBBB&t=3')).toContain(
      '/embed/BBBBBBBBBBB'
    );
    expect(L.urlLecteurVideo('https://evil.example/watch?v=AAAAAAAAAAA')).toBeNull();
    expect(L.urlLecteurVideo('javascript:alert(1)')).toBeNull();
    expect(L.urlLecteurVideo('https://youtu.be/AAAAAAAAAAAXXXX')).toBeNull();
  });
  it("fiches PDF : chemin livré avec l'application ou stockage privé, jamais un chemin libre", () => {
    expect(L.pdfPublic('assets/fiches/reeduc-pied/1.1 Exo é.pdf')).toBe(
      '../assets/fiches/reeduc-pied/1.1%20Exo%20%C3%A9.pdf'
    );
    expect(L.pdfPublic('assets/fiches/../../x.pdf')).toBeNull();
    expect(L.pdfPublic('https://evil.example/x.pdf')).toBeNull();
    expect(L.pdfPrive('base/aaaaaaaa-0000-0000-0000-000000000001.pdf')).toBeTruthy();
    expect(L.pdfPrive('base/../secret.pdf')).toBeNull();
    expect(L.pdfPrive('/etc/passwd')).toBeNull();
    expect(L.pdfPrive('a/b/../c.pdf')).toBeNull();
  });
  it("jour affiché : aujourd'hui, sinon le premier / le dernier / le prochain", () => {
    expect(L.jourProgramme(contenu, '2026-10-27')).toEqual({ index: 1, etat: 'jour' });
    expect(L.jourProgramme(contenu, '2026-10-28')).toEqual({ index: 2, etat: 'jour' });
    expect(L.jourProgramme(contenu, '2026-10-01')).toEqual({ index: 0, etat: 'avant' });
    expect(L.jourProgramme(contenu, '2026-12-01')).toEqual({ index: 2, etat: 'apres' });
    expect(L.jourProgramme({ jours: [] }, '2026-10-27')).toBeNull();
    expect(L.libelleJour(contenu, 2)).toBe('Jour 4 sur 4');
  });
  it('exercice affichable : nom, vidéos reconnues, fiche ; inconnu = null', () => {
    const cat = {
      a: {
        nom: 'A',
        liens: ['https://youtu.be/AAAAAAAAAAA', 'nimporte quoi'],
        pdf: 'assets/fiches/x/1.pdf',
        texte: 'T',
      },
      b: { nom: 'B', liens: [], pdf: 'base/aaaaaaaa-0000-0000-0000-000000000001.pdf' },
    };
    expect(L.exerciceAffichable(cat, 'a').videos).toHaveLength(1);
    expect(L.exerciceAffichable(cat, 'a').pdfPublic).toBe('../assets/fiches/x/1.pdf');
    expect(L.exerciceAffichable(cat, 'b').pdfPrive).toBeTruthy();
    expect(L.exerciceAffichable(cat, 'zzz')).toBeNull();
  });
  it('chrono : phrases Express et Échauffement', () => {
    expect(L.phraseChrono({ type: 'tabata', travail: 20, repos: 10 })).toContain(
      '20 s d’effort, 10 s de repos'
    );
    expect(L.phraseChrono({ type: 'emom', travail: 45, repos: 15 })).toContain(
      '1 exercice par minute'
    );
  });
});

describe('modules cochés sans exercice', () => {
  it('signale Échauffement, Express 1 et Express 2 sans exercice ; rien si tout est rempli', () => {
    const vide = {
      ttt: {
        programmes: prog({ chauffe: { actif: true, debut: '2026-10-26', fin: '2026-10-29' } }),
      },
    };
    expect(f._progPortailManques('sport', vide)).toEqual([
      'Échauffement',
      'Express 1',
      'Express 2',
    ]);
    expect(
      f._progPortailManques(
        'sport',
        sport(prog({ chauffe: { actif: true, debut: '2026-10-26', fin: '2026-10-29' } }))
      )
    ).toEqual([]);
    const demi = sport(prog());
    demi.ttt.c2 = [];
    expect(f._progPortailManques('sport', demi)).toEqual(['Express 2']);
    expect(
      f._progPortailManques('sport', {
        ttt: { programmes: { pied: { actif: true, debut: '2026-10-26', fin: '2026-10-27' } } },
      })
    ).toEqual([]);
  });
});

describe('séances absentes du jour affiché', async () => {
  const L = await import('../patient/patient-logique.mjs');
  const s = (id) => ({ id, titre: id });
  const contenu = {
    jours: [
      { date: '2026-10-24', seances: [s('pied')] },
      { date: '2026-10-25', seances: [s('pied')] },
      { date: '2026-10-26', seances: [s('chauffe'), s('express1'), s('pied'), s('express2')] },
      { date: '2026-10-27', seances: [s('pied')] },
    ],
  };
  it('samedi : Échauffement et Express absents, prochaine date = lundi', () => {
    expect(L.seancesAbsentes(contenu, 0).map((a) => [a.id, a.date])).toEqual([
      ['chauffe', '2026-10-26'],
      ['express1', '2026-10-26'],
      ['express2', '2026-10-26'],
    ]);
  });
  it("jour complet : rien d'absent ; après la dernière séance : date nulle", () => {
    expect(L.seancesAbsentes(contenu, 2)).toEqual([]);
    expect(L.seancesAbsentes(contenu, 3).map((a) => a.date)).toEqual([null, null, null]);
    expect(L.seancesAbsentes(contenu, 9)).toEqual([]);
  });
});

describe('fiches de réathlétisation (fiches seules, chantier B lot 4)', () => {
  const fiches = (...k) => k.reduce((o, x) => ({ ...o, [x]: true }), {});
  it('sans programme actif mais avec une fiche : copie à 0 jour et la liste « fiches »', () => {
    const r = f._progPortailConstruire('sport', {
      ttt: { programmes: { patho: fiches('achille') } },
    });
    expect(r.jours).toEqual([]);
    expect(r.fiches).toEqual([
      "pathologies-pied|1. Programme de réathlétisation d'une tendinopathie d'Achille",
    ]);
  });
  it("fiches dans l'ordre de la liste (genou, hanche, pied), avec les séances du programme du pied", () => {
    const r = f._progPortailConstruire(
      'sport',
      sport(prog({ patho: fiches('fibulaires', 'bit', 'pubalgie') }))
    );
    expect(r.fiches.map((c) => c.split('|')[0])).toEqual([
      'pathologies-genou',
      'pathologies-hanche',
      'pathologies-pied',
    ]);
    expect(r.jours.length).toBeGreaterThan(0);
  });
  it('sans case cochée : aucune clé « fiches » (copie identique à avant), et rien à publier sans programme', () => {
    expect(f._progPortailConstruire('sport', sport(prog())).fiches).toBeUndefined();
    expect(f._progPortailConstruire('sport', { ttt: { programmes: {} } })).toBeNull();
    expect(f._progPortailConstruire('sport', { ttt: { programmes: { patho: {} } } })).toBeNull();
  });
  it('clé inconnue dans patho : ignorée', () => {
    expect(
      f._progPortailConstruire('sport', { ttt: { programmes: { patho: { nimporte: true } } } })
    ).toBeNull();
  });
});
