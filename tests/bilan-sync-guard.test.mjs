import { describe, it, expect } from 'vitest';
import { isEnCoursPourSync, detectIdCollision } from '../js/bilan-sync-guard.mjs';

// id au format réel observé en prod lors du diagnostic (anonymisé — aucune
// donnée patient ici, seul le format uuid compte).
const ARCHIVE_ID = 'a14ed399-47cb-4227-915a-740d4abf509e';

// Simule le sous-ensemble de bilanRows pertinent tel que construit par
// _syncPatientToNormalizedTables : une ligne "en cours" éventuelle (poussée
// seulement si isEnCoursPourSync l'autorise) + la ligne archivée déjà en
// base pour ce même bilan, si le scénario en comporte une.
function buildRows({ sousType, hasContent, id, hasArchivedCounterpart }) {
  const rows = [];
  if (isEnCoursPourSync(sousType, hasContent)) {
    rows.push({ id, status: 'in_progress' });
  }
  if (hasArchivedCounterpart) {
    rows.push({ id, status: 'archived' });
  }
  return rows;
}

describe('isEnCoursPourSync', () => {
  it("#102 régression — consulter une archive (sousType null, contenu chargé) n'est PAS en cours", () => {
    // C'est exactement l'état laissé par ouvrirBilan<Module>() : sousType
    // supprimé, mais bilanData rempli avec la copie de l'archive.
    expect(isEnCoursPourSync(null, true)).toBe(false);
  });

  it('bilan génuinement en cours (sousType posé + contenu saisi) est en cours', () => {
    expect(isEnCoursPourSync('initial', true)).toBe(true);
    expect(isEnCoursPourSync('controle', true)).toBe(true);
  });

  it('sousType posé mais aucun contenu saisi — rien à synchroniser', () => {
    expect(isEnCoursPourSync('initial', false)).toBe(false);
  });

  it('sousType undefined (jamais initialisé) traité comme non-en-cours', () => {
    expect(isEnCoursPourSync(undefined, true)).toBe(false);
  });
});

describe('detectIdCollision — #102 hotfix 2 (Postgres 21000)', () => {
  it('consulter une archive ne collisionne plus avec sa propre ligne archivée (fix appliqué)', () => {
    const rows = buildRows({
      sousType: null,
      hasContent: true,
      id: ARCHIVE_ID,
      hasArchivedCounterpart: true,
    });
    expect(rows).toHaveLength(1); // seule la ligne archived est poussée
    expect(rows[0].status).toBe('archived');
    expect(detectIdCollision(rows)).toEqual([]);
  });

  it('documente la régression : sans le garde-fou sousType, la même situation collisionne', () => {
    // Mirror volontaire de l'ANCIEN comportement bugué (PR #159→#162) :
    // condition = présence de contenu seule, sans vérifier le sousType.
    const buggyEnCours = (_sousType, hasContent) => Boolean(hasContent);
    const rows = [];
    if (buggyEnCours(null, true)) rows.push({ id: ARCHIVE_ID, status: 'in_progress' });
    rows.push({ id: ARCHIVE_ID, status: 'archived' });
    expect(detectIdCollision(rows)).toEqual([ARCHIVE_ID]); // → 500 Postgres 21000
  });

  it('un bilan génuinement en cours (id neuf, pas encore archivé) ne collisionne jamais', () => {
    const rows = buildRows({
      sousType: 'initial',
      hasContent: true,
      id: 'nouveau-bilan-id',
      hasArchivedCounterpart: false,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('in_progress');
    expect(detectIdCollision(rows)).toEqual([]);
  });

  it('les 4 modules (sport/posturo/podopediatrie/pedicurie) partagent le même garde-fou', () => {
    ['sport', 'posturo', 'podopediatrie', 'pedicurie'].forEach((module) => {
      const rows = buildRows({
        sousType: null,
        hasContent: true,
        id: `${module}-${ARCHIVE_ID}`,
        hasArchivedCounterpart: true,
      });
      expect(detectIdCollision(rows)).toEqual([]);
    });
  });
});
