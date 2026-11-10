// Lot 4 bis, étape 5 : pied mannequin anatomique dans la 3D (pied + court segment de jambe, ongles), avec deux modes :
//  - « Pied posé sur la semelle corrigée » (par défaut) : le pied reste POSÉ sur la semelle (relevé de ce qu'il faut pour reposer sur son dessus, torsion comprise) ; c'est l'AXE de Henke qui se
//    corrige (axe vert), avec le bilan avant / après (déviation, croisement avec la ligne des têtes, catégorie) ;
//  - « Rotation libre autour de l'axe » (démonstration) : le pied tourne de phi autour de l'axe de départ.
// Affichage seulement : ni calcul de la semelle, ni STL, ni Annuler. Le pied est calculé une fois par le worker (sur l'empreinte), la pose se fait ensuite dans la carte graphique.
import { poseGPU, composantesTriplan, texteTriplan, fleches, niveauPhiMannequin, vecteurRotation } from '../calcul/mannequin.js';
import { bilanCorrection, textesCorrection, traceAxe } from '../calcul/correction_axe.js';
import { depuisHenke, alertesAxe } from '../calcul/axe-henke.js';
import { HENKE, MANNEQUIN } from '../constantes.js';

const COUL_FLECHE = { bleu: 0x2563eb, vert: 0x16a34a, orange: 0xf59e0b };
const COUL_AXE_CORRIGE = 0x16a34a;
const NOM_PLAN = { frontal: 'Frontal', transversal: 'Transversal', sagittal: 'Sagittal' };
const fr = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');

