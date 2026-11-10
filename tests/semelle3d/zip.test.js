import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ecrireZip, nomFichierZip } from '../../js/semelle3d/calcul/zip.js';
import { listerZip, extraireZip, crc32 } from '../../js/semelle3d/calcul/lecteurs.js';

const octets = (n, graine) => { const u = new Uint8Array(n); let s = graine; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; u[i] = s >>> 24; } return u; };

test('zip : relu par le lecteur du projet — noms, tailles, CRC et contenu identiques, 2 fichiers', async () => {
  const a = octets(5000, 1), b = octets(777, 2), z = ecrireZip([{ nom: 'Base_D_20261102.stl', donnees: a }, { nom: 'Base_G_20261102.stl', donnees: b }], new Date(Date.UTC(2026, 10, 2, 9, 30, 10)));
  const l = listerZip(z); assert.equal(l.length, 2);
  assert.deepEqual(l.map((m) => m.nom), ['Base_D_20261102.stl', 'Base_G_20261102.stl']);
  assert.deepEqual(l.map((m) => m.taille), [5000, 777]); assert.equal(l[0].crc, crc32(a));
  assert.deepEqual([...await extraireZip(z, l[0])], [...a]); assert.deepEqual([...await extraireZip(z, l[1])], [...b]);
});
test('zip : validé par un lecteur EXTERNE (python zipfile : testzip + contenu octet à octet)', () => {
  const a = octets(120001, 3), b = octets(3, 4), z = ecrireZip([{ nom: 'a_D.stl', donnees: a }, { nom: 'é_G.stl', donnees: b }]);
  const dir = mkdtempSync(join(tmpdir(), 'zip-')), f = join(dir, 't.zip'); writeFileSync(f, new Uint8Array(z)); writeFileSync(join(dir, 'a.bin'), a); writeFileSync(join(dir, 'b.bin'), b);
  const py = "import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; n=z.namelist(); assert n==['a_D.stl','é_G.stl'], n; assert z.read(n[0])==open(sys.argv[2],'rb').read(); assert z.read(n[1])==open(sys.argv[3],'rb').read(); print('ok')";
  const r = spawnSync('python3', ['-c', py, f, join(dir, 'a.bin'), join(dir, 'b.bin')], { encoding: 'utf8' });
  if (r.error) return; // python absent : le test interne ci-dessus suffit
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /ok/);
});
test('zip : refus — liste vide, nom invalide, nom en double', () => {
  assert.throws(() => ecrireZip([]), /au moins un fichier/);
  for (const nom of ['', '../x.stl', 'a/b.stl', '.cache', 'a:b']) assert.throws(() => ecrireZip([{ nom, donnees: new Uint8Array(1) }]), /nom de fichier invalide/);
  assert.throws(() => ecrireZip([{ nom: 'a.stl', donnees: new Uint8Array(1) }, { nom: 'a.stl', donnees: new Uint8Array(1) }]), /double/);
});
test('zip : un octet modifié est détecté par le contrôle CRC du lecteur', async () => {
  const z = ecrireZip([{ nom: 'a.stl', donnees: octets(100, 5) }]), l = listerZip(z); new Uint8Array(z)[30 + 5 + 10] ^= 1;
  await assert.rejects(() => extraireZip(z, l[0]), /CRC|contrôle/);
});
test('nom du zip : référence nettoyée + date', () => {
  assert.equal(nomFichierZip('Semelles fictives', '2026-11-02T10:00:00Z'), 'Semelles-fictives_20261102.zip');
  assert.throws(() => nomFichierZip('', '2026-11-02'), /vide/); assert.throws(() => nomFichierZip('a', 'hier'), /date/);
});
