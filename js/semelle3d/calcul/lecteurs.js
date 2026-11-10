// Lecture des scans 3D, sans dépendance : STL (binaire + ASCII), OBJ, PLY (ASCII + binaire LE/BE), 3MF.
// Le format est reconnu par le CONTENU (jamais par l'extension). Couleurs/textures/normales ignorées.
// Aucune hypothèse d'unité ni de repère : les coordonnées sont recopiées telles quelles.
// Retour : { format, positions: Float64Array, indices: Uint32Array, nbSommets, nbTriangles, avertissements[] }
export class ErreurFormat extends Error {}

class Tampon {
  constructor(n = 1024) { this.a = new Float64Array(n); this.n = 0; }
  pousser(v) { if (this.n === this.a.length) { const b = new Float64Array(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
  fin() { return this.a.slice(0, this.n); }
}
const latin1 = (u8, a, b) => { let s = ''; for (let i = a; i < b; i++) s += String.fromCharCode(u8[i]); return s; };

function finaliser(format, positions, indices, avertissements) {
  if (positions.length % 3 !== 0) throw new ErreurFormat(format + ' : nombre de coordonnées incohérent');
  const nv = positions.length / 3;
  const nt = indices.length / 3;
  if (nt === 0) throw new ErreurFormat(format + ' : aucun triangle lu');
  for (let k = 0; k < positions.length; k++) {
    if (!Number.isFinite(positions[k])) throw new ErreurFormat(format + ' : coordonnée non numérique (NaN ou infinie)');
  }
  for (let k = 0; k < indices.length; k++) {
    if (!(indices[k] < nv)) throw new ErreurFormat(format + ' : indice de sommet hors limites');
  }
  return { format, positions, indices, nbSommets: nv, nbTriangles: nt, avertissements };
}

export function detecterFormat(buffer) {
  const u8 = new Uint8Array(buffer);
  if (u8.length < 4) throw new ErreurFormat('fichier trop court');
  if (u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 3 && u8[3] === 4) return '3mf';
  const debut = latin1(u8, 0, Math.min(u8.length, 2048));
  if (/^\s*ply\r?\n/.test(debut)) return 'ply';
  // Un STL binaire peut avoir un en-tête qui commence par « solid » : la taille exacte tranche d'abord.
  if (u8.length >= 84) {
    const n = new DataView(buffer).getUint32(80, true);
    if (84 + 50 * n === u8.length) return 'stl_binaire';
  }
  if (/^\s*solid/i.test(debut) && /facet/i.test(debut)) return 'stl_ascii';
  const tete = latin1(u8, 0, Math.min(u8.length, 65536));
  if (/^\s*v\s+[-+.\d]/m.test(tete)) return 'obj';
  if (/^\s*solid/i.test(debut)) throw new ErreurFormat('STL probablement tronqué : taille ' + u8.length + ' octets incohérente avec l\'en-tête');
  throw new ErreurFormat('format non reconnu (attendu : STL, OBJ, PLY ou 3MF)');
}

function lireSTLBinaireScan(buffer) {
  const dv = new DataView(buffer);
  const nt = dv.getUint32(80, true);
  const pos = new Float64Array(9 * nt);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 9; k++) pos[9 * t + k] = dv.getFloat32(o + 12 + 4 * k, true);
    o += 50;
  }
  const idx = new Uint32Array(3 * nt);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return finaliser('stl_binaire', pos, idx, []);
}

function lireSTLAscii(buffer) {
  const txt = new TextDecoder('utf-8').decode(buffer);
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  const t = new Tampon(1 << 16);
  let m;
  while ((m = re.exec(txt))) { t.pousser(Number(m[1])); t.pousser(Number(m[2])); t.pousser(Number(m[3])); }
  if (t.n % 9 !== 0) throw new ErreurFormat('stl_ascii : nombre de sommets non multiple de 3 (fichier tronqué ?)');
  const idx = new Uint32Array(t.n / 3);
  for (let i = 0; i < idx.length; i++) idx[i] = i;
  return finaliser('stl_ascii', t.fin(), idx, []);
}

function lireOBJ(buffer) {
  const txt = new TextDecoder('utf-8').decode(buffer);
  const pos = new Tampon(1 << 16);
  const idx = new Tampon(1 << 16);
  let nv = 0, polygones = 0;
  let debut = 0;
  while (debut <= txt.length) {
    let fin = txt.indexOf('\n', debut);
    if (fin < 0) fin = txt.length;
    const l = txt.slice(debut, fin).trim();
    debut = fin + 1;
    if (l.length < 2) continue;
    if (l[0] === 'v' && (l[1] === ' ' || l[1] === '\t')) {
      const p = l.split(/\s+/);
      if (p.length < 4) throw new ErreurFormat('obj : sommet incomplet : ' + l.slice(0, 40));
      pos.pousser(Number(p[1])); pos.pousser(Number(p[2])); pos.pousser(Number(p[3]));
      nv++;
    } else if (l[0] === 'f' && (l[1] === ' ' || l[1] === '\t')) {
      const p = l.split(/\s+/).slice(1);
      if (p.length < 3) throw new ErreurFormat('obj : face de moins de 3 sommets');
      const ids = p.map((s) => {
        const k = parseInt(s.split('/')[0], 10);
        if (!Number.isInteger(k) || k === 0) throw new ErreurFormat('obj : indice de face invalide : ' + s);
        const r = k < 0 ? nv + k : k - 1; // indices négatifs = relatifs au dernier sommet lu
        if (r < 0 || r >= nv) throw new ErreurFormat('obj : indice de face hors limites : ' + s);
        return r;
      });
      if (ids.length > 3) polygones++;
      for (let i = 1; i < ids.length - 1; i++) { idx.pousser(ids[0]); idx.pousser(ids[i]); idx.pousser(ids[i + 1]); }
    }
  }
  const av = polygones ? [polygones + ' face(s) à plus de 3 sommets découpée(s) en éventail'] : [];
  return finaliser('obj', pos.fin(), Uint32Array.from(idx.fin()), av);
}

const TYPES_PLY = {
  char: [1, 'getInt8'], int8: [1, 'getInt8'], uchar: [1, 'getUint8'], uint8: [1, 'getUint8'],
  short: [2, 'getInt16'], int16: [2, 'getInt16'], ushort: [2, 'getUint16'], uint16: [2, 'getUint16'],
  int: [4, 'getInt32'], int32: [4, 'getInt32'], uint: [4, 'getUint32'], uint32: [4, 'getUint32'],
  float: [4, 'getFloat32'], float32: [4, 'getFloat32'], double: [8, 'getFloat64'], float64: [8, 'getFloat64'],
};

function lirePLY(buffer) {
  const u8 = new Uint8Array(buffer);
  const marque = 'end_header';
  let fin = -1;
  const limite = Math.min(u8.length, 1 << 20);
  const entete = latin1(u8, 0, limite);
  const k = entete.indexOf(marque);
  if (k < 0) throw new ErreurFormat('ply : en-tête sans end_header');
  fin = k + marque.length;
  if (u8[fin] === 13) fin++;
  if (u8[fin] === 10) fin++;
  const lignes = entete.slice(0, k).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let format = null;
  const elements = [];
  for (const l of lignes) {
    const p = l.split(/\s+/);
    if (p[0] === 'format') format = p[1];
    else if (p[0] === 'element') elements.push({ nom: p[1], n: parseInt(p[2], 10), props: [] });
    else if (p[0] === 'property') {
      if (!elements.length) throw new ErreurFormat('ply : propriété avant tout élément');
      if (p[1] === 'list') {
        if (!TYPES_PLY[p[2]] || !TYPES_PLY[p[3]]) throw new ErreurFormat('ply : type de liste inconnu');
        elements.at(-1).props.push({ nom: p[4], liste: true, tc: p[2], ti: p[3] });
      } else {
        if (!TYPES_PLY[p[1]]) throw new ErreurFormat('ply : type inconnu ' + p[1]);
        elements.at(-1).props.push({ nom: p[2], liste: false, t: p[1] });
      }
    }
  }
  if (!['ascii', 'binary_little_endian', 'binary_big_endian'].includes(format)) throw new ErreurFormat('ply : format « ' + format + ' » non pris en charge');
  const ev = elements.find((e) => e.nom === 'vertex');
  const ef = elements.find((e) => e.nom === 'face');
  if (!ev || !ef) throw new ErreurFormat('ply : éléments vertex et face attendus');
  const ix = ['x', 'y', 'z'].map((c) => ev.props.findIndex((p) => p.nom === c && !p.liste));
  if (ix.some((i) => i < 0)) throw new ErreurFormat('ply : propriétés x, y, z absentes');
  const pf = ef.props.findIndex((p) => p.liste && (p.nom === 'vertex_indices' || p.nom === 'vertex_index'));
  if (pf < 0) throw new ErreurFormat('ply : liste vertex_indices absente');

  const pos = new Float64Array(3 * ev.n);
  const idx = new Tampon(1 << 16);
  let polygones = 0;
  // lecteur de valeurs : ASCII (jetons) ou binaire (DataView)
  let prochain; // (type) -> nombre
  if (format === 'ascii') {
    const jetons = new TextDecoder('utf-8').decode(u8.subarray(fin)).split(/\s+/).filter(Boolean);
    let j = 0;
    prochain = () => { if (j >= jetons.length) throw new ErreurFormat('ply : fichier tronqué'); return Number(jetons[j++]); };
  } else {
    const dv = new DataView(buffer);
    const little = format === 'binary_little_endian';
    let o = fin;
    prochain = (t) => {
      const [taille, fn] = TYPES_PLY[t];
      if (o + taille > u8.length) throw new ErreurFormat('ply : fichier tronqué');
      const v = fn === 'getInt8' || fn === 'getUint8' ? dv[fn](o) : dv[fn](o, little);
      o += taille;
      return v;
    };
  }
  for (const e of elements) {
    for (let r = 0; r < e.n; r++) {
      const ligne = [];
      for (let p = 0; p < e.props.length; p++) {
        const pr = e.props[p];
        if (!pr.liste) { ligne[p] = prochain(pr.t); continue; }
        const c = prochain(pr.tc);
        const v = [];
        for (let i = 0; i < c; i++) v.push(prochain(pr.ti));
        ligne[p] = v;
      }
      if (e === ev) { pos[3 * r] = ligne[ix[0]]; pos[3 * r + 1] = ligne[ix[1]]; pos[3 * r + 2] = ligne[ix[2]]; }
      else if (e === ef) {
        const v = ligne[pf];
        if (v.length < 3) throw new ErreurFormat('ply : face de moins de 3 sommets');
        if (v.length > 3) polygones++;
        for (let i = 1; i < v.length - 1; i++) { idx.pousser(v[0]); idx.pousser(v[i]); idx.pousser(v[i + 1]); }
      }
    }
  }
  const av = polygones ? [polygones + ' face(s) à plus de 3 sommets découpée(s) en éventail'] : [];
  return finaliser('ply_' + format.replace('binary_', 'bin_').replace('_endian', ''), pos, Uint32Array.from(idx.fin()), av);
}

// ---- 3MF : archive zip, décompression par l'API du navigateur (DecompressionStream) ----
const TABLE_CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = TABLE_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }

