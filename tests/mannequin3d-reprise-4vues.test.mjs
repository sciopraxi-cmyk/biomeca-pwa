// Reprise des résultats de « captures 4 vues » sur le mannequin 3D : fonctions pures (aucun WebGL, aucune donnée patient réelle).
import { describe, it, expect, afterEach } from 'vitest';
import { definirSeuils } from '../js/mannequin3d/mecanismes.js?v=v315';
import { calculerReprise } from '../js/mannequin3d/reprise-4vues.js?v=v315';
import { PAR_ID } from '../js/mannequin3d/parametres.js?v=v315';

afterEach(() => definirSeuils(null));

const v = (r, id) => {
  const p = r.propositions.find((x) => x.id === id);
  return p ? p.valeur : undefined;
};
const ids = (r) => r.propositions.map((x) => x.id);

describe('aucune analyse', () => {
  it("ne propose rien et n'échoue pas", () => {
    expect(calculerReprise(null).propositions).toEqual([]);
    expect(calculerReprise({}).vues).toEqual([]);
    expect(calculerReprise({ face: {} }).propositions).toEqual([]);
  });
});

describe('signes et moyennes', () => {
  it('épaules / bassin : + analyse = côté D PLUS HAUT, + mannequin = côté D BAS → signe inversé', () => {
    const r = calculerReprise({ face: { angles: { ligneEpaules: 4, basculeBassin: 3 } } });
    expect(v(r, 'ceinture_incl')).toBe(-4);
    expect(v(r, 'bassin_bascule')).toBe(-3);
  });
  it('tête : même signe des deux côtés, moyenne face + dos', () => {
    const r = calculerReprise({
      face: { angles: { inclinaisonTete: 6 } },
      dos: { angles: { inclinaisonTete: 2 } },
    });
    expect(v(r, 'tete_incl')).toBe(4);
  });
  it('moyenne des seules vues où la mesure existe', () => {
    const r = calculerReprise({
      face: { angles: { basculeBassin: null } },
      dos: { angles: { basculeBassin: 5 } },
    });
    expect(v(r, 'bassin_bascule')).toBe(-5);
  });
  it('rotation de la tête : face seulement (signe du dos ambigu)', () => {
    const r = calculerReprise({
      face: { angles: { rotationTete: 5 } },
      dos: { angles: { rotationTete: -9 } },
    });
    expect(v(r, 'tete_rot')).toBe(5);
  });
  it("une mesure sous le seuil du cabinet n'est pas reportée", () => {
    const a = { face: { angles: { inclinaisonTete: 2.5 } } };
    expect(v(calculerReprise(a), 'tete_incl')).toBe(2.5);
    definirSeuils({ face: { tete: 3 } });
    expect(v(calculerReprise(a), 'tete_incl')).toBeUndefined();
  });
  it('les valeurs sont bornées aux curseurs', () => {
    const r = calculerReprise({ face: { angles: { inclinaisonTete: 60 } } });
    expect(v(r, 'tete_incl')).toBe(PAR_ID.tete_incl.max);
  });
  it("n'écrit rien dans ses entrées", () => {
    const a = { face: { angles: { inclinaisonTete: 6, fermetureViscerale: 'D' } } };
    const copie = JSON.stringify(a);
    calculerReprise(a);
    expect(JSON.stringify(a)).toBe(copie);
  });
});

describe('membres inférieurs', () => {
  it('genoux, calcanéum, pas : par côté du patient', () => {
    const r = calculerReprise({
      face: { angles: { valgumVarumD: 8, valgumVarumG: -5, ouverturePasD: 35, ouverturePasG: 5 } },
      dos: { angles: { angleCalcaneenD: 6, angleCalcaneenG: 1 } },
    });
    expect(v(r, 'genou_valgus_D')).toBe(8);
    expect(v(r, 'genou_valgus_G')).toBe(-5);
    expect(v(r, 'pied_ouverture_D')).toBe(10); // 35° − 25° (zone physiologique 15-25°)
    expect(v(r, 'pied_ouverture_G')).toBe(-10); // 5° − 15°
    expect(v(r, 'pied_valgus_D')).toBe(6);
    expect(v(r, 'pied_valgus_G')).toBeUndefined(); // 1° < seuil
  });
  it('pas dans la zone physiologique : rien', () => {
    const r = calculerReprise({ face: { angles: { ouverturePasD: 20, ouverturePasG: 15 } } });
    expect(ids(r)).toEqual([]);
  });
  it('genou de profil : flessum + / récurvatum −, côté du profil', () => {
    const r = calculerReprise({
      profilD: { angles: { genouFlexion: 170 } },
      profilG: { angles: { genouFlexion: 190 } },
    });
    expect(v(r, 'genou_flex_D')).toBe(10);
    expect(v(r, 'genou_flex_G')).toBe(-10);
  });
});

