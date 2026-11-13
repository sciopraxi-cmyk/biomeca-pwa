// Lot 4d : outil Pinceau (✎). Glisser sur la semelle = lisser (ou remplir) le relief sous le disque. Un geste = une retouche = une entrée Annuler.
// Ce module ne fait que lire la souris et dessiner le curseur ; les passages sont calculés dans calcul/pinceau.js (pur) et appliqués par le worker comme un élément.
import { coupsDuTrajet } from '../calcul/pinceau.js';
import { PINCEAU } from '../constantes.js';

export function initPinceau(P) {
  const { $, THREE, scene, camera, controls, renderer, demanderRendu } = P;
  const dom = renderer.domElement, rc = new THREE.Raycaster();
  const racine = new THREE.Group(); racine.renderOrder = 60; scene.add(racine);
  let actif = false, trace = null, pied = null, curseur = null, ligne = null;
  const rayon = () => Math.max(PINCEAU.rayon_mm.min, Math.min(PINCEAU.rayon_mm.max, Number($('pinceau-rayon').value) || PINCEAU.rayon_defaut_mm));
  const mode = () => (document.querySelector('input[name=pinceau-mode]:checked') || { value: 'lisser' }).value;
  const couleur = () => (mode() === 'remplir' ? 0x16a34a : 0xe11d48);

  function vider() { for (const o of [...racine.children]) { racine.remove(o); o.traverse((q) => { if (q.geometry) q.geometry.dispose(); if (q.material) q.material.dispose(); }); } curseur = null; ligne = null; }
  function anneau(r, c) { const pts = []; for (let a = 0; a <= 64; a++) pts.push(new THREE.Vector3(Math.cos((a / 64) * 2 * Math.PI) * r, Math.sin((a / 64) * 2 * Math.PI) * r, 0)); return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: c, depthTest: false })); }
  function poserCurseur(p) {
    if (!curseur) { curseur = anneau(rayon(), couleur()); curseur.renderOrder = 60; curseur.userData = { role: 'curseur-pinceau' }; racine.add(curseur); }
    curseur.geometry.dispose(); const c = anneau(rayon(), couleur()); curseur.geometry = c.geometry; curseur.material.color.set(couleur()); c.material.dispose();
    curseur.position.set(p.x, p.y, p.z + 0.4); curseur.visible = true; demanderRendu();
  }
  function dessinerTrace() {
    if (ligne) { racine.remove(ligne); ligne.geometry.dispose(); ligne.material.dispose(); ligne = null; }
    if (!trace || trace.length < 2) return;
    ligne = new THREE.Line(new THREE.BufferGeometry().setFromPoints(trace.map((q) => new THREE.Vector3(q.sx, q.sy, q.sz + 0.5))), new THREE.LineBasicMaterial({ color: couleur(), depthTest: false })); ligne.renderOrder = 61; racine.add(ligne);
  }
  function viser(ev) {
    const m = P.getMaille(); if (!m) return null;
    const r = dom.getBoundingClientRect();
    rc.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    m.updateMatrixWorld(); const h = rc.intersectObject(m, false)[0]; return h ? h.point : null;
  }
  function majPanneau() { $('pinceau-panel').hidden = !actif; $('pinceau-rayon-val').textContent = String(rayon()).replace('.', ',') + ' mm'; }
  function activer(v) {
    actif = v; $('outil-pinceau').classList.toggle('on', v); $('vue').classList.toggle('mode-pinceau', v);
    if (v) { $('outil-select').classList.remove('on'); $('outil-point').classList.remove('on'); } else { trace = null; pied = null; controls.enabled = true; vider(); }
    majPanneau(); demanderRendu();
  }
  $('outil-pinceau').onclick = () => {
    if (!actif) {
      const E = P.edition();
      if (!P.get().baseAffichee || !E.pieds().length) { $('etat').textContent = 'Construisez d\'abord la base (et confirmez la latéralité) pour retoucher au pinceau.'; return; }
      $('outil-select').click(); // rend la main à l'édition, éteint Point et Mesure
    }
    activer(!actif);
  };
  for (const id of ['outil-select', 'outil-point', 'outil-mesure']) $(id).addEventListener('click', () => { if (actif) activer(false); });
  $('pinceau-rayon').addEventListener('input', () => { majPanneau(); if (curseur) poserCurseur(curseur.position.clone().setZ(curseur.position.z - 0.4)); });
  document.querySelectorAll('input[name=pinceau-mode]').forEach((e) => e.addEventListener('change', () => { if (curseur) curseur.material.color.set(couleur()); demanderRendu(); }));
  document.addEventListener('keydown', (ev) => { const t = ev.target; if (actif && ev.key === 'Escape' && !(t && /INPUT|TEXTAREA|SELECT/.test(t.tagName))) { if (trace) { trace = null; pied = null; controls.enabled = true; dessinerTrace(); } else activer(false); ev.stopImmediatePropagation(); } }, true);

  window.addEventListener('pointerdown', (ev) => {
    if (!actif || ev.button !== 0 || ev.target !== dom) return;
    const h = viser(ev); if (!h) return;
    const E = P.edition(), f = E.piedEn(h.x); if (!f) return;
    ev.stopImmediatePropagation(); ev.preventDefault();
    pied = f; controls.enabled = false; trace = [{ x: h.x - f.off, y: h.y, sx: h.x, sy: h.y, sz: h.z }];
    try { dom.setPointerCapture(ev.pointerId); } catch (err) { void err; }
    poserCurseur(h); dessinerTrace();
  }, true);
  window.addEventListener('pointermove', (ev) => {
    if (!actif) return;
    if (ev.target !== dom && !trace) return;
    const h = viser(ev);
    if (!h) { if (curseur) { curseur.visible = false; demanderRendu(); } return; }
    poserCurseur(h);
    if (trace && pied) { trace.push({ x: h.x - pied.off, y: h.y, sx: h.x, sy: h.y, sz: h.z }); dessinerTrace(); }
  });
  window.addEventListener('pointerup', async () => {
    if (!trace) return;
    const t = trace, f = pied; trace = null; pied = null; controls.enabled = true; dessinerTrace();
    const coups = coupsDuTrajet(t, f.rep, f.med, { rayon_mm: rayon(), mode: mode(), force: PINCEAU.force_defaut });
    if (coups.length === 0) return;
    try { await P.edition().poserPinceau(f, coups); } catch (err) { $('el-msg').textContent = 'pinceau : ' + err.message; }
  });
  window.addEventListener('pointercancel', () => { if (trace) { trace = null; pied = null; controls.enabled = true; dessinerTrace(); } });

  return {
    actif: () => actif,
    reset() { if (actif) activer(false); },
    ecran: () => ({ hmax: (P.get().baseRapport || {}).hauteur_max_mm, actif, trace: trace ? trace.length : 0, rayon: rayon(), mode: mode(), curseur: !!(curseur && curseur.visible), panneau: !$('pinceau-panel').hidden }),
  };
}
