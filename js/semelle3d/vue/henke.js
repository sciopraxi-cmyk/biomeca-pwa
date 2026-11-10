// Lot 4 bis, étape 2 : axe de Henke dans la 3D (axe incliné, projection plantaire, têtes M1-M3, croisement, catégorie, bras de levier, palpation, validation).
// Affichage et réglages seulement : ni calcul de la semelle, ni STL, ni Annuler (la torsion est l'étape 3). Toute valeur est une PROPOSITION à valider.
import { etatParDefaut, deplacerRepere, regler, palper, retablir, valider, resumerAxe, brasDesSommets, enregistrer, versHenke, depuisHenke, vecteursAxe, yTetes, xCroisement, LIBELLES_CATEGORIE } from '../calcul/axe-henke.js';

// couleurs déjà présentes dans l'interface (pastilles des cartes) : bleu = supinateur, rouge = pronateur, violet = axe, vert d'eau = repères
const COUL = { axe: 0x7c3aed, proj: 0x7c3aed, tete: 0x0b1b3a, repere: 0x14b8a6, croise: 0xffffff, supi: [0x25 / 255, 0x63 / 255, 0xeb / 255], prona: [0xe1 / 255, 0x1d / 255, 0x48 / 255] };

export function initHenke(P) {
  const { $, THREE, scene, camera, controls, renderer, demanderRendu } = P;
  const dom = renderer.domElement;
  const racine = new THREE.Group(); racine.renderOrder = 40; scene.add(racine);
  const etats = new Map();     // cote -> { cle, etat }
  const aRestaurer = new Map(); // cote -> etat à poser dès que le pied est affiché (V1)
  let groupes = [], poignees = [], drag = null, palpation = null; // palpation : { points: [] } | null
  const relief = () => Number($('relief').value) || 1;
  const fr = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');
  const fini = (v) => Number.isFinite(v);
  const age = () => { const t = $('pat-age') ? $('pat-age').value.trim().replace(',', '.') : ''; const v = t === '' ? NaN : Number(t); return Number.isFinite(v) && v >= 0 && v <= 120 ? v : undefined; }; // âge du patient (ans) ; vide = adulte

  function etatDe(g) {
    const rep = g.rapport && g.rapport.repere_talon; if (!rep || !g.boite || !g.longueur_mm) return null;
    const cle = [g.cote, g.longueur_mm, g.boite.x_min, g.boite.x_max, rep.x_mm, rep.y_mm].join('|');
    let e = etats.get(g.cote);
    if (!e || e.cle !== cle) { e = { cle, etat: etatParDefaut(g.longueur_mm, g.boite, rep, g.cote), defaut: null }; e.defaut = e.etat; if (aRestaurer.has(g.cote)) { e.etat = aRestaurer.get(g.cote); aRestaurer.delete(g.cote); } etats.set(g.cote, e); if (P.surAxe) setTimeout(P.surAxe, 0); }
    return e;
  }
  const vider = () => { for (const o of [...racine.children]) { racine.remove(o); o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); }); } poignees = []; };
  function tube(a, b, r, couleur, ordre) { // cylindre fin entre deux points (une ligne WebGL ferait 1 px)
    const v = new THREE.Vector3().subVectors(b, a), l = v.length(); if (l < 1e-6) return null;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), new THREE.MeshBasicMaterial({ color: couleur, depthTest: false }));
    m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.renderOrder = ordre; return m;
  }
  function bille(p, r, couleur, ordre) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: couleur, depthTest: false })); m.position.copy(p); m.userData.r = r; m.renderOrder = ordre; return m; }

  function dessinerPied(g, e) {
    const grp = new THREE.Group(); grp.position.x = g.dx || 0; grp.scale.z = relief(); racine.add(grp);
    const rep = g.rapport.repere_talon, { axe, tetes } = e.etat, cote = g.cote;
    let zmax = 0; for (let k = 2; k < g.positions.length; k += 3) if (g.positions[k] > zmax) zmax = g.positions[k];
    const zp = zmax + 0.6;
    const P3 = (h, z = zp) => { const q = depuisHenke(h, rep, cote); return new THREE.Vector3(q.x, q.y, z); };
    const yT = yTetes(tetes), { a, u } = vecteursAxe(axe), xc = xCroisement(axe, yT);
    if ($('henke-bras').checked) { // carte des bras de levier : bleu = supinateur (dedans de l'axe), rouge = pronateur (dehors), intensité ∝ |d|
      const d = brasDesSommets(g.positions, axe, rep, cote); let dm = 1e-6; for (const v of d) dm = Math.max(dm, Math.abs(v));
      const col = new Float32Array(d.length * 3);
      for (let v = 0; v < d.length; v++) { const t = Math.min(1, Math.abs(d[v]) / dm), c = d[v] >= 0 ? COUL.supi : COUL.prona; for (let q = 0; q < 3; q++) col[3 * v + q] = 1 + (c[q] - 1) * t; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(g.positions, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setIndex(new THREE.BufferAttribute(g.indices, 1));
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.renderOrder = 41; m.userData = { role: 'bras', pied: cote, dmax: dm }; grp.add(m);
    }
    const y0 = axe.p0.y, yFin = yT + 25, sFin = (yFin - y0) / a.y; // projection plantaire : de p0 au-delà de la ligne des têtes
    const proj = tube(P3(axe.p0), P3({ x: axe.p0.x + a.x * sFin, y: yFin }), 0.5, COUL.proj, 42); if (proj) { proj.userData = { role: 'projection', pied: cote }; grp.add(proj); }
    const tAxe = Math.min((yT - y0) / u.y, 70 / u.z), a3 = P3(axe.p0), b3 = P3({ x: axe.p0.x + u.x * tAxe, y: axe.p0.y + u.y * tAxe }, zp + u.z * tAxe); // axe 3D incliné, limité à ~7 cm de hauteur (sortie au col du talus) : la projection plantaire montre le trajet complet
    const ax3 = tube(a3, b3, 0.9, COUL.axe, 43); if (ax3) { ax3.userData = { role: 'axe', pied: cote, z_fin: b3.z }; grp.add(ax3); }
    const lt = tube(P3({ x: tetes.m3.x - 12, y: yT }), P3({ x: tetes.m1.x + tetes.m1.rayon_mm + 8, y: yT }), 0.4, COUL.tete, 42); if (lt) { lt.userData = { role: 'ligne_tetes', pied: cote }; grp.add(lt); }
    const bord = tube(P3({ x: tetes.m1.x + tetes.m1.rayon_mm, y: yT - 4 }), P3({ x: tetes.m1.x + tetes.m1.rayon_mm, y: yT + 4 }), 0.4, COUL.tete, 42); if (bord) grp.add(bord); // repère du bord médial de M1
    const croise = bille(P3({ x: xc, y: yT }), 3.2, COUL.croise, 46); croise.userData.role = 'croisement'; grp.add(croise); poignees.push({ cote, nom: null, mesh: croise, groupe: grp, fixe: true });
    for (const [nom, h, coul] of [['p0', axe.p0, COUL.repere], ['m1', { x: tetes.m1.x, y: yT }, COUL.tete], ['m2', { x: tetes.m2.x, y: yT }, COUL.tete], ['m3', { x: tetes.m3.x, y: yT }, COUL.tete]]) {
      const b = bille(P3(h), 3, coul, 45); b.userData = { ...b.userData, role: 'repere', nom, pied: cote }; grp.add(b); poignees.push({ cote, nom, mesh: b, groupe: grp });
    }
    if (palpation && palpation.cote === cote) palpation.points.forEach((p) => { const b = bille(P3(p), 3.2, 0xff2d55, 47); b.userData.role = 'palpation'; grp.add(b); poignees.push({ cote, nom: null, mesh: b, groupe: grp, fixe: true }); });
  }
  function echelle() { // taille constante à l'écran (~6 px de rayon)
    for (const q of poignees) {
      const w = new THREE.Vector3(); q.mesh.getWorldPosition(w);
      const s = (2 * camera.position.distanceTo(w) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 6) / (dom.clientHeight || 600);
      q.mesh.scale.set(s, s, s);
    }
  }
  controls.addEventListener('change', echelle);

  function carte() {
    const infos = [], g0 = groupes[0], un = groupes.length === 1;
    for (const g of groupes) { const e = etatDe(g); if (!e) continue; const r = resumerAxe(e.etat, { age_ans: age() }); infos.push({ g, e, r }); }
    const disp = (id, v) => { const n = $(id); if (n) n.disabled = v; };
    const actif = $('henke-on').checked;
    $('henke-reglages').hidden = !actif;
    const txt = [];
    if (!groupes.length) txt.push('<i>Calculez d\'abord la base et confirmez le côté du pied.</i>');
    for (const { g, r } of infos) {
      const cat = '<b>' + LIBELLES_CATEGORIE[r.categorie] + '</b>' + (r.limite ? ' <span class="lim">(limite : à moins de 2 mm de « ' + r.seuil_proche + ' »)</span>' : '');
      txt.push((infos.length > 1 ? '<b>Pied ' + g.cote + '</b> : ' : '') + 'axe ' + cat + ' · croisement à ' + fr(r.x_croisement_mm, 0) + ' mm · déviation ' + fr(r.deviation_deg) + '° · inclinaison ' + fr(r.inclinaison_deg, 0) + '° · source ' + r.source
        + (r.valide ? ' · <span class="ok">validé</span>' : ' · <span class="aval">à valider</span>')
        + (r.skive ? '<br><i class="sugg">Suggestion (non appliquée) : ' + (r.skive.type === 'skive_medial' ? 'skive médial' : 'skive latéral (ou coin valgisant)') + ' de <b>' + fr(r.skive.profondeur_mm, 0) + ' mm</b> · ' + (r.skive.enfant ? 'enfant (moins de 12 ans)' : r.skive.age_inconnu ? 'adulte <small>(âge non renseigné)</small>' : 'adulte') + ' · pente ' + fr(r.skive.angle_deg, 0) + '°</i> '
          + '<button data-skive="' + g.cote + '"' + (r.valide ? '' : ' disabled title="Validez d\'abord l\'axe"') + '>Ajouter cette skive</button>' + (r.valide ? '' : ' <small>(validez l\'axe pour l\'ajouter)</small>')
          + (r.skive.alternative ? '<br><small>Alternative : un coin valgisant, à ajouter depuis la liste des éléments.</small>' : '') : '')
        + r.alertes.map((a) => '<br><span class="alerte">⚠ ' + a + '</span>').join(''));
    }
    $('henke-info').innerHTML = txt.join('<hr>');
    const e = un && infos[0] ? infos[0].e : null;
    for (const id of ['henke-incl', 'henke-dev', 'henke-defaut', 'henke-palper', 'henke-valider']) disp(id, !e);
    if (e) {
      if (document.activeElement !== $('henke-incl')) $('henke-incl').value = fr(e.etat.axe.inclinaison_deg, 1);
      if (document.activeElement !== $('henke-dev')) $('henke-dev').value = fr(e.etat.axe.deviation_deg, 1);
    }
    $('henke-valider').textContent = e && e.etat.axe.valide ? '✔ Axe validé' : 'Valider l\'axe';
    $('henke-palper').classList.toggle('on', !!palpation);
    $('henke-palper').textContent = palpation ? (palpation.points.length === 0 ? 'Palpation : cliquez le point POSTÉRIEUR' : 'Palpation : cliquez le point ANTÉRIEUR') : 'Palper (2 points)';
    $('henke-bandeau').hidden = !actif || !infos.length || infos.every((i) => i.r.valide);
    $('henke-aide-multi').hidden = !(actif && infos.length > 1);
    void g0;
  }
  function dessiner() {
    vider();
    if ($('henke-on').checked) for (const g of groupes) { const e = etatDe(g); if (e) { try { dessinerPied(g, e); } catch (err) { $('henke-info').textContent = 'axe de Henke : ' + err.message; } } }
    carte(); echelle(); demanderRendu();
  }
  function modifier(g, f, msg) { const e = etatDe(g); if (!e) return; try { e.etat = f(e.etat); } catch (err) { $('henke-info').textContent = err.message; return; } if (msg) P.noter('modification', msg); dessiner(); if (P.surAxe) P.surAxe(); }
  const unGroupe = () => (groupes.length === 1 ? groupes[0] : null);

  // ----- skive suggérée : l'ajout est la validation du praticien (jamais appliquée seule)
  $('henke-info').addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('button[data-skive]'); if (!b || b.disabled) return;
    const g = groupes.find((x) => x.cote === b.dataset.skive), e = g && etatDe(g); if (!e || !e.etat.axe.valide) return;
    const sk = resumerAxe(e.etat, { age_ans: age() }).skive; if (!sk) return;
    if (P.ajouterSkive) P.ajouterSkive({ cote: g.cote, bord: sk.type === 'skive_medial' ? 'medial' : 'lateral', profondeur_mm: sk.profondeur_mm, angle_deg: sk.angle_deg, categorie: sk.categorie, enfant: sk.enfant });
  });
  const ageChamp = $('pat-age'); if (ageChamp) ageChamp.addEventListener('change', () => carte());

  // ----- champs
  $('henke-on').onchange = () => { if (!$('henke-on').checked) palpation = null; dessiner(); };
  $('henke-bras').onchange = dessiner;
  $('henke-incl').onchange = () => { const g = unGroupe(); if (!g) return; const v = Number($('henke-incl').value.replace(',', '.')); modifier(g, (s) => regler(s, { inclinaison_deg: v }), 'axe de Henke : inclinaison ' + fr(v) + '°'); };
  $('henke-dev').onchange = () => { const g = unGroupe(); if (!g) return; const v = Number($('henke-dev').value.replace(',', '.')); modifier(g, (s) => regler(s, { deviation_deg: v }), 'axe de Henke : déviation ' + fr(v) + '° (saisie)'); };
  $('henke-defaut').onclick = () => { const g = unGroupe(); if (!g) return; palpation = null; const e = etatDe(g); modifier(g, (s) => retablir(s, e.defaut), 'axe de Henke : repères par défaut rétablis'); };
  $('henke-valider').onclick = () => { const g = unGroupe(); if (!g) return; modifier(g, valider, 'axe de Henke : validé par le praticien (pied ' + g.cote + ')'); };
  $('henke-palper').onclick = () => {
    const g = unGroupe(); if (!g) return;
    palpation = palpation ? null : { cote: g.cote, points: [] }; $('vue').classList.toggle('mode-mesure', !!palpation); dom.style.cursor = palpation ? 'crosshair' : ''; dessiner();
  };
  document.addEventListener('keydown', (ev) => { if (palpation && ev.key === 'Escape') { const t = ev.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; palpation = null; $('vue').classList.remove('mode-mesure'); dom.style.cursor = ''; dessiner(); } });

  // ----- glisser un repère (p0, M1, M2, M3) dans la vue
  const pointeur = (ev) => { const r = dom.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height }; };
  function viser(ev) {
    const p = pointeur(ev); let meilleur = null, dm = 14;
    for (const q of poignees) {
      if (q.fixe) continue;
      const w = new THREE.Vector3(); q.mesh.getWorldPosition(w); w.project(camera);
      const d = Math.hypot(((w.x + 1) / 2) * p.w - p.x, ((1 - w.y) / 2) * p.h - p.y);
      if (d <= dm) { dm = d; meilleur = q; }
    }
    return meilleur;
  }
  dom.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !$('henke-on').checked || palpation || !poignees.length || (P.mesureActive && P.mesureActive())) return;
    const q = viser(ev); if (!q) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    const w = new THREE.Vector3(); q.mesh.getWorldPosition(w);
    drag = { cote: q.cote, nom: q.nom, plan: new THREE.Plane(new THREE.Vector3(0, 0, 1), -w.z), dx: q.groupe.position.x, bouge: false };
    controls.enabled = false; try { dom.setPointerCapture(ev.pointerId); } catch (err) { void err; }
  }, true);
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = pointeur(ev), rc = new THREE.Raycaster(); rc.setFromCamera(new THREE.Vector2((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1), camera);
    const hit = new THREE.Vector3(); if (!rc.ray.intersectPlane(drag.plan, hit)) return;
    const g = groupes.find((x) => x.cote === drag.cote), e = g && etatDe(g); if (!e) return;
    const h = versHenke({ x: hit.x - drag.dx, y: hit.y }, g.rapport.repere_talon, g.cote);
    try { e.etat = deplacerRepere(e.etat, drag.nom, { x: Math.round(h.x * 2) / 2, y: Math.round(h.y * 2) / 2 }); } catch (err) { void err; return; }
    drag.bouge = true; dessiner();
  });
  window.addEventListener('pointerup', () => { if (!drag) return; const d = drag; drag = null; controls.enabled = true; if (d.bouge && P.surAxe) P.surAxe(); if (d.bouge) P.noter('modification', 'axe de Henke : repère ' + (d.nom === 'p0' ? 'postérieur' : d.nom.toUpperCase()) + ' déplacé (pied ' + d.cote + ')'); demanderRendu(); });

  // ----- palpation : 2 clics sur la semelle
  let depart = null;
  window.addEventListener('pointerdown', (ev) => { depart = palpation && ev.button === 0 && ev.target === dom ? { x: ev.clientX, y: ev.clientY } : null; }, true);
  window.addEventListener('pointerup', (ev) => {
    if (!depart || !palpation) return; const d = depart; depart = null;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) return;
    const m = P.getMaille(), g = unGroupe(); if (!m || !g) return;
    const r = dom.getBoundingClientRect(), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    m.updateMatrixWorld(); const hit = rc.intersectObject(m, false)[0]; if (!hit) return;
    const h = versHenke({ x: hit.point.x - (g.dx || 0), y: hit.point.y }, g.rapport.repere_talon, g.cote);
    if (palpation.points.length === 1 && !(h.y > palpation.points[0].y)) { $('henke-info').innerHTML = '<span class="alerte">⚠ Le point antérieur doit être plus en avant que le point postérieur.</span>'; return; }
    palpation.points.push({ x: Math.round(h.x * 2) / 2, y: Math.round(h.y * 2) / 2 });
    if (palpation.points.length === 2) {
      const [post, ant] = palpation.points; palpation = null; $('vue').classList.remove('mode-mesure'); dom.style.cursor = '';
      modifier(g, (s) => palper(s, post, ant), 'axe de Henke : palpation (pied ' + g.cote + ') · déviation ' + fr(Math.atan2(ant.x - post.x, ant.y - post.y) * 180 / Math.PI) + '°');
    } else dessiner();
  }, true);
  window.addEventListener('resize', echelle);

  return {
    // g = [{ cote, dx, rapport (repere_talon), positions, indices, longueur_mm, boite }] ; vide = rien à montrer
    afficher(g) { groupes = (g || []).filter((x) => x && x.rapport && x.positions); dessiner(); },
    relief() { for (const o of racine.children) o.scale.z = relief(); echelle(); demanderRendu(); },
    reset() { etats.clear(); groupes = []; palpation = null; vider(); carte(); },
    axeDe(cote) { const g = groupes.find((x) => x.cote === cote), e = g && etatDe(g); return e ? { axe: e.etat.axe, tetes: e.etat.tetes, valide: !!e.etat.axe.valide, rep: g.rapport.repere_talon } : null; }, // lot 4 bis, étape 5 : le mannequin lit l'axe courant
    importer(cote, o) { // V1 : remet un axe enregistré (réouverture d'un plan du bilan) ; en attente si le pied n'est pas encore affiché
      if (!o || typeof o !== 'object' || !o.tetes) return false;
      const { tetes, ...axe } = o, valeur = { axe, tetes: JSON.parse(JSON.stringify(tetes)) }, e = etats.get(cote);
      if (e) { e.etat = valeur; dessiner(); } else aRestaurer.set(cote, valeur);
      return true;
    },
    exporter() { const o = {}; for (const [c, e] of etats) o[c] = enregistrer(e.etat); return Object.keys(o).length ? o : undefined; },
    actif: () => $('henke-on').checked && !!palpation,
    ecran: () => ({ // aide de vérification (scripts de contrôle navigateur)
      actif: $('henke-on').checked, palpation: palpation ? palpation.points.length : null, info: $('henke-info').textContent, bandeau: !$('henke-bandeau').hidden,
      etats: Object.fromEntries([...etats].map(([c, e]) => [c, { ...resumerAxe(e.etat), p0: e.etat.axe.p0, tetes: e.etat.tetes, axe: e.etat.axe }])),
      objets: racine.children.flatMap((o) => o.children.map((q) => ({ ...q.userData, type: q.geometry && q.geometry.type }))),
      reperes: poignees.filter((q) => !q.fixe).map((q) => { const w = new THREE.Vector3(); q.mesh.getWorldPosition(w); w.project(camera); const r = dom.getBoundingClientRect(); return { cote: q.cote, nom: q.nom, x: r.left + ((w.x + 1) / 2) * r.width, y: r.top + ((1 - w.y) / 2) * r.height }; }),
    }),
  };
}