export function initMannequin(P) {
  const { $, THREE, scene, demanderRendu } = P;
  const racine = new THREE.Group(); racine.renderOrder = 38; scene.add(racine);
  const cache = new Map();     // clé de pied -> données du worker | 'attente' | 'echec'
  const appuis = new Map();    // cote -> { dz_mm, brut_mm } (relevé du pied pour reposer sur la semelle)
  let groupes = [], pose = [], graine = 0;
  const relief = () => Number($('relief').value) || 1;
  const mode = () => { const r = document.querySelector('input[name=mq-mode]:checked'); return r ? r.value : 'corrige'; };
  const opacite = () => { const v = Number($('mq-opa').value); return Number.isFinite(v) ? Math.min(1, Math.max(0.2, v / 100)) : 1; };
  const phiLibre = () => { const v = Number($('mq-phi').value.replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const phiPour = (cote) => (mode() === 'corrige' ? (P.phiTorsion(cote) ?? 0) : phiLibre());
  const vider = () => { for (const o of [...racine.children]) { racine.remove(o); o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); }); } pose = []; };
  const formeSemelleCochee = () => { const e = document.getElementById('forme-semelle'); return !!(e && e.checked); };
  const cle = (g) => [g.cote, g.longueur_mm, g.boite && g.boite.x_min, g.boite && g.boite.x_max, g.rapport.repere_talon.x_mm, g.rapport.repere_talon.y_mm, formeSemelleCochee()].join('|');

  // ------------------------------------------------------------------ texte
  function info() {
    const lignes = [], libre = mode() === 'libre';
    if (groupes.length === 0) { $('mq-info').innerHTML = '<small>Construisez d\'abord la base (carte 2) : le pied mannequin est posé sur la semelle.</small>'; majCommandes(null); return; }
    let phiAffiche = 0, nbTorsion = 0;
    for (const g of groupes) {
      const a = P.axeDe(g.cote); if (!a) continue;
      const val = phiPour(g.cote), tete = groupes.length > 1 ? 'Pied ' + g.cote + ' · ' : '', t = composantesTriplan(val, a.axe), niv = niveauPhiMannequin(val), tors = P.phiTorsion(g.cote);
      phiAffiche = val; if (tors !== null) nbTorsion++;
      lignes.push('<div><b>' + tete + (libre ? 'Rotation libre' : 'Pied posé sur la semelle corrigée') + '</b>' + (a.valide ? '' : ' <span class="alerte">(axe non validé : proposition)</span>') + '</div>');
      if (!libre) {
        const ap = appuis.get(g.cote);
        if (ap) lignes.push('<div data-appui="1"><small>Le pied suit la semelle : relevé de ' + fr(ap.a_mm) + ' mm' + (ap.inclinaison_deg > 0.05 ? ', incliné de ' + fr(ap.inclinaison_deg) + '° avec la correction (frontal ' + fr(Math.abs(ap.frontal_deg)) + '°)' : '') + ' ; la semelle ne traverse pas le pied' + (ap.penetration_mm > 0.05 ? ' <span class="alerte">(⚠ ' + fr(ap.penetration_mm) + ' mm de pénétration restante : borne atteinte)</span>' : '') + '.</small></div>');
        if (tors === null) { lignes.push('<div><small>Aucune torsion dans la carte 3 (groupe « Axe de Henke ») : ajoutez-en une pour voir l\'axe se corriger.</small></div>'); continue; }
        const b = bilanCorrection(a.axe, a.tetes, val);
        lignes.push('<div>Torsion de la semelle : <b>' + (val > 0 ? '+' : '') + fr(val) + '°</b></div>');
        for (const l of textesCorrection(b)) lignes.push('<div data-bilan="1">' + l + '</div>');
        const al = alertesAxe(b.axe_apres); if (al.length) lignes.push('<div class="alerte">⚠ axe corrigé : ' + al.join(' ; ') + '</div>');
      }
      if (t.mouvement === 'neutre') { if (libre) lignes.push('<div><small>Pied au neutre (phi = 0°).</small></div>'); continue; }
      for (const p of ['frontal', 'transversal', 'sagittal']) {
        const c = t[p], f = fleches(val, a.axe).find((x) => x.plan === p), hex = '#' + COUL_FLECHE[f.couleur].toString(16).padStart(6, '0');
        lignes.push('<div data-plan="' + p + '"><span class="pastille" style="background:' + hex + '"></span> ' + NOM_PLAN[p] + ' : <b>' + c.sens + ' ' + fr(Math.abs(c.deg)) + '°</b></div>');
      }
      lignes.push('<div><small>' + texteTriplan(val, a.axe) + '</small></div>');
      if (niv.niveau !== 'ok') lignes.push('<div class="alerte">⚠ ' + (niv.niveau === 'rouge' ? 'Rotation importante (> ' + HENKE.phi.rouge_deg + '°).' : 'Rotation à surveiller (> ' + HENKE.phi.orange_deg + '°).') + '</div>');
    }
    majCommandes(nbTorsion > 0 ? phiAffiche : null);
    $('mq-info').innerHTML = lignes.join('');
  }
  function majCommandes(phiTors) {
    const libre = mode() === 'libre', v = libre ? phiLibre() : (phiTors ?? 0);
    $('mq-phi').disabled = !libre; if (!libre) $('mq-phi').value = v;
    $('mq-phi-val').textContent = (v > 0 ? '+' : '') + fr(v) + '°';
    const niv = niveauPhiMannequin(v); $('mq-phi-val').style.color = niv.niveau === 'rouge' ? '#c0213f' : niv.niveau === 'orange' ? '#c2670a' : '';
    $('mq-phi-nom').innerHTML = libre ? 'Rotation phi <small>(+ supination, − pronation)</small>' : 'Phi de la torsion <small>(lecture seule)</small>';
    $('mq-boutons').hidden = !libre;
    $('mq-torsion').disabled = !groupes.some((g) => P.phiTorsion(g.cote) !== null);
  }

  // ------------------------------------------------------------------ maillages
  function matPeau(o) { return new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.56, metalness: 0, sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xff9d8c), clearcoat: 0.04, clearcoatRoughness: 0.6, transparent: o < 1, opacity: o, side: THREE.FrontSide }); }
  // « Relief ×N » grossit la semelle seulement : le pied suit la semelle exagérée (décalage = hauteur de plante sous chaque sommet), son épaisseur reste VRAIE.
  function geometrie(d, avecCouleurs) {
    const r = relief(), pos = Float32Array.from(d.positions);
    for (let v = 0; v < d.decal.length; v++) pos[3 * v + 2] += (r - 1) * d.decal[v];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(d.normales, 3)); geo.setIndex(new THREE.BufferAttribute(d.indices, 1));
    if (avecCouleurs) { const col = new Float32Array(d.couleurs.length); for (let q = 0; q < col.length; q++) col[q] = Math.pow(d.couleurs[q], 2.2); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); } // sRGB -> linéaire
    return geo;
  }
  function tube(a, b, r, couleur, ordre) {
    const v = new THREE.Vector3().subVectors(b, a), l = v.length(); if (l < 1e-6) return null;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), new THREE.MeshBasicMaterial({ color: couleur, depthTest: false }));
    m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.renderOrder = ordre; return m;
  }
  function axeCorrigeDessin(g, a, b) { // axe de Henke corrigé (vert) : projection plantaire, axe 3D, point de croisement avec la ligne des têtes ; mêmes hauteurs et même échelle que l'axe de départ
    const grp = new THREE.Group(); grp.position.x = g.dx || 0; grp.scale.z = relief(); racine.add(grp);
    let zmax = 0; for (let k = 2; k < g.positions.length; k += 3) if (g.positions[k] > zmax) zmax = g.positions[k];
    const zp = zmax + 0.9, P3 = (h, z = zp) => { const q = depuisHenke(h, a.rep, g.cote); return new THREE.Vector3(q.x, q.y, z); };
    const tr = traceAxe(b.axe_apres, a.tetes);
    const proj = tube(P3(tr.projection.de), P3(tr.projection.a), 0.5, COUL_AXE_CORRIGE, 44); if (proj) { proj.userData = { role: 'axe-corrige-projection', pied: g.cote }; grp.add(proj); }
    const ax = tube(P3(tr.axe3d.de), P3(tr.axe3d.a, zp + tr.axe3d.a.z), 0.9, COUL_AXE_CORRIGE, 45); if (ax) { ax.userData = { role: 'axe-corrige', pied: g.cote, z_fin: zp + tr.axe3d.a.z }; grp.add(ax); }
    const cr = new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12), new THREE.MeshBasicMaterial({ color: COUL_AXE_CORRIGE, depthTest: false })); cr.position.copy(P3(tr.croisement)); cr.renderOrder = 48;
    cr.userData = { role: 'croisement-corrige', pied: g.cote, x_henke: tr.croisement.x, categorie: b.apres.categorie }; const ring = new THREE.Mesh(new THREE.SphereGeometry(4.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x0b3d1e, depthTest: false })); ring.renderOrder = 47; cr.add(ring); grp.add(cr);
  }
  function dessinerPied(g) {
    const k = cle(g), c = cache.get(k);
    if (c === undefined) {
      cache.set(k, 'attente');
      $('mq-msg').textContent = 'calcul du pied mannequin…';
      P.demander(g.deux ? { type: 'mannequin', pied: g.cote, longueur_mm: g.longueur_mm, cote: g.cote, forme_semelle: formeSemelleCochee() } : { type: 'mannequin', longueur_mm: g.longueur_mm, cote: g.cote, forme_semelle: formeSemelleCochee() })
        .then((r) => { cache.set(k, r); $('mq-msg').textContent = ''; dessiner(); })
        .catch((err) => { cache.set(k, 'echec'); $('mq-msg').textContent = 'pied mannequin indisponible : ' + err.message; });
      return;
    }
    if (typeof c === 'string') return;
    const a = P.axeDe(g.cote); if (!a) return;
    const ext = new THREE.Group(); ext.position.x = g.dx || 0; racine.add(ext);
    const pivotGrp = new THREE.Group(); ext.add(pivotGrp);
    const o = opacite(), peau = new THREE.Mesh(geometrie(c, true), matPeau(o)); peau.renderOrder = 38; peau.userData = { role: 'mannequin', pied: g.cote };
    const enfants = new THREE.Group(); enfants.add(peau);
    if (c.ongles && c.ongles.indices.length) {
      const ong = new THREE.Mesh(geometrie(c.ongles, false), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0xf4d3c9), roughness: 0.26, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.12, transparent: o < 1, opacity: o, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      ong.renderOrder = 39; ong.userData = { role: 'mannequin-ongles', pied: g.cote, nb: c.ongles.nb }; enfants.add(ong);
    }
    pivotGrp.add(enfants);
    const fl = new THREE.Group(); ext.add(fl);
    pose.push({ g, a, ext, pivotGrp, enfants, fl, jambe: { centre: c.centre, z_pied_mm: c.z_cheville_mm }, decal: (relief() - 1) * (c.decal[0] || 0) });
  }
  function demanderAppuis() { // relevé du pied pour reposer sur le dessus de la semelle (torsion, voûte, etc. comprises) : recalculé à chaque affichage de la semelle
    const id = ++graine;
    for (const g of groupes) {
      P.demander(g.deux ? { type: 'appui_mannequin', pied: g.cote, socle_mm: MANNEQUIN.socle_mm } : { type: 'appui_mannequin', socle_mm: MANNEQUIN.socle_mm })
        .then((r) => { if (id !== graine) return; appuis.set(g.cote, r); placer(); info(); })
        .catch(() => { if (id === graine) appuis.delete(g.cote); });
    }
  }
  function placer() { // le pied (et les flèches) suivent la correction de la semelle : inclinés comme elle, relevés juste assez pour ne pas être traversés
    const N = relief();
    for (const o of pose) {
      const ap = mode() === 'corrige' ? appuis.get(o.g.cote) : null, dx = o.g.dx || 0;
      if (!ap) { o.ext.quaternion.identity(); o.ext.position.set(dx, 0, 0); o.dz = 0; continue; }
      const n = new THREE.Vector3(-N * ap.b, -N * ap.c, 1).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n), pv = new THREE.Vector3(ap.px, ap.py, 0);
      o.ext.quaternion.copy(q); o.ext.position.copy(pv).sub(pv.clone().applyQuaternion(q)).add(new THREE.Vector3(dx, 0, N * ap.a_mm)); o.dz = N * ap.a_mm;
    }
    demanderRendu();
  }
  function orienter() {
    for (const o of pose) {
      const val = phiPour(o.g.cote), libre = mode() === 'libre';
      const q = poseGPU(o.a.axe, libre ? val : 0, o.a.rep, o.g.cote), pv = new THREE.Vector3(...q.pivot);
      o.pivotGrp.position.copy(pv); o.enfants.position.copy(pv).negate();
      o.pivotGrp.quaternion.setFromAxisAngle(new THREE.Vector3(...q.axe), q.angle_rad);
      for (const e of [...o.fl.children]) { o.fl.remove(e); e.traverse((x) => { if (x.geometry) x.geometry.dispose(); if (x.material) x.material.dispose(); }); }
      if (Math.abs(val) < 1e-9) continue;
      const w = vecteurRotation(o.a.axe, val, o.g.cote), origine = new THREE.Vector3(o.jambe.centre.x_mm, o.jambe.centre.y_mm, o.jambe.z_pied_mm + o.decal + 20);
      const dirs = { frontal: [0, Math.sign(w[1]), 0], transversal: [0, 0, Math.sign(w[2])], sagittal: [Math.sign(w[0]), 0, 0] };
      for (const f of fleches(val, o.a.axe)) {
        if (f.longueur_mm <= 0) continue;
        const d = new THREE.Vector3(...dirs[f.plan]); if (d.lengthSq() === 0) continue;
        const ar = new THREE.ArrowHelper(d.normalize(), origine, f.longueur_mm * 3.5, COUL_FLECHE[f.couleur], f.longueur_mm * 1.1, f.longueur_mm * 0.6);
        ar.line.material.depthTest = false; ar.cone.material.depthTest = false; ar.line.material.linewidth = 3; ar.renderOrder = 60; ar.line.renderOrder = 60; ar.cone.renderOrder = 61;
        ar.userData = { role: 'mannequin-fleche', plan: f.plan, pied: o.g.cote, longueur_mm: f.longueur_mm, dir: d.toArray(), sens: f.sens };
        o.fl.add(ar);
      }
    }
    demanderRendu();
  }
  // Axe de Henke CORRIGÉ par la torsion : affiché dès qu'une torsion existe, que le pied mannequin soit affiché ou non (retour de Joël 04/11)
  function axesCorriges() {
    if (mode() !== 'corrige') return;
    for (const g of groupes) { const a = P.axeDe(g.cote); if (!a || P.phiTorsion(g.cote) === null) continue; const val = phiPour(g.cote); if (Math.abs(val) < 1e-9) continue; axeCorrigeDessin(g, a, bilanCorrection(a.axe, a.tetes, val)); }
  }
  function bilanHenke() { // même bilan avant → après dans la carte « Axe de Henke », pour le lire sans afficher le mannequin
    const el = $('henke-correction'); if (!el) return; const L = [];
    if (mode() === 'corrige') for (const g of groupes) { const a = P.axeDe(g.cote); if (!a || P.phiTorsion(g.cote) === null) continue; const val = phiPour(g.cote); if (Math.abs(val) < 1e-9) continue; const tete = groupes.length > 1 ? 'Pied ' + g.cote + ' · ' : ''; L.push('<div><b style="color:#16a34a">' + tete + 'Axe corrigé par la torsion de ' + (val > 0 ? '+' : '') + fr(val) + '°</b> <small>(trait vert ; modèle indicatif)</small></div>'); for (const l of textesCorrection(bilanCorrection(a.axe, a.tetes, val))) L.push('<div data-bilan-henke="1">' + l + '</div>'); }
    el.innerHTML = L.join('');
  }
  function dessiner() {
    vider(); $('mq-reglages').hidden = !$('mq-on').checked;
    axesCorriges(); bilanHenke();
    if (!$('mq-on').checked) { info(); demanderRendu(); return; }
    for (const g of groupes) dessinerPied(g);
    info(); placer(); orienter();
  }

  $('mq-on').onchange = () => { if ($('mq-on').checked) demanderAppuis(); dessiner(); };
  for (const r of document.querySelectorAll('input[name=mq-mode]')) r.onchange = () => { dessiner(); };
  const regler = (v) => { const n = Math.max(-HENKE.phi.blocage_deg, Math.min(HENKE.phi.blocage_deg, Math.round(v / HENKE.phi.pas_deg) * HENKE.phi.pas_deg)); $('mq-phi').value = n; info(); orienter(); };
  $('mq-phi').oninput = () => { if (mode() === 'libre') regler(phiLibre()); };
  $('mq-torsion').onclick = () => { const g = groupes.find((x) => P.phiTorsion(x.cote) !== null); if (g) { const t = P.phiTorsion(g.cote); regler(t); P.noter('modification', 'pied mannequin : phi repris de la torsion (' + fr(t) + '°)'); } };
  $('mq-zero').onclick = () => regler(0);
  $('mq-opa').oninput = () => { $('mq-opa-val').textContent = Math.round(opacite() * 100) + ' %'; dessiner(); };

  return {
    afficher(g) { groupes = (g || []).filter((x) => x && x.rapport && x.rapport.repere_talon && x.positions && x.longueur_mm); if ($('mq-on').checked) demanderAppuis(); dessiner(); },
    relief() { dessiner(); },
    reset() { cache.clear(); appuis.clear(); groupes = []; vider(); info(); },
    actif: () => false,
    ecran: () => ({ actif: $('mq-on').checked, mode: mode(), bilan_henke: ($('henke-correction') || {}).textContent || '', phi: phiLibre(), phi_affiche: Number($('mq-phi').value), info: $('mq-info').textContent, msg: $('mq-msg').textContent, torsion_dispo: !$('mq-torsion').disabled, phi_desactive: $('mq-phi').disabled,
      appuis: Object.fromEntries(appuis),
      objets: (() => { const L = []; racine.traverse((q) => { if (q.userData && q.userData.role) { const w = new THREE.Vector3(); q.getWorldPosition(w); L.push({ ...q.userData, mondial: w.toArray(), tri: q.geometry && q.geometry.index ? q.geometry.index.count / 3 : undefined, opacite: q.material ? q.material.opacity : undefined }); } }); return L; })(),
      poses: pose.map((o) => ({ cote: o.g.cote, quat: o.pivotGrp.quaternion.toArray(), pivot: o.pivotGrp.position.toArray(), dz: o.dz, appui_quat: o.ext.quaternion.toArray(), appui_pos: o.ext.position.toArray() })) }),
    regler,
  };
}
