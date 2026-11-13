// Édition directe dans la 3D (lot 4b) : Annuler / Rétablir, points curseurs au 1/10 mm, glisser-déposer des éléments, poignées (largeur, longueur, rotation, rayon).
// Toute la géométrie est dans calcul/poignees.js (pur, testé) et la pile dans calcul/historique.js (pur, testé) ; ce module ne fait que lire le pointeur et dessiner.
// Branché sur viewer.js par un pont (voir la fin de viewer.js), comme deuxpieds.js.
import { historiqueNeuf, valider, annuler, retablir, courant, peutAnnuler, peutRetablir } from '../calcul/historique.js';
import { TYPES_ELEMENTS } from '../calcul/elements.js';
import { capacites, pivotPlan, reglagesPourPivot, poigneesLocales, glisserPoignee, contient, aire, localVersPlan, contourLocal, medial } from '../calcul/poignees.js';

const COUL = { element: 0x7c3aed, point: 0xf59e0b, choisi: 0x0b1b3a, etire: 0x16a34a, tourne: 0x2563eb, rayon: 0xdc2626, contour: 0x0b1b3a };
const arrondi = (v) => Math.round(v * 10) / 10;
const DEGAGEMENT_POINT = 14; // hauteur (unités de la scène) à laquelle flotte la poignée d'un point curseur au-dessus de la surface