export function listerZip(buffer) {
  const dv = new DataView(buffer);
  let e = -1;
  for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new ErreurFormat('3mf : archive zip illisible (fin de répertoire introuvable)');
  const n = dv.getUint16(e + 10, true);
  let o = dv.getUint32(e + 16, true);
  const u8 = new Uint8Array(buffer);
  const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(o, true) !== 0x02014b50) throw new ErreurFormat('3mf : répertoire zip corrompu');
    const m = {
      methode: dv.getUint16(o + 10, true), crc: dv.getUint32(o + 16, true), taille_comp: dv.getUint32(o + 20, true), taille: dv.getUint32(o + 24, true),
      nom: new TextDecoder().decode(u8.subarray(o + 46, o + 46 + dv.getUint16(o + 28, true))), local: dv.getUint32(o + 42, true),
    };
    if (m.taille_comp === 0xffffffff || m.taille === 0xffffffff) throw new ErreurFormat('3mf : zip64 non pris en charge');
    out.push(m);
    o += 46 + dv.getUint16(o + 28, true) + dv.getUint16(o + 30, true) + dv.getUint16(o + 32, true);
  }
  return out;
}

export async function extraireZip(buffer, m) {
  const dv = new DataView(buffer);
  if (dv.getUint32(m.local, true) !== 0x04034b50) throw new ErreurFormat('3mf : entrée zip corrompue');
  const debut = m.local + 30 + dv.getUint16(m.local + 26, true) + dv.getUint16(m.local + 28, true);
  const brut = new Uint8Array(buffer, debut, m.taille_comp);
  let donnees;
  if (m.methode === 0) donnees = brut.slice();
  else if (m.methode === 8) {
    const flux = new Blob([brut]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    donnees = new Uint8Array(await new Response(flux).arrayBuffer());
  } else throw new ErreurFormat('3mf : méthode de compression ' + m.methode + ' non prise en charge');
  if (donnees.length !== m.taille) throw new ErreurFormat('3mf : taille décompressée incohérente');
  if (crc32(donnees) !== m.crc) throw new ErreurFormat('3mf : somme de contrôle (CRC) invalide, archive corrompue');
  return donnees;
}

const attributs = (s) => { const o = {}; for (const m of s.matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2]; return o; };
function matrice3MF(s) {
  if (!s) return null;
  const v = s.trim().split(/\s+/).map(Number);
  if (v.length !== 12 || v.some((x) => !Number.isFinite(x))) throw new ErreurFormat('3mf : transformation invalide');
  return v;
}
const composer = (a, b) => { // a puis b (convention 3MF : vecteur ligne)
  if (!a) return b; if (!b) return a;
  const r = new Array(12).fill(0);
  const M = (m) => [[m[0], m[1], m[2], 0], [m[3], m[4], m[5], 0], [m[6], m[7], m[8], 0], [m[9], m[10], m[11], 1]];
  const A = M(a), B = M(b);
  const C = [0, 1, 2, 3].map((i) => [0, 1, 2, 3].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j] + A[i][3] * B[3][j]));
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) r[3 * i + j] = C[i][j];
  return r;
};

