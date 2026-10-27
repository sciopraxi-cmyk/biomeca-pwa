// #265 — hypothèses de mécanisme lésionnel : données générées depuis le document validé + moteur de règles.
import { describe, it, expect } from 'vitest';
import {
  REGLES,
  SOURCES,
  PRUDENCE,
  evaluer,
  synthese,
  reglesManuelles,
  htmlRapport,
  htmlHypothese,
} from '../js/mannequin3d/mecanismes.js';
import { PAR_ID, TABLEAUX } from '../js/mannequin3d/parametres.js';

const ids = (v) => evaluer(v).map((h) => h.regle.id);

describe('données du document (48 règles, sources relues)', () => {
  it('48 règles R01–R48 uniques ; 10 phrases de prudence ; sources présentes', () => {
    expect(REGLES.map((r) => r.id)).toEqual(
      Array.from({ length: 48 }, (_, i) => 'R' + String(i + 1).padStart(2, '0'))
    );
    expect(PRUDENCE).toHaveLength(10);
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(28);
  });
  it('chaque source citée par une règle existe dans la liste des sources', () => {
    for (const r of REGLES)
      for (const s of r.sources) expect(SOURCES[s], r.id + '/' + s).toBeTruthy();
  });
  it('niveaux de preuve valides ; aucune règle sans niveau', () => {
    for (const r of REGLES) {
      expect(['F', 'M', 'f', 'CC']).toContain(r.niveau);
      expect(r.niveaux.length).toBeGreaterThan(0);
    }
  });
  it('les conditions automatiques ne citent que des curseurs existants', () => {
    const lat = (b) => [b + '_D', b + '_G'];
    for (const r of REGLES.filter((x) => x.cond)) {
      const c = r.cond;
      const cites = [
        ...(c.lat || []).flatMap((t) => lat(t.base)),
        ...(c.sym || []).flatMap((t) => lat(t.base)),
        ...(c.any || []).flatMap((t) => lat(t.base)),
        ...(c.glob || []).map((t) => t.id),
      ];
      for (const id of cites) expect(PAR_ID[id], r.id + '/' + id).toBeTruthy();
    }
  });
  it('les règles qui demandent le contexte clinique ne sont pas calculées (8 règles)', () => {
    expect(reglesManuelles().map((r) => r.id)).toEqual([
      'R03',
      'R04',
      'R42',
      'R44',
      'R45',
      'R46',
      'R47',
      'R48',
    ]);
  });
});

describe('déclenchement des règles', () => {
  it('mannequin neutre : aucune hypothèse', () => {
    expect(evaluer({})).toEqual([]);
  });
  it('genu valgum bilatéral (tableau type) : R09 des deux côtés', () => {
    const v = TABLEAUX.genu_valgum_bilat.valeurs;
    const h = evaluer(v);
    const r09 = h.find((x) => x.regle.id === 'R09');
    expect(r09.cotes).toEqual(['D', 'G']);
    expect(r09.declencheurs.join(' ')).toContain('valgus 9');
  });
  it('valgus unilatéral droit + pied valgus + bascule côté droit bas : chaîne R37 côté D seulement', () => {
    const h = evaluer({ genou_valgus_D: 8, pied_valgus_D: 7, bassin_bascule: 4 });
    expect(h.find((x) => x.regle.id === 'R37').cotes).toEqual(['D']);
    expect(h[0].combinee).toBe(true); // les chaînes combinées passent en premier
    expect(ids({ genou_valgus_D: 8, pied_valgus_D: 7, bassin_bascule: -4 })).not.toContain('R37'); // bascule du mauvais côté
  });
  it('seuils : 4° ne déclenche pas R09, 5° oui ; inégalité 10–19 mm = R13, ≥ 20 mm = R14', () => {
    expect(ids({ genou_valgus_D: 4 })).not.toContain('R09');
    expect(ids({ genou_valgus_D: 5 })).toContain('R09');
    expect(ids({ bassin_inegalite: 12 })).toEqual(expect.arrayContaining(['R13']));
    expect(ids({ bassin_inegalite: 12 })).not.toContain('R14');
    expect(ids({ bassin_inegalite: -25 })).toContain('R14');
    expect(ids({ bassin_inegalite: -25 })).not.toContain('R13');
  });
  it('antéversion (plage −12 → +6) : 3° déclenche R17, −5° déclenche R18', () => {
    expect(ids({ bassin_antev: 3 })).toContain('R17');
    expect(ids({ bassin_antev: -5 })).toContain('R18');
    expect(ids({ bassin_antev: 2 })).not.toContain('R17');
  });
  it('syndromes croisés de Janda : tableaux types', () => {
    expect(ids(TABLEAUX.croise_inf.valeurs)).toContain('R35');
    expect(ids(TABLEAUX.croise_sup.valeurs)).toContain('R36');
  });
  it('asymétrie des épaules (R26) : D=G ne déclenche pas, 3° d’écart oui', () => {
    expect(ids({ epaule_elev_D: 4, epaule_elev_G: 4 })).not.toContain('R26');
    expect(ids({ epaule_elev_D: 5, epaule_elev_G: 1 })).toContain('R26');
  });
  it('les antériorisations globales ne déclenchent aucune règle (aucune source documentée)', () => {
    expect(evaluer({ glob_chev: 8 })).toEqual([]);
  });
  it('tous les tableaux types évaluent sans erreur ; la synthèse compte les pathologies citées', () => {
    for (const k in TABLEAUX) expect(() => evaluer(TABLEAUX[k].valeurs)).not.toThrow();
    const s = synthese(evaluer(TABLEAUX.genu_valgum_bilat.valeurs));
    expect(s.nbHypotheses).toBeGreaterThan(0);
    expect(s.pathologies.length).toBeGreaterThan(0);
  });
});

describe('rendu HTML', () => {
  it('le rapport contient la prudence, le niveau de preuve, les sources et les tests ; rien pour un mannequin neutre', () => {
    expect(htmlRapport({})).toBe('');
    const h = htmlRapport(TABLEAUX.genu_valgum_bilat.valeurs);
    expect(h).toContain('pas un diagnostic');
    expect(h).toContain('Niveau de preuve');
    expect(h).toContain('Tests pour confirmer');
    expect(h).toContain('Risque d’aggravation');
    expect(h).toMatch(/S\d+/);
  });
  it('le texte est échappé (aucune balise injectée)', () => {
    const hyp = {
      regle: {
        id: 'RX',
        titre: '<img src=x onerror=1>',
        niveaux: ['CC'],
        sources: [],
        asc: '<b>',
        desc: '',
        patho: ['<script>'],
        musclesH: [],
        musclesI: [],
        tests: [],
        preuve: '<i>',
      },
      cotes: null,
      declencheurs: ['<u>'],
    };
    const h = htmlHypothese(hyp, { ouvert: true });
    expect(h).not.toMatch(/<img|<script|<u>|<i>/);
  });
});
