// #102-A — Tests de la fusion additive des archives cloud (bilan-merge.mjs,
// miroir de _mergeCloudArchivesIntoPatient dans js/biomeca.js).
import { describe, it, expect } from 'vitest';
import { mergeCloudArchivesIntoPatient } from '../js/bilan-merge.mjs';

const sportArchive = (id, label = 'Initial') => ({
  _bilanId: id,
  label,
  type: 'initial',
  date: '01/08/2026',
  mesures: { m1: 1 },
  bilanData: { champ: 'x' },
});
const posturoArchive = (id) => ({
  label: 'Initial',
  type: 'initial',
  date: '02/08/2026',
  bilanDataPosturo: { _bilanId: id, champ: 'y' },
});

describe('mergeCloudArchivesIntoPatient (#102-A)', () => {
  it('règle 1 — ajoute une archive cloud absente en local (copie profonde)', () => {
    const p = { bilansSport: [sportArchive('a1')] };
    const recon = { bilansSport: [sportArchive('a1'), sportArchive('a2', 'Contrôle')] };
    const added = mergeCloudArchivesIntoPatient(p, recon);
    expect(added).toEqual(['bilansSport:a2']);
    expect(p.bilansSport).toHaveLength(2);
    // Copie profonde : muter la source cloud ne touche pas le blob.
    recon.bilansSport[1].mesures.m1 = 999;
    expect(p.bilansSport[1].mesures.m1).toBe(1);
  });

  it('règle 2 — archive présente des deux côtés : aucune modification locale', () => {
    const local = sportArchive('a1');
    local.mesures.m1 = 42; // version locale divergente
    const p = { bilansSport: [local] };
    const added = mergeCloudArchivesIntoPatient(p, { bilansSport: [sportArchive('a1')] });
    expect(added).toEqual([]);
    expect(p.bilansSport).toHaveLength(1);
    expect(p.bilansSport[0].mesures.m1).toBe(42); // intouchée
  });

  it('règle 3 — archive locale absente du cloud : aucune suppression', () => {
    const p = { bilansSport: [sportArchive('local-only')] };
    const added = mergeCloudArchivesIntoPatient(p, { bilansSport: [] });
    expect(added).toEqual([]);
    expect(p.bilansSport).toHaveLength(1);
  });

  it("règle 4 — entrée cloud sans id fiable : pas d'ajout", () => {
    const orphan = sportArchive('x');
    delete orphan._bilanId;
    const p = { bilansSport: [] };
    const added = mergeCloudArchivesIntoPatient(p, { bilansSport: [orphan] });
    expect(added).toEqual([]);
    expect(p.bilansSport).toHaveLength(0);
  });

  it('identité posturo lue DANS bilanDataPosturo (pas au niveau racine)', () => {
    const p = { bilansPosturo: [posturoArchive('p1')] };
    const added = mergeCloudArchivesIntoPatient(p, {
      bilansPosturo: [posturoArchive('p1'), posturoArchive('p2')],
    });
    expect(added).toEqual(['bilansPosturo:p2']);
    expect(p.bilansPosturo).toHaveLength(2);
  });

  it('crée le tableau local absent (patient sans aucune archive du module)', () => {
    const p = {};
    const added = mergeCloudArchivesIntoPatient(p, {
      bilansPedicurie: [
        { label: null, type: null, date: null, bilanDataPedicurie: { _bilanId: 'k1' } },
      ],
    });
    expect(added).toEqual(['bilansPedicurie:k1']);
    expect(p.bilansPedicurie).toHaveLength(1);
  });

  it('in_progress hors périmètre : mesures/bilanData* jamais touchés', () => {
    const p = { mesures: { local: true }, bilanData: { local: true } };
    const recon = {
      mesures: { cloud: true },
      bilanData: { cloud: true },
      bilanDataPosturo: { cloud: true },
      bilansSport: [],
    };
    mergeCloudArchivesIntoPatient(p, recon);
    expect(p.mesures).toEqual({ local: true });
    expect(p.bilanData).toEqual({ local: true });
    expect(p.bilanDataPosturo).toBeUndefined();
  });

  it('entrées nulles/invalides tolérées sans throw', () => {
    expect(mergeCloudArchivesIntoPatient(null, {})).toEqual([]);
    expect(mergeCloudArchivesIntoPatient({}, null)).toEqual([]);
    const p = { bilansSport: [null, sportArchive('a1')] };
    const added = mergeCloudArchivesIntoPatient(p, { bilansSport: [null, sportArchive('a2')] });
    expect(added).toEqual(['bilansSport:a2']);
  });
});
