// Lot 4d : outil Mesure (📏). 2 clics sur la semelle = distance 3D + x / y / z. Affichage seulement : ni calcul, ni STL, ni Annuler.
import { mesurer, texteMesure, clicMesure } from '../calcul/mesure.js';

export function initMesure(P) {
  const { $, THREE, scene, camera, controls, renderer, demanderRendu } = P;
  const dom = renderer.domElement, rc = new THREE.Raycaster();
  const racine = new THREE.Group(); racine.renderOrder = 50; scene.add(racine);
  let actif = false, etat = { points: [] }, bas = null, marques = [];
  const relief = () => Number($('relief').value) || 1;
  const etiquette = $('mesure-etiquette');

  function vider() { for (const o of [...racine.children]) { racine.remove(o); o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); }); } marques = []; }
  function dessiner() {
    vider(); const pts = etat.points, r = relief();
    pts.forEach((p) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xff2d55, depthTest: false }));
      m.position.set(p.x, p.y, p.z * r); m.renderOrder = 51; racine.add(m); marques.push(m);
    });
    if (pts.length === 2) {
      const g = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p.x, p.y, p.z * r)));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff2d55, depthTest: false })); l.renderOrder = 50; racine.add(l);
    }
    texte(); echelle(); demanderRendu();
  }
  function texte() {
    const pts = etat.points;
    if (pts.length === 0) { etiquette.hidden = !actif; etiquette.textContent = actif ? 'Mesure : cliquez 2 points sur la semelle (Échap : effacer)' : ''; etiquette.classList.remove('resultat'); return; }
    if (pts.length === 1) { etiquette.hidden = false; etiquette.textContent = 'Point 1 posé : cliquez le second point'; etiquette.classList.remove('resultat'); return; }
    etiquette.hidden = false; etiquette.classList.add('resultat'); bas = mesurer(pts[0], pts[1], 1); etiquette.textContent = texteMesure(bas);
  }
  function echelle() { // taille constante à l'écran (~5 px de rayon)
    for (const m of marques) {
      const d = camera.position.distanceTo(m.position), s = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 5) / (dom.clientHeight || 600);
      m.scale.set(s, s, s);
    }
  }
  controls.addEventListener('change', echelle);
  function activer(v) {
    actif = v; $('outil-mesure').classList.toggle('on', v); $('vue').classList.toggle('mode-mesure', v);
    if (v) { $('outil-select').classList.remove('on'); $('outil-point').classList.remove('on'); } else etat = { points: [] };
    dom.style.cursor = v ? 'crosshair' : ''; dessiner();
  }
  $('outil-mesure').onclick = () => {
    if (!P.get().baseAffichee) { $('etat').textContent = 'Construisez d\'abord la base pour mesurer sur la semelle.'; return; }
    if (!actif) $('outil-select').click(); // rend la main à l'édition (outil Point éteint), puis passe en mesure
    activer(!actif);
  };
  $('outil-select').addEventListener('click', () => { if (actif) activer(false); });
  $('outil-point').addEventListener('click', () => { if (actif) activer(false); });
  document.addEventListener('keydown', (ev) => { if (actif && ev.key === 'Escape') { const t = ev.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; etat = { points: [] }; dessiner(); ev.stopImmediatePropagation(); } }, true);

  let depart = null;
  window.addEventListener('pointerdown', (ev) => { depart = actif && ev.button === 0 && ev.target === dom ? { x: ev.clientX, y: ev.clientY } : null; }, true);
  window.addEventListener('pointerup', (ev) => {
    if (!depart) return; const d = depart; depart = null;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) return; // un glissement = on tourne la vue
    const m = P.getMaille(); if (!m) return;
    const r = dom.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    m.updateMatrixWorld(); const h = rc.intersectObject(m, false)[0]; if (!h) return;
    etat = clicMesure(etat, { x: h.point.x, y: h.point.y, z: h.point.z / relief() });
    dessiner();
  }, true);
  window.addEventListener('resize', echelle);

  return {
    actif: () => actif,
    effacer() { etat = { points: [] }; dessiner(); },
    relief() { dessiner(); },
    reset() { if (actif) activer(false); else { etat = { points: [] }; dessiner(); } },
    ecran: () => ({ actif, n: etat.points.length, points: etat.points, mesure: etat.points.length === 2 ? mesurer(etat.points[0], etat.points[1], 1) : null, texte: etiquette.textContent,
      ecran: marques.map((m) => { const w = m.position.clone().project(camera), q = dom.getBoundingClientRect(); return { x: q.left + ((w.x + 1) / 2) * q.width, y: q.top + ((1 - w.y) / 2) * q.height }; }) }),
  };
}
