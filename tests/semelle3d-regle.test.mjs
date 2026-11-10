// V1b : règle « dessin gardé / 3D » (js/semelle3d/regle.js).
import { describe, it, expect } from 'vitest';
import { modeSemelleBilan } from '../js/semelle3d/regle.js';

describe('modeSemelleBilan', () => {
  it('bilan neuf (objet vide, absent, null) : 3D', () => {
    expect(modeSemelleBilan({})).toBe('3d');
    expect(modeSemelleBilan(undefined)).toBe('3d');
    expect(modeSemelleBilan(null)).toBe('3d');
  });
  it('ancien bilan sans dessin (autres champs seulement) : 3D', () => {
    expect(modeSemelleBilan({ _morpho_face: 'data:image/png;base64,AAAA', sp_desc: 'x' })).toBe(
      '3d'
    );
  });
  it('bilan avec dessin en valeur : dessin gardé', () => {
    expect(modeSemelleBilan({ _pieds: 'data:image/png;base64,AAAA' })).toBe('dessin');
  });
  it('bilan avec dessin migré dans Storage (chemin seul) : dessin gardé', () => {
    expect(modeSemelleBilan({ _piedsPath: 'u/p/b/_pieds.png' })).toBe('dessin');
  });
  it('valeur vide ou non texte : pas un dessin', () => {
    expect(modeSemelleBilan({ _pieds: '', _piedsPath: '' })).toBe('3d');
    expect(modeSemelleBilan({ _pieds: null })).toBe('3d');
    expect(modeSemelleBilan({ _pieds: {} })).toBe('3d');
  });
  it('clé autre bilan : postural et podopédiatrie', () => {
    expect(modeSemelleBilan({ _pieds: 'data:x' }, '_podo_pieds')).toBe('3d');
    expect(modeSemelleBilan({ _podo_piedsPath: 'p' }, '_podo_pieds')).toBe('dessin');
  });
});
