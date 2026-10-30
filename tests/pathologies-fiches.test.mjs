// Chantier B lot 4 : détection des programmes de réathlétisation dans les textes du bilan. Données fictives.
import { describe, it, expect } from 'vitest';
import { detecterPathologies, PATHOLOGIES } from '../js/mannequin3d/exercices-auto.js?v=v326';

const cles = (t) => detecterPathologies(t).map((x) => x.cle);

describe('détection des pathologies dans le bilan', () => {
  it("le cas du praticien : « tendinopathie d'achille » dans l'anamnèse", () => {
    const r = detecterPathologies(["Douleur depuis 3 mois, tendinopathie d'achille gauche."]);
    expect(r.map((x) => x.cle)).toEqual(['achille']);
    expect(r[0].raison).toContain("tendinopathie d'achille gauche");
    expect(r[0].code).toBe(
      "pathologies-pied|1. Programme de réathlétisation d'une tendinopathie d'Achille"
    );
  });
  it('variantes courantes : accents, majuscules, apostrophe typographique, tendinite, achilléenne', () => {
    expect(cles(['TENDINOPATHIE D’ACHILLE'])).toEqual(['achille']);
    expect(cles(['Tendinite achilléenne droite'])).toEqual(['achille']);
    expect(cles(['syndrome femoro patellaire'])).toEqual(['fp']);
    expect(cles(['Syndrome fémoro-patellaire bilatéral'])).toEqual(['fp']);
    expect(cles(['syndrome de la bandelette ilio-tibiale', 'essuie-glace'])).toEqual(['bit']);
    expect(cles(['Pubalgie du sportif'])).toEqual(['pubalgie']);
    expect(cles(['syndrome du muscle piriforme'])).toEqual(['piriforme']);
    expect(cles(['tendinopathie du moyen fessier'])).toEqual(['fessier']);
    expect(cles(['tendinite des péroniers latéraux'])).toEqual(['fibulaires']);
    expect(cles(['tendinopathie des fibulaires'])).toEqual(['fibulaires']);
  });
  it("plusieurs pathologies dans plusieurs textes : une proposition chacune, dans l'ordre de la liste", () => {
    const r = cles([
      'pubalgie ancienne',
      "tendinopathie d'Achille",
      'RAS',
      'syndrome du piriforme',
    ]);
    expect(r).toEqual(['pubalgie', 'piriforme', 'achille']);
  });
  it('sans doublon quand le terme revient', () => {
    expect(cles(['pubalgie', 'pubalgie encore', 'PUBALGIE'])).toEqual(['pubalgie']);
  });
  it('la négation dans la phrase ne coche rien ; la phrase suivante reste lue', () => {
    expect(cles(["pas de tendinopathie d'Achille"])).toEqual([]);
    expect(cles(['Aucune pubalgie. Syndrome du piriforme.'])).toEqual(['piriforme']);
    expect(cles(['sans tendinite achilléenne'])).toEqual([]);
  });
  it("« tendon d'Achille » seul (examen) ou un mot proche ne déclenche rien", () => {
    expect(cles(["tendon d'Achille raide, palpation indolore"])).toEqual([]);
    expect(cles(['douleur du genou'])).toEqual([]);
    expect(cles(['fessier faible'])).toEqual([]);
  });
  it('entrées invalides ou énormes : ignorées sans erreur', () => {
    expect(detecterPathologies(null)).toEqual([]);
    expect(detecterPathologies([null, 3, {}, '', '   '])).toEqual([]);
    expect(detecterPathologies(['x'.repeat(30000) + ' pubalgie'])).toEqual([]);
  });
  it('7 programmes, codes tous distincts et au format catégorie|libellé', () => {
    expect(PATHOLOGIES).toHaveLength(7);
    expect(new Set(PATHOLOGIES.map((x) => x.code)).size).toBe(7);
    for (const x of PATHOLOGIES)
      expect(x.code).toMatch(/^pathologies-(genou|hanche|pied)\|\d\. Programme de réathlétisation/);
  });
});
