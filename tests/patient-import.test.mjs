// #223-B — Tests des helpers purs de l'import CSV patients (Doctolib/DrSanté).
// Miroir testé : js/patient-import.mjs (dette #132 — sync manuelle avec
// js/biomeca.js).
import { describe, it, expect } from 'vitest';
import {
  _csvDetectSep,
  _csvParse,
  _importNormName,
  _importNormDdn,
  _importNormCivilite,
  _importMapHeaders,
  _importMatchDecision,
} from '../js/patient-import.mjs';

describe('_csvDetectSep', () => {
  it('détecte ; (Doctolib)', () => {
    expect(_csvDetectSep('Nom;Prénom;Date de naissance')).toBe(';');
  });
  it('détecte , quand majoritaire', () => {
    expect(_csvDetectSep('Nom,Prénom,Email')).toBe(',');
  });
  it('ignore les séparateurs à l’intérieur des guillemets', () => {
    expect(_csvDetectSep('"Nom, complet";Prénom;Ville')).toBe(';');
  });
  it('détecte la tabulation', () => {
    expect(_csvDetectSep('Nom\tPrénom')).toBe('\t');
  });
});

describe('_csvParse', () => {
  it('parse un CSV simple ;', () => {
    expect(_csvParse('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('préserve un ; à l’intérieur d’un champ quoté (le bug de l’ancien split)', () => {
    const rows = _csvParse('Nom;Adresse\nDupont;"12 rue X; Bât. B"');
    expect(rows[1]).toEqual(['Dupont', '12 rue X; Bât. B']);
  });
  it('gère les guillemets doublés et les retours à la ligne internes', () => {
    const rows = _csvParse('a;b\n"dit ""oui""";"ligne1\nligne2"');
    expect(rows[1]).toEqual(['dit "oui"', 'ligne1\nligne2']);
  });
  it('retire le BOM et ignore les lignes vides', () => {
    const rows = _csvParse('\uFEFFa;b\n\n1;2\n\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
  it('gère les fins de ligne CRLF', () => {
    expect(_csvParse('a;b\r\n1;2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('_importNormName', () => {
  it('normalise casse, accents, espaces et traits d’union', () => {
    expect(_importNormName('  Jean-François  DUPRÉ ')).toBe('jean francois dupre');
  });
  it('gère les apostrophes', () => {
    expect(_importNormName("D'Artagnan")).toBe('d artagnan');
  });
});

describe('_importNormDdn', () => {
  it('convertit DD/MM/YYYY', () => {
    expect(_importNormDdn('05/03/1988')).toBe('1988-03-05');
  });
  it('accepte l’ISO tel quel (avec heure éventuelle)', () => {
    expect(_importNormDdn('1988-03-05T00:00:00')).toBe('1988-03-05');
  });
  it('accepte D.M.YYYY', () => {
    expect(_importNormDdn('5.3.1988')).toBe('1988-03-05');
  });
  it('retourne "" si invalide', () => {
    expect(_importNormDdn('inconnu')).toBe('');
  });
});

describe('_importNormCivilite', () => {
  it.each([
    ['M', 'M.'],
    ['M.', 'M.'],
    ['Monsieur', 'M.'],
    ['Mme', 'Mme'],
    ['MADAME', 'Mme'],
    ['F', 'Mme'],
    ['', ''],
    ['Autre', ''],
  ])('%s → %s', (input, expected) => {
    expect(_importNormCivilite(input)).toBe(expected);
  });
});

describe('_importMapHeaders — export base patients Doctolib', () => {
  const headers = [
    'Id',
    'Civilité',
    'Nom',
    'Prénom',
    'Date de naissance',
    'E-mail',
    'Téléphone portable',
    'Téléphone secondaire',
    'Adresse',
    'Code postal',
    'Ville',
    "Type d'assurance",
    'Profession',
    'Nom du médecin traitant',
    'Ville du médecin traitant',
    'Numéro de sécurité sociale',
    'Provenance',
  ];
  const { map, nirIdx } = _importMapHeaders(headers);
  it('mappe l’identité', () => {
    expect(map.nom).toBe(2);
    expect(map.prenom).toBe(3);
    expect(map.ddn).toBe(4);
    expect(map.civilite).toBe(1);
  });
  it('mappe les coordonnées (portable prioritaire, adresse ≠ e-mail)', () => {
    expect(map.email).toBe(5);
    expect(map.tel).toBe(6);
    expect(map.adresse).toBe(8);
    expect(map.cp).toBe(9);
  });
  it('distingue ville patient et ville du médecin traitant', () => {
    expect(map.ville).toBe(10);
    expect(map.medecinTraitant).toBe(13);
  });
  it('mappe assurance, profession, provenance', () => {
    expect(map.assurance).toBe(11);
    expect(map.metier).toBe(12);
    expect(map.provenance).toBe(16);
  });
  it('repère le NIR pour l’ignorer explicitement', () => {
    expect(nirIdx).toBe(15);
  });
});

describe('_importMapHeaders — cas limites', () => {
  it('ne prend pas "nom de naissance" ni "nom du médecin traitant" pour le nom', () => {
    const { map } = _importMapHeaders([
      'Nom de naissance',
      'Nom du médecin traitant',
      'Nom',
      'Prénom',
    ]);
    expect(map.nom).toBe(2);
  });
  it('en-têtes inconnues → nom et prénom à -1', () => {
    const { map } = _importMapHeaders(['Foo', 'Bar']);
    expect(map.nom).toBe(-1);
    expect(map.prenom).toBe(-1);
  });
});

describe('_importMatchDecision — idempotence', () => {
  it('aucun candidat → création', () => {
    expect(_importMatchDecision([], '1990-01-01')).toEqual({ action: 'create' });
  });
  it('ddn identique → match', () => {
    expect(_importMatchDecision([{ idx: 4, ddn: '1990-01-01' }], '1990-01-01')).toEqual({
      action: 'match',
      idx: 4,
    });
  });
  it('homonyme avec ddn différente → création (pas de fusion hasardeuse)', () => {
    expect(_importMatchDecision([{ idx: 4, ddn: '1985-06-06' }], '1990-01-01')).toEqual({
      action: 'create',
    });
  });
  it('candidat unique sans ddn locale → match (complétion de la ddn)', () => {
    expect(_importMatchDecision([{ idx: 2, ddn: '' }], '1990-01-01')).toEqual({
      action: 'match',
      idx: 2,
    });
  });
  it('plusieurs candidats sans ddn → ambigu (ligne ignorée)', () => {
    expect(
      _importMatchDecision(
        [
          { idx: 1, ddn: '' },
          { idx: 2, ddn: '' },
        ],
        '1990-01-01'
      )
    ).toEqual({ action: 'ambiguous' });
  });
  it('ligne sans ddn + candidat unique → match', () => {
    expect(_importMatchDecision([{ idx: 7, ddn: '1990-01-01' }], '')).toEqual({
      action: 'match',
      idx: 7,
    });
  });
  it('ligne sans ddn + plusieurs candidats → ambigu', () => {
    expect(
      _importMatchDecision(
        [
          { idx: 1, ddn: '1990-01-01' },
          { idx: 2, ddn: '1991-02-02' },
        ],
        ''
      )
    ).toEqual({ action: 'ambiguous' });
  });
});
