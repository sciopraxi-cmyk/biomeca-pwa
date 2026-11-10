// Mode A : import du scan du pied -> longueur saisie -> échelle -> recalage -> rasterisation (H_plantaire).
// Fonctions pures (appelées par le worker, testables sans navigateur).
import { lireMaillage } from './lecteurs.js';
import { recaler } from './recalage.js';
import { rasteriser } from './rasterisation.js';
import { signalVoute, proposerLateralite } from './lateralite.js';
import { compterValides, minMax } from './grille.js';
import { maillerCarte } from './maillage.js';
import { modelePiedRealiste } from './pied_realiste.js';
import { modelePied, scanPiedSurface, scanPiedSolide, scanDeuxPieds, transformerMaillage, rotX, rotY, rotZ, produit, deg } from './synthetique.js';
import { ecrireSTLBinaireScan, ecrireOBJ, ecrirePLY, ecrire3MF } from './ecrivains_scans.js';

const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function importerScan(buffer, nom = '') {
  const t0 = maintenant();
  const m = await lireMaillage(buffer);
  return { mesh: m, info: { nom, format: m.format, octets: buffer.byteLength, nbSommets: m.nbSommets, nbTriangles: m.nbTriangles, avertissements: m.avertissements, ms_lecture: Math.round(maintenant() - t0) } };
}

// Retour : { confirmation_requise: true, echelle } SANS rasterisation si l'écart d'échelle dépasse 15 % et n'est pas confirmé.
export function analyserScan(mesh, { longueur_mm, confirmeEcart = false, inverserY = false, inverserZ = false }) {
  const t0 = maintenant();
  const r = recaler(mesh, longueur_mm, { inverserY, inverserZ });
  if (r.echelle.confirmation_requise && !confirmeEcart) return { confirmation_requise: true, echelle: r.echelle };
  const g = rasteriser(r, {});
  const mm = minMax(g);
  if (!mm) throw new RangeError('rasterisation : aucune cellule couverte (scan vide ou hors cadre)');
  const lateralite = proposerLateralite(r.signal_contour, signalVoute(g, longueur_mm));
  const rapport = {
    acquisition: { mode: 'A_scan', longueur_pied_mm: longueur_mm, facteur_echelle: r.echelle.facteur_echelle, ecart_echelle_pct: r.echelle.ecart_echelle_pct, ecart_confirme: !!(r.echelle.confirmation_requise && confirmeEcart), unite_probable: r.echelle.unite_probable },
    boite: r.boite,
    grille: { nx: g.nx, ny: g.ny, pas_mm: g.pas, cellules_valides: compterValides(g), cellules_masquees_pente_raide: g.cellules_pente_raide, hauteur_min_mm: mm.min, hauteur_max_mm: mm.max },
    propositions: { ...r.propositions, cote: lateralite },
    confirmations_requises: ['cote', 'sens_longitudinal', 'sens_vertical'],
    diagnostics: r.diagnostics,
    avertissements: r.avertissements,
    limites: ['La longueur saisie est une référence, pas une garantie : l\'ombre du scan (orteils, bords) peut dépasser le pied réel.',
      'Le facteur est calculé sur la boîte englobante le long de l\'axe de l\'ACP (écart d\'axe possible de quelques degrés).'],
    duree_ms: Math.round(maintenant() - t0),
  };
  return { confirmation_requise: false, grille: g, rapport };
}

// Maillage d'AFFICHAGE de H_plantaire : socle de 1 mm ajouté, valeurs négatives ramenées à 0 (affichage seulement).
export function maillageAffichage(g, socle_mm = 1) {
  const c = { ...g, z: new Float32Array(g.z.length) };
  for (let k = 0; k < g.z.length; k++) c.z[k] = Number.isFinite(g.z[k]) ? Math.max(g.z[k], 0) + socle_mm : NaN;
  return maillerCarte(c);
}

