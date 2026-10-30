// Profil du patient et chaîne musculaire : fonctions pures (aucun WebGL, aucune donnée patient réelle).
import { describe, it, expect, afterEach } from 'vitest';
import { TABLEAUX, CATEGORIES_TABLEAUX } from '../js/mannequin3d/parametres.js';
import { definirSeuils } from '../js/mannequin3d/mecanismes.js?v=v322';
import {
  CHAINES,
  evaluerProfil,
  niveauDe,
  definirSeuilsProfil,
  seuilsProfil,
  SEUILS_PROFIL_DEFAUT,
  htmlProfil,
  htmlProfilRapport,
} from '../js/mannequin3d/chaines.js?v=v322';

afterEach(() => {
  definirSeuilsProfil(null);
  definirSeuils(null);
});

describe('niveaux 0–4', () => {
  it('suivent les amplitudes léger → sévère du curseur et le sens', () => {
    // genou_valgus : qual [3, 7, 11, 15]
    expect([0, 2, 3, 7, 11, 15].map((x) => niveauDe('genou_valgus_D', x, 1))).toEqual([
      0, 0, 1, 2, 3, 4,
    ]);
    expect(niveauDe('genou_valgus_D', -8, 1)).toBe(0); // varus : autre sens
    expect(niveauDe('genou_valgus_D', -8, -1)).toBe(2);
    expect(niveauDe('inconnu', 5, 1)).toBe(0);
  });
  it('le seuil « existe » est celui du cabinet quand il existe', () => {
    expect(niveauDe('genou_valgus_D', 5, 1)).toBe(1);
    definirSeuils({ face: { valgumVarum: 6 } });
    expect(niveauDe('genou_valgus_D', 5, 1)).toBe(0);
    expect(niveauDe('genou_valgus_D', 6, 1)).toBe(1);
  });
});

describe('chaque tableau type de chaîne fait ressortir sa chaîne', () => {
  const clesChaines = Object.keys(TABLEAUX).filter((k) => k.startsWith('chaine_'));
  it('16 tableaux (AL et PL aussi d’un seul côté), regroupés par famille', () => {
    expect(clesChaines.length).toBe(16);
    expect(CHAINES.length).toBe(12);
    for (const k of clesChaines)
      expect(TABLEAUX[k].groupe).toMatch(/Mézières \/ Myers|Busquet \/ GDS/);
  });
  const attendu = {
    chaine_grande_posterieure: ['grande_posterieure', 'postural'],
    chaine_grande_anterieure: ['grande_anterieure', 'postural'],
    chaine_laterale_D: ['ligne_laterale_D', 'postural'],
    chaine_laterale_G: ['ligne_laterale_G', 'postural'],
    chaine_spiralee_D: ['ligne_spiralee_D', 'postural'],
    chaine_spiralee_G: ['ligne_spiralee_G', 'postural'],
    chaine_extension_PM: ['extension_PM', 'chainiste'],
    chaine_flexion_AM: ['flexion_AM', 'chainiste'],
    chaine_AP: ['AP', 'chainiste'],
    chaine_PA: ['PA', 'chainiste'],
    chaine_fermeture_AL: ['fermeture_AL', 'chainiste'],
    chaine_ouverture_PL: ['ouverture_PL', 'chainiste'],
    chaine_fermeture_AL_D: ['fermeture_AL', 'chainiste', 'D'],
    chaine_fermeture_AL_G: ['fermeture_AL', 'chainiste', 'G'],
    chaine_ouverture_PL_D: ['ouverture_PL', 'chainiste', 'D'],
    chaine_ouverture_PL_G: ['ouverture_PL', 'chainiste', 'G'],
  };
  for (const [k, [id, profil, cote]] of Object.entries(attendu))
    it(k + ' → ' + id + ' (' + profil + (cote ? ', côté ' + cote : '') + ')', () => {
      const p = evaluerProfil(TABLEAUX[k].valeurs);
      expect(p.exprimees[0].id).toBe(id);
      expect(p.exprimees[0].cote || undefined).toBe(cote);
      expect(p.dominante && p.dominante.id).toBe(id);
      expect(p.profils).toEqual([profil]);
      expect(p.grosses).toEqual([]);
    });
});

