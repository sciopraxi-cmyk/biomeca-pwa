// Pièces de la semelle (exports multi-imprimantes) : la semelle finale est une carte de hauteur ; chaque matière y occupe, en chaque nœud, un intervalle
// [dessous, dessus] (base d'abord, puis chaque élément dans l'ordre d'empilement, le recouvrement en dernier : mêmes règles que `strates` et `decomposerEpaisseur`).
// Une PIÈCE = un volume fermé : la base (et le devant en demi-semelle, 2e matériau) ou un élément. Fonctions pures, sans dépendance.
import { maillerBase } from './maillage_base.js';
import { ordreEmpilement } from './elements.js';
import { estValide } from './grille.js';
import { verifierMaillage } from './verification.js';
import { EPSILON_HAUTEUR_MM } from '../constantes.js';

const SEUIL_MM = 2 * EPSILON_HAUTEUR_MM; // sous cette épaisseur une cellule n'appartient pas à la pièce (le maillage la refuserait)

export const ROLES = Object.freeze({ base: 'Base', devant: 'Devant (2e matériau)', element: 'Élément', recouvrement: 'Recouvrement' });

// zones : rapport.zones de la base [{ zone: 'base'|'devant', materiau }] ; infoMateriau(materiau_id) -> { shore, couleur_hex } facultatif (catalogue PODAXIA).
export function piecesDeLaSemelle(finale, { zones = [], infoMateriau = () => null } = {}) {
  const { nx, ny, haut, bas, haut_base: hb } = finale;
  const n = nx * ny, els = finale.elements || [], infos = finale.infos || [], couches = finale.couches || [];
  const pieces = [];
  const ajouter = (meta, hi, lo, garder) => {
    const h = new Float32Array(n).fill(NaN), b = new Float32Array(n);
    let nb = 0;
    for (let k = 0; k < n; k++) if (Number.isFinite(hi[k]) && hi[k] - lo[k] > SEUIL_MM) { h[k] = hi[k]; b[k] = lo[k]; nb++; }
    if (nb === 0) return;
    let mesh;
    try { mesh = maillerBase({ ...finale, haut: h, bas: b }, { garder }); } catch (e) { if (e instanceof RangeError && /aucune cellule/.test(e.message)) return; throw e; }
    const v = verifierMaillage(mesh);
    pieces.push({ ...meta, mesh, nbTriangles: mesh.nbTriangles, ferme: v.ferme, degeneres: v.degeneres, volume_mm3: v.volume, couleur_hex: (infoMateriau(meta.materiau_id) || {}).couleur_hex || null });
  };
  const matDeZone = (z) => { const r = zones.find((q) => q.zone === z); return r && r.materiau ? r.materiau : null; };

  // Base (+ devant) : de la face de dessous jusqu'au dessus de la base, borné par le dessus final (un creux d'élément coupe la base).
  const hiB = new Float32Array(n).fill(NaN), loB = new Float32Array(n);
  for (let k = 0; k < n; k++) if (estValide(haut[k])) { hiB[k] = Math.min(hb[k], haut[k]); loB[k] = bas[k]; }
  const zone = finale.zone && finale.zone.length === n ? finale.zone : null;
  const zonesPresentes = new Set(); if (zone) for (let k = 0; k < n; k++) if (estValide(haut[k]) && zone[k] > 0) zonesPresentes.add(zone[k]);
  const metaBase = (role, mat) => ({ id: role, role, libelle: ROLES[role], materiau_id: mat ? mat.id : null, materiau_libelle: mat ? mat.libelle : null, shore: mat && Number.isFinite(mat.shore) ? mat.shore : ((infoMateriau(mat && mat.id) || {}).shore ?? null) });
  if (zone && zonesPresentes.has(2)) {
    ajouter(metaBase('base', matDeZone('base')), hiB, loB, (i, j) => zone[j * nx + i] === 1);
    ajouter(metaBase('devant', matDeZone('devant')), hiB, loB, (i, j) => zone[j * nx + i] === 2);
  } else ajouter(metaBase('base', matDeZone('base')), hiB, loB, null);

  // Éléments : intervalle [cumul avant, cumul après] de chaque élément visible qui ajoute de la matière, limité à [dessous, dessus final].
  if (els.length > 0) {
    const ordre = ordreEmpilement(els);
    const LO = els.map(() => new Float32Array(n).fill(NaN)), HI = els.map(() => new Float32Array(n).fill(NaN));
    for (let k = 0; k < n; k++) {
      if (!estValide(haut[k])) continue;
      const top = haut[k], bot = bas[k];
      let c = hb[k];
      for (const idx of ordre) {
        const z = couches[idx].z[k], avant = c; c += z;
        if (!(z > 0)) continue;
        const lo = Math.min(top, Math.max(bot, avant)), hi = Math.min(top, Math.max(bot, c));
        if (hi - lo > 1e-4) { LO[idx][k] = lo; HI[idx][k] = hi; }
      }
    }
    for (const idx of ordre) {
      const info = infos[idx] || {}, rec = info.type === 'recouvrement';
      ajouter({ id: els[idx].id, role: rec ? 'recouvrement' : 'element', libelle: info.libelle || els[idx].type, materiau_id: info.materiau_id === undefined ? null : info.materiau_id, materiau_libelle: info.materiau || null, shore: Number.isFinite(info.shore_a) ? info.shore_a : ((infoMateriau(info.materiau_id) || {}).shore ?? null) }, HI[idx], LO[idx], null);
    }
  }
  return pieces;
}

