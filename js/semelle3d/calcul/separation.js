// Séparation des 2 pieds d'une même empreinte (fonction pure).
// 1) soudure des sommets confondus, composantes connexes (union-find sur les triangles) ;
// 2) 2 composantes significatives = 2 pieds ; sinon (maillage d'un seul tenant, pieds collés) coupe dans la vallée
//    de densité de surface le long d'un axe principal ; sinon coupe MANUELLE (plan donné par le praticien).
// Aucune latéralité ici : les pieds sont nommés « A » et « B » (ordre d'apparition dans le fichier).
import { analyseACP } from './recalage.js';

export const SEPARATION = Object.freeze({
  tolerance_soudure_rel: 1e-6, // × diagonale de la boîte
  aire_min_rel: 0.2, // une composante est un pied si son aire >= 20 % de la plus grande
  classes_vallee: 200,
  fenetre_vallee: [0.25, 0.75],
  seuil_vallee: 0.35, // densité minimale / plus petit des deux pics voisins
  pic_min_rel: 0.1, // les deux flancs doivent porter chacun >= 10 % de la surface
});

function aireTri(p, a, b, c) {
  const ux = p[3 * b] - p[3 * a], uy = p[3 * b + 1] - p[3 * a + 1], uz = p[3 * b + 2] - p[3 * a + 2];
  const vx = p[3 * c] - p[3 * a], vy = p[3 * c + 1] - p[3 * a + 1], vz = p[3 * c + 2] - p[3 * a + 2];
  return Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
}

function souder(mesh) {
  const { positions } = mesh;
  const nv = positions.length / 3;
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < nv; v++) for (let k = 0; k < 3; k++) { const x = positions[3 * v + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
  const diag = Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]);
  const q = Math.max(diag * SEPARATION.tolerance_soudure_rel, 1e-12);
  const table = new Map();
  const id = new Int32Array(nv);
  for (let v = 0; v < nv; v++) {
    const cle = Math.round(positions[3 * v] / q) + ',' + Math.round(positions[3 * v + 1] / q) + ',' + Math.round(positions[3 * v + 2] / q);
    let n = table.get(cle);
    if (n === undefined) { n = table.size; table.set(cle, n); }
    id[v] = n;
  }
  return { id, nSoudes: table.size };
}

