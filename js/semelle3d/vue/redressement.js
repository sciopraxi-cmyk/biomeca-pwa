// Étape B : pose des 3 points (talon, M1, M5) sur l'empreinte affichée. Les points sont lus dans le repère du recalage automatique ;
// « Appliquer » relance l'analyse avec ces points (le noyau fait tourner l'empreinte), « Plan automatique » revient au plan du RANSAC.
import { clicRedressement, verifierPoints, REDRESSEMENT, NOMS_POINTS } from '../calcul/redressement.js';

export function initRedressement(P) {
  const { $, THREE, scene, camera, controls, renderer, demanderRendu } = P;
  const dom = renderer.domElement, rc = new THREE.Raycaster();
  const racine = new THREE.Group(); racine.renderOrder = 50; scene.add(racine);
  let actif = false, etat = { points: {} }, marques = [];
  const relief = () => Number($('relief').value) || 1;
  const nb = () => Object.keys(etat.points).length;
  const COULEURS = { talon: 0x2563eb, m1: 0xe11d48, m5: 0x16a34a };

  function vider() { for (const o of [...racine.children]) { racine.remove(o); o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); }); } marques = []; }
  function dessiner() {
    vider(); const r = relief();
    for (const k of REDRESSEMENT.cles) {
      const p = etat.points[k]; if (!p) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: COULEURS[k], depthTest: false }));
      m.position.set(p.x, p.y, p.z * r); m.renderOrder = 51; racine.add(m); marques.push(m);
    }
    if (nb() === 3) {
      const g = new THREE.BufferGeometry().setFromPoints(REDRESSEMENT.cles.concat('talon').map((k) => new THREE.Vector3(etat.points[k].x, etat.points[k].y, etat.points[k].z * r)));
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x111827, depthTest: false })); l.renderOrder = 50; racine.add(l);
    }
    echelle(); texte(); demanderRendu();
  }
  function echelle() {
    for (const m of marques) {
      const d = camera.position.distanceTo(m.position), s = (2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 6) / (dom.clientHeight || 600);
      m.scale.set(s, s, s);
    }
  }
  controls.addEventListener('change', echelle);
  const appliquee = () => !!P.get().appliquee;
  function texte() {
    const e = $('redress-etat'), n = nb(), v = n === 3 ? verifierPoints(etat.points) : null;
    if (actif && n < 3) e.textContent = 'Cliquez ' + NOMS_POINTS[REDRESSEMENT.cles[n]] + ' (' + (n + 1) + '/3). Échap : effacer.';
    else if (n === 3 && v.ok) e.textContent = '3 points posés : appuyez sur « Appliquer le redressement ».';
    else if (n === 3) e.textContent = 'Points refusés : ' + v.erreurs.join(' ; ') + '. Effacez et recommencez.';
    else e.textContent = appliquee() ? '' : 'Plan d\'appui : automatique.';
    $('btn-redress-appliquer').disabled = !(n === 3 && v && v.ok);
    $('btn-redress-effacer').disabled = !(n > 0 || appliquee());
    $('btn-redress-poser').classList.toggle('on', actif);
    $('btn-redress-poser').textContent = actif ? 'Arrêter la pose' : 'Poser les 3 points';
  }
  function activer(v) { actif = v; $('vue').classList.toggle('mode-mesure', v); dom.style.cursor = v ? 'crosshair' : ''; if (!v) etat = { points: {} }; dessiner(); }

  $('btn-redress-poser').onclick = async () => {
    if (actif) { activer(false); return; }
    if (!P.get().analyse) { $('etat').textContent = 'Analysez d\'abord le scan (carte 1).'; return; }
    if (P.get().appliquee || P.get().base) await P.revenirAuto(); // les points se posent sur l'empreinte du plan automatique (la base déjà construite est à refaire)
    P.arreterAutres(); activer(true);
  };
  $('btn-redress-effacer').onclick = async () => { const etaitApp = appliquee(); etat = { points: {} }; if (etaitApp) { activer(false); await P.revenirAuto(); } dessiner(); };
  $('btn-redress-appliquer').onclick = async () => {
    if (nb() !== 3) return; const pts = JSON.parse(JSON.stringify(etat.points));
    activer(false); await P.appliquer(pts);
  };
  document.addEventListener('keydown', (ev) => { if (actif && ev.key === 'Escape') { const t = ev.target; if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return; ev.stopPropagation(); /* ne ferme pas la fenêtre de la Semelle 3D */ etat = { points: {} }; dessiner(); } });

  let depart = null;
  window.addEventListener('pointerdown', (ev) => { depart = actif && ev.button === 0 && ev.target === dom ? { x: ev.clientX, y: ev.clientY } : null; }, true);
  window.addEventListener('pointerup', (ev) => {
    if (!depart) return; const d = depart; depart = null;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) return; // un glissement = on tourne la vue
    const m = P.getMaille(); if (!m) return;
    const r = dom.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    m.updateMatrixWorld(); const h = rc.intersectObject(m, false)[0]; if (!h) return;
    etat = clicRedressement(etat, { x: h.point.x, y: h.point.y, z: h.point.z / relief() });
    dessiner();
  }, true);
  window.addEventListener('resize', echelle);

  return {
    actif: () => actif,
    majTexte: texte,
    relief() { dessiner(); },
    reset() { if (actif) activer(false); else { etat = { points: {} }; dessiner(); } },
    ecran: () => ({ actif, n: nb(), points: etat.points, texte: $('redress-etat').textContent,
      ecran: marques.map((m) => { const w = m.position.clone().project(camera), q = dom.getBoundingClientRect(); return { x: q.left + ((w.x + 1) / 2) * q.width, y: q.top + ((1 - w.y) / 2) * q.height }; }) }),
  };
}