describe('retours de Joël du 28/10 (tableaux AP / PA, AL et PL unilatérales, local + chaîne)', () => {
  it('AP : bassin avancé plus prononcé, thorax en rétro, tête moins en antépulsion', () => {
    const v = TABLEAUX.chaine_AP.valeurs;
    expect(v.bassin_avance).toBeGreaterThanOrEqual(5);
    expect(v.tronc_antero).toBeLessThan(0);
    expect(v.tete_antep).toBeLessThanOrEqual(2);
  });
  it('PA : élévation des épaules beaucoup plus marquée', () => {
    expect(TABLEAUX.chaine_PA.valeurs.epaule_elev_D).toBeGreaterThanOrEqual(8);
  });
  it('AL / PL unilatérales : le tableau ne pose que les signes d’un côté', () => {
    const v = TABLEAUX.chaine_fermeture_AL_D.valeurs;
    expect(Object.keys(v).filter((k) => k.endsWith('_G'))).toEqual([]);
    expect(Object.keys(v).filter((k) => k.endsWith('_D')).length).toBeGreaterThan(5);
    const w = TABLEAUX.chaine_ouverture_PL_G.valeurs;
    expect(Object.keys(w).filter((k) => k.endsWith('_D'))).toEqual([]);
  });
  it('chaîne AM + genu valgum unilatéral droit : chaîniste ET biomécanique (genou droit, entrée basse)', () => {
    const v = { ...TABLEAUX.chaine_flexion_AM.valeurs, ...TABLEAUX.genu_valgum_D.valeurs };
    const p = evaluerProfil(v);
    expect(p.exprimees[0].id).toBe('flexion_AM');
    expect(p.profils).toEqual(['biomecanique', 'chainiste']);
    expect(p.grosses.map((g) => g.id)).toContain('genou_valgus_D');
    expect(p.grosses.find((g) => g.id === 'genou_valgus_D').cote).toBe('D');
    expect(p.entree.type).toBe('basse');
    // le même valgus des DEUX côtés n'est pas une compensation locale
    const b = evaluerProfil({
      ...TABLEAUX.chaine_flexion_AM.valeurs,
      genou_valgus_D: 9,
      genou_valgus_G: 9,
    });
    expect(b.profils).toEqual(['chainiste']);
  });
  it('un écart moyen d’un seul côté appartenant à la chaîne exprimée n’est pas « local »', () => {
    expect(evaluerProfil(TABLEAUX.chaine_fermeture_AL_D.valeurs).grosses).toEqual([]);
    definirSeuilsProfil({ unilateralMin: 4 });
    const p = evaluerProfil({ genou_valgus_D: 9 });
    expect(p.grosses).toEqual([]);
  });
});

describe('tout ce que pose un tableau de chaîne est un signe de cette chaîne (liste complète)', () => {
  const ASSOC = {
    chaine_grande_posterieure: 'grande_posterieure',
    chaine_grande_anterieure: 'grande_anterieure',
    chaine_laterale_D: 'ligne_laterale_D',
    chaine_laterale_G: 'ligne_laterale_G',
    chaine_spiralee_D: 'ligne_spiralee_D',
    chaine_spiralee_G: 'ligne_spiralee_G',
    chaine_extension_PM: 'extension_PM',
    chaine_flexion_AM: 'flexion_AM',
    chaine_AP: 'AP',
    chaine_PA: 'PA',
    chaine_fermeture_AL: 'fermeture_AL',
    chaine_fermeture_AL_D: 'fermeture_AL',
    chaine_fermeture_AL_G: 'fermeture_AL',
    chaine_ouverture_PL: 'ouverture_PL',
    chaine_ouverture_PL_D: 'ouverture_PL',
    chaine_ouverture_PL_G: 'ouverture_PL',
  };
  for (const [k, id] of Object.entries(ASSOC))
    it(k, () => {
      const ch = CHAINES.find((c) => c.id === id);
      const signes = [...(ch.principal || []), ...(ch.secondaires || []), ...(ch.signes || [])];
      for (const [cur, x] of Object.entries(TABLEAUX[k].valeurs)) {
        const base = cur.replace(/_(D|G)$/, '');
        const sg = signes.filter(
          (s) => s.id === cur || (s.paire && s.id === base) || (s.ou && s.ou.includes(cur))
        );
        expect(sg.length, k + ' : « ' + cur + ' » absent de la liste des signes').toBeGreaterThan(
          0
        );
        expect(
          sg.some((s) => Math.sign(s.sens) === Math.sign(x)),
          k + ' : « ' + cur + ' » n’a pas le bon sens'
        ).toBe(true);
      }
    });
  it('AP : le thorax en rétro, le bassin avancé et la tête en légère antépulsion figurent dans la liste', () => {
    const txt = CHAINES.find((c) => c.id === 'AP').signes.map((s) => s.txt);
    expect(txt).toEqual(
      expect.arrayContaining([
        'thorax en rétro (rétropulsion du thorax)',
        'avancement du bassin',
        'légère antépulsion de tête',
      ])
    );
  });
});

