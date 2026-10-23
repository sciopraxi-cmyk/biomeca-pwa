// Lot e3a : programme du patient (dates par défaut, séances par jour). Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const debut = SRC_BIOMECA.indexOf('const _PROG_LIBELLES');
  const lib = SRC_BIOMECA.slice(debut, SRC_BIOMECA.indexOf('\n', debut) + 1);
  const corps = [
    lib,
    fonction('_progJour'),
    fonction('_progISO'),
    fonction('_progFr'),
    fonction('_progDefaut'),
    fonction('_progPeriodes'),
    fonction('_progSeances'),
    fonction('_progTexteSeances'),
    fonction('_progLignesRapport'),
    'return { _progDefaut, _progSeances, _progTexteSeances, _progLignesRapport };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const P = (a, d, f) => ({ actif: a, debut: d, fin: f });

describe('programme du patient', () => {
  const f = monter();
  it('dates par défaut : lendemain du bilan, 28 jours', () => {
    expect(f._progDefaut('2026-10-23')).toEqual({ debut: '2026-10-24', fin: '2026-11-20' });
    expect(f._progDefaut('2026-12-31')).toEqual({ debut: '2027-01-01', fin: '2027-01-28' });
    expect(f._progDefaut('')).toEqual({ debut: '', fin: '' });
  });
  it('Express + programme du pied, même période : 3 séances', () => {
    const s = f._progSeances({
      pied: P(true, '2026-10-24', '2026-11-20'),
      express: P(true, '2026-10-24', '2026-11-20'),
      chauffe: P(false, '', ''),
    });
    expect(s).toHaveLength(1);
    expect(s[0].seances).toEqual(['Express 1', 'programme du pied du jour', 'Express 2']);
  });
  it('Échauffement + programme du pied : 2 séances', () => {
    const s = f._progSeances({
      pied: P(true, '2026-10-24', '2026-11-20'),
      express: P(false, '', ''),
      chauffe: P(true, '2026-10-24', '2026-11-20'),
    });
    expect(s[0].seances).toEqual(['Échauffement', 'programme du pied du jour']);
  });
  it('les trois ensemble : Échauffement, Express 1, programme, Express 2', () => {
    const s = f._progSeances({
      pied: P(true, '2026-10-24', '2026-11-20'),
      express: P(true, '2026-10-24', '2026-11-20'),
      chauffe: P(true, '2026-10-24', '2026-11-20'),
    });
    expect(s[0].seances).toEqual([
      'Échauffement',
      'Express 1',
      'programme du pied du jour',
      'Express 2',
    ]);
  });
  it("périodes qui ne se chevauchent qu'en partie : tronçons séparés", () => {
    const s = f._progSeances({
      pied: P(true, '2026-10-24', '2026-11-20'),
      express: P(true, '2026-10-24', '2026-11-06'),
      chauffe: P(false, '', ''),
    });
    expect(s.map((t) => [t.debut, t.fin, t.seances.length])).toEqual([
      ['2026-10-24', '2026-11-06', 3],
      ['2026-11-07', '2026-11-20', 1],
    ]);
  });
  it("le programme du pied s'arrête au jour 28 ; fin avant début ignorée ; rien de coché = rien", () => {
    const s = f._progSeances({
      pied: P(true, '2026-10-24', '2027-03-01'),
      express: P(false, '', ''),
      chauffe: P(false, '', ''),
    });
    expect(s[0].fin).toBe('2026-11-20');
    expect(f._progSeances({ pied: P(true, '2026-11-20', '2026-10-24') })).toEqual([]);
    expect(f._progSeances({})).toEqual([]);
    expect(f._progSeances(undefined)).toEqual([]);
  });
  it('texte du rapport', () => {
    const l = f._progLignesRapport({
      pied: P(true, '2026-10-24', '2026-11-20'),
      express: P(true, '2026-10-24', '2026-11-20'),
      chauffe: P(false, '', ''),
    });
    expect(l[0]).toBe(
      'Programme de renforcement des muscles profonds des pieds : du 24/10/2026 au 20/11/2026'
    );
    expect(l[1]).toBe('Circuits Express 1 et 2 : du 24/10/2026 au 20/11/2026');
    expect(l[2]).toBe(
      'Du 24/10/2026 au 20/11/2026 : 3 séances par jour (Express 1, programme du pied du jour, Express 2)'
    );
  });
});
