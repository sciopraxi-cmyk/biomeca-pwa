// Archive .zip « stockée » (sans compression : les STL binaires se compressent mal), écrite sans dépendance.
// Sert à l'export des 2 semelles en UN SEUL téléchargement (les navigateurs bloquent ou annulent le 2e téléchargement automatique).
import { crc32 } from './lecteurs.js';

const enc = new TextEncoder();
function dos(date) { // date/heure MS-DOS (2 s de résolution, année >= 1980)
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date(Date.UTC(2026, 0, 1));
  const an = Math.max(1980, d.getUTCFullYear());
  return { t: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1), d: ((an - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}
// entrees : [{ nom, donnees: Uint8Array|ArrayBuffer }] ; renvoie un ArrayBuffer.
export function ecrireZip(entrees, date = new Date()) {
  if (!Array.isArray(entrees) || entrees.length === 0) throw new RangeError('zip : au moins un fichier');
  const noms = new Set(), { t, d } = dos(date), parts = [], central = [];
  let o = 0;
  for (const e of entrees) {
    if (typeof e.nom !== 'string' || !e.nom || /[\\/:*?"<>|]/.test(e.nom) || e.nom.startsWith('.')) throw new RangeError('zip : nom de fichier invalide « ' + e.nom + ' »');
    if (noms.has(e.nom)) throw new RangeError('zip : nom en double « ' + e.nom + ' »');
    noms.add(e.nom);
    const nom = enc.encode(e.nom), donnees = e.donnees instanceof Uint8Array ? e.donnees : new Uint8Array(e.donnees), crc = crc32(donnees);
    if (donnees.length >= 0xffffffff) throw new RangeError('zip : fichier trop gros (zip64 non géré)');
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); /* UTF-8 */ lh.setUint16(10, t, true); lh.setUint16(12, d, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, donnees.length, true); lh.setUint32(22, donnees.length, true); lh.setUint16(26, nom.length, true);
    parts.push(new Uint8Array(lh.buffer), nom, donnees);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(12, t, true); ch.setUint16(14, d, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, donnees.length, true); ch.setUint32(24, donnees.length, true); ch.setUint16(28, nom.length, true); ch.setUint32(42, o, true);
    central.push(new Uint8Array(ch.buffer), nom);
    o += 30 + nom.length + donnees.length;
  }
  const tc = central.reduce((a, p) => a + p.length, 0), fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entrees.length, true); fin.setUint16(10, entrees.length, true); fin.setUint32(12, tc, true); fin.setUint32(16, o, true);
  const tout = [...parts, ...central, new Uint8Array(fin.buffer)], out = new Uint8Array(tout.reduce((a, p) => a + p.length, 0));
  let k = 0; for (const p of tout) { out.set(p, k); k += p.length; }
  return out.buffer;
}
// Nom du .zip : « Semelles-fictives_AAAAMMJJ.zip » (même règle de nettoyage que les STL).
export function nomFichierZip(ref, dateISO) {
  const r = String(ref).replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''); if (!r) throw new RangeError('zip : référence vide');
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateISO); if (!m) throw new RangeError('zip : date ISO attendue');
  return r + '_' + m[1] + m[2] + m[3] + '.zip';
}
