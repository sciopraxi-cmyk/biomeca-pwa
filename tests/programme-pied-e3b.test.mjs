// Lot e3b : tableau « Exercices du pied » jour par jour (28 jours, sans dose). Données fictives.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

function monter() {
  const dn = SRC_BIOMECA.indexOf('const JOURS_CIRCUITS_NOMS');
  const noms = SRC_BIOMECA.slice(dn, SRC_BIOMECA.indexOf('\n', dn) + 1);
  const dj = SRC_BIOMECA.indexOf('const _PIED_JOURS = [');
  const jours = SRC_BIOMECA.slice(dj, SRC_BIOMECA.indexOf('\n];', dj) + 3);
  const de = SRC_BIOMECA.indexOf('const EXERCICES_PIED_ENFANT = [');
  const exos = SRC_BIOMECA.slice(de, SRC_BIOMECA.indexOf('\n];', de) + 3);
  const ds = SRC_BIOMECA.indexOf('const _PIED_JOURS_SEM');
  const sem = SRC_BIOMECA.slice(ds, SRC_BIOMECA.indexOf('\n', ds) + 1);
  const corps = [
    noms,
    jours,
    exos,
    sem,
    'function _escHtml(s){return String(s);}',
    'var _progModifs = { sp: {}, po: {}, pd: {} }; var _progPiedOuvert = { sp: false, po: false, pd: false };',
    'var _majAppelee = 0; function _progMaj(){ _majAppelee++; } var _scheduleBilanAutosave = function(){};',
    fonction('_progJour'),
    fonction('_progISO'),
    fonction('_progFr'),
    fonction('_progJourPied'),
    fonction('_progPeriodes'),
    fonction('_piedLib'),
    fonction('_progModifsNettoyer'),
    fonction('_progExosJour'),
    fonction('_progExosProgramme'),
    fonction('_progPiedChoisir'),
    fonction('_progPiedRetablir'),
    fonction('_progPiedRafraichir'),
    fonction('_PIED_JOURS_EXOS'),
    fonction('_progPiedTableauHTML'),
    'return { _PIED_JOURS, _progModifs, _progModifsNettoyer, _progExosJour, _progExosProgramme, _progPiedChoisir, _progPiedRetablir, _progPiedTableauHTML, _PIED_JOURS_EXOS, _piedLib, maj: () => _majAppelee };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  return new Function(corps)();
}
const P = (d, f) => ({ pied: { actif: true, debut: d, fin: f } });

describe('programme du pied : 28 jours de la fiche', () => {
  const f = monter();
  it('28 jours, 4 exercices sauf les jours 7, 14, 21 et 28 (1 seul : massage à la balle)', () => {
    expect(f._PIED_JOURS).toHaveLength(28);
    f._PIED_JOURS.forEach((j, i) => expect(j).toHaveLength((i + 1) % 7 === 0 ? 1 : 4));
    expect(f._PIED_JOURS[6]).toEqual(['plantar-massage-ball']);
    expect(f._PIED_JOURS_EXOS()).toHaveLength(12);
  });
  it("jour 1 dans l'ordre exact de la fiche", () => {
    expect(f._PIED_JOURS[0]).toEqual([
      'sensitive-plantar-activation',
      'elevation-talons',
      'grasping-foot-towel',
      'plantar-automassage',
    ]);
  });
  it('retour en sens inverse : jour 29 = jour 27, jour 55 = jour 1', () => {
    expect(f._progExosProgramme({}, 29)).toEqual(f._PIED_JOURS[26]);
    expect(f._progExosProgramme({}, 55)).toEqual(f._PIED_JOURS[0]);
    expect(f._progExosProgramme({}, 56)).toEqual([]);
  });
  it('un jour modifié par le praticien est repris aussi dans le sens inverse', () => {
    const p = { pied: { modifs: { 27: ['short-foot'] } } };
    expect(f._progExosProgramme(p, 27)).toEqual(['short-foot']);
    expect(f._progExosProgramme(p, 29)).toEqual(['short-foot']);
  });
});

describe('modifications du praticien', () => {
  it('nettoie : jours hors 1-28, exercices inconnus, jours identiques à la fiche', () => {
    const f = monter();
    const m = f._progModifsNettoyer({
      3: ['short-foot', 'inconnu'],
      0: ['short-foot'],
      29: ['short-foot'],
      5: f._PIED_JOURS[4],
      6: 'pas une liste',
    });
    expect(m).toEqual({ 3: ['short-foot'] });
  });
  it("choisir un exercice enregistre le jour ; remettre celui de la fiche l'efface", () => {
    const f = monter();
    f._progPiedChoisir('sp', 2, 1, 'short-foot');
    expect(f._progModifs.sp[2]).toEqual([
      'sensitive-plantar-activation',
      'short-foot',
      'toes-spread-out-1',
      'plantar-massage-ball',
    ]);
    f._progPiedChoisir('sp', 2, 1, 'elevation-orteils');
    expect(f._progModifs.sp[2]).toBeUndefined();
    expect(f.maj()).toBe(2);
  });
  it('« — » retire un exercice du jour ; rétablir un jour / tout', () => {
    const f = monter();
    f._progPiedChoisir('po', 7, 0, '');
    expect(f._progModifs.po[7]).toEqual([]);
    f._progPiedChoisir('po', 1, 3, '');
    expect(f._progModifs.po[1]).toHaveLength(3);
    f._progPiedRetablir('po', 7);
    expect(Object.keys(f._progModifs.po)).toEqual(['1']);
    f._progPiedRetablir('po');
    expect(f._progModifs.po).toEqual({});
  });
  it('les 3 bilans ont chacun leurs modifications', () => {
    const f = monter();
    f._progPiedChoisir('sp', 3, 0, 'short-foot');
    expect(f._progModifs.pd[3]).toBeUndefined();
  });
});

describe('tableau affiché dans le bilan', () => {
  it('sans dates : 28 jours sans date, 4 menus par jour, sans aucune dose', () => {
    const f = monter();
    const h = f._progPiedTableauHTML('sp', { pied: { actif: true, debut: '', fin: '' } });
    expect(h).toContain('(28 jours)');
    expect(h).toContain('Jour 28');
    expect((h.match(/<select/g) || []).length).toBe(28 * 4);
    expect(h).not.toMatch(/séries|reps|sec\b|min\/pied|3 x|4 x/i);
  });
  it('avec dates : vraie date de chaque jour (24/10/2026 = samedi)', () => {
    const f = monter();
    const h = f._progPiedTableauHTML('sp', P('2026-10-24', '2026-11-20'));
    expect(h).toContain('sam. 24/10 · Jour 1');
    expect(h).toContain('(28 jours)');
  });
  it('au-delà de 28 jours : retour en sens inverse, plafond 55 jours, lignes en lecture seule', () => {
    const f = monter();
    const h = f._progPiedTableauHTML('sp', P('2026-10-24', '2027-03-01'));
    expect(h).toContain('(55 jours)');
    expect(h).toContain('Jour 29');
    expect(h).toContain('= exercices du jour 27 (retour en sens inverse)');
    expect(h).toContain('= exercices du jour 1 (retour en sens inverse)');
    expect((h.match(/<select/g) || []).length).toBe(28 * 4);
  });
  it('jour modifié signalé ✏️, avec « rétablir »', () => {
    const f = monter();
    f._progPiedChoisir('sp', 4, 0, 'short-foot');
    const h = f._progPiedTableauHTML('sp', P('2026-10-24', '2026-11-20'));
    expect(h).toContain('Jour 4 ✏️');
    expect(h).toContain('1 jour modifié');
    expect(h).toContain('rétablir');
  });
});
