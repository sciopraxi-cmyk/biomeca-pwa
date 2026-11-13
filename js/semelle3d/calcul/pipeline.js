// Orchestration des calculs lourds (fonction pure, appelée par le worker).
import { genererDome } from './synthetique.js';
import { graver } from './gravure.js';
import { surimpressions, strates, ordreEmpilement, ligneIsthme, hauteursLigne } from './surimpression.js';
import { compterValides, minMax } from './grille.js';
import { maillerCarte } from './maillage.js';
import { verifierMaillage } from './verification.js';
import { ecrireSTLBinaire, lireSTLBinaire, indexerSommets } from './stl.js';
import { importerScan, analyserScan, maillageAffichage, fabriquerDemo, fabriquerDemoDeuxPieds, fabriquerDemoBoite, SCENARIOS_DEMO_2P, SCENARIOS_DEMO_BOITE } from './modeA.js';
import { construireBase, extraireCoupe } from './base.js';
import { maillerBase } from './maillage_base.js';
import { EPAISSEUR_BASE_MIN_MM, EPAISSEUR_TOTALE_AVERTISSEMENT_MM } from '../constantes.js';
import { chargerMateriaux } from './materiaux.js';
import { appliquerElements, mesurerCoupe } from './elements.js';
import { suggererMilieuVoute } from './bords.js';
import { separerPieds } from './separation.js';
import { proposerPaire } from './lateralite.js';
import { formeSemelle } from './forme_semelle.js';
import { appuiMannequin } from './mannequin.js';
import { creerMannequin } from './pied_sculpte.js';
import { grilleDuPiedGenerique } from './pied_generique.js';
import { paramsBasePour, elementsPour, normaliserPlan } from './plan.js';

// etat = { dernier: {mesh, rapport} | null } conservé par le worker.
export function traiterMessage(msg, etat) {
  if (!msg || typeof msg.type !== 'string') throw new TypeError('message invalide');
  if (msg.type === 'construire') {
    const g = genererDome(msg.params || {});
    const mesh = maillerCarte(g);
    const v = verifierMaillage(mesh);
    const mm = minMax(g);
    const rapport = {
      cellulesValides: compterValides(g),
      nbSommets: mesh.nbSommets,
      nbTriangles: mesh.nbTriangles,
      ferme: v.ferme,
      volume_mm3: v.volume,
      epaisseurMin_mm: mm.min,
      hauteurMax_mm: mm.max,
      bbox: v.bbox,
    };
    etat.dernier = { mesh, rapport };
    return { type: 'construit', rapport, positions: mesh.positions, indices: mesh.indices };
  }
  if (msg.type === 'exporter') {
    if (!etat.dernier) throw new Error('rien à exporter : construire d\'abord');
    if (etat.dernier.base) {
      // Base du lot 2 : latéralité confirmée obligatoire, épaisseur mini de la décision de Joël (résines 0,9 mm).
      if (msg.cote !== 'D' && msg.cote !== 'G') throw new Error('export refusé : latéralité non confirmée');
      const tb = etat.dernier.rapport.torsions_bloquees || [];
      if (tb.length > 0) throw new Error('export refusé : torsion non appliquée — ' + tb.join(' ; '));
      if (!(etat.dernier.rapport.epaisseur_min_mm >= EPAISSEUR_BASE_MIN_MM - 1e-3)) throw new Error('export refusé : épaisseur minimale ' + etat.dernier.rapport.epaisseur_min_mm.toFixed(2) + ' mm sous ' + EPAISSEUR_BASE_MIN_MM + ' mm');
    }
    const stl = ecrireSTLBinaire(etat.dernier.mesh);
    // Contrôle du fichier réellement produit (relecture), pas du maillage en mémoire.
    const relu = lireSTLBinaire(stl);
    const v = verifierMaillage(indexerSommets(relu));
    if (!v.ferme || v.degeneres > 0 || !(v.volume > 0)) throw new Error('export refusé : STL non conforme');
    return { type: 'exporte', stl, nbTriangles: relu.nbTriangles, volume_mm3: v.volume, octets: stl.byteLength, indicatif: !!etat.generique }; // pied générique (mode B) : fichier nommé « indicatif », jamais une base de production
  }
  throw new TypeError('type de message inconnu : ' + msg.type);
}