async function lire3MF(buffer) {
  const entrees = listerZip(buffer);
  const e = entrees.find((x) => x.nom === '3D/3dmodel.model') || entrees.find((x) => /\.model$/i.test(x.nom));
  if (!e) throw new ErreurFormat('3mf : fichier modèle (3D/3dmodel.model) absent');
  const xml = new TextDecoder('utf-8').decode(await extraireZip(buffer, e));
  const objets = new Map();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const a = attributs(m[1]);
    const corps = m[2];
    const o = { id: a.id, sommets: null, triangles: null, composants: [] };
    const mesh = /<mesh\b[\s\S]*?<\/mesh>/.exec(corps);
    if (mesh) {
      o.sommets = []; o.triangles = [];
      for (const v of mesh[0].matchAll(/<vertex\b([^>]*?)\/?>/g)) { const t = attributs(v[1]); o.sommets.push(Number(t.x), Number(t.y), Number(t.z)); }
      for (const v of mesh[0].matchAll(/<triangle\b([^>]*?)\/?>/g)) { const t = attributs(v[1]); o.triangles.push(Number(t.v1), Number(t.v2), Number(t.v3)); }
    }
    for (const c of corps.matchAll(/<component\b([^>]*?)\/?>/g)) { const t = attributs(c[1]); o.composants.push({ id: t.objectid, m: matrice3MF(t.transform) }); }
    objets.set(a.id, o);
  }
  if (!objets.size) throw new ErreurFormat('3mf : aucun objet dans le modèle');
  const items = [...xml.matchAll(/<item\b([^>]*?)\/?>/g)].map((m) => attributs(m[1]));
  const racines = items.length ? items.map((t) => ({ id: t.objectid, m: matrice3MF(t.transform) })) : [...objets.values()].filter((o) => o.sommets).map((o) => ({ id: o.id, m: null }));
  const pos = new Tampon(1 << 16);
  const idx = new Tampon(1 << 16);
  let nv = 0;
  const ajouter = (id, m, prof) => {
    if (prof > 8) throw new ErreurFormat('3mf : composants trop imbriqués');
    const o = objets.get(id);
    if (!o) throw new ErreurFormat('3mf : objet ' + id + ' introuvable');
    if (o.sommets) {
      const base = nv;
      for (let i = 0; i < o.sommets.length; i += 3) {
        let [x, y, z] = [o.sommets[i], o.sommets[i + 1], o.sommets[i + 2]];
        if (m) [x, y, z] = [x * m[0] + y * m[3] + z * m[6] + m[9], x * m[1] + y * m[4] + z * m[7] + m[10], x * m[2] + y * m[5] + z * m[8] + m[11]];
        pos.pousser(x); pos.pousser(y); pos.pousser(z);
      }
      nv += o.sommets.length / 3;
      for (const t of o.triangles) idx.pousser(base + t);
      for (let i = 0; i < o.triangles.length; i++) if (!(o.triangles[i] < o.sommets.length / 3)) throw new ErreurFormat('3mf : indice de triangle hors limites');
    }
    for (const c of o.composants) ajouter(c.id, composer(c.m, m), prof + 1);
  };
  for (const r of racines) ajouter(r.id, r.m, 0);
  return finaliser('3mf', pos.fin(), Uint32Array.from(idx.fin()), []);
}

export async function lireMaillage(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('lireMaillage : ArrayBuffer attendu');
  const f = detecterFormat(buffer);
  if (f === 'stl_binaire') return lireSTLBinaireScan(buffer);
  if (f === 'stl_ascii') return lireSTLAscii(buffer);
  if (f === 'obj') return lireOBJ(buffer);
  if (f === 'ply') return lirePLY(buffer);
  return lire3MF(buffer);
}
