import { describe, it, expect } from 'vitest';
import { isoDateToFr, reconstructPatientBilansFromRows } from '../js/bilan-reconstruct.mjs';

describe('isoDateToFr', () => {
  it('convertit YYYY-MM-DD en DD/MM/YYYY', () => {
    expect(isoDateToFr('2026-05-19')).toBe('19/05/2026');
  });

  it('renvoie null sur entrée absente ou mal formée', () => {
    expect(isoDateToFr(null)).toBeNull();
    expect(isoDateToFr(undefined)).toBeNull();
    expect(isoDateToFr('19/05/2026')).toBeNull();
    expect(isoDateToFr('')).toBeNull();
  });
});

describe('reconstructPatientBilansFromRows', () => {
  it('reconstruit le slot "en cours" sport (mesures + bilanData)', () => {
    const rows = [
      {
        module: 'sport',
        status: 'in_progress',
        payload: { mesures: { a: 1 }, bilanData: { b: 2 } },
      },
    ];
    const out = reconstructPatientBilansFromRows(rows);
    expect(out.mesures).toEqual({ a: 1 });
    expect(out.bilanData).toEqual({ b: 2 });
  });

  it('reconstruit le slot "en cours" posturo (payload direct)', () => {
    const rows = [{ module: 'posturo', status: 'in_progress', payload: { neuro4: { x: true } } }];
    const out = reconstructPatientBilansFromRows(rows);
    expect(out.bilanDataPosturo).toEqual({ neuro4: { x: true } });
  });

  it('#102 étape 4a-ter régression — une archive reconstruite porte _bilanId = row.id', () => {
    const rows = [
      {
        id: 'a14ed399-47cb-4227-915a-740d4abf509e',
        module: 'sport',
        status: 'archived',
        sous_type: 'initial',
        label: 'Sportif Initial',
        bilan_date: '2026-05-19',
        payload: { mesures: { amorti: 1 }, bilanData: { motif: 'test' } },
      },
    ];
    const out = reconstructPatientBilansFromRows(rows);
    expect(out.bilansSport).toHaveLength(1);
    expect(out.bilansSport[0]._bilanId).toBe('a14ed399-47cb-4227-915a-740d4abf509e');
    expect(out.bilansSport[0].label).toBe('Sportif Initial');
    expect(out.bilansSport[0].type).toBe('initial');
    expect(out.bilansSport[0].date).toBe('19/05/2026');
    expect(out.bilansSport[0].mesures).toEqual({ amorti: 1 });
    expect(out.bilansSport[0].bilanData).toEqual({ motif: 'test' });
  });

  it('applique la même garantie _bilanId aux 3 autres modules archivés', () => {
    const rows = [
      { id: 'id-posturo', module: 'posturo', status: 'archived', payload: { x: 1 } },
      { id: 'id-podo', module: 'podopediatrie', status: 'archived', payload: { y: 2 } },
      { id: 'id-pedi', module: 'pedicurie', status: 'archived', payload: { z: 3 } },
    ];
    const out = reconstructPatientBilansFromRows(rows);
    expect(out.bilansPosturo[0]._bilanId).toBe('id-posturo');
    expect(out.bilansPodopediatrie[0]._bilanId).toBe('id-podo');
    expect(out.bilansPedicurie[0]._bilanId).toBe('id-pedi');
  });

  it('conserve plusieurs archives du même module dans leur ordre', () => {
    const rows = [
      { id: 'id-1', module: 'sport', status: 'archived', label: 'Initial', payload: {} },
      { id: 'id-2', module: 'sport', status: 'archived', label: 'Contrôle', payload: {} },
    ];
    const out = reconstructPatientBilansFromRows(rows);
    expect(out.bilansSport.map((b) => b._bilanId)).toEqual(['id-1', 'id-2']);
    expect(out.bilansSport.map((b) => b.label)).toEqual(['Initial', 'Contrôle']);
  });

  it('rows vide ou absent renvoie une structure vide sans throw', () => {
    expect(reconstructPatientBilansFromRows([])).toMatchObject({
      bilansSport: [],
      bilansPosturo: [],
      bilansPodopediatrie: [],
      bilansPedicurie: [],
    });
    expect(reconstructPatientBilansFromRows(undefined)).toMatchObject({ bilansSport: [] });
  });
});
