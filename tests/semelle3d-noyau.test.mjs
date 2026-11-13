// Lance les tests du noyau de la semelle 3D (tests/semelle3d/, écrits avec node:test) dans la suite habituelle.
// Vitest ne sait pas lire node:test : on exécute `node --test` et on exige un code de sortie 0.
// Motif glob (et non le dossier) : Node 22 (CI) refuse un dossier comme argument de --test, Node 24+ l'accepte.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));

describe('semelle 3D — noyau de calcul (node:test)', () => {
  it('tous les tests de tests/semelle3d/ passent', async () => {
    const { code, sortie } = await new Promise((resolve) => {
      const p = spawn(process.execPath, ['--test', 'tests/semelle3d/**/*.test.js'], {
        cwd: racine,
      });
      let texte = '';
      p.stdout.on('data', (d) => (texte += d));
      p.stderr.on('data', (d) => (texte += d));
      p.on('close', (c) => resolve({ code: c, sortie: texte }));
    });
    const resume = sortie
      .split('\n')
      .filter((l) => /^ℹ (tests|pass|fail)|^✖/.test(l))
      .join('\n');
    expect(code, resume).toBe(0);
    expect(sortie).toMatch(/ℹ tests (\d+)/);
    expect(Number(/ℹ tests (\d+)/.exec(sortie)[1])).toBeGreaterThan(450);
  }, 1500000);
});