export function initEdition3d(P) {
  const { $, THREE, scene, camera, controls, renderer, noter, fr, echapper } = P;
  const dom = renderer.domElement;
  let h = null, restaurant = false, outil = 'select', sel = null, drag = null, clic = null, survol = null, minuteurPas = null, dernierRayon = 10;
  const groupe = new THREE.Group(), decor = new THREE.Group();
  groupe.renderOrder = 20; decor.renderOrder = 19; scene.add(groupe, decor);
  const rc = new THREE.Raycaster();
  const els = () => P.get().elements;
  const geoRaw = (e) => { const T = TYPES_ELEMENTS[e.type]; return { ...T.defauts, ...e, angle_plan_deg: e.angle_plan_deg || 0 }; };

  // ---------------------------------------------------------------- Annuler / Rétablir
  function instantane() {
    try {
      const deux = P.deux.instantane(), base = deux ? null : P.baseParams();
      return { elements: JSON.parse(JSON.stringify(els())), base, deux };
    } catch (err) { void err; return null; } // un champ de base en cours de saisie (illisible) : pas de pas
  }
  const pret = () => !!P.get().baseAffichee;
  function assurerBase() { if (!h && pret() && !restaurant) { const s = instantane(); if (s) h = historiqueNeuf(s); majBoutons(); } }
  function enregistrer() {
    clearTimeout(minuteurPas); minuteurPas = null;
    if (restaurant || !pret()) return;
    const s = instantane(); if (!s) return;
    h = h ? valider(h, s) : historiqueNeuf(s);
    majBoutons();
  }
  const enregistrerBientot = (ms = 0) => { clearTimeout(minuteurPas); minuteurPas = setTimeout(enregistrer, ms); };
  function majBoutons() {
    $('btn-annuler').disabled = !(h && peutAnnuler(h)); $('btn-retablir').disabled = !(h && peutRetablir(h));
    $('btn-annuler').title = 'Annuler (Ctrl+Z)' + (h ? ' — ' + (h.i) + ' pas' : ''); $('btn-retablir').title = 'Rétablir (Ctrl+Maj+Z)' + (h ? ' — ' + (h.pile.length - 1 - h.i) + ' pas' : '');
  }
  async function restaurer(s) {
    restaurant = true;
    try {
      P.mettre({ elements: s.elements.map((e) => ({ ...e })), dernierModifie: null });
      sel = null;
      if (s.deux) P.deux.restaurer(s.deux); else P.ecrireBaseParams(s.base);
      P.dessinerCartes();
      if (P.deux.actif()) await P.deux.calculer(); else await P.reconstruire();
    } finally { restaurant = false; }
  }
  async function revenir(sens) {
    if (drag) return;
    if (minuteurPas) enregistrer();
    if (!h) return;
    const avant = h; h = sens < 0 ? annuler(h) : retablir(h);
    if (h === avant) return;
    majBoutons();
    await restaurer(courant(h));
    noter('modification', (sens < 0 ? 'Annuler' : 'Rétablir') + ' : retour au pas ' + h.i + ' sur ' + (h.pile.length - 1));
  }
  $('btn-annuler').onclick = () => revenir(-1);
  $('btn-retablir').onclick = () => revenir(1);

  // Les pas du plan : tout champ validé, tout bouton de la liste d'éléments, ajout, suggestion, case de dérogation.
  for (const ev of ['pointerdown', 'focusin', 'keydown']) document.addEventListener(ev, assurerBase, true); // l'état AVANT le geste devient la base de la pile
  document.addEventListener('change', (e) => { if (!e.target.closest || !e.target.closest('#p-scan, #journal, header')) enregistrerBientot(0); });
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#liste-elements button, #btn-el-ajouter, #sugg-voute button, #chk-deroge')) enregistrerBientot(0); }, true); // en capture : le bouton « Retirer » disparaît du DOM pendant son propre clic

  // ---------------------------------------------------------------- pieds affichés
  function pieds() {
    const G = P.get(); if (!G.baseRapport || !G.baseAffichee) return [];
    const v = P.deux.vue();
    const entree = (cote, rapport, off, filtre) => ({ cote, med: medial(cote), rapport, off, rep: rapport.repere_talon, appartient: filtre });
    if (!v) return G.coteConfirme ? [entree(G.coteConfirme, G.baseRapport, 0, () => true)] : [];
    if (v.onglet === '3D') return ['D', 'G'].map((c) => entree(c, v.R[c].rapport, v.dx[c], (e) => e.portee === 'commun' || e.portee === c));
    return [entree(v.onglet, v.R[v.onglet].rapport, 0, (e) => e.portee === 'commun' || e.portee === v.onglet)];
  }
  const piedEn = (X) => { const L = pieds(); if (L.length === 2) return L.find((f) => f.cote === (X >= 0 ? 'D' : 'G')); return L[0]; };

  // ---------------------------------------------------------------- lancer de rayon
  function viser(ev) {
    const r = dom.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
  }
  const maille = () => P.getMaille();
  const prioritaire = (hits) => hits.find((t) => t.object.userData.genre !== 'deplace') || hits.find((t) => t.object.userData.id === 'pied') || hits[0]; // bille / poignée > pied > anneau
  function surMaille() { const m = maille(); if (!m) return null; const x = rc.intersectObject(m, false)[0]; return x ? x.point : null; }
  function surPlan(zPlan) { const v = new THREE.Vector3(); return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -zPlan), v) ? v : null; }
  function hauteurEn(x, y) { const m = maille(); if (!m) return 0; rc.set(new THREE.Vector3(x, y, 400), new THREE.Vector3(0, 0, -1)); const t = rc.intersectObject(m, false)[0]; return t ? t.point.z : 0; }
  const sensBord = (f, T) => ((T.bords && T.bords.includes('medial')) ? f.med : -f.med); // direction axe du pied -> bord de l'élément
  // Vrai bord du pied (côté s : -1 = -X, +1 = +X) à la hauteur y : rayons horizontaux depuis l'extérieur, à plusieurs hauteurs ; on garde le point le PLUS EXTÉRIEUR.
  // (Le premier rayon qui touche ne suffit pas : sur une base thermoformée, dans la zone de la voûte, le dessous est relevé ; un rayon bas passe sous le pied et touche l'autre paroi.)
  const HAUTEURS_RAYON = [0.5, 1, 2, 3, 5, 8, 12, 16, 22, 30];
  function bordExtreme(f, y, s) {
    const m = maille(); if (!m) return null; let best = null;
    for (const z of HAUTEURS_RAYON) {
      rc.set(new THREE.Vector3(f.off + f.rep.x_mm + s * 200, y, z * Number($('relief').value)), new THREE.Vector3(-s, 0, 0));
      const t = rc.intersectObject(m, false)[0]; if (t && (best === null || (s < 0 ? t.point.x < best : t.point.x > best))) best = t.point.x;
    }
    return best;
  }
  function bordX(f, y, T, el) { // vrai bord du pied (médial ou latéral) à la hauteur y
    const cote = T.coteHaut ? T.coteHaut : (T.bords && T.bords.includes('medial') ? 'medial' : 'lateral');
    const x = bordExtreme(f, y, cote === 'medial' ? f.med : -f.med); void el;
    return x === null ? f.off + f.rep.x_mm : x;
  }

  // ---------------------------------------------------------------- dessin des repères
  const mat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, transparent: true, opacity: o });
  const geoSphere = new THREE.SphereGeometry(1, 16, 12), geoBoite = new THREE.BoxGeometry(1, 1, 1);
  function repere(geo, couleur, x, y, z, px, data) { const m = new THREE.Mesh(geo, mat(couleur)); m.position.set(x, y, z); m.renderOrder = 21; m.userData = { ...data, px }; groupe.add(m); return m; }
  function contourTrace(f, e, T, c, z, couleur, epais) {
    const g = contourLocal(e, T), pts = [];
    const vers = (a, b) => { const w = localVersPlan(a, b, e.angle_plan_deg || 0, f.med); return new THREE.Vector3(f.off + c.x + w.x, c.y + w.y, z); };
    if (g.cercle !== undefined) for (let k = 0; k < 64; k++) pts.push(vers(g.cercle * Math.cos((k / 64) * 2 * Math.PI), g.cercle * Math.sin((k / 64) * 2 * Math.PI)));
    else for (const [a, b] of g.rect) pts.push(vers(a, b));
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: couleur, depthTest: false, transparent: true, opacity: epais ? 0.95 : 0.55 }));
    l.renderOrder = 19; decor.add(l);
  }
  function vider(g) { for (const o of [...g.children]) { g.remove(o); if (o.geometry && o.geometry !== geoSphere && o.geometry !== geoBoite) o.geometry.dispose(); if (o.material) o.material.dispose(); } }
  function reconstruire() {
    vider(groupe); vider(decor);
    const L = pieds(), liste = els();
    if (L.length && maille()) {
      for (const f of L) {
        const n = liste.filter(f.appartient).length;
        void n; if (!f.rep) continue; // les repères s'affichent tout de suite (avant la fin du calcul), d'après le repère talon du dernier rapport
        liste.forEach((e, i) => {
          if (!f.appartient(e) || e.visible === false) return;
          const T = TYPES_ELEMENTS[e.type]; if (!T || T.recouvrement || T.pinceau) return; // le pinceau n'a ni poignée ni repère
          const g = geoRaw(e), cap = capacites(T, g), c = pivotPlan(g, T, f.rep, f.med), estSel = i === sel;
          const bordCap = !!cap.bord;
          const cx = bordCap ? bordX(f, c.y, T, g) - f.off : c.x;
          const z = hauteurEn(f.off + cx, c.y) + 0.6, X = f.off + cx;
          // point curseur : poignée FLOTTANT au-dessus de la semelle (visible de profil, comme une rangée de billes) ; elle monte et descend avec la surface
          const zg = T.point ? z + DEGAGEMENT_POINT : z;
          if (T.point) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X, c.y, z), new THREE.Vector3(X, c.y, zg)]), new THREE.LineBasicMaterial({ color: estSel ? COUL.choisi : COUL.point, depthTest: false, transparent: true, opacity: 0.55 })); l.renderOrder = 19; decor.add(l); }
          repere(geoSphere, estSel ? COUL.choisi : (T.point ? COUL.point : COUL.element), X, c.y, zg, estSel ? 5.5 : 4.2, { genre: 'grip', i, cote: f.cote });
          if (T.point) { // pied du point (au sol) + anneau du cercle : saisissables pour DÉPLACER le point sur la surface
            const pied = repere(geoSphere, 0xffffff, X, c.y, z, 3, { genre: 'deplace', id: 'pied', i, cote: f.cote }); pied.material.color.set(0xffffff);
            const r = g.rayon_mm, anneau = new THREE.Mesh(new THREE.RingGeometry(Math.max(0.5, r - 3), r + 3, 64), new THREE.MeshBasicMaterial({ color: COUL.point, transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
            anneau.position.set(X, c.y, z); anneau.renderOrder = 20; anneau.userData = { genre: 'deplace', id: 'anneau', i, cote: f.cote, px: 0 }; groupe.add(anneau);
          }
          if (T.point || estSel) if (!bordCap) contourTrace(f, g, T, c, z, estSel ? COUL.contour : (T.point ? COUL.point : COUL.element), estSel);
          if (estSel) {
            for (const hd of poigneesLocales(g, T)) {
              let hx, hy;
              if (hd.id === 'W+') { hx = X - sensBord(f, T) * g.largeur_mm; hy = c.y; } // bord : poignée d'étendue, vers l'intérieur du pied (dans le sens du bord externe)
              else if (bordCap) { hx = X; hy = c.y + (hd.id === 'L+' ? 1 : -1) * (g.longueur_mm / 2); } else { const w = localVersPlan(hd.a, hd.b, g.angle_plan_deg, f.med); hx = X + w.x; hy = c.y + w.y; }
              const hz = hauteurEn(hx, hy) + 0.6, col = hd.id === 'rot' ? COUL.tourne : hd.id === 'R' ? COUL.rayon : COUL.etire;
              if (hd.id === 'W+') { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X, c.y, z), new THREE.Vector3(hx, hy, hz)]), new THREE.LineBasicMaterial({ color: COUL.etire, depthTest: false, transparent: true, opacity: 0.8 })); l.renderOrder = 19; decor.add(l); }
              repere(hd.id === 'rot' ? geoSphere : geoBoite, col, hx, hy, hz, hd.id === 'rot' ? 4.2 : 6.5, { genre: 'poignee', id: hd.id, i, cote: f.cote });
              if (hd.id === 'rot') { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(X, c.y, z), new THREE.Vector3(hx, hy, hz)]), new THREE.LineBasicMaterial({ color: COUL.tourne, depthTest: false, transparent: true, opacity: 0.8 })); l.renderOrder = 19; decor.add(l); }
            }
          }
        });
      }
    }
    echelle(); majHud(); P.demanderRendu();
  }
  function echelle() { // taille constante à l'écran
    for (const o of groupe.children) { if (!o.userData.px) continue; const d = camera.position.distanceTo(o.position), s = d * 0.0105 * (o.userData.px / 5); o.scale.set(s, s, s); }
  }
  controls.addEventListener('change', () => { if (groupe.children.length) { echelle(); } });

  // ---------------------------------------------------------------- sélection, HUD
  function nomElement(i) { const e = els()[i]; return (i + 1) + '. ' + (TYPES_ELEMENTS[e.type] ? TYPES_ELEMENTS[e.type].libelle : e.type); }
  function majHud() {
    const d = $('hud-edition'), e = sel !== null ? els()[sel] : null;
    if (sel !== null && !e) sel = null;
    const L = [];
    if (outil === 'point') L.push('<b>Point curseur</b> : cliquez sur la semelle pour poser un point ; tirez-le ensuite vers le haut ou le bas pour monter ou descendre la semelle à cet endroit.');
    if (e) {
      const T = TYPES_ELEMENTS[e.type], g = geoRaw(e);
      const port = e.portee ? (e.portee === 'commun' ? 'Commun (2 pieds)' : 'Pied ' + e.portee + ' seul') : '';
      L.push('<b>' + echapper(nomElement(sel)) + '</b>' + (port ? ' · ' + port : '') + (e.visible === false ? ' · masqué' : ''));
      if (T.point) L.push('bille : tirer haut / bas = hauteur · point blanc ou cercle : tirer = déplacer sur la semelle<br>hauteur <b>' + (g.hauteur_mm > 0 ? '+' : '') + fr(g.hauteur_mm, 1) + ' mm</b> · rayon ' + fr(g.rayon_mm, 1) + ' mm · à ' + fr(g.dy_mm, 1) + ' mm du talon, ' + fr(g.dx_mm, 1) + ' mm vers le médial');
      else if (T.skive) L.push('skive de Kirby de ' + fr(e.profondeur_mm, 1) + ' mm · bord ' + (e.bord_skive === 'medial' ? 'médial' : 'latéral') + ' · pente ' + fr(e.angle_skive_deg, 0) + '° — réglages dans la carte de l\'élément')
      else if (T.torsion) L.push('torsion de ' + fr(e.phi_deg, 1) + '° autour de l\'axe de Henke · zone ' + ({ totale: 'toute la semelle', arriere: 'arrière-pied', avant: 'avant-pied' })[e.zone_torsion] + ' — réglages dans la carte de l\'élément')
      else if (T.pinceau) L.push((e.coups || []).length + ' passage(s) · rayon ' + fr((e.coups && e.coups[0] ? e.coups[0].rayon_mm : 0), 1) + ' mm · ' + (e.coups && e.coups[0] && e.coups[0].mode === 'remplir' ? 'remplissage' : 'lissage') + ' — « Annuler » ou « Retirer » défait la retouche');
      else if (!T.bord && !T.coteHaut) L.push(fr(g.largeur_mm, 1) + ' × ' + fr(g.longueur_mm, 1) + ' mm · rotation ' + fr(g.angle_plan_deg || 0, 0) + '° · à ' + fr(g.dy_mm, 1) + ' mm du talon, ' + fr(g.dx_mm, 1) + ' mm vers le médial');
      else L.push('longueur ' + fr(g.longueur_mm, 1) + ' mm · début à ' + fr(g.dy_mm, 1) + ' mm du talon');
    }
    d.innerHTML = L.join('<br>'); d.hidden = L.length === 0;
  }
  function marquerCartes() {
    document.querySelectorAll('#liste-elements .el').forEach((c) => c.classList.toggle('sel', sel !== null && Number(c.dataset.i) === sel));
  }
  function selectionner(i, { defiler = false } = {}) {
    sel = i; marquerCartes(); reconstruire();
    if (defiler && i !== null) { const c = document.querySelector('#liste-elements .el[data-i="' + i + '"]'); if (c) c.scrollIntoView({ block: 'nearest' }); }
  }
  $('liste-elements').addEventListener('click', (ev) => { const c = ev.target.closest('.el'); if (c && !ev.target.closest('button')) { const i = Number(c.dataset.i); if (i !== sel) selectionner(i); } });

  function choisirOutil(o) {
    outil = o; $('outil-select').classList.toggle('on', o === 'select'); $('outil-point').classList.toggle('on', o === 'point');
    $('vue').classList.toggle('mode-point', o === 'point'); majHud();
  }
  $('btn-rangee').onclick = () => poserRangee(Math.max(3, Math.min(15, Math.round(Number($('rangee-n').value) || 9))));
  $('outil-select').onclick = () => choisirOutil('select');
  $('outil-point').onclick = () => { if (!pret() || !pieds().length) { $('etat').textContent = 'Construisez d\'abord la base pour poser des points.'; return; } choisirOutil(outil === 'point' ? 'select' : 'point'); };

  // ---------------------------------------------------------------- points curseurs
  async function poserPoint(f, Xp, Yp) {
    const T = TYPES_ELEMENTS.point_curseur;
    const p = { type: 'point_curseur', ...T.defauts, dx_mm: arrondi(f.med * (Xp - f.rep.x_mm)), dy_mm: arrondi(Yp - f.rep.y_mm), hauteur_mm: 0, rayon_mm: dernierRayon, materiau_id: null, shore_a: null, visible: true };
    if (P.deux.actif()) { const v = P.deux.portee(); p.portee = v === 'commun' ? 'commun' : f.cote; p.uid = P.deux.nouvelUid(); }
    assurerBase();
    const { i, calcul } = P.ajouter('point_curseur', p);
    selectionner(i, { defiler: true });
    choisirOutil('select');
    noter('creation', 'point curseur posé : ' + fr(p.hauteur_mm, 1) + ' mm, rayon ' + fr(p.rayon_mm, 1) + ' mm' + (p.portee ? ' (portée : ' + p.portee + ')' : ''));
    await calcul; enregistrer();
  }
  // Pinceau (lot 4d) : un geste = UN élément « pinceau » = UN pas dans Annuler. Toujours propre au pied peint (la retouche dépend du relief de CE scan).
  async function poserPinceau(f, coups) {
    const T = TYPES_ELEMENTS.pinceau;
    const p = { type: 'pinceau', ...T.defauts, coups, materiau_id: null, shore_a: null, visible: true };
    if (P.deux.actif()) { p.portee = f.cote; p.uid = P.deux.nouvelUid(); }
    assurerBase();
    const { i, calcul } = P.ajouter('pinceau', p);
    selectionner(i);
    noter('creation', 'pinceau : ' + coups.length + ' passage(s), rayon ' + fr(coups[0].rayon_mm, 1) + ' mm, ' + (coups[0].mode === 'remplir' ? 'remplissage' : 'lissage') + (p.portee ? ' (pied ' + p.portee + ')' : ''));
    await calcul; enregistrer();
  }
  // Rangée de points : N poignées à 0 mm le long de l'axe du pied (de 8 % à 92 % de la longueur), à tirer une à une vers le haut ou le bas.
  function rayonBord(f, y, cote) { // x du bord médial / latéral à la hauteur y ; null si pas de maillage
    const x = bordExtreme(f, y, cote === 'medial' ? f.med : -f.med); return x === null ? null : x - f.off;
  }
  async function poserRangee(n) {
    const L = pieds(); if (!pret() || !L.length) { $('etat').textContent = 'Construisez d\'abord la base pour poser des points.'; return; }
    const f = L[0], T = TYPES_ELEMENTS.point_curseur;
    const lon = (f.rapport.bbox ? f.rapport.bbox.max[1] - f.rapport.bbox.min[1] : 260);
    const y0 = lon * 0.08, y1 = lon * 0.92, pasY = (y1 - y0) / (n - 1), ray = Math.max(4, Math.min(60, Math.round(pasY * 0.9 * 10) / 10));
    assurerBase();
    const aj = [];
    for (let k = 0; k < n; k++) {
      const y = y0 + k * pasY, a = rayonBord(f, f.rep.y_mm + y, 'medial'), b = rayonBord(f, f.rep.y_mm + y, 'lateral');
      const xc = a !== null && b !== null ? (a + b) / 2 : f.rep.x_mm;
      const p = { type: 'point_curseur', ...T.defauts, dx_mm: arrondi(f.med * (xc - f.rep.x_mm)), dy_mm: arrondi(y), hauteur_mm: 0, rayon_mm: ray, materiau_id: null, shore_a: null, visible: true };
      if (P.deux.actif()) { const v = P.deux.portee(); p.portee = v === 'commun' ? 'commun' : f.cote; } // l'uid est donné par ajouterPlusieurs
      aj.push(p);
    }
    P.ajouterPlusieurs(aj); noter('creation', n + ' points curseurs posés en rangée (à 0 mm, rayon ' + fr(ray, 1) + ' mm) : tirez-les vers le haut ou le bas');
    await P.attendreCalcul(); enregistrer();
  }
  function reglerHauteur(delta) {
    const e = sel !== null ? els()[sel] : null; if (!e || e.type !== 'point_curseur') return false;
    assurerBase();
    let v = arrondi((Number.isFinite(e.hauteur_mm) ? e.hauteur_mm : 1) + delta);
    if (Math.abs(v) < 0.05) v = delta > 0 ? 0.1 : -0.1; // un point à 0 ne ferait rien : on saute
    v = Math.max(-8, Math.min(8, v));
    P.modifier(sel, { hauteur_mm: v }); majHud(); enregistrerBientot(700);
    return true;
  }

  // ---------------------------------------------------------------- glisser-déposer
  function pointeurPlan(ev, zRef) { viser(ev); const m = surMaille(); if (m) return { X: m.x, Y: m.y }; const p = surPlan(zRef); return p ? { X: p.x, Y: p.y } : null; }
  function debuter(data, ev, objet) {
    const f = pieds().find((x) => x.cote === data.cote); if (!f) return;
    const e = els()[data.i]; if (!e) return;
    assurerBase();
    if (sel !== data.i) selectionner(data.i, { defiler: true });
    const p = pointeurPlan(ev, objet.position.z) || { X: objet.position.x, Y: objet.position.y };
    const estPoint = !!TYPES_ELEMENTS[e.type].point, modeHauteur = data.genre === 'grip' && estPoint && !ev.shiftKey; // bille = hauteur ; pied / anneau (ou Maj + bille) = déplacement
    const proj0 = (() => { const r = dom.getBoundingClientRect(), q = objet.position.clone().project(camera), q1 = objet.position.clone().add(new THREE.Vector3(0, 0, 1)).project(camera); return { vx: ((q1.x - q.x) / 2) * r.width, vy: (-(q1.y - q.y) / 2) * r.height }; })();
    drag = { ...data, modeHauteur, ex: ev.clientX, ey: ev.clientY, vz: proj0, h0: Number.isFinite(e.hauteur_mm) ? e.hauteur_mm : 0, f, depart: { ...e }, cles: new Set(), offX: objet.position.x - p.X, offY: objet.position.y - p.Y, zRef: objet.position.z, occupe: false, dernier: null, bon: null, bouge: false };
    controls.enabled = false; dom.setPointerCapture && ev.pointerId !== undefined && dom.setPointerCapture(ev.pointerId); dom.style.cursor = 'grabbing';
  }
  function patchPour(ev) {
    if (drag.modeHauteur) { // tirer le point vers le haut / le bas de l'écran : monte / descend la semelle à cet endroit (au 1/10 mm), dans toutes les vues
      const dX = ev.clientX - drag.ex, dY = ev.clientY - drag.ey, v = drag.vz, n2 = v.vx * v.vx + v.vy * v.vy;
      const dz = n2 > 16 ? (dX * v.vx + dY * v.vy) / n2 / Number($('relief').value) : -dY * 0.05; // vue de dessus : 0,05 mm par pixel
      return { hauteur_mm: Math.max(-8, Math.min(8, arrondi(drag.h0 + dz))) };
    }
    const p = pointeurPlan(ev, drag.zRef); if (!p) return null;
    const f = drag.f, e = els()[drag.i], T = TYPES_ELEMENTS[e.type], g = geoRaw(e);
    const Xp = p.X - f.off, Yp = p.Y;
    if (drag.genre === 'grip' || drag.genre === 'deplace') return reglagesPourPivot(g, T, f.rep, f.med, Xp + drag.offX, Yp + drag.offY);
    if (drag.id === 'W+') return glisserPoignee(g, T, f.rep, f.med, 'W+', Xp, Yp, undefined, { bordX: bordX(f, pivotPlan(g, T, f.rep, f.med).y, T, g) - f.off });
    return glisserPoignee(g, T, f.rep, f.med, drag.id, Xp, Yp);
  }
  async function pousser() {
    if (drag.occupe) return; drag.occupe = true;
    try { while (drag && drag.dernier) { const patch = drag.dernier; drag.dernier = null; for (const k of Object.keys(patch)) drag.cles.add(k); await P.modifier(drag.i, patch); if ($('el-msg').textContent === '') drag.bon = patch; } } finally { if (drag) drag.occupe = false; }
  }
  function onMove(ev) {
    if (drag) {
      const patch = patchPour(ev); if (!patch || !Object.keys(patch).length) return;
      drag.bouge = true; drag.dernier = patch; pousser(); return;
    }
    if (ev.target !== dom || !pieds().length) return;
    viser(ev); const t = prioritaire(rc.intersectObjects(groupe.children, false));
    survol = t ? t.object.userData : null; dom.style.cursor = t ? (t.object.userData.genre === 'poignee' ? 'pointer' : 'grab') : (outil === 'point' ? 'crosshair' : '');
  }
  async function onUp(ev) {
    if (drag) {
      const d = drag; dom.releasePointerCapture && ev.pointerId !== undefined && dom.hasPointerCapture && dom.hasPointerCapture(ev.pointerId) && dom.releasePointerCapture(ev.pointerId);
      while (d.occupe || d.dernier) { if (d.dernier && !d.occupe) pousser(); await new Promise((r) => setTimeout(r, 15)); }
      drag = null; controls.enabled = true; dom.style.cursor = '';
      if ($('el-msg').textContent !== '') { // dernier calcul refusé (hors du contour…) : on revient à la dernière valeur acceptée
        const retour = d.bon || Object.fromEntries([...d.cles].map((k) => [k, d.depart[k]]));
        await P.modifier(d.i, retour);
      }
      if (d.bouge) {
        const e = els()[d.i]; if (e && e.type === 'point_curseur' && d.id === 'R') dernierRayon = e.rayon_mm;
        noter('modification', nomElement(d.i) + ' : ' + (d.modeHauteur ? 'hauteur ' + fr(els()[d.i].hauteur_mm, 1) + ' mm' : d.genre === 'grip' || d.genre === 'deplace' ? 'déplacé' : { rot: 'tourné', R: 'rayon changé', 'W+': 'élargi', 'W-': 'élargi', 'L+': 'allongé', 'L-': 'allongé' }[d.id]) + ' à la souris');
        enregistrer();
      }
      reconstruire(); return;
    }
    if (clic) { // simple clic (sans glisser) sur la semelle
      const c = clic; clic = null;
      if (Math.hypot(ev.clientX - c.x, ev.clientY - c.y) > 4 || ev.target !== dom) return;
      viser(ev); const m = surMaille(); if (!m) { if (outil === 'select') selectionner(null); return; }
      const f = piedEn(m.x); if (!f) return;
      const Xp = m.x - f.off, Yp = m.y;
      if (outil === 'point') { await poserPoint(f, Xp, Yp); return; }
      const liste = els(); let meilleur = null, aMin = Infinity;
      liste.forEach((e, i) => { if (!f.appartient(e) || e.visible === false || TYPES_ELEMENTS[e.type].pinceau) return; const T = TYPES_ELEMENTS[e.type], g = geoRaw(e); if (contient(g, T, f.rep, f.med, Xp, Yp) && aire(g, T) < aMin) { aMin = aire(g, T); meilleur = i; } });
      selectionner(meilleur, { defiler: true });
    }
  }
  dom.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !pieds().length || (P.mesureActive && P.mesureActive())) return; // outil Mesure actif : le clic lui appartient
    viser(ev); const t = prioritaire(rc.intersectObjects(groupe.children, false));
    if (t) { ev.stopImmediatePropagation(); ev.preventDefault(); debuter(t.object.userData, ev, t.object); return; }
    clic = { x: ev.clientX, y: ev.clientY };
  }, true);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', () => { if (drag) onUp({ clientX: 0, clientY: 0 }); });

  // molette sur le point sélectionné (ou Maj/Alt + molette n'importe où) = hauteur ; sinon zoom normal
  $('vue').addEventListener('wheel', (ev) => {
    if (sel === null) return;
    const e = els()[sel]; if (!e || e.type !== 'point_curseur') return;
    const dessus = survol && survol.genre === 'grip' && survol.i === sel;
    if (!(dessus || ev.shiftKey || ev.altKey)) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    reglerHauteur((ev.deltaY < 0 ? 1 : -1) * 0.1);
  }, { capture: true, passive: false });

  document.addEventListener('keydown', (ev) => {
    const t = ev.target, saisie = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((ev.ctrlKey || ev.metaKey) && !saisie && (ev.key === 'z' || ev.key === 'Z' || ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); revenir(ev.key === 'y' || ev.key === 'Y' || ev.shiftKey ? 1 : -1); return; }
    if (saisie) return;
    if (ev.key === 'Escape') { if (outil === 'point') choisirOutil('select'); else if (sel !== null) selectionner(null); return; }
    if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && sel !== null && reglerHauteur((ev.key === 'ArrowUp' ? 1 : -1) * (ev.shiftKey ? 1 : 0.1))) ev.preventDefault();
  });

  return {
    surAffichage: () => reconstruire(),
    surCartes: () => { marquerCartes(); reconstruire(); },
    reset: () => { h = null; sel = null; drag = null; clic = null; clearTimeout(minuteurPas); minuteurPas = null; controls.enabled = true; choisirOutil('select'); vider(groupe); vider(decor); majBoutons(); majHud(); },
    selectionner, enregistrer, revenir, etat: () => ({ outil, sel, pas: h ? h.pile.length : 0, i: h ? h.i : -1, glisse: !!drag, drag: drag ? { genre: drag.genre, id: drag.id, mh: drag.modeHauteur, bouge: drag.bouge, occupe: drag.occupe, cles: [...drag.cles] } : null }),
    reglerHauteur, choisirOutil, poserRangee, pieds, piedEn, poserPinceau,
    // aide de vérification (scripts de contrôle navigateur) : positions à l'écran des repères et projection d'un point du plan
    ecran: () => {
      const r = dom.getBoundingClientRect(), proj = (v) => { const q = v.clone().project(camera); return { x: r.left + ((q.x + 1) / 2) * r.width, y: r.top + ((1 - q.y) / 2) * r.height }; };
      return { reperes: groupe.children.map((o) => ({ ...o.userData, ...proj(o.position) })), projeter: (X, Y) => proj(new THREE.Vector3(X, Y, hauteurEn(X, Y))), pieds: pieds().map((f) => ({ cote: f.cote, off: f.off, rep: f.rep })) };
    },
  };
}