// Mode B : empreinte VIRTUELLE d'un pied générique (utilisée par « pied_generique » et « pieds_generiques »). Paramètres invalides : exception, aucun état touché.
function empreinteGenerique(msg) {
  const t0 = maintenant();
  const g = grilleDuPiedGenerique({ longueur_mm: msg.longueur_mm, cote: msg.cote, largeur_rel: msg.largeur_rel ?? 1, voute_mm: msg.voute_mm ?? 15 });
  let hmin = Infinity, hmax = -Infinity, n = 0, xa = Infinity, xb = -Infinity, yb = 0, zb = 0;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const v = g.z[j * g.nx + i]; if (!Number.isFinite(v)) continue; n++; if (v < hmin) hmin = v; if (v > hmax) hmax = v; const x = g.ox + i * g.pas, y = g.oy + j * g.pas; if (x < xa) xa = x; if (x > xb) xb = x; if (y > yb) yb = y; }
  zb = hmax;
  const rapport = {
    generique: true,
    acquisition: { mode: 'B_generique', longueur_pied_mm: msg.longueur_mm, facteur_echelle: 1, ecart_echelle_pct: 0, ecart_confirme: false, unite_probable: null, cote: msg.cote, largeur_rel: msg.largeur_rel ?? 1, voute_mm: msg.voute_mm ?? 15 },
    boite: { x_min: xa, x_max: xb, y_min: 0, y_max: yb, z_min: 0, z_max: zb },
    grille: { nx: g.nx, ny: g.ny, pas_mm: g.pas, cellules_valides: n, cellules_masquees_pente_raide: 0, hauteur_min_mm: hmin, hauteur_max_mm: hmax },
    propositions: { cote: { valeur: msg.cote, ambigu: false, concordants: true }, sens_longitudinal: { confiance: 1, ambigu: false }, sens_vertical: { confiance: 1, ambigu: false } },
    confirmations_requises: [], diagnostics: {},
    avertissements: ['Pied générique (proportions moyennes fictives) : aperçu INDICATIF, ce n\'est pas une mesure du patient'],
    limites: ['Aucun scan : la forme du pied, la voûte et les têtes métatarsiennes viennent d\'un modèle moyen. L\'export est nommé « indicatif ».'],
    duree_ms: Math.round(maintenant() - t0),
  };
  const aff = maillageAffichage(g);
  return { g, rapport, aff };
}