// Scénarios de démonstration : scans SYNTHÉTIQUES exportés dans divers formats, repères et unités.
export const SCENARIOS_DEMO = Object.freeze({
  // Empreintes « réalistes » (fictives) : talon arrondi, voûte, têtes métatarsiennes, 5 orteils ; maillage au pas de 0,5 mm (contour sans escalier visible). Démo par défaut.
  reel_droit_stl: { libelle: 'Pied droit réaliste (fictif) — STL, mm', cote: 'D', variante: 'surface', realiste: { voute_mm: 15, longueur_mm: 265 }, pas_mm: 0.5 },
  reel_gauche_obj: { libelle: 'Pied gauche réaliste (fictif) — OBJ, mm', cote: 'G', variante: 'surface', realiste: { voute_mm: 15, longueur_mm: 258 }, pas_mm: 0.5 },
  reel_creux_stl: { libelle: 'Pied droit creux (fictif, voûte haute) — STL, mm', cote: 'D', variante: 'surface', realiste: { voute_mm: 24, longueur_mm: 272 }, pas_mm: 0.5 },
  droit_stl_mm: { libelle: 'Pied droit — STL binaire, millimètres, tourné de 30°', cote: 'D', variante: 'surface' },
  gauche_obj_mm: { libelle: 'Pied gauche — OBJ, millimètres, autre repère', cote: 'G', variante: 'solide' },
  droit_ply_m: { libelle: 'Pied droit — PLY binaire en MÈTRES (doit déclencher la confirmation)', cote: 'D', variante: 'surface' },
  gauche_3mf_pouces: { libelle: 'Pied gauche — 3MF en POUCES (doit déclencher la confirmation)', cote: 'G', variante: 'surface' },
});

// Scans de démonstration à 2 pieds (synthétiques) : pieds séparés (130 mm) ou collés (95 mm : un seul bloc), STL binaire en mm.
export const SCENARIOS_DEMO_2P = Object.freeze({
  deux_pieds_separes: { libelle: 'Les 2 pieds — séparés (D 265 mm, G 258 mm)', ecart_mm: 130 },
  deux_pieds_colles: { libelle: 'Les 2 pieds — collés, un seul bloc (D 265 mm, G 258 mm)', ecart_mm: 95 },
});
export function fabriquerDemoDeuxPieds(scenario) {
  const s = SCENARIOS_DEMO_2P[scenario];
  if (!s) throw new TypeError('scénario inconnu : ' + scenario);
  const sc = scanDeuxPieds({ variante: 'surface', ecart_mm: s.ecart_mm, longueur_D_mm: 265, longueur_G_mm: 258 });
  return { buffer: ecrireSTLBinaireScan(sc), nom: 'demo_synthetique_' + scenario + '.stl', longueurs_suggerees_mm: [265, 258], libelle: s.libelle };
}

export function fabriquerDemo(scenario) {
  const s = SCENARIOS_DEMO[scenario];
  if (!s) throw new TypeError('scénario inconnu : ' + scenario);
  const gen = s.variante === 'solide' ? scanPiedSolide : scanPiedSurface;
  const sc = s.realiste ? gen({ modele: modelePiedRealiste({ cote: s.cote, ...s.realiste }), pas_mm: s.pas_mm || 0.5 }) : gen({ cote: s.cote, pas_mm: 1 });
  let ymin = Infinity, ymax = -Infinity;
  for (let v = 1; v < sc.positions.length; v += 3) { ymin = Math.min(ymin, sc.positions[v]); ymax = Math.max(ymax, sc.positions[v]); }
  const longueur = Math.round(ymax - ymin);
  const rep = { reel_droit_stl: [30, -90, 4, 1, [120, -40, 300]], reel_gauche_obj: [-75, 0, 3, 1, [-50, 200, 10]], reel_creux_stl: [140, -90, 5, 1, [-30, 60, 200]], droit_stl_mm: [30, -90, 4, 1, [120, -40, 300]], gauche_obj_mm: [-75, 0, 3, 1, [-50, 200, 10]], droit_ply_m: [140, -90, 6, 0.001, [0.1, 0.05, -0.2]], gauche_3mf_pouces: [200, 90, 5, 1 / 25.4, [3, 8, 1]] }[scenario];
  const R = produit(rotZ(deg(rep[0])), produit(rotX(deg(rep[1])), rotY(deg(rep[2]))));
  const m = transformerMaillage(sc, { R, t: rep[4], facteur: rep[3] });
  const buffer = scenario === 'droit_stl_mm' || scenario === 'reel_droit_stl' || scenario === 'reel_creux_stl' ? ecrireSTLBinaireScan(m) : scenario === 'gauche_obj_mm' || scenario === 'reel_gauche_obj' ? ecrireOBJ(m) : scenario === 'droit_ply_m' ? ecrirePLY(m, { format: 'binary_little_endian' }) : ecrire3MF(m);
  const ext = { reel_droit_stl: 'stl', reel_gauche_obj: 'obj', reel_creux_stl: 'stl', droit_stl_mm: 'stl', gauche_obj_mm: 'obj', droit_ply_m: 'ply', gauche_3mf_pouces: '3mf' }[scenario];
  return { buffer, nom: 'demo_synthetique_' + scenario + '.' + ext, longueur_suggeree_mm: longueur, cote_reel: s.cote, libelle: s.libelle };
}
void modelePied;