describe('coude en extension', () => {
  it('l’extension du coude (valeur négative) n’est ni une zone touchée ni une compensation locale', () => {
    const p = evaluerProfil({ coude_flex_G: -20 });
    expect(p.grosses).toEqual([]);
    expect(p.zones.find((z) => z.id === 'bras').niveau).toBe(0);
    expect(p.profils).toEqual([]);
    expect(evaluerProfil({ coude_flex_G: 100 }).grosses.map((g) => g.id)).toEqual(['coude_flex_G']);
  });
});

describe('profils', () => {
  it('mannequin neutre : aucun profil', () => {
    const p = evaluerProfil({});
    expect(p.vide).toBe(true);
    expect(p.profils).toEqual([]);
  });
  it('postural : antériorisation globale seule, sans compensation', () => {
    const p = evaluerProfil({ glob_chev: 5 });
    expect(p.profils).toEqual(['postural']);
    expect(p.nbZonesTouchees).toBe(0);
  });
  it('le côté de la ligne latérale / spiralée suit les signes (côté inverse = score nul)', () => {
    const p = evaluerProfil(TABLEAUX.chaine_laterale_D.valeurs);
    expect(p.chaines.find((c) => c.id === 'ligne_laterale_G').score).toBe(0);
    const s = evaluerProfil(TABLEAUX.chaine_spiralee_G.valeurs);
    expect(s.chaines.find((c) => c.id === 'ligne_spiralee_D').score).toBe(0);
  });
  it('biomécanique : une grosse compensation d’un seul côté, entrée basse (membre inférieur)', () => {
    const p = evaluerProfil({ genou_valgus_D: 12, pied_valgus_D: 4, tete_incl: 3 });
    expect(p.profils).toContain('biomecanique');
    expect(p.grosses.map((g) => g.id)).toEqual(['genou_valgus_D']);
    expect(p.entree.type).toBe('basse');
  });
  it('un gros écart bilatéral symétrique n’est pas une compensation locale', () => {
    const p = evaluerProfil({ genou_valgus_D: 12, genou_valgus_G: 12 });
    expect(p.grosses).toEqual([]);
    expect(p.profils).not.toContain('biomecanique');
  });
  it('entrée haute : tête latéralisée + mandibule ; indices vestibulaire et mandibulaire', () => {
    const p = evaluerProfil({ tete_incl: 12, mandi_transl: 10 }, { yeux: -5 });
    expect(p.entree.type).toBe('haute');
    expect(p.entree.indices.vestibulaire).toBeTruthy();
    expect(p.entree.indices.mandibulaire).toBeTruthy();
    expect(p.entree.indices.visuel.angle).toBe(-5);
    expect(evaluerProfil({ tete_incl: 12 }, { yeux: 0.5 }).entree.indices.visuel).toBeNull();
  });
  it('entrée mixte : haut d’un côté, bas de l’autre', () => {
    const p = evaluerProfil({ tronc_incl: 12, genou_valgus_G: 12 });
    expect(p.entree.haut[0].cote).toBe('D');
    expect(p.entree.bas[0].cote).toBe('G');
    expect(p.entree.type).toBe('mixte');
  });
  it('biomécanique + postural', () => {
    const p = evaluerProfil({ glob_chev: 5, tete_incl: 12 });
    expect(p.profils).toEqual(['biomecanique', 'postural']);
    expect(p.libelle).toBe('biomécanique + postural');
  });
  it('biomécanique + chaîniste', () => {
    const p = evaluerProfil({ ...TABLEAUX.chaine_ouverture_PL.valeurs, genou_valgus_D: 13 });
    expect(p.profils).toEqual(['biomecanique', 'chainiste']);
    expect(p.grosses.map((g) => g.id)).toEqual(['genou_valgus_D']);
  });
  it('plusieurs chaînes : dominante seulement avec l’écart réglable', () => {
    const v = { ...TABLEAUX.chaine_fermeture_AL.valeurs, ...TABLEAUX.chaine_AP.valeurs };
    const p = evaluerProfil(v);
    expect(p.exprimees.length).toBeGreaterThan(1);
    const ecart = p.exprimees[0].score - p.exprimees[1].score;
    expect(p.ecartDominante).toBe(ecart);
    definirSeuilsProfil({ ecartDominante: ecart + 1 });
    expect(evaluerProfil(v).dominante).toBeNull();
    definirSeuilsProfil({ ecartDominante: Math.max(1, ecart) });
    expect(evaluerProfil(v).dominante).toBeTruthy();
  });
});

