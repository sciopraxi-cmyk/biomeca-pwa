// B3 : image du rapport = vue de dessus + vue 3/4 médiale, orthographiques figées, même échelle (calcul/vues_rapport.js).
// Ne dessine que la semelle, ses éléments colorés, la grille et les repères TALON / AVANT-PIED : ni poignées, ni axe de Henke, ni pied mannequin, ni ligne pointillée de l'isthme, ni plan de coupe.
import { vuesRapport } from '../calcul/vues_rapport.js';
import { IMAGE_RAPPORT as IR } from '../constantes.js';

const TITRES = { dessus: 'Vue de dessus', 'trois-quarts-medial': 'Vue 3/4 médiale' };
const GRILLE_MARGE_MM = 20; // la grille dépasse la semelle de 20 mm de chaque côté
const SPRITE_MM = 30; // demi-largeur d'un repère (60 mm de large dans la scène)
const ENTETE_PX = 64, PIED_PX = 84, ESPACE_PX = 24, BORD_PX = 24;

export function initImageRapport(P) {
  const { THREE, scene, renderer, $, demanderRendu, redimensionner, getMaille, racineTransp, aidesTransp, getGrille, get } = P;

  function garder() { // masque tout ce qui n'est pas la semelle (lumières, grille, repères, semelle, éléments colorés) ; renvoie la fonction qui remet tout
    const memo = [];
    const cacher = (o) => { memo.push([o, o.visible]); o.visible = false; };
    const maille = getMaille(), rt = racineTransp(), grille = getGrille();
    for (const o of scene.children) {
      if (o === maille || o === rt || o === grille || o.isLight || o.isSprite) continue;
      cacher(o);
    }
    if (rt) rt.traverse((o) => { if (o.userData && o.userData.role === 'isthme') cacher(o); });
    for (const m of aidesTransp()) cacher(m); // points curseurs de la ligne de l'isthme
    return () => { for (const [o, v] of memo) o.visible = v; };
  }

  let diag = []; // objets réellement visibles au moment du rendu (preuve qu'aucune aide n'est dessinée)
  // Rend une vue dans un canvas 2D à la taille voulue. Précondition : relief ×1, objets masqués.
  function rendreVue(v) {
    diag = []; scene.traverseVisible((o) => { if (o.isMesh || o.isLine || o.isSprite) diag.push(o); });
    const cam = new THREE.OrthographicCamera(-v.demi_largeur_mm, v.demi_largeur_mm, v.demi_hauteur_mm, -v.demi_hauteur_mm, 1, v.distance * 3);
    cam.up.set(...v.haut); cam.position.set(...v.position); cam.lookAt(...v.cible); cam.updateProjectionMatrix();
    renderer.setPixelRatio(1); renderer.setSize(v.largeur_px, v.hauteur_px, false);
    renderer.setClearColor(0xffffff, 1); renderer.render(scene, cam);
    const c = document.createElement('canvas'); c.width = v.largeur_px; c.height = v.hauteur_px;
    c.getContext('2d').drawImage(renderer.domElement, 0, 0); // lu tout de suite après le rendu (sans tampon conservé)
    return c;
  }

  function composer(rendus, vues, { cote, generique }) {
    const l = BORD_PX * 2 + rendus.reduce((s, c) => s + c.width, 0) + ESPACE_PX * (rendus.length - 1);
    const h = ENTETE_PX + Math.max(...rendus.map((c) => c.height)) + PIED_PX + BORD_PX;
    const out = document.createElement('canvas'); out.width = l; out.height = h;
    const g = out.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, l, h);
    g.fillStyle = '#1d3a6e'; g.font = 'bold 28px sans-serif'; g.textAlign = 'left'; g.fillText('Plan de semelles 3D — pied ' + (cote === 'D' ? 'droit' : 'gauche'), BORD_PX, 40);
    let x = BORD_PX;
    rendus.forEach((c, k) => {
      const y = ENTETE_PX; g.drawImage(c, x, y);
      g.strokeStyle = '#d5e0f3'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, c.width - 2, c.height - 2);
      g.fillStyle = '#4b5d7e'; g.font = 'bold 20px sans-serif'; g.fillText(TITRES[vues[k].vue], x + 12, y + 28);
      x += c.width + ESPACE_PX;
    });
    // barre d'échelle (vue de dessus) + mentions
    const yb = h - PIED_PX + 14, px = IR.barre_echelle_mm * IR.px_par_mm;
    g.strokeStyle = '#1d3a6e'; g.lineWidth = 4; g.beginPath(); g.moveTo(BORD_PX, yb + 14); g.lineTo(BORD_PX + px, yb + 14); g.moveTo(BORD_PX, yb + 6); g.lineTo(BORD_PX, yb + 22); g.moveTo(BORD_PX + px, yb + 6); g.lineTo(BORD_PX + px, yb + 22); g.stroke();
    g.fillStyle = '#1d3a6e'; g.font = '18px sans-serif'; g.fillText(IR.barre_echelle_mm + ' mm (vue de dessus ; même échelle pour la vue 3/4, raccourcie en profondeur)', BORD_PX + px + 14, yb + 20);
    if (generique) { g.fillStyle = '#b45309'; g.font = 'bold 18px sans-serif'; g.fillText('Pied générique (proportions moyennes fictives) : aperçu indicatif, pas une mesure du patient.', BORD_PX, yb + 52); }
    return out;
  }

  // Grille du fond : propre à l'image (10 mm, trait plus marqué tous les 50 mm), limitée à un rectangle autour de la semelle, posée à z = -0.05.
  function grilleImage(b) {
    const x0 = Math.floor((b.min.x - GRILLE_MARGE_MM) / 10) * 10, x1 = Math.ceil((b.max.x + GRILLE_MARGE_MM) / 10) * 10;
    const y0 = Math.floor((b.min.y - GRILLE_MARGE_MM) / 10) * 10, y1 = Math.ceil((b.max.y + GRILLE_MARGE_MM) / 10) * 10;
    const fine = [], forte = [];
    for (let x = x0; x <= x1; x += 10) (x % 50 === 0 ? forte : fine).push(x, y0, -0.05, x, y1, -0.05);
    for (let y = y0; y <= y1; y += 10) (y % 50 === 0 ? forte : fine).push(x0, y, -0.05, x1, y, -0.05);
    const g = new THREE.Group();
    for (const [pts, coul] of [[fine, 0xd5e0f3], [forte, 0xa9bbdb]]) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: coul }))); }
    g.userData.role = 'grille-image'; g.userData.rect = { x0, x1, y0, y1 };
    return g;
  }

  function creer() {
    const S = get();
    if (!S.baseAffichee || !getMaille()) throw new Error('affichez d\'abord la semelle (étape Base)');
    if (S.deuxPieds) throw new Error('l\'image du rapport est prévue pour un seul pied (mode « deux pieds » : à venir)');
    if (S.eclate) throw new Error('quittez la vue éclatée avant de créer l\'image');
    if (S.coteConfirme !== 'D' && S.coteConfirme !== 'G') throw new Error('confirmez le côté du pied');
    const reliefAvant = $('relief').value;
    if (reliefAvant !== '1') { $('relief').value = '1'; $('relief').dispatchEvent(new Event('change')); }
    const grille = getGrille(), grilleVisible = grille ? grille.visible : null;
    const remettre = garder();
    let gi = null;
    try {
      if (grille) grille.visible = false; // la grille de l'écran (300 × 300 mm) est remplacée par celle de l'image
      const boite = new THREE.Box3().setFromObject(getMaille());
      for (const o of scene.children) if (o.isSprite && o.visible) boite.expandByPoint(new THREE.Vector3(o.position.x - SPRITE_MM, o.position.y - SPRITE_MM, o.position.z)).expandByPoint(new THREE.Vector3(o.position.x + SPRITE_MM, o.position.y + SPRITE_MM, o.position.z)); // les repères TALON / AVANT-PIED doivent tenir dans l'image
      gi = grilleImage(boite); scene.add(gi); // dans le cadrage : toute la grille tient dans l'image
      const r0 = gi.userData.rect; boite.expandByPoint(new THREE.Vector3(r0.x0, r0.y0, -0.05)).expandByPoint(new THREE.Vector3(r0.x1, r0.y1, -0.05));
      const vues = vuesRapport({ x_min: boite.min.x, x_max: boite.max.x, y_min: boite.min.y, y_max: boite.max.y, z_min: boite.min.z, z_max: boite.max.z }, S.coteConfirme);
      const rendus = vues.map(rendreVue);
      const canvas = composer(rendus, vues, { cote: S.coteConfirme, generique: !!S.generique });
      return { canvas, largeur: canvas.width, hauteur: canvas.height, vues: vues.map((v) => ({ vue: v.vue, largeur_px: v.largeur_px, hauteur_px: v.hauteur_px, px_par_mm: v.px_par_mm })), cote: S.coteConfirme, generique: !!S.generique, visibles: diag.map((o) => (o.isSprite ? 'sprite' : o === getMaille() ? 'semelle' : o === getGrille() ? 'grille' : (o.userData && o.userData.role) || o.type)) };
    } finally {
      if (gi) { scene.remove(gi); gi.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      remettre(); if (grille) grille.visible = grilleVisible;
      renderer.setClearColor(0x000000, 0);
      if (reliefAvant !== '1') { $('relief').value = reliefAvant; $('relief').dispatchEvent(new Event('change')); }
      redimensionner(); demanderRendu();
    }
  }
  return { creer };
}
