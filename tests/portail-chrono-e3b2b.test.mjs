// Lot e3b-2b : chrono (pause, passer), séances validées, « Bravo ». Données fictives.
import { describe, it, expect } from 'vitest';
import {
  planChrono,
  etatChrono,
  debutExerciceMs,
  exerciceSuivantMs,
  formaterTemps,
  cleValidation,
  cleExo,
  indexerExos,
  exosTermines,
  indexerValidations,
  situationJour,
  PREPARATION_S,
} from '../patient/patient-logique.mjs';

const express = {
  id: 'express1',
  chrono: { type: 'tabata', travail: 20, repos: 10 },
  exos: [['a'], ['b'], ['c'], ['d']],
};
const pied = {
  id: 'pied',
  chrono: { type: 'emom', travail: 45, repos: 15 },
  exos: [['a'], ['b'], ['c'], ['d']],
};
const piedUn = { id: 'pied', chrono: { type: 'emom', travail: 45, repos: 15 }, exos: [['a']] };

describe('plan du chrono', () => {
  it('Express : prêt 5 s puis 4 × (20 s + 10 s) = 2 min 5 s', () => {
    const p = planChrono(express);
    expect(p.etapes[0]).toEqual({ exo: 0, phase: 'prep', duree: PREPARATION_S });
    expect(p.etapes.length).toBe(9);
    expect(p.total).toBe(5 + 4 * 30);
  });
  it('pied EMOM 45/15 : 1 min par exercice, un seul exercice = 1 min 5 s', () => {
    expect(planChrono(pied).total).toBe(5 + 4 * 60);
    expect(planChrono(piedUn).total).toBe(65);
  });
  it('échauffement 30/30 et 45/15 (8 exercices)', () => {
    const e = (r) => ({
      chrono: { type: 'emom', ...r },
      exos: Array.from({ length: 8 }, () => ['x']),
    });
    expect(planChrono(e({ travail: 30, repos: 30 })).total).toBe(5 + 8 * 60);
    expect(planChrono(e({ travail: 45, repos: 15 })).total).toBe(5 + 8 * 60);
  });
  it('sans chrono valide : null', () => {
    expect(planChrono(null)).toBeNull();
    expect(planChrono({ exos: [['a']] })).toBeNull();
    expect(planChrono({ chrono: { travail: 0, repos: 5 }, exos: [['a']] })).toBeNull();
    expect(planChrono({ chrono: { travail: 20, repos: 10 }, exos: [] })).toBeNull();
    expect(planChrono({ chrono: { travail: 'x', repos: 10 }, exos: [['a']] })).toBeNull();
    expect(
      planChrono({
        chrono: { travail: 20, repos: 10 },
        exos: Array.from({ length: 13 }, () => ['a']),
      })
    ).toBeNull();
  });
});

describe('état du chrono', () => {
  const p = planChrono(express);
  it('suit prêt → effort → repos → exercice suivant → fin', () => {
    expect(etatChrono(p, 0)).toMatchObject({ phase: 'prep', restantS: 5, termine: false });
    expect(etatChrono(p, 4999)).toMatchObject({ phase: 'prep', restantS: 1 });
    expect(etatChrono(p, 5000)).toMatchObject({ phase: 'travail', exo: 0, restantS: 20 });
    expect(etatChrono(p, 24999)).toMatchObject({ phase: 'travail', exo: 0, restantS: 1 });
    expect(etatChrono(p, 25000)).toMatchObject({ phase: 'repos', exo: 0, restantS: 10 });
    expect(etatChrono(p, 35000)).toMatchObject({ phase: 'travail', exo: 1, restantS: 20 });
    expect(etatChrono(p, 5000 + 3 * 30000 + 25000)).toMatchObject({ phase: 'repos', exo: 3 });
    expect(etatChrono(p, p.total * 1000 - 1)).toMatchObject({
      termine: false,
      exo: 3,
      restantS: 1,
    });
    expect(etatChrono(p, p.total * 1000)).toMatchObject({ termine: true, restantS: 0 });
    expect(etatChrono(p, 9e9).termine).toBe(true);
  });
  it('valeurs aberrantes : traitées comme 0', () => {
    expect(etatChrono(p, -50).phase).toBe('prep');
    expect(etatChrono(p, NaN).phase).toBe('prep');
  });
  it("la PAUSE : un temps écoulé figé donne le même état, quelle que soit l'heure", () => {
    const avant = etatChrono(p, 41234);
    expect(etatChrono(p, 41234)).toEqual(avant);
    expect(avant).toMatchObject({ phase: 'travail', exo: 1 });
  });
  it("Passer : début de l'effort de l'exercice suivant ; pendant « Prêt ? » : du premier ; au dernier : fin", () => {
    expect(exerciceSuivantMs(p, 1000)).toBe(5000);
    expect(exerciceSuivantMs(p, 6000)).toBe(35000);
    expect(exerciceSuivantMs(p, 28000)).toBe(35000); // pendant le repos de l'exercice 1
    expect(exerciceSuivantMs(p, 5000 + 3 * 30000 + 3000)).toBe(p.total * 1000);
    expect(exerciceSuivantMs(p, p.total * 1000)).toBe(p.total * 1000);
    expect(etatChrono(p, exerciceSuivantMs(p, 6000))).toMatchObject({ phase: 'travail', exo: 1 });
  });
  it("Recommencer l'exercice : début de son effort", () => {
    expect(debutExerciceMs(p, 2000)).toBe(0);
    expect(debutExerciceMs(p, 50000)).toBe(35000);
    expect(debutExerciceMs(p, 28000)).toBe(5000); // pendant le repos : retour à l'effort du même exercice
    expect(etatChrono(p, debutExerciceMs(p, 50000))).toMatchObject({
      phase: 'travail',
      exo: 1,
      restantS: 20,
    });
  });
  it('un seul exercice : Passer termine le chrono', () => {
    const u = planChrono(piedUn);
    expect(exerciceSuivantMs(u, 10000)).toBe(u.total * 1000);
  });
});

