// API partenaire v1 — vérification du contrat docs/api-partenaire-v1.md.
//
// Trois niveaux, du plus littéral au plus sémantique :
//   1. les corps produits sont comparés OCTET PAR OCTET aux goldens ;
//   2. les exemples du contrat sont comparés aux mêmes goldens, ce qui
//      empêche le document de dériver de l'implémentation ;
//   3. les règles de calcul du § 5 sont vérifiées cas par cas.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  CLES_ACTIVITE,
  MODULE_ORDRE,
  agreger,
  bornesMois,
  bornesMoisPrecedent,
  corpsActivite,
  corpsErreur,
  corpsSante,
  dateParis,
  dateRef,
  decalerJours,
  estUuidValide,
  modulesActifs,
  modulesInconnus,
} from '../supabase/functions/_shared/partenaire-v1.ts';

const ICI = dirname(fileURLToPath(import.meta.url));
const DOSSIER_GOLDEN = join(ICI, 'golden', 'partenaire-v1');
const CONTRAT = join(ICI, '..', 'docs', 'api-partenaire-v1.md');

/** Octets exacts d'un golden — jamais parsé, jamais normalisé. */
const golden = (nom) => readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');

// ═══════════════════════════════════════════════════════════════════
// 1. Sérialisation — comparaison octet par octet aux goldens
// ═══════════════════════════════════════════════════════════════════