describe('profil : courbures, bassin, tête', () => {
  it('cyphose / lordose = dépassement du seuil « hyper » du cabinet, moyenne des 2 profils', () => {
    const r = calculerReprise({
      profilG: { angles: { deviationThoracique: 40, deviationLombaire: 30 } },
      profilD: { angles: { deviationThoracique: 44, deviationLombaire: 30 } },
    });
    expect(v(r, 'tronc_cyphose')).toBe(10); // 42 − 32
    expect(v(r, 'tronc_lordose')).toBeUndefined(); // 30 < 35
  });
  it('hyperlordose cervicale = extension de la tête (dépassement de 28°) + antépulsion estimée (CVA)', () => {
    const r = calculerReprise({ profilG: { angles: { deviationCervicale: 38, cva: 40 } } });
    expect(v(r, 'tete_flex')).toBe(-10); // négatif = extension
    expect(v(r, 'tete_antep')).toBeGreaterThan(0);
    expect(r.propositions.find((p) => p.id === 'tete_antep').estime).toBe(true);
  });
  it("pas d'extension sans hyperlordose cervicale", () => {
    const r = calculerReprise({ profilG: { angles: { deviationCervicale: 20, cva: 50 } } });
    expect(ids(r)).toEqual([]);
  });
  it('bassin de profil = antéversion (+)', () => {
    expect(v(calculerReprise({ profilG: { angles: { bassin: 5 } } }), 'bassin_antev')).toBe(5);
  });
});

describe('thorax : conversion estimée % → cm', () => {
  it('30 cm de largeur d\u2019appui supposée, marqué « estimé »', () => {
    const r = calculerReprise({ face: { angles: { translationThorax: 5 } } });
    expect(v(r, 'thorax_transl')).toBe(1.5);
    expect(r.propositions.find((p) => p.id === 'thorax_transl').estime).toBe(true);
  });
});

describe('fermeture viscérale (règle du praticien)', () => {
  it("buste dévié : l'angle des deux lignes va sur l'inclinaison du buste, du côté de la fermeture ; épaule et bassin non reportés", () => {
    // fermeture D : épaule D basse (−3, D plus bas), bassin D haut (+2) → les lignes convergent de 5°
    const r = calculerReprise({
      face: {
        angles: {
          fermetureViscerale: 'D',
          ligneEpaules: -3,
          basculeBassin: 2,
          inclinaisonTronc: 4,
        },
      },
    });
    expect(v(r, 'tronc_incl')).toBe(5);
    expect(v(r, 'ceinture_incl')).toBeUndefined();
    expect(v(r, 'bassin_bascule')).toBeUndefined();
  });
  it('fermeture G, buste dévié : côté G = négatif', () => {
    const r = calculerReprise({
      face: {
        angles: {
          fermetureViscerale: 'G',
          ligneEpaules: 3,
          basculeBassin: -2,
          inclinaisonTronc: -4,
        },
      },
    });
    expect(v(r, 'tronc_incl')).toBe(-5);
  });
  it('buste non dévié : épaule du côté de la fermeture abaissée, bassin du même côté monté', () => {
    const d = calculerReprise({
      face: {
        angles: {
          fermetureViscerale: 'D',
          ligneEpaules: -3,
          basculeBassin: 2,
          inclinaisonTronc: 0.5,
        },
      },
    });
    expect(v(d, 'ceinture_incl')).toBe(3); // + = D bas
    expect(v(d, 'bassin_bascule')).toBe(-2); // − = G bas = D monté
    expect(v(d, 'tronc_incl')).toBeUndefined();
    const g = calculerReprise({
      face: {
        angles: {
          fermetureViscerale: 'G',
          ligneEpaules: 3,
          basculeBassin: -2,
          inclinaisonTronc: 0,
        },
      },
    });
    expect(v(g, 'ceinture_incl')).toBe(-3); // G bas
    expect(v(g, 'bassin_bascule')).toBe(2); // + = D bas = G monté
  });
  it('sans fermeture viscérale : règle directe (inclinaison du tronc mesurée)', () => {
    const r = calculerReprise({ face: { angles: { inclinaisonTronc: 4 } } });
    expect(v(r, 'tronc_incl')).toBe(4);
  });
});

describe('mesures sans curseur équivalent', () => {
  it('listées seulement quand elles sont mesurées', () => {
    const r = calculerReprise({
      dos: { angles: { rachisApex: 'TH6', sillonInterfessier: null } },
      face: { angles: { translationBassin: 4, nezTordu: true } },
    });
    expect(r.nonReportees).toContain('Rachis de dos (apex, convexité)');
    expect(r.nonReportees).toContain('Translation du bassin (face)');
    expect(r.nonReportees).toContain('Nez tordu (face)');
    expect(r.nonReportees).not.toContain('Sillon inter-fessier');
  });
});