describe('seuils réglables', () => {
  it('valeurs par défaut validées et surcharge bornée', () => {
    expect(seuilsProfil()).toEqual(SEUILS_PROFIL_DEFAUT);
    expect(SEUILS_PROFIL_DEFAUT).toMatchObject({
      exprimee: 40,
      ecartDominante: 15,
      grosse: 3,
      plusieurs: 3,
    });
    definirSeuilsProfil({ exprimee: 95, grosse: 'x', inconnu: 1 });
    expect(seuilsProfil().exprimee).toBe(95);
    expect(seuilsProfil().grosse).toBe(3);
    expect(evaluerProfil(TABLEAUX.chaine_extension_PM.valeurs).exprimees.length).toBe(0);
  });
});

describe('affichage', () => {
  it('encadré : deux appellations, prudence, cours cité, case « Inclure au rapport »', () => {
    const h = htmlProfil(evaluerProfil(TABLEAUX.chaine_ouverture_PL.valeurs), { coche: true });
    expect(h).toContain('Mézières / Myers');
    expect(h).toContain('Busquet / GDS');
    expect(h).toContain('pas un diagnostic');
    expect(h).toContain('cours, diapo 43');
    expect(h).toContain('data-profil="1"');
    expect(h).not.toMatch(/checked/);
    expect(htmlProfil(evaluerProfil({ glob_chev: 5 }), { coche: true, retenu: true })).toMatch(
      /checked/
    );
  });
  it('rapport : vide si le profil n’est pas retenu ou si le mannequin est neutre', () => {
    const v = TABLEAUX.chaine_AP.valeurs;
    expect(htmlProfilRapport(v, false)).toBe('');
    expect(htmlProfilRapport({}, true)).toBe('');
    const h = htmlProfilRapport(v, true);
    expect(h).toContain('AP, antéro-postérieure');
    expect(h).not.toContain('data-profil');
  });
  it('aucune chaîne ne cite un contenu hors du cours : chaque rappel porte un numéro de diapo', () => {
    for (const c of CHAINES) for (const r of c.cours) expect(r[1]).toMatch(/^\d+$/);
  });
});

describe('menu « Tableau type » : catégories et tableaux de genou unilatéraux', () => {
  it('chaque tableau (sauf « Neutre ») appartient à l’une des 8 catégories demandées, dans l’ordre', () => {
    expect(CATEGORIES_TABLEAUX.map((c) => c[0])).toEqual([
      'genoux',
      'pieds',
      'bassin',
      'ilmi',
      'tronc',
      'anteriorisation',
      'posturales',
      'chainistes',
    ]);
    const ids = new Set(CATEGORIES_TABLEAUX.map((c) => c[0]));
    for (const [k, t] of Object.entries(TABLEAUX)) {
      if (k === 'neutre') expect(t.categorie).toBeUndefined();
      else expect(ids.has(t.categorie), k + ' sans catégorie').toBe(true);
    }
    expect(Object.keys(TABLEAUX).filter((k) => TABLEAUX[k].categorie === 'genoux').length).toBe(10);
  });
  it('flessum et récurvatum D / G : un seul genou, dans le bon sens', () => {
    expect(TABLEAUX.flessum_D.valeurs).toEqual({ genou_flex_D: 15 });
    expect(TABLEAUX.flessum_G.valeurs).toEqual({ genou_flex_G: 15 });
    expect(TABLEAUX.recurvatum_D.valeurs).toEqual({ genou_flex_D: -10 });
    expect(TABLEAUX.recurvatum_G.valeurs).toEqual({ genou_flex_G: -10 });
    for (const [k, cote] of [
      ['flessum_D', 'D'],
      ['flessum_G', 'G'],
      ['recurvatum_D', 'D'],
      ['recurvatum_G', 'G'],
    ]) {
      const p = evaluerProfil(TABLEAUX[k].valeurs);
      expect(p.grosses.map((g) => g.id)).toEqual(['genou_flex_' + cote]);
      expect(p.entree.type).toBe('basse');
    }
  });
});
