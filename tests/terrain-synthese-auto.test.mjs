// Chantier B (30/10) : cochage automatique de « terrain / synthèse » (fonction pure). Données fictives.
import { describe, it, expect } from 'vitest';
import { planTerrainSynthese, CHAINE_CASE } from '../js/mannequin3d/exercices-auto.js?v=v329';
import { TABLEAUX } from '../js/mannequin3d/parametres.js?v=v329';

const VIDE = { terrain: false, posture: {}, chaines: {} };
const plan = (valeurs, extra = {}) => planTerrainSynthese({ valeurs, deja: VIDE, ...extra });

describe('planTerrainSynthese', () => {
  it('Myers : antériorisé → antériorisation globale ; postériorisé → postériorisation globale', () => {
    expect(plan({ glob_chev: 10, glob_gen: 6, tronc_lordose: 6 }).posture).toEqual({ ant: true });
    expect(plan({ glob_chev: -10, glob_gen: -6 }).posture).toEqual({ post: true });
  });
  it('ligne latérale DROITE = latéralisation globale à GAUCHE, et inversement (règle de Joël)', () => {
    expect(plan({ poids_lr: -12, tronc_incl: -8, tete_incl: 4 }).posture).toEqual({
      later: true,
      laterDir: 'gauche',
    }); // ligne_laterale_D
    expect(plan({ poids_lr: 12, tronc_incl: 8, tete_incl: -4 }).posture).toEqual({
      later: true,
      laterDir: 'droite',
    }); // ligne_laterale_G
  });
  it('fermeture = AL et ouverture = PL : chacune coche sa propre case', () => {
    expect(CHAINE_CASE.fermeture_AL).toBe('ferm');
    expect(CHAINE_CASE.ouverture_PL).toBe('ouv');
    expect(plan(TABLEAUX.chaine_fermeture_AL.valeurs).chaines).toContain('ferm');
    expect(plan(TABLEAUX.chaine_ouverture_PL.valeurs).chaines).toContain('ouv');
    expect(plan(TABLEAUX.chaine_fermeture_AL.valeurs).chaines).not.toContain('ouv');
  });
  it('chaînistes : extension, flexion, statiques', () => {
    expect(plan(TABLEAUX.chaine_extension_PM.valeurs).chaines).toContain('ext');
    expect(plan(TABLEAUX.chaine_flexion_AM.valeurs).chaines).toContain('flex');
    expect(plan(TABLEAUX.chaine_AP.valeurs).chaines).toContain('stat-deg');
    expect(plan(TABLEAUX.chaine_PA.valeurs).chaines).toContain('stat-opt');
  });
  it('terrain aérien / terrien (préférences motrices) ; rien si une case terrain est déjà cochée', () => {
    expect(plan(null, { terrain: 'aerien' }).terrain).toBe('aerien');
    expect(plan(null, { terrain: 'terrien' }).terrain).toBe('terrien');
    expect(planTerrainSynthese({ terrain: 'aerien', deja: { terrain: true } }).terrain).toBeNull();
    expect(plan(null, { terrain: null }).terrain).toBeNull();
  });
  it('on complète sans écraser : case déjà cochée = rien à faire ; direction déjà choisie conservée', () => {
    const v = { glob_chev: 10, glob_gen: 6, tronc_lordose: 6 };
    expect(planTerrainSynthese({ valeurs: v, deja: { posture: { ant: true } } }).posture).toEqual(
      {}
    );
    const l = { poids_lr: -12, tronc_incl: -8, tete_incl: 4 };
    expect(planTerrainSynthese({ valeurs: l, deja: { posture: { later: true } } }).posture).toEqual(
      {}
    );
    expect(planTerrainSynthese({ valeurs: l, deja: { posture: {} } }).posture.laterDir).toBe(
      'gauche'
    );
  });
  it('une case décochée par le praticien n’est pas recochée (clés déjà appliquées)', () => {
    const v = { glob_chev: 10, glob_gen: 6, tronc_lordose: 6 };
    const p1 = plan(v);
    expect(p1.cles).toContain('posture-ant');
    expect(plan(v, { refuses: p1.cles }).posture).toEqual({});
  });
  it('mannequin vide ou nul : rien', () => {
    expect(plan(null)).toEqual({ terrain: null, posture: {}, chaines: [], cles: [] });
    expect(plan({})).toEqual({ terrain: null, posture: {}, chaines: [], cles: [] });
  });
});