describe('Sérialisation — octet par octet (contrat § 8)', () => {
  it('1. /sante produit exactement sante.json', () => {
    expect(corpsSante()).toBe(golden('sante.json'));
  });

  it('2. activité nominale produit exactement activite-nominal.json', () => {
    const corps = corpsActivite(
      '7f3a9c21-6b4e-4d18-9a05-2c8e1f0b47d3',
      {
        patientsActifs: 124,
        bilansMoisCourant: 18,
        bilansMoisPrecedent: 22,
        dernierBilanLe: '2026-08-15',
      },
      ['POSTURO', 'PEDIATRIE', 'PEDICURIE']
    );
    expect(corps).toBe(golden('activite-nominal.json'));
  });

  it('3. cabinet fraîchement activé produit exactement activite-vide.json', () => {
    const corps = corpsActivite(
      '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
      {
        patientsActifs: 0,
        bilansMoisCourant: 0,
        bilansMoisPrecedent: 0,
        dernierBilanLe: null,
      },
      ['SPORT', 'PEDICURIE']
    );
    expect(corps).toBe(golden('activite-vide.json'));
  });

  it('4. les trois corps d’erreur figés sont produits à l’identique', () => {
    expect(corpsErreur('licence_introuvable')).toBe(golden('erreur-licence-introuvable.json'));
    expect(corpsErreur('authentification_requise')).toBe(
      golden('erreur-authentification-requise.json')
    );
    expect(corpsErreur('debit_depasse')).toBe(golden('erreur-debit-depasse.json'));
  });

  it('5. aucun golden ne porte de saut de ligne final ni d’indentation', () => {
    // Un passage de Prettier sur tests/golden/ casserait la comparaison
    // ci-dessus de façon peu lisible. On l'attrape ici, explicitement.
    for (const nom of readdirSync(DOSSIER_GOLDEN)) {
      const octets = readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');
      expect(octets.endsWith('}'), `${nom} doit finir par } sans saut de ligne`).toBe(true);
      expect(octets.includes('\n'), `${nom} ne doit contenir aucun saut de ligne`).toBe(false);
      expect(octets.includes(': '), `${nom} ne doit pas être indenté`).toBe(false);
    }
  });

  it('6. l’ordre des clés est celui du contrat, pas l’alphabet', () => {
    const corps = corpsActivite(
      '7f3a9c21-6b4e-4d18-9a05-2c8e1f0b47d3',
      {
        patientsActifs: 1,
        bilansMoisCourant: 2,
        bilansMoisPrecedent: 3,
        dernierBilanLe: '2026-08-15',
      },
      []
    );
    expect(Object.keys(JSON.parse(corps))).toEqual([...CLES_ACTIVITE]);
    // Garde explicite : le tri alphabétique donnerait un autre ordre.
    expect([...CLES_ACTIVITE]).not.toEqual([...CLES_ACTIVITE].sort());
  });

  it('7. aucun champ n’est omis quand il vaut 0, null ou []', () => {
    const objet = JSON.parse(golden('activite-vide.json'));
    for (const cle of CLES_ACTIVITE) {
      expect(Object.hasOwn(objet, cle), `${cle} doit être présent`).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Le contrat ne dérive pas de l'implémentation
// ═══════════════════════════════════════════════════════════════════

describe('Contrat et goldens décrivent le même objet', () => {
  const markdown = readFileSync(CONTRAT, 'utf8');

  // Chaque exemple normatif du contrat est précédé de <!-- golden: X -->.
  const exemples = [
    ...markdown.matchAll(/<!--\s*golden:\s*(\S+)\s*-->\s*\n+```json\n([\s\S]*?)```/g),
  ];

  it('8. chaque golden est référencé par un exemple du contrat', () => {
    const references = exemples.map(([, nom]) => nom).sort();
    expect(references).toEqual(readdirSync(DOSSIER_GOLDEN).sort());
  });

  it.each(exemples.map(([, nom, bloc]) => [nom, bloc]))(
    '9. l’exemple %s du contrat décrit le même objet que le golden',
    (nom, bloc) => {
      // Le document est indenté pour la lecture, le golden porte les octets
      // normatifs : on compare donc les objets, puis on vérifie que le
      // golden est bien la forme compacte de cet objet.
      const duContrat = JSON.parse(bloc);
      const duGolden = JSON.parse(golden(nom));
      expect(duContrat).toEqual(duGolden);
      expect(Object.keys(duContrat)).toEqual(Object.keys(duGolden));
      expect(JSON.stringify(duContrat)).toBe(golden(nom));
    }
  );

  it('10. le contrat énonce le même ordre de modules que le code', () => {
    const tableau = markdown.match(
      /`POSTURO`, puis `PEDIATRIE`, puis `SPORT`, puis\s*\n?\s*`PEDICURIE`/
    );
    expect(tableau, 'l’ordre figé du § 6 doit rester énoncé dans le contrat').not.toBeNull();
    expect([...MODULE_ORDRE]).toEqual(['POSTURO', 'PEDIATRIE', 'SPORT', 'PEDICURIE']);
  });

  it('11. aucun champ de patient ne figure dans un exemple (frontière § 1)', () => {
    // Filet grossier mais utile : ces mots ne doivent jamais apparaître
    // dans un corps de réponse, quel qu'il soit.
    const interdits = ['nom', 'prenom', 'ddn', 'email', 'patientId', 'bilanId', 'payload'];
    for (const nom of readdirSync(DOSSIER_GOLDEN)) {
      const contenu = readFileSync(join(DOSSIER_GOLDEN, nom), 'utf8');
      for (const mot of interdits) {
        expect(contenu.includes(`"${mot}"`), `${nom} ne doit pas porter ${mot}`).toBe(false);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Vocabulaire des modules (contrat § 6)
// ═══════════════════════════════════════════════════════════════════

describe('modulesActifs (contrat § 6)', () => {
  it('12. traduit les identifiants internes en jetons publics', () => {
    expect(modulesActifs(['postural'], false)).toEqual(['POSTURO']);
    expect(modulesActifs(['podopedia'], false)).toEqual(['PEDIATRIE']);
    expect(modulesActifs(['podo_sport'], false)).toEqual(['SPORT']);
  });

  it('13. PEDICURIE vient de la formule, jamais d’un module interne', () => {
    expect(modulesActifs([], true)).toEqual(['PEDICURIE']);
    expect(modulesActifs([], false)).toEqual([]);
    // Aucun identifiant interne 'pedicurie' n'existe : s'il en arrivait un,
    // il serait ignoré comme tout identifiant hors vocabulaire.
    expect(modulesActifs(['pedicurie'], false)).toEqual([]);
  });

  it('14. respecte l’ordre figé, qui n’est pas l’ordre alphabétique', () => {
    // Entrée volontairement désordonnée.
    expect(modulesActifs(['podo_sport', 'podopedia', 'postural'], true)).toEqual([
      'POSTURO',
      'PEDIATRIE',
      'SPORT',
      'PEDICURIE',
    ]);
    // L'alphabet donnerait PEDIATRIE, PEDICURIE, POSTURO, SPORT.
    expect([...MODULE_ORDRE]).not.toEqual([...MODULE_ORDRE].sort());
  });

  it('15. dédoublonne', () => {
    expect(modulesActifs(['postural', 'postural'], false)).toEqual(['POSTURO']);
  });

  it('16. ignore silencieusement un identifiant hors vocabulaire', () => {
    expect(modulesActifs(['postural', 'module_futur'], false)).toEqual(['POSTURO']);
    expect(modulesInconnus(['postural', 'module_futur'])).toEqual(['module_futur']);
  });

  it('17. tolère une source absente ou malformée sans jamais renvoyer null', () => {
    expect(modulesActifs(undefined, false)).toEqual([]);
    expect(modulesActifs(null, false)).toEqual([]);
    expect(modulesActifs('postural', false)).toEqual([]);
    expect(modulesActifs(undefined, true)).toEqual(['PEDICURIE']);
  });

  it('18. cabinet lié sans formule : état anormal, mais la réponse le décrit tel quel', () => {
    // Le contrat § 6 impose de refléter l'état réel, pas de le corriger.
    expect(modulesActifs(['postural'], false)).toEqual(['POSTURO']);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Dates et bornes (contrat § 5.1)
// ═══════════════════════════════════════════════════════════════════

describe('Dates et fuseau (contrat § 5.1)', () => {
  it('19. dateRef privilégie bilan_date sur created_at', () => {
    expect(dateRef({ bilan_date: '2026-07-04', created_at: '2026-08-01T10:00:00Z' })).toBe(
      '2026-07-04'
    );
  });

  it('20. dateRef se replie sur created_at quand bilan_date est nulle', () => {
    expect(dateRef({ bilan_date: null, created_at: '2026-08-01T10:00:00Z' })).toBe('2026-08-01');
    expect(dateRef({ created_at: '2026-08-01T10:00:00Z' })).toBe('2026-08-01');
  });

  it('21. dateRef renvoie null quand aucune date n’est exploitable', () => {
    expect(dateRef({})).toBe(null);
    expect(dateRef({ bilan_date: null, created_at: null })).toBe(null);
  });

  it('22. le mois est calculé à Paris, pas en UTC', () => {
    // 31 juillet 23:30 UTC = 1er août 01:30 à Paris (heure d'été).
    // Calculé en UTC, ce bilan tomberait en juillet — c'est le bug que
    // la règle « Europe/Paris » du § 5.1 existe pour empêcher.
    expect(dateParis('2026-07-31T23:30:00Z')).toBe('2026-08-01');
    // En hiver, décalage +1 : 31 décembre 23:30 UTC = 1er janvier à Paris.
    expect(dateParis('2026-12-31T23:30:00Z')).toBe('2027-01-01');
    // Et une heure du matin UTC reste le même jour à Paris.
    expect(dateParis('2026-08-01T01:00:00Z')).toBe('2026-08-01');
  });

  it('23. bornesMois encadre le mois calendaire, longueurs variables comprises', () => {
    expect(bornesMois('2026-08-18')).toEqual(['2026-08-01', '2026-08-31']);
    expect(bornesMois('2026-02-10')).toEqual(['2026-02-01', '2026-02-28']);
    expect(bornesMois('2028-02-10')).toEqual(['2028-02-01', '2028-02-29']); // bissextile
    expect(bornesMois('2026-04-30')).toEqual(['2026-04-01', '2026-04-30']);
  });

  it('24. bornesMoisPrecedent franchit correctement le passage d’année', () => {
    expect(bornesMoisPrecedent('2026-08-18')).toEqual(['2026-07-01', '2026-07-31']);
    expect(bornesMoisPrecedent('2026-01-15')).toEqual(['2025-12-01', '2025-12-31']);
    expect(bornesMoisPrecedent('2026-03-31')).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('25. decalerJours franchit les mois et les années', () => {
    expect(decalerJours('2026-08-01', -1)).toBe('2026-07-31');
    expect(decalerJours('2026-01-01', -1)).toBe('2025-12-31');
    expect(decalerJours('2026-08-18', -364)).toBe('2025-08-19');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Agrégats (contrat § 5.2 à 5.4)
// ═══════════════════════════════════════════════════════════════════

const AUJ = '2026-08-18';
const b = (patient_id, bilan_date) => ({ patient_id, bilan_date, created_at: null });

describe('agreger (contrat § 5.2 à 5.4)', () => {
  it('26. compte des patients distincts, pas des bilans', () => {
    const r = agreger([b('p1', '2026-08-01'), b('p1', '2026-08-02'), b('p2', '2026-08-03')], AUJ);
    expect(r.patientsActifs).toBe(2);
    expect(r.bilansMoisCourant).toBe(3);
  });

  it('27. répartit les bilans entre mois courant et mois précédent', () => {
    const r = agreger(
      [b('p1', '2026-08-01'), b('p2', '2026-08-18'), b('p3', '2026-07-31'), b('p4', '2026-07-01')],
      AUJ
    );
    expect(r.bilansMoisCourant).toBe(2);
    expect(r.bilansMoisPrecedent).toBe(2);
  });

  it('28. le mois courant inclut aujourd’hui et exclut le 1er du mois suivant', () => {
    const r = agreger([b('p1', '2026-08-18')], AUJ);
    expect(r.bilansMoisCourant).toBe(1);
    // Bornes exactes : le 31 juillet n'est pas dans le mois courant.
    expect(agreger([b('p1', '2026-07-31')], AUJ).bilansMoisCourant).toBe(0);
    expect(agreger([b('p1', '2026-08-01')], AUJ).bilansMoisCourant).toBe(1);
  });

  it('29. un bilan antérieur au mois précédent n’alimente aucun compteur mensuel', () => {
    const r = agreger([b('p1', '2026-06-30')], AUJ);
    expect(r.bilansMoisCourant).toBe(0);
    expect(r.bilansMoisPrecedent).toBe(0);
    // Il reste néanmoins un patient actif et le dernier bilan connu.
    expect(r.patientsActifs).toBe(1);
    expect(r.dernierBilanLe).toBe('2026-06-30');
  });

  it('30. la fenêtre patientsActifs couvre 365 jours, bornes comprises', () => {
    // 2025-08-19 est le 365e jour en remontant depuis 2026-08-18 inclus.
    expect(agreger([b('p1', '2025-08-19')], AUJ).patientsActifs).toBe(1);
    expect(agreger([b('p1', '2025-08-18')], AUJ).patientsActifs).toBe(0);
  });

  it('31. un patient hors fenêtre sort de patientsActifs sans effacer dernierBilanLe', () => {
    const r = agreger([b('p1', '2023-05-04')], AUJ);
    expect(r.patientsActifs).toBe(0);
    expect(r.dernierBilanLe).toBe('2023-05-04');
    // Contrat § 5.4 : la combinaison est cohérente, pas contradictoire.
  });

  it('32. les bilans pré-datés dans le futur sont exclus de tout', () => {
    const r = agreger([b('p1', '2026-09-01'), b('p2', '2026-08-10')], AUJ);
    expect(r.patientsActifs).toBe(1);
    expect(r.bilansMoisCourant).toBe(1);
    expect(r.dernierBilanLe).toBe('2026-08-10');
  });

  it('33. dernierBilanLe est la plus grande date, sans limite d’ancienneté', () => {
    const r = agreger([b('p1', '2024-01-02'), b('p2', '2026-08-15'), b('p3', '2025-06-06')], AUJ);
    expect(r.dernierBilanLe).toBe('2026-08-15');
  });

  it('34. dernierBilanLe vaut null, jamais la chaîne vide', () => {
    const r = agreger([], AUJ);
    expect(r.dernierBilanLe).toBe(null);
    expect(r.dernierBilanLe).not.toBe('');
  });

  it('35. un bilan sans date exploitable est ignoré sans faire échouer le calcul', () => {
    const r = agreger([{ patient_id: 'p1' }, b('p2', '2026-08-10')], AUJ);
    expect(r.patientsActifs).toBe(1);
    expect(r.bilansMoisCourant).toBe(1);
  });

  it('36. le repli sur created_at alimente bien les compteurs', () => {
    const r = agreger(
      [{ patient_id: 'p1', bilan_date: null, created_at: '2026-08-05T09:00:00Z' }],
      AUJ
    );
    expect(r.bilansMoisCourant).toBe(1);
    expect(r.dernierBilanLe).toBe('2026-08-05');
  });

  it('37. un horodatage complet en bilan_date est tronqué au jour', () => {
    const r = agreger([{ patient_id: 'p1', bilan_date: '2026-08-05T00:00:00Z' }], AUJ);
    expect(r.dernierBilanLe).toBe('2026-08-05');
  });

  it('38. cabinet sans aucun bilan : tous les compteurs à zéro', () => {
    expect(agreger([], AUJ)).toEqual({
      patientsActifs: 0,
      bilansMoisCourant: 0,
      bilansMoisPrecedent: 0,
      dernierBilanLe: null,
    });
  });

  it('39. le calcul reste juste au 1er du mois, où le mois courant est d’un jour', () => {
    const r = agreger([b('p1', '2026-08-01'), b('p2', '2026-07-15')], '2026-08-01');
    expect(r.bilansMoisCourant).toBe(1);
    expect(r.bilansMoisPrecedent).toBe(1);
  });

  it('40. le calcul reste juste au 1er janvier, à cheval sur deux années', () => {
    const r = agreger([b('p1', '2027-01-01'), b('p2', '2026-12-24')], '2027-01-01');
    expect(r.bilansMoisCourant).toBe(1);
    expect(r.bilansMoisPrecedent).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 6. licenceId (contrat § 4.2 et § 7.2)
// ═══════════════════════════════════════════════════════════════════

describe('estUuidValide (contrat § 4.2)', () => {
  it('41. accepte la forme canonique en minuscules', () => {
    expect(estUuidValide('7f3a9c21-6b4e-4d18-9a05-2c8e1f0b47d3')).toBe(true);
  });

  it('42. refuse tout ce qui n’est pas cette forme', () => {
    for (const v of [
      '7F3A9C21-6B4E-4D18-9A05-2C8E1F0B47D3', // majuscules : normalisées en amont
      '7f3a9c216b4e4d189a052c8e1f0b47d3', // sans tirets
      '1', // séquentiel — le motif que le § 7.2 proscrit
      '',
      '../../etc/passwd',
      "7f3a9c21-6b4e-4d18-9a05-2c8e1f0b47d3' OR '1'='1",
      null,
      undefined,
      42,
    ]) {
      expect(estUuidValide(v), `${String(v)} doit être refusé`).toBe(false);
    }
  });
});
