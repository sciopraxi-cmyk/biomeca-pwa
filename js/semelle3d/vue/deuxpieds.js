// Interface « 2 pieds » (lot 4) : séparation des 2 pieds d'un même scan, longueur et latéralité de CHAQUE pied,
// plan hybride (éléments communs / D / G, « Détacher », dérogation de base par pied), onglets D / G / les 2, export des 2 STL (un seul .zip).
// Tout le calcul reste dans le worker (messages separer, scan_brut, recaler_pieds, confirmer_pieds, plan2, coupe, exporter + pied).
// Ce module ne touche que l'affichage : il est branché sur viewer.js par un « pont » (voir la fin de viewer.js).
import { detacher as detacherPlan } from '../calcul/plan.js';
import { miroirElements, apercuMiroir } from '../calcul/miroir.js';

const COUL = { A: [0.247, 0.498, 0.816], B: [0.96, 0.62, 0.12], D: [0.247, 0.498, 0.816], G: [0.08, 0.7, 0.62] };
const LIB_PORTEE = { commun: 'Commun aux 2 pieds', D: 'Pied D seulement', G: 'Pied G seulement' };
const autreCote = (c) => (c === 'D' ? 'G' : 'D');

export function initDeuxPieds(P) {
  const { $, THREE, scene, demander, noter, fr, echapper } = P;
  const S = {
    mode2: false, sugg: null, optsMono: null,
    sep: null, brut: null, plan3d: null,
    inv: { A: { y: false, z: false }, B: { y: false, z: false } }, confirmeEcart: { A: false, B: false },
    analyse: null, affectation: null, propose: null, confirme: false, generique: false,
    onglet: 'D', commun: null, derog: { D: {}, G: {} }, deroge: { D: false, G: false },
    resultats: null, plan: null, seq: 0, dernierOnglet: null, dx3d: { D: 0, G: 0 },
  };
  const actif = () => S.mode2 && S.confirme;
  const source = (cote) => (S.affectation.A === cote ? 'A' : 'B'); // quel pied du scan (A ou B) est le D (ou le G)
  const erreur = (m) => { $('sep-info').innerHTML = '<span class="err">' + echapper(m) + '</span>'; $('etat').textContent = 'erreur : ' + m; };

  // ---------- maillages fusionnés pour l'affichage ----------
  function fusionner(parts) {
    let nv = 0, ni = 0;
    for (const p of parts) { nv += p.positions.length / 3; ni += p.indices.length; }
    const pos = new Float32Array(nv * 3), idx = new Uint32Array(ni), col = new Float32Array(nv * 3);
    let vo = 0, io = 0;
    for (const p of parts) {
      const n = p.positions.length / 3;
      let zmax = 1e-9;
      if (p.hauteur) for (let v = 0; v < n; v++) if (p.positions[3 * v + 2] > zmax) zmax = p.positions[3 * v + 2];
      for (let v = 0; v < n; v++) {
        pos[3 * (vo + v)] = p.positions[3 * v] + (p.dx || 0); pos[3 * (vo + v) + 1] = p.positions[3 * v + 1]; pos[3 * (vo + v) + 2] = p.positions[3 * v + 2];
        let c = p.couleur;
        if (p.hauteur) { const t = Math.min(1, Math.max(0, (p.positions[3 * v + 2] - 1) / Math.max(zmax - 1, 1e-9))); c = [0.15 + 0.8 * t, 0.45 + 0.2 * (1 - Math.abs(2 * t - 1)), 0.85 - 0.75 * t]; }
        col[3 * (vo + v)] = c[0]; col[3 * (vo + v) + 1] = c[1]; col[3 * (vo + v) + 2] = c[2];
      }
      for (let k = 0; k < p.indices.length; k++) idx[io + k] = p.indices[k] + vo;
      vo += n; io += p.indices.length;
    }
    return { pos, idx, col };
  }
  function boite(positions) {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < positions.length; v += 3) for (let k = 0; k < 3; k++) { const x = positions[v + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x; }
    return { mn, mx };
  }

  // ---------- plan de coupe manuel (affichage) ----------
  let planCoupe = null;
  function retirerPlanCoupe() { if (planCoupe) { scene.remove(planCoupe); planCoupe.geometry.dispose(); planCoupe.material.dispose(); planCoupe = null; P.demanderRendu(); } }
  function poserPlanCoupe(axe, valeur) {
    retirerPlanCoupe();
    const b = S.brut.boite, ext = [0, 1, 2].map((k) => b.max[k] - b.min[k]), ctr = [0, 1, 2].map((k) => (b.max[k] + b.min[k]) / 2);
    const autres = [0, 1, 2].filter((k) => k !== axe);
    const g = new THREE.PlaneGeometry(1, 1);
    planCoupe = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd02020, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
    // PlaneGeometry : plan XY, normale Z. Axe X : tourné autour de Y ; axe Y : autour de X ; axe Z : tel quel.
    if (axe === 0) { planCoupe.rotation.y = Math.PI / 2; planCoupe.scale.set(ext[2] * 1.15, ext[1] * 1.15, 1); }
    else if (axe === 1) { planCoupe.rotation.x = Math.PI / 2; planCoupe.scale.set(ext[0] * 1.15, ext[2] * 1.15, 1); }
    else planCoupe.scale.set(ext[0] * 1.15, ext[1] * 1.15, 1);
    void autres;
    planCoupe.position.set(axe === 0 ? valeur : ctr[0], axe === 1 ? valeur : ctr[1], axe === 2 ? valeur : ctr[2]);
    scene.add(planCoupe); P.demanderRendu();
  }

  // ---------- état : remise à zéro ----------
  function resetEtat() {
    S.sep = null; S.brut = null; S.analyse = null; S.affectation = null; S.propose = null; S.confirme = false; S.generique = false;
    S.inv = { A: { y: false, z: false }, B: { y: false, z: false } }; S.confirmeEcart = { A: false, B: false };
    S.commun = null; S.derog = { D: {}, G: {} }; S.deroge = { D: false, G: false }; S.resultats = null; S.plan = null; S.onglet = 'D'; S.dernierOnglet = null; S.seq++;
    retirerPlanCoupe();
    $('onglets-pieds').hidden = true; $('bloc-deroge').hidden = true; $('ligne-portee').hidden = true;
    $('sep-info').innerHTML = ''; $('coupe-manuelle').hidden = true; $('btn-coupe-main').hidden = true; $('confirm-ecart-2p').hidden = true;
    $('prop-paire').textContent = 'Latéralité proposée : —'; $('conf-paire').checked = false; $('conf-paire').disabled = true; $('txt-paire').textContent = '…';
    for (const id of ['btn-analyser-2p', 'btn-inverser-paire', 'btn-valider-paire']) $(id).disabled = true;
    $('btn-analyser-2p').disabled = true;
    for (const id of ['inv-A-y', 'inv-A-z', 'inv-B-y', 'inv-B-z']) $(id).disabled = true;
    if (S.mode2) majTexteExport();
  }
  function majTexteExport() { $('btn-export-base').textContent = S.mode2 ? 'Exporter les 2 STL →' : 'Exporter le STL →'; }

  // ---------- étape 1 : séparation ----------
  async function separer(coupe = null) {
    $('etat').textContent = 'séparation des 2 pieds (worker)…'; $('sep-info').innerHTML = ''; $('confirm-ecart-2p').hidden = true;
    try {
      const r = await demander({ type: 'separer', coupe });
      S.sep = r; S.analyse = null; S.confirme = false; S.affectation = null; S.generique = false;
      $('coupe-manuelle').hidden = true; retirerPlanCoupe(); $('btn-coupe-main').hidden = false;
      const A = r.affichage.A, B = r.affichage.B;
      const f = fusionner([{ positions: A.positions, indices: A.indices, couleur: COUL.A }, { positions: B.positions, indices: B.indices, couleur: COUL.B }]);
      P.mettre({ positionsAff: f.pos, indicesAff: f.idx, couleursAff: f.col, baseAffichee: false });
      P.afficher(f.pos, f.idx, { vue: 'trois-quarts', couleurs: f.col });
      const bA = boite(A.positions), bB = boite(B.positions);
      P.poserEtiquettes([['PIED A', (bA.mn[0] + bA.mx[0]) / 2, (bA.mn[1] + bA.mx[1]) / 2, bA.mx[2] + 12], ['PIED B', (bB.mn[0] + bB.mx[0]) / 2, (bB.mn[1] + bB.mx[1]) / 2, bB.mx[2] + 12]]);
      const lib = { composantes: 'deux blocs séparés dans le fichier', vallee: 'pieds collés : coupe automatique dans la vallée entre les deux', manuelle: 'coupe placée à la main' }[r.methode];
      $('sep-info').innerHTML = '<div><b>2 pieds trouvés</b> — ' + lib + '.</div><div><span class="pastille" style="background:#3f7fd0"></span> pied A · <span class="pastille" style="background:#f5a01f"></span> pied B (étiquettes dans la vue ; D ou G se décide plus bas)</div>'
        + r.pieds.map((p) => '<small>Pied ' + p.id + ' : ' + p.nbTriangles.toLocaleString('fr-FR') + ' triangles</small>').join('<br>')
        + r.avertissements.map((t) => '<div class="el-avert">⚠ ' + echapper(t) + '</div>').join('');
      // longueurs suggérées (démonstration seulement) : on attribue chaque suggestion au pied dont la plus grande dimension est la plus proche
      if (S.sugg && !$('long-A').value && !$('long-B').value) {
        const ext = (b) => Math.max(b.mx[0] - b.mn[0], b.mx[1] - b.mn[1]);
        const [s1, s2] = S.sugg, dA = ext(bA), dB = ext(bB);
        const directe = Math.abs(dA - s1) + Math.abs(dB - s2) <= Math.abs(dA - s2) + Math.abs(dB - s1);
        $('long-A').value = String(directe ? s1 : s2); $('long-B').value = String(directe ? s2 : s1);
      }
      $('btn-analyser-2p').disabled = false;
      noter('import', 'séparation des 2 pieds (' + r.methode + ')' + (r.coupe ? ' · plan de coupe n=(' + r.coupe.n.map((v) => fr(v, 2)).join('; ') + ')' : ''));
      $('etat').textContent = 'pieds séparés : saisissez la longueur de chaque pied';
      P.majParcours(); majPastilles();
    } catch (err) {
      if (err.code === 'COUPE_MANUELLE_REQUISE' || err.code === 'COUPE_VIDE') { await ouvrirCoupeManuelle(err.message); return; }
      erreur(err.message);
    }
  }

  async function ouvrirCoupeManuelle(message) {
    try {
      if (!S.brut) S.brut = await demander({ type: 'scan_brut' });
      const b = S.brut.boite;
      P.mettre({ positionsAff: S.brut.positions, indicesAff: S.brut.indices, couleursAff: null });
      P.afficher(S.brut.positions, S.brut.indices, { couleurHauteur: true, vue: 'trois-quarts' });
      $('coupe-manuelle').hidden = false; $('btn-coupe-main').hidden = true;
      $('coupe-msg').textContent = message || 'Placez la coupe entre les deux pieds.';
      // axe par défaut : celui des 3 dont l'étendue est la plus grande après la longueur d'un pied → on propose X, modifiable
      const axe = Number(document.querySelector('input[name=axe-coupe]:checked').value);
      majCurseurCoupe(axe, true);
      $('etat').textContent = 'coupe à placer à la main entre les deux pieds';
    } catch (err) { erreur(err.message); }
  }
  function majCurseurCoupe(axe, recentrer) {
    const b = S.brut.boite, lo = b.min[axe], hi = b.max[axe], sl = $('coupe-curseur');
    sl.min = String(lo); sl.max = String(hi); sl.step = String((hi - lo) / 400);
    if (recentrer || Number(sl.value) < lo || Number(sl.value) > hi) sl.value = String((lo + hi) / 2);
    $('coupe-valeur').textContent = fr(Number(sl.value), 1) + ' (sur ' + fr(hi - lo, 0) + ')';
    poserPlanCoupe(axe, Number(sl.value));
  }

  // ---------- étape 2 : longueur de chaque pied -> recalage ----------
  const lire = (id) => { const t = $(id).value.trim().replace(',', '.'); return t === '' ? NaN : Number(t); };
  async function analyser() {
    const L = { A: lire('long-A'), B: lire('long-B') };
    $('confirm-ecart-2p').hidden = true;
    if (![L.A, L.B].every((v) => Number.isFinite(v) && v > 0)) { $('etat').textContent = 'saisissez la longueur des 2 pieds (en mm)'; $('sep-info').insertAdjacentHTML('beforeend', '<div class="err">Saisissez la longueur de chaque pied (en mm).</div>'); return; }
    $('etat').textContent = 'analyse des 2 pieds en cours (worker)…';
    try {
      const r = await demander({ type: 'recaler_pieds', longueurs: L, confirmeEcart: S.confirmeEcart, inverserY: { A: S.inv.A.y, B: S.inv.B.y }, inverserZ: { A: S.inv.A.z, B: S.inv.B.z } });
      if (r.type === 'confirmation_requise') {
        const ids = Object.keys(r.pieds);
        $('confirm-ecart-2p').hidden = false;
        $('confirm-ecart-2p').innerHTML = ids.map((id) => { const e = r.pieds[id]; return '<div><b>Pied ' + id + ' : le scan doit être multiplié par ' + fr(e.facteur_echelle, 3) + '</b> pour mesurer ' + fr(L[id]) + ' mm (écart de ' + fr(e.ecart_echelle_pct, 0) + ' %' + (e.unite_probable ? ' ; le fichier semble être en <b>' + e.unite_probable + '</b>' : '') + '). Confirmez-vous que ' + fr(L[id]) + ' mm est bien la longueur du pied ' + id + ' ?</div>'; }).join('') + '<button id="btn-conf-ecart-2p">Oui, je confirme</button>';
        $('btn-conf-ecart-2p').onclick = () => { for (const id of ids) { S.confirmeEcart[id] = true; noter('confirmation', 'écart d\'échelle du pied ' + id + ' confirmé (facteur ' + fr(r.pieds[id].facteur_echelle, 3) + ')'); } analyser(); };
        $('etat').textContent = 'confirmation de l\'échelle requise';
        return;
      }
      const etaitConfirme = S.confirme;
      S.analyse = r; S.confirme = false; S.propose = { ...r.paire.affectation }; S.affectation = { ...r.paire.affectation };
      P.apresAnalyse(); $('btn-base').disabled = true; // la base attend la confirmation des 2 côtés
      P.mettre({ rapport: r.rapports.A, coteConfirme: null, baseAffichee: false });
      $('onglets-pieds').hidden = true; $('bloc-deroge').hidden = true; $('ligne-portee').hidden = true;
      afficherAnalyse();
      noter('creation', 'H_plantaire des 2 pieds · longueurs A ' + fr(L.A) + ' mm, B ' + fr(L.B) + ' mm' + (etaitConfirme ? ' (latéralité à reconfirmer)' : ''));
      $('etat').textContent = 'affiché : confirmez D / G';
    } catch (err) { erreur(err.message); }
  }

  function afficherAnalyse() {
    const r = S.analyse, A = r.affichage.A, B = r.affichage.B, bA = boite(A.positions), bB = boite(B.positions);
    const gen = !!S.generique; // 2 pieds génériques : A = D, B = G, placés comme dans la vue des 2 semelles (D à droite de l'écran)
    const dxA = gen ? 10 - bA.mn[0] : -10 - bA.mx[0], dxB = gen ? -10 - bB.mx[0] : 10 - bB.mn[0]; // scan : A à gauche, B à droite (l'affectation D/G n'est pas encore décidée)
    const f = fusionner([{ positions: A.positions, indices: A.indices, dx: dxA, hauteur: true }, { positions: B.positions, indices: B.indices, dx: dxB, hauteur: true }]);
    P.mettre({ positionsAff: f.pos, indicesAff: f.idx, couleursAff: f.col });
    P.afficher(f.pos, f.idx, { vue: P.$('vue-preset').value, couleurs: f.col });
    P.poserEtiquettes([[gen ? 'PIED D' : 'PIED A', dxA + (bA.mn[0] + bA.mx[0]) / 2, bA.mx[1] + 14, 2], [gen ? 'PIED G' : 'PIED B', dxB + (bB.mn[0] + bB.mx[0]) / 2, bB.mx[1] + 14, 2]]);
    $('bandeau-generique').hidden = !gen;
    $('stats').innerHTML = ['A', 'B'].map((id) => { const R = r.rapports[id], a = R.acquisition, g = R.grille;
      if (gen) return '<div><b>Pied ' + (id === 'A' ? 'D' : 'G') + ' GÉNÉRIQUE</b> (mode B, sans scan) : longueur ' + fr(a.longueur_pied_mm) + ' mm · largeur ×' + fr(a.largeur_rel, 2) + ' · voûte ' + fr(a.voute_mm, 0) + ' mm · hauteur de ' + fr(g.hauteur_min_mm, 2) + ' à ' + fr(g.hauteur_max_mm, 2) + ' mm</div>' + R.avertissements.map((t) => '<div>⚠ ' + echapper(t) + '</div>').join('');
      return '<div><b>Pied ' + id + '</b> : longueur ' + fr(a.longueur_pied_mm) + ' mm · échelle ×' + fr(a.facteur_echelle, 4) + ' (écart ' + fr(a.ecart_echelle_pct, 2) + ' %) · grille ' + g.nx + ' × ' + g.ny + ' à ' + fr(g.pas_mm) + ' mm · hauteur de ' + fr(g.hauteur_min_mm, 2) + ' à ' + fr(g.hauteur_max_mm, 2) + ' mm</div>' + R.avertissements.map((t) => '<div>⚠ ' + echapper(t) + '</div>').join(''); }).join('');
    for (const id of ['btn-inverser-paire', 'inv-A-y', 'inv-A-z', 'inv-B-y', 'inv-B-z']) $(id).disabled = gen; // 2 pieds génériques : D et G sont choisis dans la fiche, rien à inverser
    $('conf-paire').disabled = gen; $('conf-paire').checked = gen; $('btn-valider-paire').disabled = !gen;
    majTextesPaire(); P.majParcours(); majPastilles();
  }

  // ---------- étape 3 : latéralité de la paire ----------
  function majTextesPaire() {
    const r = S.analyse; if (!r) return;
    const p = r.paire, a = S.affectation, nom = { D: 'DROIT', G: 'GAUCHE' };
    const prop = p.affectation;
    if (S.generique) { // pas de latéralité à deviner : le praticien a saisi le pied D et le pied G
      $('prop-paire').innerHTML = 'Latéralité : <b>pied D</b> et <b>pied G</b> (choisis dans la fiche « 2 pieds génériques »).';
      $('txt-paire').textContent = 'le pied D mesure ' + Math.round(r.rapports.A.acquisition.longueur_pied_mm) + ' mm et le pied G ' + Math.round(r.rapports.B.acquisition.longueur_pied_mm) + ' mm';
      $('btn-valider-paire').disabled = true; $('btn-valider-paire').textContent = S.confirme ? 'Pieds D et G prêts ✓' : 'Valider les 2 pieds';
      return;
    }
    $('prop-paire').innerHTML = 'Latéralité proposée : <b>A = ' + prop.A + '</b>, <b>B = ' + prop.B + '</b>' + (p.ambigu ? ' — <b>peu fiable</b> (' + (p.concordants === false ? 'signaux contradictoires' : 'signaux faibles') + ')' : '') + ' — à confirmer. <small>Un pied droit et un pied gauche : jamais deux du même côté.</small>';
    $('txt-paire').textContent = 'A est le pied ' + nom[a.A] + ' et B est le pied ' + nom[a.B];
    $('btn-valider-paire').disabled = !$('conf-paire').checked;
    $('btn-valider-paire').textContent = S.confirme ? 'Latéralité confirmée ✓' : 'Valider les 2 pieds';
  }
  async function confirmer() {
    try {
      if (!S.generique) await demander({ type: 'confirmer_pieds', affectation: S.affectation }); // 2 pieds génériques : D / G déjà posés par le worker
      S.confirme = true; S.onglet = S.onglet === 'G' ? 'G' : 'D';
      const sD = source('D'), sG = source('G');
      noter('confirmation', S.generique ? '2 pieds génériques : pied D et pied G choisis par le praticien' : 'latéralité confirmée par le praticien : pied ' + sD + ' = D, pied ' + sG + ' = G (proposée : A=' + S.propose.A + ', B=' + S.propose.B + ')');
      P.mettre({ rapport: S.analyse.rapports[source(S.onglet)], coteConfirme: S.onglet });
      P.majCote(); majPastilles();
      $('onglets-pieds').hidden = false; majOnglets();
      $('btn-base').disabled = false; $('base-msg').textContent = 'Choisissez le type de base, puis « Construire la base » : elle s\'applique aux 2 pieds (réglage commun).';
      $('ligne-portee').hidden = false; majBlocDeroge(); majTexteExport();
      $('etat').textContent = 'latéralité des 2 pieds confirmée';
      majTextesPaire();
      return true;
    } catch (err) { erreur(err.message); return false; }
  }

  // ---------- mode B pour les 2 pieds : pieds génériques D et G, sans scan ----------
  async function creerGeneriques() {
    const L = { D: lire('g2-long-D'), G: lire('g2-long-G') };
    if (![L.D, L.G].every((v) => Number.isFinite(v) && v > 0)) { $('etat').textContent = 'saisissez la longueur du pied D et du pied G (en mm)'; erreur('Saisissez la longueur de chaque pied (en mm).'); return; }
    const pieds = {};
    for (const c of ['D', 'G']) pieds[c] = { longueur_mm: L[c], largeur_rel: Number($('g2-larg-' + c).value), voute_mm: Number($('g2-voute-' + c).value) };
    P.viderVue(); $('sep-info').innerHTML = ''; // repart d'une vue vide (le scan éventuel est abandonné)
    $('etat').textContent = 'création des 2 pieds génériques (worker)…';
    try {
      const r = await demander({ type: 'pieds_generiques', pieds });
      S.generique = true; S.analyse = { rapports: r.rapports, affichage: r.affichage, paire: { affectation: { ...r.affectation }, ambigu: false, concordants: true } };
      S.propose = { ...r.affectation }; S.affectation = { ...r.affectation }; S.confirme = false;
      P.apresAnalyse(); $('btn-base').disabled = true;
      P.mettre({ rapport: r.rapports.A, coteConfirme: null, baseAffichee: false });
      afficherAnalyse();
      noter('creation', 'H_plantaire GÉNÉRIQUES (mode B, sans scan) · D ' + fr(L.D) + ' mm (largeur ×' + fr(pieds.D.largeur_rel, 2) + ', voûte ' + fr(pieds.D.voute_mm, 0) + ' mm) · G ' + fr(L.G) + ' mm (largeur ×' + fr(pieds.G.largeur_rel, 2) + ', voûte ' + fr(pieds.G.voute_mm, 0) + ' mm)');
      await confirmer();
      $('etat').textContent = '2 pieds génériques créés : choisissez le type de base';
    } catch (err) { S.generique = false; erreur(err.message); }
  }

  // ---------- plan hybride ----------
  const proxUid = () => { let m = 0; for (const e of P.get().elements) { const k = /^e(\d+)/.exec(e.uid || ''); if (k) m = Math.max(m, Number(k[1])); } return 'e' + (m + 1); };
  function assainer() { // tout élément a une portée et un identifiant unique (ceux posés par la suggestion de voûte n'en ont pas)
    const els = P.get().elements; if (els.every((e) => e.uid && e.portee)) return els;
    const util = new Set(els.map((e) => e.uid).filter(Boolean)); let n = 0;
    const neuf = els.map((e) => { if (e.uid && e.portee) return e; let u = e.uid; if (!u) { do { n++; u = 'e' + n; } while (util.has(u)); util.add(u); } return { ...e, uid: u, portee: e.portee || 'commun' }; });
    P.mettre({ elements: neuf }); return neuf;
  }
  function diff(p, base) { const d = {}; for (const k of Object.keys(p)) if (JSON.stringify(p[k]) !== JSON.stringify(base[k])) d[k] = p[k]; return d; }
  function construirePlan() {
    const p = P.baseParams(); delete p.cote; // le côté vient du plan (par pied)
    const c = S.onglet;
    if (S.commun === null) S.commun = p;
    else if (c !== '3D' && S.deroge[c]) S.derog[c] = diff(p, S.commun);
    else S.commun = p;
    const plan = { base: { commun: S.commun, derogations: { D: S.derog.D, G: S.derog.G } }, elements: assainer() };
    const axe = P.axeHenke && P.axeHenke(); if (axe) plan.axe_henke = axe; // lot 4 bis : axe de Henke par pied (propositions, validées ou non)
    return plan;
  }
  const refOnglet = () => (S.onglet === '3D' ? 'D' : S.onglet);

  async function calculer() {
    if (!actif()) return;
    const mon = ++S.seq;
    const plan = construirePlan();
    $('etat').textContent = 'calcul des 2 semelles (worker)…'; $('btn-export-base').disabled = true;
    try {
      const r = await demander({ type: 'plan2', plan, gravure: window.gravureCourante ? window.gravureCourante() : { actif: false } });
      if (mon !== S.seq) return;
      S.resultats = r.pieds; S.plan = plan; if (window.majInfoGravure) window.majInfoGravure(r.pieds.D.rapport.gravure);
      $('el-msg').textContent = ''; $('base-msg').textContent = 'Bases construites. Les réglages se recalculent seuls.';
      await montrer();
      noter('creation', 'semelles D et G calculées · ' + plan.elements.length + ' élément(s) · base ' + (S.deroge.D || S.deroge.G ? 'avec dérogation(s)' : 'commune'));
    } catch (err) {
      if (mon !== S.seq) return;
      $('base-msg').innerHTML = '<span style="color:#b03030">' + echapper(err.message) + '</span>'; $('el-msg').textContent = err.message; $('etat').textContent = 'erreur : ' + err.message;
    }
  }

  async function montrer() {
    const R = S.resultats, on = S.onglet, ref = refOnglet();
    const garder = S.dernierOnglet === on; S.dernierOnglet = on;
    S.dx3d = { D: 0, G: 0 };
    let pos, idx, couleurs = null, limiteY = null;
    if (on === '3D') {
      const bD = boite(R.D.positions), bG = boite(R.G.positions), dxD = 10 - bD.mn[0], dxG = -10 - bG.mx[0];
      const f = fusionner([{ positions: R.D.positions, indices: R.D.indices, dx: dxD, couleur: COUL.D }, { positions: R.G.positions, indices: R.G.indices, dx: dxG, couleur: COUL.G }]);
      pos = f.pos; idx = f.idx; couleurs = f.col; S.dx3d = { D: dxD, G: dxG };
      P.poserEtiquettes([['PIED D', dxD + (bD.mn[0] + bD.mx[0]) / 2, bD.mx[1] + 14, 2], ['PIED G', dxG + (bG.mn[0] + bG.mx[0]) / 2, bG.mx[1] + 14, 2]]);
    } else {
      pos = R[on].positions; idx = R[on].indices; limiteY = P.limiteDevant(R[on].rapport);
      const bb = S.analyse.rapports[source(on)].boite;
      P.poserEtiquettes([['TALON', (bb.x_min + bb.x_max) / 2, -14, 2], ['AVANT-PIED', (bb.x_min + bb.x_max) / 2, bb.y_max + 14, 2]]);
    }
    const surimpAff = on === '3D' ? ['D', 'G'].map((c) => ({ pied: c, dx: S.dx3d[c], liste: R[c].surimpressions, strates: R[c].strates, isthme: R[c].isthme })) : [{ pied: on, dx: 0, liste: R[on].surimpressions, strates: R[on].strates, isthme: R[on].isthme }];
    P.mettre({ rapport: S.analyse.rapports[source(ref)], baseRapport: R[ref].rapport, basePos: pos, baseIdx: idx, baseAffichee: true, coteConfirme: ref, couleursAff: couleurs, surimpAff });
    P.afficher(pos, idx, { vue: P.$('vue-preset').value, garderCamera: garder, limiteY, couleurs });
    // mesures et contrôles
    const parPied = (c) => { P.statsBase(R[c].rapport); return { s: $('stats').innerHTML, k: $('controles').innerHTML }; };
    if (on === '3D') {
      const d = parPied('D'), g = parPied('G');
      $('stats').innerHTML = '<div><b>Pied D</b></div>' + d.s + '<div style="margin-top:8px"><b>Pied G</b></div>' + g.s;
      $('controles').innerHTML = '<div class="vide"><b>Pied D</b></div>' + d.k + '<div class="vide"><b>Pied G</b></div>' + g.k;
      $('legende-zones').hidden = true;
    } else parPied(on);
    { const m = R[ref].rapport.zones && R[ref].rapport.zones[0] && R[ref].rapport.zones[0].materiau; $('base-mat-info').textContent = m ? 'Shore ' + (m.shore === null ? 'n.d.' : m.shore) + ' · résistance ' + (m.resistance_kgm3 === null ? 'n.d.' : m.resistance_kgm3 + ' kg/m³') + ' · feuille de ' + m.epaisseur_feuille_mm + ' mm' : ''; }
    majCartes();
    P.majParcours(); majPastilles();
    $('btn-export-base').disabled = ['D', 'G'].some((c) => (R[c].rapport.torsions_bloquees || []).length > 0); $('bloc-elements').hidden = false; // torsion non appliquée : export bloqué
    P.dessinerCartes(); majCartes();
    $('coupe-panel').hidden = on === '3D'; P.masquerCoupe(on === '3D'); P.redimensionner();
    if (on !== '3D') await P.dessinerCoupe();
    $('etat').textContent = 'base affichée';
  }

  // applique aux cartes d'éléments les valeurs calculées (angle/hauteur d'un coin, matériau, avertissements) du pied concerné
  function majCartes() {
    const els = P.get().elements, R = S.resultats; if (!R) return;
    const compteur = { D: 0, G: 0 }, inf = [];
    els.forEach((e) => { const o = {}; for (const c of ['D', 'G']) if (e.portee === 'commun' || e.portee === c) { o[c] = R[c].rapport.elements[compteur[c]]; compteur[c]++; } inf.push(o); });
    els.forEach((e, i) => {
      const carte = document.querySelector('#liste-elements .el[data-i="' + i + '"]'); if (!carte) return;
      const o = inf[i], cote = o[refOnglet()] ? refOnglet() : (o.D ? 'D' : 'G'), r = o[cote]; if (!r) return;
      const maj = (f, v) => { const inp = carte.querySelector('[data-f="' + f + '"]'); if (inp && document.activeElement !== inp) inp.value = P.texteNombre(v); };
      if (r.angle_deg !== null && r.angle_deg !== undefined && carte.querySelector('[data-f="angle_deg"]')) { maj('angle_deg', r.angle_deg); maj('hauteur_mm', r.hauteur_reglee_mm); }
      const mat = P.get().materiaux && r.materiau_id ? P.get().materiaux.parId.get(r.materiau_id) : null;
      const ts = carte.querySelector('[data-role="tab-shore"]'); if (ts) ts.textContent = mat ? 'tableau : ' + (mat.shore === null ? 'pas de Shore' : mat.shore) + ' · résistance ' + (mat.resistance_kgm3 === null ? 'non indiquée' : mat.resistance_kgm3 + ' kg/m³') + ' · feuille de ' + mat.epaisseur_mm + ' mm' : '';
      const av = carte.querySelector('[data-role="avert"]');
      if (av) av.innerHTML = ['D', 'G'].filter((c) => o[c]).flatMap((c) => o[c].avertissements.map((a) => '<div>⚠ ' + (e.portee === 'commun' ? '(' + c + ') ' : '') + echapper(a) + '</div>')).join('');
    });
    P.majSuggestion(R[refOnglet()].rapport);
  }

  function badge(e) {
    if (!actif()) return '';
    return '<span class="portee p-' + e.portee + '" title="' + LIB_PORTEE[e.portee] + '">' + (e.portee === 'commun' ? 'Commun' : 'Pied ' + e.portee + ' seul') + '</span>'
      + (e.portee === 'commun' ? ' <button data-act="detacher" data-i="@I@" title="Remplace l\'élément commun par une copie D et une copie G, au même rang : chacune se règle ensuite à part">Détacher</button>' : '');
  }
  function detacher(i) {
    const els = assainer(), e = els[i]; if (!e || e.portee !== 'commun') return;
    const p = detacherPlan({ base: {}, elements: els }, e.uid);
    P.mettre({ elements: p.elements });
    noter('modification', 'élément « ' + e.type + ' » détaché : copie D et copie G au même rang (rien n\'est perdu)');
    P.dessinerCartes(); calculer();
  }

  // ---------- onglets D / G / les 2 ----------
  function majOnglets() { document.querySelectorAll('#onglets-pieds button').forEach((b) => b.classList.toggle('on', b.dataset.onglet === S.onglet)); }
  function majBlocDeroge() {
    const c = S.onglet, b = $('bloc-deroge');
    b.hidden = !actif();
    $('chk-deroge-ligne').hidden = c === '3D';
    $('chk-deroge').checked = c !== '3D' && S.deroge[c];
    $('deroge-cote').textContent = c;
    $('deroge-txt').textContent = c === '3D' ? 'Les réglages de base ci-dessous s\'appliquent aux 2 pieds. Choisissez l\'onglet D ou G pour régler la base d\'un seul pied.'
      : S.deroge[c] ? 'Ce pied a ses propres réglages : seuls les réglages que vous changez ici s\'écartent du commun.' : 'Tant que la case est décochée, modifier un réglage ici change la base des 2 pieds.';
    $('bloc-deroge').classList.toggle('propre', c !== '3D' && S.deroge[c]);
  }
  function allerOnglet(o) {
    if (!actif() || o === S.onglet) return;
    if (S.commun) { P.ecrireBaseParams(o === '3D' ? S.commun : { ...S.commun, ...S.derog[o] }); }
    S.onglet = o; majOnglets(); majBlocDeroge(); P.dessinerCartes();
    if (S.resultats) montrer(); else { P.mettre({ coteConfirme: refOnglet(), rapport: S.analyse.rapports[source(refOnglet())] }); }
  }
  document.querySelectorAll('#onglets-pieds button').forEach((b) => b.addEventListener('click', () => allerOnglet(b.dataset.onglet)));
  $('chk-deroge').addEventListener('change', () => {
    const c = S.onglet; if (c === '3D') return;
    if ($('chk-deroge').checked) { S.deroge[c] = true; S.derog[c] = S.derog[c] || {}; noter('modification', 'pied ' + c + ' : réglages de base propres (dérogation au commun)'); }
    else { S.deroge[c] = false; S.derog[c] = {}; if (S.commun) P.ecrireBaseParams(S.commun); noter('modification', 'pied ' + c + ' : retour aux réglages de base communs'); }
    majBlocDeroge(); if (S.resultats) calculer();
  });

  // ---------- libellés d'en-tête ----------
  function majPastilles() {
    if (!S.mode2) return;
    const pc = $('pill-cote'); pc.textContent = S.confirme ? 'Pieds D + G' : '2 pieds : à confirmer'; pc.className = 'pill ' + (S.confirme ? 'g' : 'a');
    if (S.analyse) $('pill-long').textContent = S.confirme ? 'D ' + Math.round(S.analyse.rapports[source('D')].acquisition.longueur_pied_mm) + ' · G ' + Math.round(S.analyse.rapports[source('G')].acquisition.longueur_pied_mm) + ' mm' : 'A ' + Math.round(S.analyse.rapports.A.acquisition.longueur_pied_mm) + ' · B ' + Math.round(S.analyse.rapports.B.acquisition.longueur_pied_mm) + ' mm';
    else $('pill-long').textContent = 'longueurs —';
    $('lib-cote').innerHTML = S.confirme ? 'Côtés <em>D</em> + <em>G</em> confirmés' : 'Côtés : à confirmer'; $('lib-cote').classList.toggle('a', !S.confirme);
    const bd = $('badge-scan'); if (S.analyse) { bd.hidden = false; bd.textContent = S.confirme ? 'Validé' : 'À confirmer'; bd.className = 'badge' + (S.confirme ? '' : ' a'); }
  }

  // ---------- export des 2 STL : UN SEUL .zip (un seul téléchargement : le 2e téléchargement automatique était bloqué ou annulé par le navigateur) ----------
  async function exporter() {
    $('etat').textContent = 'export des 2 STL en cours (worker)…';
    try {
      const fichiers = [], noms = [], maintenant = new Date().toISOString();
      for (const c of ['D', 'G']) {
        const r = await demander({ type: 'exporter', pied: c });
        const type = S.resultats[c].rapport.type;
        const nom = P.nomFichierSTL((S.generique ? 'INDICATIF-Pied-generique-' : '') + { plate: 'Base-fictive-plate', thermoformee: 'Base-fictive-thermoformee', pleine_dessous: 'Base-fictive-intermediaire' }[type], c, maintenant);
        fichiers.push({ nom, donnees: new Uint8Array(r.stl) });
        noter('export', nom + ' · ' + r.octets + ' octets · fichier relu : fermé');
        noms.push(nom + ' (' + r.nbTriangles + ' triangles)');
      }
      const zip = P.ecrireZip(fichiers, new Date()), nomZip = P.nomFichierZip((S.generique ? 'INDICATIF-' : '') + 'Semelles-fictives', maintenant);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([zip], { type: 'application/zip' })); a.download = nomZip; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      noter('export', nomZip + ' · ' + zip.byteLength + ' octets · 2 STL');
      $('etat').textContent = 'exportés dans ' + nomZip + ' : ' + noms.join(' + ') + ' — contrôlés : fermés';
    } catch (err) { $('base-msg').innerHTML = '<span style="color:#b03030">' + echapper(err.message) + '</span>'; $('etat').textContent = 'erreur : ' + err.message; }
  }

  // ---------- mode un pied / deux pieds ----------
  function activerMode(deux) {
    S.mode2 = deux;
    $('bloc-1p').hidden = deux; $('bloc-modeb').hidden = deux; $('bloc-2p').hidden = !deux;
    if (!S.optsMono) S.optsMono = [...$('demo').options].map((o) => [o.value, o.textContent]);
    const liste = deux ? [['deux_pieds_separes', 'Les 2 pieds — séparés (D 265 mm, G 258 mm)'], ['deux_pieds_colles', 'Les 2 pieds — collés, un seul bloc (D 265, G 258)']] : S.optsMono;
    $('demo').innerHTML = ''; for (const [v, t] of liste) { const o = document.createElement('option'); o.value = v; o.textContent = t; $('demo').append(o); }
    S.sugg = null; $('long-A').value = ''; $('long-B').value = '';
    P.viderVue(); P.mettre({ coteConfirme: null, rapport: null }); P.majCote(); majTexteExport();
    if (!deux) { $('pill-long').textContent = 'longueur —'; const pc = $('pill-cote'); pc.textContent = 'Pied : à confirmer'; pc.className = 'pill a'; $('onglets-pieds').hidden = true; }
    if (deux && P.get().scanPret) { $('info-fichier').insertAdjacentHTML('beforeend', ''); separer(); }
  }
  for (const rb of document.querySelectorAll('input[name=nbpieds]')) rb.addEventListener('change', () => { if (rb.checked) activerMode(rb.value === '2'); });

  // ---------- liaisons ----------
  $('btn-analyser-2p').onclick = () => analyser();
  $('btn-modeb2').onclick = () => creerGeneriques();
  for (const id of ['long-A', 'long-B']) $(id).addEventListener('input', () => { S.confirmeEcart = { A: false, B: false }; });
  $('btn-coupe-main').onclick = () => ouvrirCoupeManuelle('Placez le plan de coupe entre les deux pieds.');
  for (const rb of document.querySelectorAll('input[name=axe-coupe]')) rb.addEventListener('change', () => { if (S.brut) majCurseurCoupe(Number(rb.value), true); });
  $('coupe-curseur').addEventListener('input', () => { if (S.brut) majCurseurCoupe(Number(document.querySelector('input[name=axe-coupe]:checked').value), false); });
  $('btn-coupe-appliquer').onclick = () => {
    const axe = Number(document.querySelector('input[name=axe-coupe]:checked').value), n = [0, 0, 0]; n[axe] = 1;
    noter('modification', 'coupe des 2 pieds placée à la main (axe ' + 'XYZ'[axe] + ' = ' + fr(Number($('coupe-curseur').value), 1) + ')');
    separer({ n, d: Number($('coupe-curseur').value) });
  };
  $('btn-inverser-paire').onclick = async () => {
    if (!S.analyse || S.generique) return;
    S.affectation = { A: autreCote(S.affectation.A), B: autreCote(S.affectation.B) };
    noter('modification', 'Inverser : A = ' + S.affectation.A + ', B = ' + S.affectation.B);
    majTextesPaire();
    if (S.confirme) { if (await confirmer()) { await calculer(); } }
  };
  $('conf-paire').addEventListener('change', () => { majTextesPaire(); });
  // ---------- Miroir (lot 4d) : copie des éléments propres au pied affiché sur l'autre pied, après confirmation ----------
  const cacherMiroir = () => { $('miroir-confirm').hidden = true; $('outil-miroir').classList.remove('on'); };
  const pl = (n, m, f) => n + ' ' + (n > 1 ? f : m);
  function demanderMiroir() {
    if ($('miroir-confirm').hidden === false) { cacherMiroir(); return; }
    if (!actif()) { $('etat').textContent = 'Miroir : disponible seulement avec les 2 pieds (séparez et confirmez les 2 pieds d\'un même scan).'; return; }
    if (S.onglet === '3D') { $('etat').textContent = 'Miroir : choisissez l\'onglet Pied D ou Pied G (le pied affiché sert de modèle).'; return; }
    const a = apercuMiroir(assainer(), S.onglet);
    if (a.rien) { $('etat').textContent = 'Miroir : le pied ' + a.de + ' n\'a aucun élément qui lui soit propre (les éléments communs sont déjà en miroir sur les 2 pieds).'; return; }
    $('miroir-texte').textContent = 'Remplacer le plan du pied ' + a.vers + ' (' + pl(a.remplaces, 'élément propre', 'éléments propres') + ') par le miroir du pied ' + a.de + ' (' + pl(a.copies, 'élément copié', 'éléments copiés') + ') ? Les éléments communs ne changent pas. « Annuler » le défait.';
    $('miroir-confirm').hidden = false; $('outil-miroir').classList.add('on');
  }
  async function appliquerMiroir() {
    const de = S.onglet; cacherMiroir(); if (!actif() || de === '3D') return;
    const a = apercuMiroir(assainer(), de); if (a.rien) return;
    P.mettre({ elements: miroirElements(assainer(), de), dernierModifie: null });
    noter('modification', 'miroir : ' + pl(a.copies, 'élément propre', 'éléments propres') + ' du pied ' + de + ' copié(s) sur le pied ' + a.vers + ' (' + pl(a.remplaces, 'élément remplacé', 'éléments remplacés') + ')');
    P.dessinerCartes(); await calculer();
    if (P.fixerPas) P.fixerPas();
  }
  $('outil-miroir').onclick = demanderMiroir;
  $('miroir-non').onclick = cacherMiroir;
  $('miroir-oui').onclick = appliquerMiroir;

  $('btn-valider-paire').onclick = async () => {
    if (!$('conf-paire').checked || S.confirme) return;
    await confirmer();
  };
  for (const [id, pied, axe] of [['inv-A-y', 'A', 'y'], ['inv-A-z', 'A', 'z'], ['inv-B-y', 'B', 'y'], ['inv-B-z', 'B', 'z']]) {
    $(id).onclick = () => { S.inv[pied][axe] = !S.inv[pied][axe]; noter('modification', 'pied ' + pied + ' : ' + (axe === 'y' ? 'sens talon/avant-pied' : 'face plantaire') + ' inversé(e) par le praticien'); analyser(); };
  }

  return {
    actif, calculer, exporter, detacher, miroir: appliquerMiroir, cacherMiroir,
    // lot 4b : instantané du plan (sans rien modifier) et retour à un instantané ; vue affichée pour les repères 3D
    vue: () => (actif() && S.resultats ? { onglet: S.onglet, R: S.resultats, dx: S.dx3d, longueur: { D: S.analyse.rapports[source('D')].acquisition.longueur_pied_mm, G: S.analyse.rapports[source('G')].acquisition.longueur_pied_mm }, boite: { D: S.analyse.rapports[source('D')].boite, G: S.analyse.rapports[source('G')].boite } } : null),
    instantane: () => {
      if (!actif()) return null;
      const p = P.baseParams(); delete p.cote; const c = S.onglet;
      let commun = S.commun, derog = { D: { ...S.derog.D }, G: { ...S.derog.G } };
      if (commun === null) commun = p; else if (c !== '3D' && S.deroge[c]) derog[c] = diff(p, commun); else commun = p;
      return JSON.parse(JSON.stringify({ commun, derog, deroge: { ...S.deroge } }));
    },
    restaurer: (s) => {
      S.commun = JSON.parse(JSON.stringify(s.commun)); S.derog = JSON.parse(JSON.stringify(s.derog)); S.deroge = { ...s.deroge };
      const o = S.onglet; P.ecrireBaseParams(o === '3D' || !S.commun ? S.commun : { ...S.commun, ...S.derog[o] });
      majBlocDeroge();
    },
    badge: (e, i) => badge(e).replace('@I@', String(i)),
    autrePied: (e) => actif() && S.onglet !== '3D' && e.portee && e.portee !== 'commun' && e.portee !== S.onglet,
    portee: () => $('el-portee').value, nouvelUid: proxUid,
    pied: () => (actif() && S.onglet !== '3D' ? S.onglet : null),
    memoriserSuggestion: (s) => { S.sugg = s; },
    surImport: () => { if (S.mode2) separer(); },
    surReset: () => resetEtat(),
  };
}
