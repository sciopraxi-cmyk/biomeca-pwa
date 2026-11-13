// Écriture de scans dans chaque format lu (jeux d'essai synthétiques et démonstration).
// Réservé aux tests/démos : l'application lit, elle n'écrit que le STL de fabrication (stl.js).
import { crc32 } from './lecteurs.js';

const enc = (s) => new TextEncoder().encode(s);

export function ecrireSTLAscii({ positions, indices }) {
  let s = 'solid scan_synthetique\n';
  for (let t = 0; t < indices.length; t += 3) {
    s += ' facet normal 0 0 0\n  outer loop\n';
    for (let k = 0; k < 3; k++) { const v = 3 * indices[t + k]; s += '   vertex ' + positions[v] + ' ' + positions[v + 1] + ' ' + positions[v + 2] + '\n'; }
    s += '  endloop\n endfacet\n';
  }
  s += 'endsolid scan_synthetique\n';
  return enc(s).buffer;
}

// En-tête volontairement « solid… » : piège classique des STL binaires.
export function ecrireSTLBinaireScan({ positions, indices }, { entete = 'solid exporte par un scanner' } = {}) {
  const nt = indices.length / 3;
  const buf = new ArrayBuffer(84 + 50 * nt);
  const dv = new DataView(buf);
  new Uint8Array(buf, 0, 80).set(enc(entete).subarray(0, 80));
  dv.setUint32(80, nt, true);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    o += 12;
    for (let k = 0; k < 3; k++) { const v = 3 * indices[3 * t + k]; for (let q = 0; q < 3; q++) dv.setFloat32(o + 4 * q, positions[v + q], true); o += 12; }
    o += 2;
  }
  return buf;
}

export function ecrireOBJ({ positions, indices }, { negatifs = false, quads = false } = {}) {
  let s = '# scan synthetique\nmtllib x.mtl\no pied\n';
  const nv = positions.length / 3;
  for (let v = 0; v < nv; v++) s += 'v ' + positions[3 * v] + ' ' + positions[3 * v + 1] + ' ' + positions[3 * v + 2] + ' 0.5 0.5 0.5\n';
  s += 'vt 0 0\nvn 0 0 1\n';
  const r = (i) => (negatifs ? i - nv : i + 1) + '/1/1';
  for (let t = 0; t < indices.length; t += 3) s += 'f ' + r(indices[t]) + ' ' + r(indices[t + 1]) + ' ' + r(indices[t + 2]) + '\n';
  return enc(s).buffer;
}

// Un seul quadrilatère (0,1,2,3) pour tester la triangulation en éventail.
export function ecrireOBJQuad(pts) {
  return enc('v ' + pts.map((p) => p.join(' ')).join('\nv ') + '\nf 1 2 3 4\n').buffer;
}

export function ecrirePLY({ positions, indices }, { format = 'ascii', couleur = true } = {}) {
  const nv = positions.length / 3, nt = indices.length / 3;
  const ent = 'ply\nformat ' + (format === 'ascii' ? 'ascii' : format) + ' 1.0\ncomment synthetique\nelement vertex ' + nv + '\nproperty float x\nproperty float y\nproperty float z\n' +
    (couleur ? 'property uchar red\nproperty uchar green\nproperty uchar blue\n' : '') + 'element face ' + nt + '\nproperty list uchar int vertex_indices\nend_header\n';
  if (format === 'ascii') {
    let s = ent;
    for (let v = 0; v < nv; v++) s += Math.fround(positions[3 * v]) + ' ' + Math.fround(positions[3 * v + 1]) + ' ' + Math.fround(positions[3 * v + 2]) + (couleur ? ' 10 20 30' : '') + '\n';
    for (let t = 0; t < nt; t++) s += '3 ' + indices[3 * t] + ' ' + indices[3 * t + 1] + ' ' + indices[3 * t + 2] + '\n';
    return enc(s).buffer;
  }
  const little = format === 'binary_little_endian';
  const eh = enc(ent);
  const taille = eh.length + nv * (12 + (couleur ? 3 : 0)) + nt * 13;
  const buf = new ArrayBuffer(taille);
  new Uint8Array(buf).set(eh);
  const dv = new DataView(buf);
  let o = eh.length;
  for (let v = 0; v < nv; v++) {
    for (let q = 0; q < 3; q++) { dv.setFloat32(o, positions[3 * v + q], little); o += 4; }
    if (couleur) { dv.setUint8(o++, 10); dv.setUint8(o++, 20); dv.setUint8(o++, 30); }
  }
  for (let t = 0; t < nt; t++) { dv.setUint8(o++, 3); for (let k = 0; k < 3; k++) { dv.setInt32(o, indices[3 * t + k], little); o += 4; } }
  return buf;
}

function zip(entrees) {
  const parts = [], central = [];
  let o = 0;
  for (const e of entrees) {
    const nom = enc(e.nom);
    const crc = crc32(e.donnees);
    const brut = e.comprime || e.donnees;
    const methode = e.comprime ? 8 : 0;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, methode, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, brut.length, true); lh.setUint32(22, e.donnees.length, true); lh.setUint16(26, nom.length, true);
    parts.push(new Uint8Array(lh.buffer), nom, brut);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(10, methode, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, brut.length, true); ch.setUint32(24, e.donnees.length, true); ch.setUint16(28, nom.length, true); ch.setUint32(42, o, true);
    central.push(new Uint8Array(ch.buffer), nom);
    o += 30 + nom.length + brut.length;
  }
  const tc = central.reduce((a, p) => a + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, entrees.length, true); fin.setUint16(10, entrees.length, true); fin.setUint32(12, tc, true); fin.setUint32(16, o, true);
  const tout = [...parts, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(tout.reduce((a, p) => a + p.length, 0));
  let k = 0;
  for (const p of tout) { out.set(p, k); k += p.length; }
  return out.buffer;
}

// compresseur(Uint8Array) -> Uint8Array (deflate brut) optionnel : sinon entrées « stockées ».
export function ecrire3MF({ positions, indices }, { compresseur = null, transform = null, unite = 'millimeter' } = {}) {
  let v = '', t = '';
  for (let i = 0; i < positions.length; i += 3) v += '<vertex x="' + positions[i] + '" y="' + positions[i + 1] + '" z="' + positions[i + 2] + '"/>';
  for (let i = 0; i < indices.length; i += 3) t += '<triangle v1="' + indices[i] + '" v2="' + indices[i + 1] + '" v3="' + indices[i + 2] + '"/>';
  const modele = '<?xml version="1.0" encoding="UTF-8"?><model unit="' + unite + '" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" type="model"><mesh><vertices>' + v + '</vertices><triangles>' + t + '</triangles></mesh></object></resources><build><item objectid="1"' + (transform ? ' transform="' + transform + '"' : '') + '/></build></model>';
  const mk = (nom, s) => { const donnees = enc(s); return { nom, donnees, comprime: compresseur ? compresseur(donnees) : null }; };
  return zip([
    mk('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    mk('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    mk('3D/3dmodel.model', modele),
  ]);
}