describe('temps affiché', () => {
  it('format m:ss', () => {
    expect(formaterTemps(0)).toBe('0:00');
    expect(formaterTemps(5)).toBe('0:05');
    expect(formaterTemps(65)).toBe('1:05');
    expect(formaterTemps(-3)).toBe('0:00');
    expect(formaterTemps('x')).toBe('0:00');
  });
});

describe('séances validées et « Bravo »', () => {
  const contenu = {
    jours: [
      { date: '2026-10-26', seances: [{ id: 'pied' }, { id: 'express1' }] },
      { date: '2026-10-27', seances: [{ id: 'pied' }] },
      { date: '2026-10-28', seances: [] },
    ],
  };
  const v = (...l) => indexerValidations(l.map(([jour, seance_id]) => ({ jour, seance_id })));
  it('clé et index (lignes invalides ignorées)', () => {
    expect(cleValidation('2026-10-26', 'pied')).toBe('2026-10-26|pied');
    const m = indexerValidations([
      { jour: '2026-10-26', seance_id: 'pied' },
      { jour: 'n', seance_id: 'x' },
      null,
      { jour: '2026-10-26' },
    ]);
    expect(m.size).toBe(1);
    expect(indexerValidations(null).size).toBe(0);
  });
  it("à jour seulement quand TOUTES les séances du jour d'aujourd'hui sont validées", () => {
    const auj = '2026-10-26';
    expect(situationJour(contenu, 0, v(), auj)).toMatchObject({
      total: 2,
      faites: 0,
      aJour: false,
      jourMeme: true,
    });
    expect(situationJour(contenu, 0, v(['2026-10-26', 'pied']), auj)).toMatchObject({
      faites: 1,
      aJour: false,
      nonFaites: ['express1'],
    });
    expect(
      situationJour(contenu, 0, v(['2026-10-26', 'pied'], ['2026-10-26', 'express1']), auj)
    ).toMatchObject({ faites: 2, aJour: true, nonFaites: [] });
  });
  it("une validation d'un autre jour ne compte pas ; jour passé complet n'est pas « Bravo »", () => {
    expect(situationJour(contenu, 1, v(['2026-10-26', 'pied']), '2026-10-27').faites).toBe(0);
    expect(
      situationJour(contenu, 0, v(['2026-10-26', 'pied'], ['2026-10-26', 'express1']), '2026-10-27')
    ).toMatchObject({ passe: true, aJour: false });
  });
  it('jour sans séance : jamais « Bravo » ; index absent : vide', () => {
    expect(situationJour(contenu, 2, v(), '2026-10-28').aJour).toBe(false);
    expect(situationJour(contenu, 9, v(), '2026-10-28')).toMatchObject({ total: 0, aJour: false });
    expect(situationJour(null, 0, v(), '2026-10-28').total).toBe(0);
  });
});

describe('exercices validés automatiquement', () => {
  const p = planChrono({
    chrono: { type: 'tabata', travail: 20, repos: 10 },
    exos: [['a', 'b'], ['c', 'd', 'e'], ['f'], ['g']],
  });
  it('un exercice est terminé dès que son repos commence', () => {
    expect(exosTermines(p, 0)).toBe(0);
    expect(exosTermines(p, 5000)).toBe(0); // début de l'effort 1
    expect(exosTermines(p, 24999)).toBe(0);
    expect(exosTermines(p, 25000)).toBe(1); // repos 1
    expect(exosTermines(p, 35000)).toBe(1); // effort 2
    expect(exosTermines(p, 5000 + 30000 + 20000)).toBe(2);
    expect(exosTermines(p, 5000 + 3 * 30000 + 20000)).toBe(4); // dernier effort fini
    expect(exosTermines(p, p.total * 1000)).toBe(4);
    expect(exosTermines(p, 9e9)).toBe(4);
  });
  it('plusieurs sous-exercices = UN exercice du chrono (un seul compteur)', () => {
    expect(p.nbExos).toBe(4);
    expect(p.etapes.filter((e) => e.phase === 'travail').length).toBe(4);
  });
  it('Passer pendant l’effort : l’exercice sauté n’est pas compté une fois le saut fait', () => {
    // simulation du compteur du portail : après un saut, compte = exosTermines(nouveau temps)
    let compte = 0;
    const avance = (ms) => {
      const n = exosTermines(p, ms);
      const valides = [];
      while (compte < n) valides.push(compte++);
      return valides;
    };
    expect(avance(10000)).toEqual([]);
    const saut = exerciceSuivantMs(p, 10000); // effort 1 → effort 2
    compte = exosTermines(p, saut);
    expect(compte).toBe(1);
    expect(avance(saut + 20000)).toEqual([1]); // l'exercice 2 (rang 1) est validé en allant au bout ; l'exercice 1 jamais
  });
  it('clés et index (lignes invalides ignorées)', () => {
    expect(cleExo('2026-10-26', 'pied', 2)).toBe('2026-10-26|pied|2');
    const s = indexerExos([
      { jour: '2026-10-26', seance_id: 'pied', exo: 0 },
      { jour: 'x', seance_id: 'pied', exo: 0 },
      { jour: '2026-10-26', seance_id: 'pied', exo: '1' },
      null,
    ]);
    expect([...s]).toEqual(['2026-10-26|pied|0']);
    expect(indexerExos(null).size).toBe(0);
  });
});
