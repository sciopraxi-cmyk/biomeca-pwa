import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { charger } from './helpers/harnais-kfppa.mjs';
import { cas, patientFictif } from './helpers/resultats-279-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 2 — construction du résultat extraite de validateAndSave
// ═══════════════════════════════════════════════════════════════════
//
// La RÉFÉRENCE (tests/golden/resultats-279.json) a été produite par
// validateAndSave AVANT l'extraction (code de 7de94ae, lu via BIOMECA_SRC),
// sur les entrées
// synthétiques de tests/helpers/resultats-279-donnees.mjs. Elle ne contient
// que des données fabriquées : dataURL factices, coordonnées inventées.
//
// Comparaison APRÈS passage par JSON : c'est la forme sous laquelle le
// résultat est persisté (une clé à undefined n'y existe pas). La date, seul
// champ non déterministe, est retirée de la référence et vérifiée à part.

const REF = JSON.parse(readFileSync(join(RACINE, 'tests/golden/resultats-279.json'), 'utf8'));
const json = (o) => JSON.parse(JSON.stringify(o));
const CAS = cas(charger().TESTS);

describe('#279 étape 2 — _construireResultatTest', () => {
  it('E1. Même résultat qu’avant l’extraction, pour les 9 tests, le repli KFPPA et l’amorti en descente', () => {
    expect(Object.keys(REF)).toHaveLength(11);
    expect(CAS.map((c) => c.nom).sort()).toEqual(Object.keys(REF).sort());
    let n = 0;
    for (const c of CAS) {
      const env = charger();
      const r = json(
        env._construireResultatTest(
          c.id,
          structuredClone(c.slots),
          structuredClone(c.frames),
          patientFictif(c.civilite),
          'DATE'
        )
      );
      delete r.date;
      expect(r, c.nom).toStrictEqual(REF[c.nom]);
      n++;
    }
    expect(n).toBe(11);
  });

  it('E2. N’écrit rien : aucun espion, entrées et patient inchangés', () => {
    for (const c of CAS) {
      const env = charger(); // espions BLOQUANTS
      const slots = structuredClone(c.slots);
      const frames = structuredClone(c.frames);
      const patient = patientFictif(c.civilite);
      const avant = json({ slots, frames, patient });
      env._construireResultatTest(c.id, slots, frames, patient, 'DATE');
      expect(env.espions(), c.nom).toEqual([]);
      expect(json({ slots, frames, patient }), `${c.nom} : entrées modifiées`).toEqual(avant);
    }
  });

  it('E3. validateAndSave enregistre toujours exactement la référence', async () => {
    for (const c of CAS) {
      const env = charger({ persistance: true });
      env.poser({
        test: c.id,
        slots: structuredClone(c.slots),
        frames: structuredClone(c.frames),
        patient: patientFictif(c.civilite),
      });
      await env.validateAndSave();
      const r = json(env.patient().mesures[c.id]);
      expect(typeof r.date, c.nom).toBe('string');
      delete r.date;
      expect(r, c.nom).toStrictEqual(REF[c.nom]);
      expect(env.enregistrements(), c.nom).toEqual(['savePatients', 'alert', 'nav:pg-sport']);
    }
  });

  it('E4. La date est celle transmise par l’appelant', () => {
    const env = charger();
    const c = CAS[0];
    const r = env._construireResultatTest(
      c.id,
      structuredClone(c.slots),
      structuredClone(c.frames),
      patientFictif(''),
      '30/09/2026 12:00:00'
    );
    expect(r.date).toBe('30/09/2026 12:00:00');
  });
});