function composantes(mesh) {
  const { indices } = mesh;
  const nt = indices.length / 3;
  const { id, nSoudes } = souder(mesh);
  const parent = new Int32Array(nSoudes);
  for (let i = 0; i < nSoudes; i++) parent[i] = i;
  const racine = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unir = (a, b) => { a = racine(a); b = racine(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
  for (let t = 0; t < nt; t++) { const a = id[indices[3 * t]], b = id[indices[3 * t + 1]], c = id[indices[3 * t + 2]]; unir(a, b); unir(a, c); }
  const parRacine = new Map();
  const etiquette = new Int32Array(nt);
  const comps = [];
  for (let t = 0; t < nt; t++) {
    const r = racine(id[indices[3 * t]]);
    let k = parRacine.get(r);
    if (k === undefined) { k = comps.length; parRacine.set(r, k); comps.push({ triangles: 0, aire: 0, premier: t }); }
    etiquette[t] = k;
    comps[k].triangles++;
    comps[k].aire += aireTri(mesh.positions, indices[3 * t], indices[3 * t + 1], indices[3 * t + 2]);
  }
  return { etiquette, comps };
}

// Extrait les triangles dont `groupe[t] === g` en un maillage compact (sommets renumérotés).
function extraire(mesh, groupe, g, format) {
  const { positions, indices } = mesh;
  const nv = positions.length / 3;
  const nouveau = new Int32Array(nv).fill(-1);
  const pos = [], idx = [];
  for (let t = 0; t < groupe.length; t++) {
    if (groupe[t] !== g) continue;
    for (let k = 0; k < 3; k++) {
      const v = indices[3 * t + k];
      if (nouveau[v] < 0) { nouveau[v] = pos.length / 3; pos.push(positions[3 * v], positions[3 * v + 1], positions[3 * v + 2]); }
      idx.push(nouveau[v]);
    }
  }
  return { format, positions: Float64Array.from(pos), indices: Uint32Array.from(idx), nbSommets: pos.length / 3, nbTriangles: idx.length / 3, avertissements: [] };
}

function centreTri(mesh, t) {
  const { positions: p, indices: i } = mesh;
  const a = 3 * i[3 * t], b = 3 * i[3 * t + 1], c = 3 * i[3 * t + 2];
  return [(p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3];
}

// Cherche la meilleure vallée sur les 3 axes principaux. Retourne {n, d, score, axe} ou null.
function chercherVallee(mesh) {
  const nt = mesh.indices.length / 3;
  const acp = analyseACP(mesh);
  const cs = new Float64Array(3 * nt), aires = new Float64Array(nt);
  for (let t = 0; t < nt; t++) {
    const c = centreTri(mesh, t);
    cs[3 * t] = c[0]; cs[3 * t + 1] = c[1]; cs[3 * t + 2] = c[2];
    aires[t] = aireTri(mesh.positions, mesh.indices[3 * t], mesh.indices[3 * t + 1], mesh.indices[3 * t + 2]);
  }
  const NB = SEPARATION.classes_vallee;
  let meilleur = null;
  acp.axes.forEach((axe, ia) => {
    const s = new Float64Array(nt);
    let mn = Infinity, mx = -Infinity;
    for (let t = 0; t < nt; t++) {
      s[t] = (cs[3 * t] - acp.centre[0]) * axe[0] + (cs[3 * t + 1] - acp.centre[1]) * axe[1] + (cs[3 * t + 2] - acp.centre[2]) * axe[2];
      if (s[t] < mn) mn = s[t]; if (s[t] > mx) mx = s[t];
    }
    if (!(mx > mn)) return;
    const h = new Float64Array(NB);
    let total = 0;
    for (let t = 0; t < nt; t++) { h[Math.min(NB - 1, Math.floor(((s[t] - mn) / (mx - mn)) * NB))] += aires[t]; total += aires[t]; }
    // lissage léger (3 classes)
    const l = new Float64Array(NB);
    for (let b = 0; b < NB; b++) l[b] = (h[Math.max(0, b - 1)] + h[b] + h[Math.min(NB - 1, b + 1)]) / 3;
    const b0 = Math.floor(SEPARATION.fenetre_vallee[0] * NB), b1 = Math.ceil(SEPARATION.fenetre_vallee[1] * NB);
    let bv = -1, vv = Infinity;
    for (let b = b0; b < b1; b++) if (l[b] < vv) { vv = l[b]; bv = b; }
    let pg = 0, pd = 0, sg = 0, sd = 0;
    for (let b = 0; b < NB; b++) { if (b < bv) { pg = Math.max(pg, l[b]); sg += h[b]; } else if (b > bv) { pd = Math.max(pd, l[b]); sd += h[b]; } }
    const pic = Math.min(pg, pd);
    if (!(pic > 0) || sg < SEPARATION.pic_min_rel * total || sd < SEPARATION.pic_min_rel * total) return;
    const score = vv / pic;
    if (score < SEPARATION.seuil_vallee && (!meilleur || score < meilleur.score)) {
      const pos = mn + ((bv + 0.5) / NB) * (mx - mn);
      meilleur = { n: [axe[0], axe[1], axe[2]], d: pos + acp.centre[0] * axe[0] + acp.centre[1] * axe[1] + acp.centre[2] * axe[2], score, axe: ia };
    }
  });
  return meilleur;
}

// plan = { n:[nx,ny,nz], d } : le côté n·x > d forme un pied, l'autre côté l'autre pied.
function couper(mesh, plan) {
  const nt = mesh.indices.length / 3;
  const norme = Math.hypot(...plan.n);
  if (!(norme > 0) || !Number.isFinite(plan.d)) throw new RangeError('séparation : plan de coupe invalide');
  const groupe = new Uint8Array(nt);
  for (let t = 0; t < nt; t++) { const c = centreTri(mesh, t); groupe[t] = (c[0] * plan.n[0] + c[1] * plan.n[1] + c[2] * plan.n[2]) / norme > plan.d / norme ? 1 : 0; }
  return groupe;
}

// Retour : { pieds: [mesh, mesh], methode: 'composantes'|'vallee'|'manuelle', ignores: [{triangles, aire_pct}], coupe: plan|null, avertissements }
// Erreur (RangeError, code 'COUPE_MANUELLE_REQUISE') si la séparation automatique échoue.
export function separerPieds(mesh, { plan = null } = {}) {
  if (!mesh || !mesh.positions || !mesh.indices) throw new TypeError('séparation : maillage invalide');
  const avertissements = [];
  const format = mesh.format || 'inconnu';
  if (plan) {
    const g = couper(mesh, plan);
    const pieds = [extraire(mesh, g, 0, format), extraire(mesh, g, 1, format)];
    if (pieds.some((p) => p.nbTriangles === 0)) throw Object.assign(new RangeError('séparation : un côté du plan de coupe est vide'), { code: 'COUPE_VIDE' });
    return { pieds, methode: 'manuelle', ignores: [], coupe: plan, avertissements };
  }
  const { etiquette, comps } = composantes(mesh);
  const ordre = comps.map((c, k) => k).sort((a, b) => comps[b].aire - comps[a].aire);
  const grandes = ordre.filter((k) => comps[k].aire >= SEPARATION.aire_min_rel * comps[ordre[0]].aire);
  if (grandes.length >= 2) {
    const gardes = grandes.slice(0, 2).sort((a, b) => comps[a].premier - comps[b].premier);
    if (grandes.length > 2) avertissements.push(grandes.length + ' éléments importants dans le fichier : seuls les 2 plus grands sont retenus comme pieds');
    const groupe = new Int32Array(etiquette.length).fill(-1);
    for (let t = 0; t < etiquette.length; t++) { const i = gardes.indexOf(etiquette[t]); if (i >= 0) groupe[t] = i; }
    const aireTot = comps.reduce((s, c) => s + c.aire, 0);
    const ignores = ordre.filter((k) => !gardes.includes(k)).map((k) => ({ triangles: comps[k].triangles, aire_pct: (100 * comps[k].aire) / aireTot }));
    if (ignores.length) avertissements.push(ignores.length + ' fragment(s) ignoré(s) (' + ignores.reduce((s, f) => s + f.triangles, 0) + ' triangles)');
    return { pieds: [extraire(mesh, groupe, 0, format), extraire(mesh, groupe, 1, format)], methode: 'composantes', ignores, coupe: null, avertissements };
  }
  // un seul pied significatif : vallée entre deux pieds collés
  const v = chercherVallee(mesh);
  if (!v) throw Object.assign(new RangeError('séparation automatique impossible : un seul bloc et aucune vallée nette entre deux pieds. Placez la coupe à la main.'), { code: 'COUPE_MANUELLE_REQUISE' });
  const g = couper(mesh, v);
  const pieds = [extraire(mesh, g, 0, format), extraire(mesh, g, 1, format)];
  if (pieds.some((p) => p.nbTriangles === 0)) throw Object.assign(new RangeError('séparation automatique impossible : coupe vide'), { code: 'COUPE_MANUELLE_REQUISE' });
  avertissements.push('les pieds se touchent : coupe automatique dans la vallée (qualité de la coupe à vérifier)');
  return { pieds, methode: 'vallee', ignores: [], coupe: { n: v.n, d: v.d }, score_vallee: v.score, avertissements };
}