// Version asynchrone (3MF : décompression par l'API du navigateur) : messages du mode A, puis repli sur traiterMessage.
export async function traiterMessageA(msg, etat) {
  if (!msg || typeof msg.type !== 'string') throw new TypeError('message invalide');
  if (msg.pied !== undefined) return traiterPied(msg, etat);
  if (msg.type === 'separer') {
    if (!etat.scan || !etat.scan.mesh) throw new Error('aucun scan importé : importer d\'abord');
    const r = separerPieds(etat.scan.mesh, { plan: msg.coupe || null });
    etat.pieds_scan = r.pieds; etat.analyses = null; etat.pieds = null;
    const infos = r.pieds.map((m, k) => ({ id: 'AB'[k], nbTriangles: m.nbTriangles, boite: boiteBrute(m) }));
    const affichage = {};
    r.pieds.forEach((m, k) => { affichage['AB'[k]] = { positions: Float32Array.from(m.positions), indices: Uint32Array.from(m.indices) }; });
    return { type: 'separe', methode: r.methode, coupe: r.coupe, ignores: r.ignores, avertissements: r.avertissements, pieds: infos, affichage };
  }
  if (msg.type === 'recaler_pieds') {
    if (!etat.pieds_scan) throw new Error('empreinte non séparée : séparer les 2 pieds d\'abord');
    const analyses = {}, confirmations = {}, affichage = {};
    for (const id of ['A', 'B']) {
      const L = msg.longueurs && msg.longueurs[id];
      const r = analyserScan(etat.pieds_scan['AB'.indexOf(id)], { longueur_mm: L, confirmeEcart: !!(msg.confirmeEcart && msg.confirmeEcart[id]), inverserY: !!(msg.inverserY && msg.inverserY[id]), inverserZ: !!(msg.inverserZ && msg.inverserZ[id]) });
      if (r.confirmation_requise) confirmations[id] = r.echelle; else analyses[id] = r;
    }
    if (Object.keys(confirmations).length) return { type: 'confirmation_requise', pieds: confirmations };
    etat.analyses = analyses; etat.pieds = null;
    const rapports = {};
    for (const id of ['A', 'B']) { rapports[id] = analyses[id].rapport; const aff = maillageAffichage(analyses[id].grille); affichage[id] = { positions: aff.positions, indices: aff.indices }; }
    return { type: 'recale_pieds', rapports, paire: proposerPaire(rapports.A.propositions.cote, rapports.B.propositions.cote), affichage };
  }
  if (msg.type === 'confirmer_pieds') {
    if (!etat.analyses) throw new Error('pieds non analysés : analyser les 2 pieds d\'abord');
    const a = msg.affectation || {};
    if (!((a.A === 'D' && a.B === 'G') || (a.A === 'G' && a.B === 'D'))) throw new Error('confirmation refusée : il faut un pied droit et un pied gauche');
    const pieds = {};
    for (const id of ['A', 'B']) pieds[a[id]] = { scan: { mesh: etat.pieds_scan['AB'.indexOf(id)] }, plantaire: { grille: etat.analyses[id].grille, rapport: etat.analyses[id].rapport }, source: id };
    etat.pieds = pieds; etat.affectation = { A: a.A, B: a.B };
    return { type: 'pieds_confirmes', affectation: etat.affectation };
  }
  if (msg.type === 'plan2') {
    if (!etat.pieds) throw new Error('latéralité des 2 pieds non confirmée');
    const plan = normaliserPlan(msg.plan);
    const sortie = {};
    for (const cote of ['D', 'G']) {
      const params = { ...paramsBasePour(plan, cote), cote };
      const elements = elementsPour(plan, cote), axe = plan.axe_henke && plan.axe_henke[cote];
      const sub = etat.pieds[cote];
      const cle = JSON.stringify(params);
      const r = await traiterPied({ type: sub.base && sub.cleBase === cle ? 'elements' : 'base', params, elements, cote, pied: cote, gravure: msg.gravure, axe }, etat);
      sub.cleBase = cle;
      sortie[cote] = { rapport: r.rapport, positions: r.positions, indices: r.indices, surimpressions: r.surimpressions, strates: r.strates, isthme: r.isthme };
    }
    return { type: 'plan2', pieds: sortie };
  }
  if (msg.type === 'scan_brut') { // scan importé tel quel (avant séparation) : pour poser la coupe à la main
    if (!etat.scan || !etat.scan.mesh) throw new Error('aucun scan importé : importer d\'abord');
    const m = etat.scan.mesh;
    return { type: 'scan_brut', positions: Float32Array.from(m.positions), indices: Uint32Array.from(m.indices), boite: boiteBrute(m) };
  }
  if (msg.type === 'demo' && SCENARIOS_DEMO_2P[msg.scenario]) {
    const d = fabriquerDemoDeuxPieds(msg.scenario);
    return { type: 'demo', buffer: d.buffer, nom: d.nom, longueurs_suggerees_mm: d.longueurs_suggerees_mm, libelle: d.libelle };
  }
  if (msg.type === 'demo' && SCENARIOS_DEMO_BOITE[msg.scenario]) {
    const d = fabriquerDemoBoite(msg.scenario);
    return { type: 'demo', buffer: d.buffer, nom: d.nom, longueur_suggeree_mm: d.longueur_suggeree_mm, cote_reel: d.cote_reel, libelle: d.libelle };
  }
  if (msg.type === 'demo') {
    const d = fabriquerDemo(msg.scenario);
    return { type: 'demo', buffer: d.buffer, nom: d.nom, longueur_suggeree_mm: d.longueur_suggeree_mm, cote_reel: d.cote_reel, libelle: d.libelle };
  }
  if (msg.type === 'pied_generique') { // mode B (sans scan) : empreinte VIRTUELLE d'un pied générique (proportions moyennes fictives), même format que l'empreinte d'un scan
    const { g, rapport, aff } = empreinteGenerique(msg);
    etat.scan = null; etat.pieds_scan = null; etat.analyses = null; etat.pieds = null;
    etat.plantaire = { grille: g, rapport }; etat.finale = null; etat.base = null; etat.generique = true; // une nouvelle empreinte invalide la base et les éléments
    return { type: 'recale', rapport, positions: aff.positions, indices: aff.indices };
  }
  if (msg.type === 'pieds_generiques') { // mode B pour les 2 pieds : un pied générique D et un G (longueur, largeur, voûte propres à chaque pied), sans scan ; D et G sont imposés (aucune latéralité à deviner)
    const p = msg.pieds || {};
    const E = {};
    for (const cote of ['D', 'G']) {
      if (!p[cote]) throw new Error('2 pieds génériques : réglages du pied ' + cote + ' manquants');
      E[cote] = empreinteGenerique({ longueur_mm: p[cote].longueur_mm, cote, largeur_rel: p[cote].largeur_rel, voute_mm: p[cote].voute_mm });
    }
    etat.scan = null; etat.pieds_scan = null; etat.analyses = null; etat.plantaire = null; etat.finale = null; etat.base = null; etat.generique = true;
    etat.pieds = {}; for (const cote of ['D', 'G']) etat.pieds[cote] = { plantaire: { grille: E[cote].g, rapport: E[cote].rapport }, source: cote, generique: true };
    etat.affectation = { A: 'D', B: 'G' };
    return { type: 'pieds_generiques', rapports: { A: E.D.rapport, B: E.G.rapport }, affichage: { A: { positions: E.D.aff.positions, indices: E.D.aff.indices }, B: { positions: E.G.aff.positions, indices: E.G.aff.indices } }, affectation: etat.affectation };
  }
  if (msg.type === 'importer') {
    etat.generique = false;
    etat.scan = null; etat.plantaire = null; etat.pieds_scan = null; etat.analyses = null; etat.pieds = null;
    const { mesh, info } = await importerScan(msg.buffer, msg.nom);
    etat.scan = { mesh, info };
    return { type: 'importe', info };
  }
  if (msg.type === 'recaler') {
    if (!etat.scan) throw new Error('aucun scan importé : importer d\'abord');
    const r = analyserScan(etat.scan.mesh, msg);
    if (r.confirmation_requise) return { type: 'confirmation_requise', echelle: r.echelle };
    etat.generique = false;
    const aff = maillageAffichage(r.grille);
    etat.plantaire = { grille: r.grille, rapport: r.rapport };
    etat.base = null; etat.finale = null; // une nouvelle empreinte invalide la base et les éléments
    return { type: 'recale', rapport: r.rapport, positions: aff.positions, indices: aff.indices };
  }
  if (msg.type === 'fantome') { // lot 4d : surface du scan (pied fantôme), même repère que la semelle ; affichage seulement
    if (!etat.plantaire) throw new Error('pied fantôme : aucune empreinte analysée');
    const aff = maillageAffichage(etat.plantaire.grille, 0.05);
    return { type: 'fantome', positions: aff.positions, indices: aff.indices };
  }
  if (msg.type === 'mannequin') { // lot 4 bis, étape 5 : pied mannequin anatomique (un seul volume fermé), même repère que la semelle ; affichage seulement
    // Mode B (pied générique, sans scan) : l'empreinte est VIRTUELLE (étroite, sans orteils) ; y coller le pied le rétrécit et écrase les orteils.
    // Sans scan, le pied sculpté garde ses proportions validées, mises à l'échelle de la longueur (decision de Joël, pied sculpté).
    if (!etat.plantaire) throw new Error('mannequin : aucune empreinte analysée');
    const cote = msg.cote === 'G' ? 'G' : 'D', m = creerMannequin({ grille: etat.generique ? null : etat.plantaire.grille, contour: etat.generique ? null : msg.forme_semelle ? formeSemelle(etat.plantaire.grille).grille : null, longueur_mm: msg.longueur_mm, cote }).pied;
    if (m.ongles && m.ongles.positions && !m.ongles.decal) m.ongles.decal = new Float32Array(m.ongles.positions.length / 3); // pied sculpté pur : pas de relevé sous les ongles (l'affichage lit toujours ongles.decal)
    return { type: 'mannequin', positions: m.positions, indices: m.indices, normales: m.normales, couleurs: m.couleurs, decal: m.decal, ongles: m.ongles, centre: m.centre, z_cheville_mm: m.z_cheville_mm, longueur_mm: m.longueur_mm };
  }
  if (msg.type === 'appui_mannequin') { // lot 4 bis, étape 5 : le pied suit la correction de la semelle (inclinaison + relèvement) et ne la traverse jamais ; affichage seulement
    if (!etat.finale || !etat.plantaire) throw new Error('appui : construire la base d\'abord');
    const f = etat.finale, g = etat.plantaire.grille;
    return { type: 'appui_mannequin', ...appuiMannequin({ nx: f.nx, ny: f.ny, pas: f.pas, ox: f.ox, oy: f.oy, haut: f.haut, hautBase: f.haut_base, z: g.z, socle: Number.isFinite(msg.socle_mm) ? msg.socle_mm : undefined }) };
  }
  if (msg.type === 'materiaux') {
    etat.materiaux = chargerMateriaux(msg.json);
    return { type: 'materiaux', nb: etat.materiaux.liste.length, shores: etat.materiaux.shores };
  }
  if (msg.type === 'base') {
    if (!etat.plantaire) throw new Error('aucune empreinte analysée : analyser le scan d\'abord');
    const t0 = maintenant();
    const base = construireBase(etat.plantaire.grille, msg.params || {}, etat.materiaux);
    etat.base = base; etat.dureeBase = maintenant() - t0;
    return assembler(etat, msg.elements, msg.cote || (msg.params && msg.params.cote), t0, msg.gravure, msg.axe);
  }
  if (msg.type === 'elements') {
    if (!etat.base) throw new Error('aucune base construite : construire la base d\'abord');
    return assembler(etat, msg.elements, msg.cote, maintenant(), msg.gravure, msg.axe);
  }
  if (msg.type === 'coupe') {
    if (!etat.finale || !etat.plantaire) throw new Error('aucune base construite : construire la base d\'abord');
    const c = extraireCoupe(etat.finale, etat.plantaire.grille, msg.mode, msg.position_mm);
    const nx = etat.finale.nx;
    const k0 = (a) => (msg.mode === 'T' ? Math.min(etat.finale.ny - 1, Math.max(0, Math.round((msg.position_mm - etat.finale.oy) / etat.finale.pas))) * nx + a : a * nx + Math.min(nx - 1, Math.max(0, Math.round((msg.position_mm - etat.finale.ox) / etat.finale.pas))));
    const m = c.coord.length;
    c.haut_base = new Float32Array(m);
    for (let a = 0; a < m; a++) c.haut_base[a] = etat.finale.haut_base[k0(a)];
    c.ordre = ordreEmpilement(etat.finale.elements); // ordre d'empilement réel (le recouvrement en dernier) : la coupe dessine chaque matériau dans SON intervalle
    c.couches = etat.finale.couches.map((q, n) => { const z = new Float32Array(m); for (let a = 0; a < m; a++) z[a] = q.z[k0(a)]; return { id: q.id, z, shore_a: etat.finale.infos[n].shore_a, materiau_id: etat.finale.infos[n].materiau_id, visible: etat.finale.infos[n].visible }; });
    c.mesures = mesurerCoupe(etat.finale, msg.mode, msg.position_mm, etat.coteElements); // toujours : épaisseurs réelles min / max de la coupe, avec ou sans élément
    return { type: 'coupe', ...c };
  }
  return traiterMessage(msg, etat);
}

