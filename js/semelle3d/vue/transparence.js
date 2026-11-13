// Lot 4c : éléments en transparence (une couleur par élément, emprise exacte), ligne pointillée de l'isthme (corrigeable par 7 points curseurs), légende de dureté.
// Géométrie dans calcul/surimpression.js (pur, testé, calculé dans le worker) ; ce module ne fait que dessiner et lire le pointeur.
// Branché sur viewer.js par un pont (voir la fin de viewer.js), comme deuxpieds.js et edition3d.js.
import { decalagesEclatement, espaceValide, FANTOME } from '../calcul/apercu.js';
import { PALETTE_ELEMENTS, POINTS_ISTHME, teinteSuivante, couleurTeinte, pointsDeControle, ligneCorrigee } from '../calcul/surimpression.js';

const DEMI_BANDE_MM = 12; // course des points de la ligne de l'isthme (± mm), identique à calcul/surimpression.js (hauteursLigne)
const SOULEVE_MM = 0.15, SOULEVE_LIGNE_MM = 0.4;
const OPACITE_DEFAUT = 40;

export { teinteSuivante, couleurTeinte, PALETTE_ELEMENTS };

export function initTransparence(P) {
  const { $, THREE, scene, camera, controls, renderer, demanderRendu, couleurShore, echapper } = P;
  let eclat = false, espace = 12;      // lot 4d : vue éclatée (affichage seulement)
  const fantomes = new Map();          // lot 4d : clé de pied -> { positions, indices } | 'attente' | 'echec'
  const couleurDe = (e, k, teinte) => (e ? P.couleurElement(e, k) : couleurTeinte(teinte, k)); // un calcul en retard peut contenir un élément déjà retiré : on retombe sur sa teinte
  const dom = renderer.domElement;
  const racine = new THREE.Group(); racine.renderOrder = 8; scene.add(racine);
  let groupes = [];            // dernier contenu affiché : [{ pied, dx, liste, isthme }]
  let masques = new Set();     // teintes masquées à l'affichage (œil de la légende) ; ne change PAS le calcul
  const corrections = new Map(); // clé de pied ('m' = un pied) -> décalages (mm) des POINTS_ISTHME points
  let ctrls = [];              // points curseurs de la ligne : { cle, c, mesh, groupe }
  let drag = null;
  // Texture du noir marbré (photo fournie par Joël) : répétée en miroir (pas de couture visible)
  const textures = new Map();
  function texture(nom) {
    if (!nom) return null;
    if (!textures.has(nom)) {
      const t = new THREE.TextureLoader().load(new URL('../../../assets/semelle3d/' + nom + '.jpg', import.meta.url).href, () => demanderRendu());
      t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      textures.set(nom, t);
    }
    return textures.get(nom);
  }
  const ECHELLE_TEXTURE_MM = 280; // une image de la photo = 280 mm de semelle : la feuille couvre toute la semelle sans répétition visible (une feuille réelle n'a pas de motif répété)
  const avecUv = (geo, positions, paroi) => { // UV monde : dessus = (x, y) ; paroi = (x + y, z), pour que la tranche porte aussi le veinage
    const uv = new Float32Array((positions.length / 3) * 2);
    for (let v = 0; v < positions.length / 3; v++) { const x = positions[3 * v], y = positions[3 * v + 1], z = positions[3 * v + 2]; uv[2 * v] = (paroi ? x + y : x) / ECHELLE_TEXTURE_MM; uv[2 * v + 1] = (paroi ? z : y) / ECHELLE_TEXTURE_MM; }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  };
  // Recouvrement : matière LUSTRÉE qui reflète la lumière quand on tourne la semelle (comme la base). Les autres éléments restent mats (aplats lisibles).
  const brillant = (el) => !!el && el.type === 'recouvrement';
  // Éclairage d'ambiance de la matière lustrée : ciel dégradé + 2 fenêtres lumineuses (carte d'environnement générée, aucun fichier) -> reflets doux qui glissent quand on tourne la semelle
  let envLustre = null;
  function environnement() {
    if (envLustre) return envLustre;
    try {
      const sc = new THREE.Scene(), ciel = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
      const pos = ciel.geometry.attributes.position, col = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) { const t = (pos.getY(v) / 50 + 1) / 2; col[3 * v] = 0.25 + 0.85 * t; col[3 * v + 1] = 0.27 + 0.85 * t; col[3 * v + 2] = 0.32 + 0.9 * t; }
      ciel.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3)); sc.add(ciel);
      for (const [x, y, z, w, h] of [[-30, 22, 12, 26, 14], [26, 14, -22, 20, 10]]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(6, 6, 6), side: THREE.DoubleSide })); f.position.set(x, y, z); f.lookAt(0, 0, 0); sc.add(f); }
      const pm = new THREE.PMREMGenerator(renderer); envLustre = pm.fromScene(sc, 0.03).texture; pm.dispose();
    } catch (err) { void err; envLustre = null; } // sans carte d'environnement (matériel limité) : la matière reste lustrée par les lumières de la scène
    return envLustre;
  }
  const matiereBrillante = (opt) => new THREE.MeshPhysicalMaterial({ roughness: 0.34, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15, envMap: environnement(), envMapIntensity: 0.9, ...opt });
  const relief = () => Number($('relief').value) || 1;
  const cle = (g) => g.pied || 'm';

  // ---------------------------------------------------------------- nettoyage
  function vider() {
    for (const o of [...racine.children]) {
      racine.remove(o);
      o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); });
    }
    ctrls = [];
  }

  // ---------------------------------------------------------------- numéros d'élément (liste globale) pour un pied
  function indexGlobal(g, k) { // k = rang dans la liste du pied ; 2 pieds : seuls les éléments communs ou du pied comptent
    const els = P.get().elements;
    if (!g.pied) return k;
    const o = []; els.forEach((e, i) => { if (!e.portee || e.portee === 'commun' || e.portee === g.pied) o.push(i); });
    return o[k] === undefined ? k : o[k];
  }
  const selection = () => { const e = P.edition().etat(); return e ? e.sel : null; };

  // ---------------------------------------------------------------- dessin
  function surfaceZ(g, r, decalage) { // hauteur de la surface sous le point r de la ligne, décalé de `decalage` mm en x (bande envoyée par le worker)
    const b = g.isthme.bande, n = b.n, pas = b.pas;
    const c0 = Math.round((decalage + DEMI_BANDE_MM) / pas);
    for (let d = 0; d <= n; d++) for (const c of [c0 - d, c0 + d]) if (c >= 0 && c < n) { const v = b.z[r * n + c]; if (Number.isFinite(v)) return v; }
    return 0;
  }
  // Pointillé en ruban plat (largeur `demi`×2 mm, dans le plan) posé sur la surface : tirets de 3 mm, intervalles de 2,2 mm.
  function ruban(v, demi, couleur, ordre) {
    const m = v.length / 3, pos = [], idx = [], DASH = 3, GAP = 2.2;
    let cumul = 0, nv = 0, base = 0, ouvert = false;
    const sommet = (x, y, z, nx, ny) => { pos.push(x + nx * demi, y + ny * demi, z, x - nx * demi, y - ny * demi, z); nv += 2; if (nv >= 4) { const a = base + nv - 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } };
    for (let r = 0; r < m - 1; r++) {
      const x0 = v[3 * r], y0 = v[3 * r + 1], z0 = v[3 * r + 2], x1 = v[3 * r + 3], y1 = v[3 * r + 4], z1 = v[3 * r + 5];
      const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1e-9) continue;
      const nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
      let a = 0;
      while (a < L) {
        const phase = cumul % (DASH + GAP), enTrait = phase < DASH, reste = (enTrait ? DASH : DASH + GAP) - phase, b = Math.min(L, a + Math.max(reste, 1e-3));
        if (enTrait) {
          if (!ouvert) { base = pos.length / 3; nv = 0; ouvert = true; const t = a / L; sommet(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, nx, ny); }
          const t = b / L; sommet(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, z0 + (z1 - z0) * t, nx, ny);
        } else ouvert = false;
        cumul += b - a; a = b;
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3)); geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: couleur, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 - ordre * 0.1, polygonOffsetUnits: -4 }));
    mesh.renderOrder = ordre; return mesh;
  }
  function dessinerLigne(g, grp) {
    if (!$('isthme-on').checked || !g.isthme || !g.isthme.bande) return;
    const I = g.isthme, k = cle(g), dec = corrections.get(k) || new Array(POINTS_ISTHME).fill(0), pts = ligneCorrigee(I, dec), m = pts.length / 2;
    const ctl = pointsDeControle(I), decLigne = (r) => pts[2 * r] - I.points[2 * r];
    const v = new Float32Array(3 * m);
    for (let r = 0; r < m; r++) { v[3 * r] = pts[2 * r]; v[3 * r + 1] = pts[2 * r + 1]; v[3 * r + 2] = surfaceZ(g, r, decLigne(r)) + SOULEVE_LIGNE_MM; }
    const l = new THREE.Group(); l.userData = { role: 'isthme', pied: g.pied };
    l.add(ruban(v, 1.5, 0x0b1b3a, 30), ruban(v, 0.75, 0xffffff, 31)); // trait pointillé : liseré sombre + trait blanc (un trait de 1 px serait illisible)
    grp.add(l);
    ctl.forEach((c, i) => {
      const x = pts[2 * c.r], y = pts[2 * c.r + 1], z = v[3 * c.r + 2];
      const s = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      s.position.set(x, y, z); s.renderOrder = 31; s.userData = { role: 'isthme-point', pied: g.pied, c: i };
      const bord = new THREE.Mesh(new THREE.SphereGeometry(1.35, 14, 10), new THREE.MeshBasicMaterial({ color: 0x0b1b3a, depthTest: false })); bord.renderOrder = 30; s.add(bord);
      grp.add(s); ctrls.push({ cle: k, c: i, mesh: s, groupe: grp, g, r: c.r });
    });
  }
  // Pied fantôme : surface du scan (calculée par le worker, même repère que la semelle), gris transparent, légèrement au-dessus
  function dessinerFantome(g, grp) {
    const k = cle(g), f = fantomes.get(k);
    if (f === undefined) {
      fantomes.set(k, 'attente');
      P.demander(g.pied ? { type: 'fantome', pied: g.pied } : { type: 'fantome' })
        .then((r) => { fantomes.set(k, { positions: r.positions, indices: r.indices }); dessiner(); })
        .catch((err) => { fantomes.set(k, 'echec'); $('el-msg').textContent = 'pied fantôme : scan indisponible (' + err.message + ')'; });
      return;
    }
    if (typeof f === 'string') return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(f.positions, 3)); geo.setIndex(new THREE.BufferAttribute(f.indices, 1));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: FANTOME.couleur, transparent: true, opacity: FANTOME.opacite, depthWrite: false, side: THREE.DoubleSide }));
    m.position.z = FANTOME.souleve_mm; m.renderOrder = 40; m.userData = { role: 'fantome', pied: g.pied, opacite: FANTOME.opacite };
    grp.add(m);
  }
  function dessiner() {
    vider();
    const actif = $('transp-on').checked || eclat, aEclater = groupes.some((g) => g.liste.some((s) => s.cellules > 0));
    $('btn-eclater').disabled = !aEclater; if (!aEclater && eclat) { eclat = false; $('btn-eclater').classList.remove('on'); $('eclat-reglage').hidden = true; }
    $('fantome-on').disabled = groupes.length === 0;
    const alpha = Number($('transp-op').value) / 100, sel = selection();
    $('transp-op-val').textContent = Math.round(alpha * 100) + ' %';
    for (const g of groupes) {
      const grp = new THREE.Group(); grp.position.x = g.dx || 0; grp.scale.z = relief(); racine.add(grp);
      const lev = eclat ? decalagesEclatement(g.liste, g.strates, espace) : null;
      if ($('fantome-on').checked) dessinerFantome(g, grp);
      if (actif) g.liste.forEach((s, k) => {
        if (!s.visible || s.cellules === 0 || masques.has(s.teinte === null ? 'r' + k : s.teinte)) return;
        const aff = s.lisse && s.lisse.indices.length ? s.lisse : s; // contour lissé (affichage seulement) ; escalier de la grille en repli
        const el = P.get().elements[indexGlobal(g, k)], coul = new THREE.Color(couleurDe(el, k, s.teinte)), choisi = sel !== null && sel === indexGlobal(g, k);
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(aff.positions, 3)); geo.setIndex(new THREE.BufferAttribute(aff.indices, 1));
        const tex = texture(el && P.textureElement(el)); if (tex) avecUv(geo, aff.positions, false);
        const opt = { color: tex ? 0xffffff : coul, map: tex, transparent: true, opacity: Math.min(1, (choisi ? alpha + 0.3 : alpha) + (eclat ? 0.25 : 0)), depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
        const lustre = brillant(el); if (lustre) geo.computeVertexNormals(); // matière éclairée : il lui faut des normales
        const mesh = new THREE.Mesh(geo, lustre ? matiereBrillante(opt) : new THREE.MeshBasicMaterial(opt));
        mesh.renderOrder = 10 + k; mesh.userData = { role: 'emprise', index: indexGlobal(g, k), teinte: s.teinte, pied: g.pied, couleur: '#' + coul.getHexString(), texture: !!tex, brillant: lustre };
        if (lev) mesh.position.z = lev[k];
        grp.add(mesh);
        const c = Float32Array.from(aff.contour); for (let q = 2; q < c.length; q += 3) c[q] += SOULEVE_MM;
        const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(c, 3));
        const ls = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: coul })); ls.renderOrder = 20 + k; ls.userData = { role: 'liseré', index: indexGlobal(g, k), teinte: s.teinte };
        if (lev) ls.position.z = lev[k];
        grp.add(ls);
      });
      if (($('strates-on').checked || eclat) && g.strates) g.strates.forEach((S, k) => {
        if (S.positions.length === 0 || masques.has(S.teinte === null ? 'r' + k : S.teinte)) return;
        const el = P.get().elements[indexGlobal(g, k)], coul = new THREE.Color(couleurDe(el, k, S.teinte)), tex = texture(el && P.textureElement(el));
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(S.positions, 3)); geo.setIndex(new THREE.BufferAttribute(S.indices, 1));
        if (tex) avecUv(geo, S.positions, true);
        geo.computeVertexNormals();
        const optS = { color: tex ? 0xffffff : coul, map: tex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 };
        const m = new THREE.Mesh(geo, brillant(el) ? matiereBrillante(optS) : new THREE.MeshStandardMaterial({ ...optS, roughness: 0.7, metalness: 0 }));
        m.renderOrder = 5 + k; m.userData = { role: 'strate', index: indexGlobal(g, k), teinte: S.teinte, epaisseur_mm: S.epaisseur_max_mm, couleur: '#' + coul.getHexString(), texture: !!tex, brillant: brillant(el) };
        if (lev) m.position.z = lev[k];
        grp.add(m);
      });
      if (!eclat) dessinerLigne(g, grp);
    }
    echelle(); demanderRendu();
  }
  function echelle() { // points de la ligne : taille constante à l'écran (~6 px de rayon)
    for (const c of ctrls) {
      const w = new THREE.Vector3(); c.mesh.getWorldPosition(w);
      const d = camera.position.distanceTo(w), px = 7, h = dom.clientHeight || 600;
      const s = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * px) / h;
      c.mesh.scale.set(s, s, s / relief());
      c.mesh.visible = camera.position.z > 0; // vu de dessous, les points ne traversent pas la semelle
    }
  }
  controls.addEventListener('change', echelle);

  // ---------------------------------------------------------------- légende (liste des éléments + échelle de dureté)
  function legende() {
    const els = P.get().elements || [], zone = $('legende-3d');
    zone.hidden = els.length === 0 && !groupes.some((g) => g.isthme);
    const sel = selection();
    let h = '';
    els.forEach((e, i) => {
      const c = couleurDe(e, i), cache = masques.has(e.teinte === undefined ? 'r' + i : e.teinte);
      const nom = P.nomElement(e.type), sh = e.shore_a;
      h += '<div class="leg-ligne' + (sel === i ? ' sel' : '') + (cache ? ' cache' : '') + (e.visible === false ? ' inactif' : '') + (P.deux.autrePied(e) ? ' autre' : '') + '" data-i="' + i + '">'
        + '<span class="teinte" style="background:' + c + '" title="' + echapper(P.nomCouleur(e)) + '"></span><span class="leg-nom"><b>' + (i + 1) + '.</b> ' + echapper(nom) + '</span>'
        + '<span class="leg-shore"><span class="pastille" style="background:' + couleurShore(sh) + '"></span>' + (Number.isFinite(sh) ? 'Shore ' + String(sh).replace('.', ',') : 'Shore —') + '</span>'
        + '<button class="oeil" data-i="' + i + '" title="' + (cache ? 'Afficher' : 'Masquer') + ' la surimpression de cet élément (affichage seulement : la semelle ne change pas)">' + (cache ? '◌' : '◉') + '</button></div>';
    });
    $('leg-liste').innerHTML = h;
    els.forEach((e, i) => { const pc = document.querySelector('#liste-elements .el[data-i="' + i + '"] .carte-teinte'); if (pc) pc.style.background = couleurDe(e, i); }); // pastille de la carte = même couleur que la surimpression
    const infos = groupes.filter((g) => g.isthme).map((g) => (g.pied ? 'Pied ' + g.pied + ' : ' : '') + (g.isthme.methode === 'theorique' ? '⚠ trajet THÉORIQUE à confirmer (aucune voûte détectée : appui = 1/3 de la plus grande largeur). ' : 'ligne estimée sur l\'appui du scan : les ' + Math.round(100 * g.isthme.part) + ' % les plus externes de la zone sans appui sont comptés comme appui en charge. '));
    $('isthme-info').hidden = infos.length === 0 || !$('isthme-on').checked; $('isthme-info').innerHTML = infos.map((t) => '<div>' + echapper(t) + '</div>').join('');
  }
  function barreShore() {
    const stops = [5, 15, 25, 35, 45, 55, 70].map((s) => couleurShore(s));
    $('leg-barre').style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
  }
  barreShore();
  $('leg-liste').addEventListener('click', (ev) => {
    const o = ev.target.closest('.oeil');
    if (o) {
      const i = Number(o.dataset.i), e = P.get().elements[i]; if (!e) return;
      const k = e.teinte === undefined ? 'r' + i : e.teinte;
      if (masques.has(k)) masques.delete(k); else masques.add(k);
      legende(); dessiner(); return;
    }
    const l = ev.target.closest('.leg-ligne'); if (l) P.edition().selectionner(Number(l.dataset.i), { defiler: true });
  });
  for (const id of ['transp-on', 'transp-op', 'isthme-on', 'strates-on']) $(id).addEventListener('input', () => { dessiner(); legende(); });
  $('btn-eclater').onclick = () => { eclat = !eclat; $('btn-eclater').classList.toggle('on', eclat); $('eclat-reglage').hidden = !eclat; dessiner(); };
  $('eclat-esp').addEventListener('input', () => { espace = espaceValide($('eclat-esp').value); $('eclat-val').textContent = String(espace).replace('.', ',') + ' mm'; if (eclat) dessiner(); });
  $('fantome-on').addEventListener('input', () => { dessiner(); });
  $('isthme-reset').onclick = () => { corrections.clear(); dessiner(); P.noter('modification', 'ligne de l\'isthme : retour à la proposition du scan'); };
  new MutationObserver(() => { legende(); if ($('transp-on').checked) dessiner(); }).observe($('liste-elements'), { attributes: true, subtree: true, attributeFilter: ['class'] });

  // ---------------------------------------------------------------- correction de la ligne par les points curseurs (glisser en x)
  function pointeur(ev) { const r = dom.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height }; }
  function viser(ev) { // point curseur de la ligne sous le pointeur (distance écran <= 14 px)
    const p = pointeur(ev); let meilleur = null, dm = 14;
    for (const c of ctrls) {
      const w = new THREE.Vector3(); c.mesh.getWorldPosition(w); w.project(camera);
      const d = Math.hypot(((w.x + 1) / 2) * p.w - p.x, ((1 - w.y) / 2) * p.h - p.y);
      if (d <= dm) { dm = d; meilleur = c; }
    }
    return meilleur;
  }
  dom.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || !ctrls.length || (P.mesureActive && P.mesureActive())) return; // outil Mesure actif : les points de la ligne sont inertes
    const c = viser(ev); if (!c) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    const w = new THREE.Vector3(); c.mesh.getWorldPosition(w);
    const dec = corrections.get(c.cle) || new Array(POINTS_ISTHME).fill(0); corrections.set(c.cle, dec);
    drag = { c, plan: new THREE.Plane(new THREE.Vector3(0, 0, 1), -w.z), x0: dec[c.c], base: w.x - c.groupe.position.x, dec };
    controls.enabled = false;
    try { dom.setPointerCapture(ev.pointerId); } catch (err) { void err; }
  }, true);
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const p = pointeur(ev), rc = new THREE.Raycaster();
    rc.setFromCamera(new THREE.Vector2((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1), camera);
    const hit = new THREE.Vector3();
    if (!rc.ray.intersectPlane(drag.plan, hit)) return; // vue de profil : plan horizontal vu par la tranche, pas de déplacement
    const auto = drag.c.g.isthme.points[2 * drag.c.r], x = hit.x - drag.c.groupe.position.x;
    drag.dec[drag.c.c] = Math.round(Math.max(-DEMI_BANDE_MM, Math.min(DEMI_BANDE_MM, x - auto)) * 10) / 10;
    drag.bouge = true; dessiner();
    // dessiner() recrée les points : la poignée tenue est celle de même rang
    const n = ctrls.find((q) => q.cle === drag.c.cle && q.c === drag.c.c); if (n) drag.c = { ...drag.c, mesh: n.mesh, groupe: n.groupe, g: n.g };
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    const d = drag; drag = null; controls.enabled = true;
    if (d.bouge) P.noter('modification', 'ligne de l\'isthme : point ' + (d.c.c + 1) + ' déplacé de ' + String(d.dec[d.c.c]).replace('.', ',') + ' mm');
    demanderRendu();
  });

  return {
    // groupes = [{ pied: null|'D'|'G', dx, liste, isthme }] ; vide = rien à montrer
    afficher(g) { groupes = (g || []).filter((x) => x && x.liste); legende(); dessiner(); },
    effacer() { groupes = []; vider(); legende(); demanderRendu(); },
    relief() { for (const o of racine.children) o.scale.z = relief(); echelle(); demanderRendu(); },
    reset() { corrections.clear(); masques = new Set(); groupes = []; fantomes.clear(); vider(); legende(); },
    legende,
    racine: () => racine, eclate: () => eclat, aides: () => ctrls.map((c) => c.mesh), // B3 : image du rapport (les points curseurs de l'isthme ne figurent pas sur l'image)
    ecran: () => ({ // aide de vérification (scripts de contrôle navigateur)
      eclat: { actif: eclat, espace, niveaux: racine.children.flatMap((o) => o.children.filter((q) => q.userData.role === 'emprise').map((q) => ({ index: q.userData.index, z: q.position.z }))) },
      fantomes: racine.children.flatMap((o) => o.children.filter((q) => q.userData.role === 'fantome').map((q) => ({ pied: q.userData.pied, opacite: q.material.opacity, sommets: q.geometry.attributes.position.count }))),
      points: ctrls.map((c) => { const w = new THREE.Vector3(); c.mesh.getWorldPosition(w); w.project(camera); const r = dom.getBoundingClientRect(); return { cle: c.cle, c: c.c, x: r.left + ((w.x + 1) / 2) * r.width, y: r.top + ((1 - w.y) / 2) * r.height }; }),
      emprises: racine.children.reduce((n, o) => n + o.children.filter((q) => q.userData.role === 'emprise').length, 0),
      strates: racine.children.flatMap((o) => o.children.filter((q) => q.userData.role === 'strate').map((q) => ({ ...q.userData }))),
      lignes: racine.children.reduce((n, o) => n + o.children.filter((q) => q.userData.role === 'isthme').length, 0),
      decalages: Object.fromEntries([...corrections.entries()]),
      opacites: racine.children.flatMap((o) => o.children.filter((q) => q.userData.role === 'emprise').map((q) => ({ index: q.userData.index, teinte: q.userData.teinte, couleur: q.userData.couleur, texture: q.userData.texture, brillant: q.userData.brillant, materiau: q.material.type, rugosite: q.material.roughness, opacite: q.material.opacity }))),
    }),
  };
}