// Somme des volumes des pièces, comparée au volume du maillage entier : l'écart mesure la matière perdue aux bords où une pièce s'amincit
// (une cellule n'appartient à une pièce que si ses 4 coins ont de l'épaisseur) et ce qui n'est pas décomposable (comblement d'un trou par un autre matériau).
export function couverture(pieces, volumeTotal_mm3) {
  const somme = pieces.reduce((a, p) => a + p.volume_mm3, 0);
  return { somme_mm3: somme, total_mm3: volumeTotal_mm3, ecart_pct: volumeTotal_mm3 > 0 ? (100 * (volumeTotal_mm3 - somme)) / volumeTotal_mm3 : 0 };
}

// Nom de fichier d'une pièce : « 02-element-Soutien-de-voute-libre_Silicone-Shore-30 » (sans accent, sans caractère interdit).
export const nettoyerNom = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
export function nomPiece(numero, piece) {
  const mat = piece.materiau_libelle ? nettoyerNom(piece.materiau_libelle) : 'materiau-non-choisi';
  return String(numero).padStart(2, '0') + '-' + nettoyerNom(piece.libelle || piece.role) + '_' + (mat || 'materiau-non-choisi');
}

// Contrôles du fichier RÉELLEMENT produit (relecture), pas du maillage en mémoire. Renvoient un message d'erreur, ou null si le fichier est conforme.
export function controlerSTLPiece(stl, piece, { lireSTL, indexer }) {
  let relu;
  try { relu = lireSTL(stl); } catch (e) { return 'STL illisible (' + e.message + ')'; }
  const v = verifierMaillage(indexer(relu));
  if (!v.ferme) return 'STL non fermé';
  if (v.degeneres > 0) return 'STL avec ' + v.degeneres + ' triangle(s) dégénéré(s)';
  if (!(v.volume > 0)) return 'STL sans volume';
  if (relu.nbTriangles !== piece.nbTriangles) return 'STL : ' + relu.nbTriangles + ' triangles relus sur ' + piece.nbTriangles;
  if (Math.abs(v.volume - piece.volume_mm3) > 1e-3 * piece.volume_mm3) return 'STL : volume relu ' + v.volume.toFixed(1) + ' mm3 au lieu de ' + piece.volume_mm3.toFixed(1);
  return null;
}
export async function controlerTroisMF(buffer, nbTrianglesAttendu, lire) {
  let lu;
  try { lu = await lire(buffer); } catch (e) { return '3MF illisible (' + e.message + ')'; }
  const n = lu.indices.length / 3;
  return n === nbTrianglesAttendu ? null : '3MF : ' + n + ' triangles relus sur ' + nbTrianglesAttendu;
}
