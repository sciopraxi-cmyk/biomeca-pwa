// #265 — hypothèses de mécanisme lésionnel : données générées depuis le document validé + moteur de règles.
import { describe, it, expect } from 'vitest';
import {
  definirSeuils,
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
  it('51 règles R01–R51 uniques ; 10 phrases de prudence ; sources présentes', () => {
    expect(REGLES.map((r) => r.id)).toEqual(
      Array.from({ length: 51 }, (_, i) => 'R' + String(i + 1).padStart(2, '0'))
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
        ...(c.anyGlob || []).map((t) => t.id),
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
  it('EIAP : effondrement du pied + valgus du genou + antéversion → R49 (chaîne combinée, en tête) ; sous le seuil rien', () => {
    const v = { pied_valgus_D: 7, genou_valgus_D: 7, bassin_antev: 4 };
    expect(ids(v)).toContain('R49');
    expect(evaluer(v)[0].combinee).toBe(true);
    expect(
      evaluer(v)
        .find((h) => h.regle.id === 'R49')
        .regle.patho.join(' ')
    ).toContain('EIAP');
    expect(ids({ pied_valgus_D: 7, genou_valgus_D: 7 })).not.toContain('R49'); // sans antéversion
    expect(ids({ pied_valgus_D: 7, genou_valgus_D: 7, bassin_antev: 2 })).not.toContain('R49');
  });
  it('antériorisation globale (chevilles, genoux ou hanches) → R50 ; aucun déclenchement sous 3°', () => {
    for (const k of ['glob_chev', 'glob_gen', 'glob_bassin']) {
      expect(ids({ [k]: 4 })).toContain('R50');
      expect(ids({ [k]: 2 })).not.toContain('R50');
      expect(ids({ [k]: -6 })).not.toContain('R50'); // postériorisation : pas d'EIAP par ce mécanisme
    }
  });
  it('R51 : pied + genou valgus + RI de la cuisse + antéversion → fascia thoraco-lombaire / érecteurs du rachis', () => {
    const v = { pied_valgus_G: 7, genou_valgus_G: 7, cuisse_rot_G: -8, bassin_antev: 4 };
    const h = evaluer(v).find((x) => x.regle.id === 'R51');
    expect(h.cotes).toEqual(['G']);
    expect(h.regle.desc).toContain('érecteurs du rachis');
    expect(h.regle.asc).toContain('fascia thoraco-lombaire');
    expect(ids({ ...v, cuisse_rot_G: 8 })).not.toContain('R51'); // rotation externe : non
    expect(h.regle.sources).toEqual([]); // expertise clinique : aucune référence inventée
  });
  it('tous les tableaux types évaluent sans erreur ; la synthèse compte les pathologies citées', () => {
    for (const k in TABLEAUX) expect(() => evaluer(TABLEAUX[k].valeurs)).not.toThrow();
    const s = synthese(evaluer(TABLEAUX.genu_valgum_bilat.valeurs));
    expect(s.nbHypotheses).toBeGreaterThan(0);
    expect(s.pathologies.length).toBeGreaterThan(0);
  });
});

describe('rendu HTML', () => {
  it('le rapport ne contient QUE les hypothèses retenues par le praticien', () => {
    const v = TABLEAUX.genu_valgum_bilat.valeurs;
    expect(htmlRapport({})).toBe('');
    expect(htmlRapport(v, [])).toBe(''); // rien de retenu : rien dans le rapport
    expect(htmlRapport(v)).toBe('');
    const h = htmlRapport(v, ['R09']);
    expect(h).toContain('R09');
    expect(h).not.toContain('R01');
    expect(h).toContain('pas un diagnostic');
    expect(h).toContain('Niveau de preuve');
    expect(h).toContain('Tests pour confirmer');
    expect(h).toContain('Risque d’aggravation');
    expect(h).toMatch(/S\d+/);
    expect(htmlRapport(v, ['R17'])).toBe(''); // retenue mais non déclenchée : ignorée
  });
  it('à l’écran : case « Inclure au rapport » cochée selon la sélection', () => {
    const hy = evaluer(TABLEAUX.genu_valgum_bilat.valeurs).find((x) => x.regle.id === 'R09');
    expect(htmlHypothese(hy, { coche: true, retenue: true })).toMatch(/data-meca="R09" checked/);
    expect(htmlHypothese(hy, { coche: true })).not.toContain('checked');
    expect(htmlHypothese(hy)).not.toContain('checkbox');
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

describe('seuils du cabinet (compte admin)', () => {
  const cab = {
    face: { valgumVarum: 8, bassin: 2, tete: 4, epaules: 1, lateralisation: 2 },
    dos: { calcaneen: 6 },
    neutralite: { genou: 3, bassin: 4 },
  };
  it('sans seuils du cabinet : seuils par défaut du logiciel', () => {
    definirSeuils(null);
    expect(ids({ genou_valgus_D: 5 })).toContain('R09');
  });
  it('le seuil du cabinet remplace le défaut (valgus du genou 8° : 7° ne déclenche plus, 8° oui)', () => {
    definirSeuils(cab);
    expect(ids({ genou_valgus_D: 7 })).not.toContain('R09');
    expect(ids({ genou_valgus_D: 8 })).toContain('R09');
    definirSeuils(null);
  });
  it('seuil négatif pour les sens opposés (varus) et calcanéen pour le pied', () => {
    definirSeuils(cab);
    expect(ids({ genou_valgus_G: -7 })).not.toContain('R10');
    expect(ids({ genou_valgus_G: -8 })).toContain('R10');
    expect(ids({ pied_valgus_D: 5 })).not.toContain('R01');
    expect(ids({ pied_valgus_D: 6 })).toContain('R01');
    definirSeuils(null);
  });
  it('bascule du bassin, tête, épaules (asymétrie) et antéversion suivent les seuils du cabinet', () => {
    definirSeuils(cab);
    expect(ids({ bassin_bascule: 2 })).toContain('R15');
    expect(ids({ tete_incl: 3 })).not.toContain('R23');
    expect(ids({ tete_incl: 4 })).toContain('R23');
    expect(ids({ epaule_elev_D: 2, epaule_elev_G: 1 })).toContain('R26');
    expect(ids({ bassin_antev: 3 })).not.toContain('R17');
    expect(ids({ bassin_antev: 4 })).toContain('R17');
    expect(ids({ bassin_antev: -4 })).toContain('R18');
    definirSeuils(null);
  });
  it('seuils invalides ignorés (retour aux défauts)', () => {
    definirSeuils({ face: { valgumVarum: 'x' } });
    expect(ids({ genou_valgus_D: 5 })).toContain('R09');
    definirSeuils(null);
  });
});