// Messages d'un seul pied (`pied` = 'D' | 'G') : même traitement que pour un pied seul, sur l'état propre à ce pied.
async function traiterPied(msg, etat) {
  if (msg.pied !== 'D' && msg.pied !== 'G') throw new TypeError('pied : D ou G attendu');
  if (!etat.pieds || !etat.pieds[msg.pied]) throw new Error('latéralité des 2 pieds non confirmée');
  const sub = etat.pieds[msg.pied];
  sub.materiaux = etat.materiaux;
  const { pied, ...reste } = msg;
  void pied;
  if (reste.type === 'exporter' && !reste.cote) reste.cote = msg.pied;
  if (reste.cote && reste.cote !== msg.pied) throw new Error('le côté demandé ne correspond pas au pied « ' + msg.pied + ' »');
  return traiterMessageA(reste, sub);
}

function boiteBrute(m) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < m.positions.length; v += 3) for (let k = 0; k < 3; k++) { const x = m.positions[v + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
  return { min: mn, max: mx };
}

const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// Base + éléments -> maillage fermé. La base seule (etat.base) est conservée : modifier un élément ne la recalcule pas.
function assembler(etat, elements, cote, t0, gravure, axe) {
  const liste = elements || [];
  if (liste.length > 0 && cote !== 'D' && cote !== 'G') throw new Error('éléments : la latéralité (D/G) doit être confirmée pour placer un élément (elle décide du côté médial)');
  const finale = appliquerElements(etat.base, liste, { cote, cat: etat.materiaux, axe });
  const grav = cote === 'D' || cote === 'G' ? graver(finale, gravure, cote) : graver(finale, null, cote); // lot 4c : nom, pied et date gravés en creux sous la semelle (avant le maillage)
  const mesh = maillerBase(finale);
  const v = verifierMaillage(mesh);
  const re = finale.rapport_elements;
  const rapport = { ...etat.base.rapport, nbTriangles: mesh.nbTriangles, ferme: v.ferme, degeneres: v.degeneres, volume_mm3: v.volume, bbox: v.bbox,
    elements: re.elements, nb_elements: re.nb, repere_talon: re.repere_talon, torsions_bloquees: re.torsions_bloquees || [], cumul_elements_max_mm: re.cumul_max_mm,
    gravure: grav, avertissements: [...etat.base.rapport.avertissements, ...re.avertissements, ...grav.avertissements] };
  // Suggestion BLEUE du milieu de la voûte (jamais appliquée seule) : calculée sur l'empreinte complète.
  if (cote === 'D' || cote === 'G') { const b = etat.base; rapport.suggestion_voute = suggererMilieuVoute({ nx: b.nx, ny: b.ny, pas: b.pas, ox: b.ox, valide: b.masqueComplet }, cote); }
  if (re.nb > 0) {
    rapport.epaisseur_min_mm = re.epaisseur_min_mm; rapport.hauteur_max_mm = re.hauteur_max_mm;
    if (re.hauteur_max_mm > EPAISSEUR_TOTALE_AVERTISSEMENT_MM && !rapport.avertissements.some((a) => a.startsWith('Épaisseur totale'))) rapport.avertissements.push('Épaisseur totale de ' + re.hauteur_max_mm.toFixed(1) + ' mm (> ' + EPAISSEUR_TOTALE_AVERTISSEMENT_MM + ' mm) : risque de ne pas tenir dans la chaussure.');
  }
  rapport.duree_ms = Math.round(maintenant() - t0);
  etat.finale = finale; etat.coteElements = cote;
  etat.dernier = { mesh, rapport, base: true };
  const sortie = { type: 'base', rapport, positions: mesh.positions, indices: mesh.indices, surimpressions: surimpressions(finale, cote), strates: strates(finale) };
  if (cote === 'D' || cote === 'G') { const b = etat.base; try { sortie.isthme = ligneIsthme({ nx: b.nx, ny: b.ny, pas: b.pas, ox: b.ox, oy: b.oy, valide: b.masqueComplet, z: etat.plantaire && etat.plantaire.grille.z.length === b.nx * b.ny ? etat.plantaire.grille.z : null }, cote); sortie.isthme.bande = hauteursLigne(finale, sortie.isthme); } catch (err) { void err; sortie.isthme = null; } } // lot 4c : ligne fictive de l'isthme
  return sortie;
}
