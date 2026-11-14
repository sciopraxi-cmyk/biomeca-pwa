// Visualiseur du lot 0 : three.js (local) + OrbitControls (local) ; calculs dans le worker.
import * as THREE from 'three';
import { resumerPlan } from '../calcul/resume.js';
import { OrbitControls } from '../../../assets/vendor/three/OrbitControls.js';
import { nomFichierSTL } from '../calcul/stl.js';
import { ecrireZip, nomFichierZip } from '../calcul/zip.js';
import { ajouterJournal } from '../calcul/journal.js';
import { TYPES_ELEMENTS, positionApres, validerElement } from '../calcul/elements.js';
import { epaisseurApplicable, epaisseurBaseApplicable } from '../calcul/materiau_auto.js';
import { chargerMateriaux } from '../calcul/materiaux.js';
import { initDeuxPieds } from './deuxpieds.js';
import { initEdition3d } from './edition3d.js';
import { EPAISSEUR_BASE_MIN_MM, EPAISSEUR_BASE_MAX_MM } from '../constantes.js';
import { initMesure } from './mesure.js';
import { initImageRapport } from './image_rapport.js';
import { initPinceau } from './pinceau.js';
import { initHenke } from './henke.js';
import { initMannequin } from './mannequin.js';
import { couleursHauteur } from '../calcul/apercu.js';
import { initTransparence, teinteSuivante, couleurTeinte } from './transparence.js';

const $ = (id) => document.getElementById(id);
const worker = new Worker(new URL('../worker/calcul.worker.js', import.meta.url), { type: 'module' });
let journal = Object.freeze([]);
let elements = [], rapportElements = [], dernierModifie = null, minuteurEl = null, seqEl = 0, materiauxTable = null, scanReplie = false; // lot 3
let suivant = 1;
let ficheB = null; // V1 : réglages du pied générique (mode B) tels qu'ils ont servi à créer l'empreinte
let appliquerAttente = Promise.resolve();
let transp = { afficher: () => {}, effacer: () => {}, relief: () => {}, reset: () => {}, legende: () => {} }; // remplacé en fin de fichier (lot 4c : transparence, couleurs, ligne de l'isthme, légende)
let mannequin = { afficher: () => {}, relief: () => {}, reset: () => {} }; // remplacé en fin de fichier (lot 4 bis, étape 5)
let henke = { afficher: () => {}, relief: () => {}, reset: () => {}, actif: () => false, exporter: () => undefined }; // remplacé en fin de fichier (lot 4 bis : axe de Henke)
let pinceau = { actif: () => false, reset: () => {} }; // remplacé en fin de fichier (lot 4d : outil Pinceau)
let mesure = { actif: () => false, relief: () => {}, reset: () => {}, effacer: () => {} }; // remplacé en fin de fichier (lot 4d : outil Mesure)
let surimpAff = null; // [{ pied, dx, liste, isthme }] : surimpressions du dernier calcul (une par pied affiché)
let edition = { surAffichage: () => {}, surCartes: () => {}, reset: () => {}, enregistrer: () => {} }; // remplacé en fin de fichier (lot 4b : Annuler/Rétablir, points curseurs, glisser-déposer)
let deux = { actif: () => false, pied: () => null, detacher: () => {}, autrePied: () => false, memoriserSuggestion: () => {}, calculer: () => {}, exporter: () => {}, badge: () => '', portee: () => 'commun', nouvelUid: () => undefined, surImport: () => {}, surReset: () => {} }; // remplacé en fin de fichier (interface 2 pieds)
const attente = new Map();
worker.onmessage = (e) => {
  const r = attente.get(e.data.id);
  attente.delete(e.data.id);
  if (r) (e.data.ok ? r.resolve(e.data) : r.reject(Object.assign(new Error(e.data.erreur), { code: e.data.code })));
};
worker.onerror = (e) => { $('etat').textContent = 'erreur du worker : ' + (e.message || 'chargement ou exécution impossible') + (e.filename ? ' (' + String(e.filename).split('/').slice(-2).join('/') + (e.lineno ? ':' + e.lineno : '') + ')' : ''); for (const [id, r] of attente) { attente.delete(id); r.reject(Object.assign(new Error('le calcul 3D s\'est arrêté (chargement du module) : fermez puis rouvrez le plan'), { code: 'WORKER' })); } }; // détail ajouté : un message vide ne permettait pas de situer la panne
const demander = (msg, transferts = []) => new Promise((resolve, reject) => {
  const id = suivant++;
  if (msg.type === 'coupe' && deux.pied()) msg = { ...msg, pied: deux.pied() }; // 2 pieds : la coupe se fait sur le pied de l'onglet
  attente.set(id, { resolve, reject });
  worker.postMessage({ ...msg, id }, transferts);
});

function noter(action, detail) {
  journal = ajouterJournal(journal, action, detail, new Date().toISOString());
  $('journal').innerHTML = '';
  for (const j of journal) {
    const li = document.createElement('li');
    li.textContent = j.date.slice(11, 19) + ' · ' + j.action + ' · ' + j.detail;
    $('journal').append(li);
  }
}

// --- scène ---
const conteneur = $('vue');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
conteneur.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = null; // fond = dégradé clair du conteneur (maquette)
const camera = new THREE.PerspectiveCamera(35, 1, 1, 3000);
camera.up.set(0, 0, 1); // Z = hauteur ; Y = longueur (talon à l'origine)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.1));
const lum = new THREE.DirectionalLight(0xffffff, 1.4);
lum.position.set(-300, -120, 120); // lumière rasante : le relief ressort
scene.add(lum);
const lumBas = new THREE.DirectionalLight(0xffffff, 1.2);
lumBas.position.set(260, -140, -240); // éclaire le dessous (vues « de dessous »)
scene.add(lumBas);
const grille = new THREE.GridHelper(300, 30, 0xa9bbdb, 0xd5e0f3);
grille.rotation.x = Math.PI / 2;
grille.position.set(45, 125, -0.05); // centré sous la zone du pied
scene.add(grille);
let maille = null;

function redimensionner() {
  const w = conteneur.clientWidth, h = conteneur.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Les panneaux du bas (options, coupe) recouvrent la scène : on remonte la semelle de la moitié de leur hauteur pour qu'elle reste entière à l'écran.
  const bas = document.querySelector('.bas'), decalage = bas ? bas.offsetHeight / 2 : 0;
  if (decalage > 0) camera.setViewOffset(w, h, 0, decalage, w, h); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  demanderRendu();
}
new ResizeObserver(() => redimensionner()).observe(document.querySelector('.bas')); // la coupe se replie / se déplie / apparaît
addEventListener('resize', redimensionner);
// Rendu À LA DEMANDE (pas de boucle permanente) : rien ne tourne quand on ne touche à rien.
let rendu = false;
function demanderRendu() {
  if (rendu) return;
  rendu = true;
  requestAnimationFrame(() => { rendu = false; renderer.render(scene, camera); });
}
controls.addEventListener('change', demanderRendu);

// Couleurs des zones de matériau (la base en bleu Verticy, le 2e matériau devant en orange) ; la limite est la frontière des deux.
const COULEUR_BASE = [0.247, 0.498, 0.816], COULEUR_DEVANT = [0.96, 0.62, 0.12];
const limiteDevant = (R) => (R && R.etendue && R.etendue.mode === 'demi' && R.etendue.devant === 'materiau2' ? R.etendue.y_limite_abs_mm : null);
let couleursAff = null; // 2 pieds : couleurs par sommet (un teint par pied), ignorées en mode un pied
// Lot 4 bis : données par pied pour l'axe de Henke (repère du talon, boîte du scan, positions de la base affichée)
function donneesHenke(positionsAffichees) {
  const v = deux.actif() ? deux.vue() : null;
  if (v) { const liste = v.onglet === '3D' ? ['D', 'G'] : [v.onglet]; return liste.map((c) => ({ deux: true, cote: c, dx: v.onglet === '3D' ? v.dx[c] : 0, rapport: v.R[c].rapport, positions: v.R[c].positions, indices: v.R[c].indices, longueur_mm: v.longueur[c], boite: v.boite[c] })); }
  if (!coteConfirme || !baseRapport || !baseRapport.repere_talon || basePos !== positionsAffichees || !rapport || !rapport.acquisition) return []; // la base est celle qu'on affiche (pas le scan brut)
  return [{ cote: coteConfirme, dx: 0, rapport: baseRapport, positions: basePos, indices: baseIdx, longueur_mm: rapport.acquisition.longueur_pied_mm, boite: rapport.boite }];
}
function afficher(positions, indices, { couleurHauteur = false, vue = 'trois-quarts', garderCamera = false, limiteY = null, couleurs = null } = {}) {
  if (maille) { scene.remove(maille); maille.geometry.dispose(); maille.material.dispose(); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  let materiau = new THREE.MeshStandardMaterial({ color: 0x3f7fd0, roughness: 0.55, metalness: 0.05 });
  if (couleurHauteur) {
    const col = couleursHauteur(positions); // lot 4 bis : dégradé plus contrasté + marches de 2 mm (voir calcul/apercu.js)
    for (let k = 0; k < col.length; k++) col[k] = Math.pow(col[k], 1.8); // couleurs pensées en sRGB : le rendu attend du linéaire (sinon l'image est délavée)
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    materiau = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.0 });
  }
  if (limiteY !== null && !couleurHauteur) { // 2e matériau devant : couleur différente de l'autre côté de la limite
    const col = new Float32Array(positions.length);
    for (let v = 0; v < positions.length / 3; v++) { const c2 = positions[3 * v + 1] > limiteY ? COULEUR_DEVANT : COULEUR_BASE; col[3 * v] = c2[0]; col[3 * v + 1] = c2[1]; col[3 * v + 2] = c2[2]; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    materiau = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  }
  if (couleurs) { geo.setAttribute('color', new THREE.BufferAttribute(couleurs, 3)); materiau = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }); }
  maille = new THREE.Mesh(geo, materiau);
  maille.scale.z = Number($('relief').value);
  scene.add(maille);
  try { henke.afficher(couleurHauteur ? [] : donneesHenke(positions)); } catch (err) { void err; } // l'axe ne doit jamais empêcher d'afficher la semelle
  try { mannequin.afficher(couleurHauteur ? [] : donneesHenke(positions)); } catch (err) { void err; } // idem pour le pied mannequin
  try { if (couleurHauteur) transp.effacer(); else transp.afficher(surimpAff); } catch (err) { $('el-msg').textContent = 'surimpression des éléments : ' + err.message; } // un défaut de la couche colorée ne doit jamais empêcher d'afficher la semelle
  geo.computeBoundingBox();
  const c = geo.boundingBox.getCenter(new THREE.Vector3());
  const cam0 = camera.position.clone(), cible0 = controls.target.clone();
  controls.target.copy(c);
  const taille = geo.boundingBox.getSize(new THREE.Vector3());
  const d = (taille.length() / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.15;
  if (vue === 'dessus') camera.position.set(c.x, c.y - 0.001 * d, c.z + d * 1.1);
  else if (vue === 'dessous') camera.position.set(c.x, c.y - 0.001 * d, c.z - d * 1.1);
  else if (vue === 'trois-quarts-dessous') camera.position.set(c.x + 0.35 * d, c.y - 0.75 * d, c.z - 0.55 * d);
  else if (vue === 'mediale' || vue === 'laterale') { // profil : le côté médial est -X pour un pied droit, +X pour un pied gauche
    const medial = coteConfirme === 'G' ? 1 : -1, sens = vue === 'mediale' ? medial : -medial;
    camera.position.set(c.x + sens * d * 1.1, c.y, c.z + 0.06 * d);
  }
  else if (vue === 'posterieure') camera.position.set(c.x, c.y - d * 1.1, c.z + 0.06 * d); // derrière le talon, vers l'avant-pied
  else camera.position.set(c.x + 0.35 * d, c.y - 0.75 * d, c.z + 0.55 * d); // vue 3/4 depuis le côté talon
  camera.lookAt(c);
  grille.visible = !String(vue).includes('dessous') && !['mediale', 'laterale', 'posterieure'].includes(vue); // la grille cacherait le dessous de la base
  grille.position.set(c.x, c.y, -0.05);
  if (garderCamera) { camera.position.copy(cam0); controls.target.copy(cible0); camera.lookAt(cible0); }
  controls.update();
  demanderRendu();
  edition.surAffichage();
}

$('relief').onchange = () => { if (maille) { maille.scale.z = Number($('relief').value); transp.relief(); henke.relief(); mannequin.relief(); mesure.relief(); demanderRendu(); edition.surAffichage(); } };
$('btn-construire').onclick = async () => {
  $('etat').textContent = 'calcul en cours (worker)…';
  $('btn-exporter').disabled = true;
  try {
    const r = await demander({ type: 'construire' });
    afficher(r.positions, r.indices);
    const p = r.rapport;
    $('stats').innerHTML = [
      'Triangles : ' + p.nbTriangles.toLocaleString('fr-FR'),
      'Maillage fermé : ' + (p.ferme ? 'oui' : 'NON'),
      'Volume : ' + (p.volume_mm3 / 1000).toFixed(2).replace('.', ',') + ' cm³',
      'Épaisseur min. : ' + p.epaisseurMin_mm.toFixed(2).replace('.', ',') + ' mm',
      'Hauteur max. : ' + p.hauteurMax_mm.toFixed(2).replace('.', ',') + ' mm',
    ].map((t) => '<div>' + t + '</div>').join('');
    noter('creation', 'dôme synthétique, ' + p.nbTriangles + ' triangles');
    $('etat').textContent = 'affiché';
    $('btn-exporter').disabled = false;
  } catch (err) { $('etat').textContent = 'erreur : ' + err.message; }
};

$('btn-exporter').onclick = async () => {
  $('etat').textContent = 'export en cours (worker)…';
  try {
    const r = await demander({ type: 'exporter' });
    const nom = nomFichierSTL('Demo-Fictive', 'D', new Date().toISOString());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' }));
    a.download = nom;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    noter('export', nom + ' · ' + r.octets + ' octets · contrôle du fichier relu : fermé');
    $('etat').textContent = 'exporté : ' + nom + ' (contrôlé : fermé, ' + r.nbTriangles + ' triangles)';
  } catch (err) { $('etat').textContent = 'erreur : ' + err.message; }
};


// ======================= Lot 1 : mode A =======================
let positionsAff = null, indicesAff = null, rapport = null, scanPret = false;
let opts = { inverserY: false, inverserZ: false };
let coteConfirme = null, sprites = [];
const fr = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');
const bordsMm = () => { const v = Number(String($('bords-mm').value).trim().replace(',', '.')); return Number.isFinite(v) ? Math.min(30, Math.max(0, v)) : 5; };
const majBlocBords = () => { $('bloc-bords').hidden = typeEmpreinte() !== 'creusee'; };
const typeEmpreinte = () => { const r = document.querySelector('input[name=typeemp]:checked'); return r ? r.value : 'decharge'; };

for (const [cle, lib] of Object.entries({
  reel_droit_stl: 'Pied droit réaliste (fictif) — STL, mm', reel_gauche_obj: 'Pied gauche réaliste (fictif) — OBJ, mm', reel_creux_stl: 'Pied droit creux (fictif, voûte haute) — STL',
  droit_stl_mm: 'Pied droit simple — STL binaire, mm, tourné de 30°', gauche_obj_mm: 'Pied gauche — OBJ, mm, autre repère',
  droit_ply_m: 'Pied droit — PLY binaire en MÈTRES', gauche_3mf_pouces: 'Pied gauche — 3MF en POUCES',
  boite_creusee_droit: 'Boîte creusée — pied droit (fictif) — STL, mm', boite_creusee_gauche: 'Boîte creusée — pied gauche (fictif) — STL, mm',
})) { const o = document.createElement('option'); o.value = cle; o.textContent = lib; $('demo').append(o); }

function etiquette(texte, x, y, z) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.font = 'bold 34px sans-serif'; g.fillStyle = '#1d3a6e'; g.textAlign = 'center'; g.fillText(texte, 128, 44);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(60, 15, 1); sp.position.set(x, y, z); scene.add(sp); sprites.push(sp);
}
function poserEtiquettes(liste) { // liste = [[texte, x, y, z], ...] (remplace les étiquettes présentes)
  for (const sp of sprites) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  sprites = [];
  for (const [t, x, y, z] of liste) etiquette(t, x, y, z);
  demanderRendu();
}
function reperes(boite) {
  for (const sp of sprites) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  sprites = [];
  etiquette('TALON', (boite.x_min + boite.x_max) / 2, -14, 2);
  etiquette('AVANT-PIED', (boite.x_min + boite.x_max) / 2, boite.y_max + 14, 2);
}

function majCote() {
  $('lib-cote').innerHTML = coteConfirme ? 'Côté <em>' + coteConfirme + '</em> confirmé' : 'Côté : à confirmer';
  $('lib-cote').classList.toggle('a', !coteConfirme);
  const pc = $('pill-cote'); pc.textContent = coteConfirme ? 'Pied ' + coteConfirme : 'Pied : à confirmer'; pc.className = 'pill ' + (coteConfirme ? 'g' : 'a');
  if (coteConfirme && rapport && !scanReplie) { scanReplie = true; $('p-scan').open = false; } // scan validé : la carte se replie, comme sur la maquette
  majParcours();
}
// Parcours en 5 étapes (en-tête) : état déduit de l'avancement réel, jamais saisi à la main.
function majParcours() {
  const analyse = !!rapport, base = !!baseAffichee, av = base && baseRapport ? baseRapport.avertissements.length : 0;
  const etats = { 1: analyse ? 'ok' : 'on', 2: base ? 'ok' : analyse ? 'on' : '', 3: base ? 'on' : '', 4: base ? (av ? 'warn' : 'ok') : '' };
  document.querySelectorAll('#parcours button[data-etape]').forEach((b) => {
    const n = Number(b.dataset.etape); if (n === 5) return;
    b.className = etats[n] || ''; b.querySelector('i').textContent = etats[n] === 'ok' ? '✓' : etats[n] === 'warn' ? '!' : String(n);
  });
  $('chip-scan').textContent = analyse ? '✓' : '1'; $('chip-scan').style.setProperty('--c', analyse ? '#14b8a6' : '#2563eb');
  const bd = $('badge-scan'); bd.hidden = !analyse; bd.textContent = coteConfirme ? 'Validé' : 'À confirmer'; bd.className = 'badge' + (coteConfirme ? '' : ' a');
  if ($('btn-image-rapport')) $('btn-image-rapport').disabled = !(base && coteConfirme);
  $('pill-long').textContent = analyse ? Math.round(rapport.acquisition.longueur_pied_mm) + ' mm' : 'longueur —';
}
document.querySelectorAll('#parcours button[data-etape]').forEach((b) => b.addEventListener('click', () => {
  const carte = { 1: 'p-scan', 2: 'p-base', 3: 'bloc-elements', 4: 'p-controles' }[b.dataset.etape]; if (!carte) return;
  const el = $(carte); if (el.hidden) return; el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}));
// Vues (boutons de la scène) : la liste cachée #vue-preset reste l'état de référence ; « Recentrer » rejoue la vue courante.
function majBoutonsVue() { document.querySelectorAll('.vues button').forEach((b) => b.classList.toggle('on', b.dataset.vue === $('vue-preset').value)); }
document.querySelectorAll('.vues button').forEach((b) => b.addEventListener('click', () => { $('vue-preset').value = b.dataset.vue; $('vue-preset').dispatchEvent(new Event('change')); }));
$('btn-recentrer').addEventListener('click', () => $('vue-preset').dispatchEvent(new Event('change')));
$('btn-relief').addEventListener('click', () => { $('relief').value = $('relief').value === '3' ? '1' : '3'; $('relief').dispatchEvent(new Event('change')); $('btn-relief').classList.toggle('on', $('relief').value === '3'); });
$('outil-coupe').addEventListener('click', () => { if (!$('coupe-panel').hidden) $('coupe-toggle').click(); });
// Contrôles (colonne de droite) : uniquement ce qui est réellement mesuré par le programme.
function majControles(R) {
  const L = [];
  L.push([R.ferme ? '' : 'e', R.ferme ? '✓' : '✕', 'Maillage fermé' + (R.ferme ? '' : ' : NON')]);
  const ok = R.epaisseur_min_mm >= 0.9 - 1e-3;
  L.push([ok ? '' : 'e', ok ? '✓' : '✕', 'Épaisseur minimale ' + fr(R.epaisseur_min_mm, 2) + ' mm (seuil 0,9 mm)']);
  for (const a of R.avertissements) L.push(['w', '!', a]);
  if (!R.avertissements.length) L.push(['', '✓', 'Aucun avertissement']);
  $('controles').innerHTML = L.map(([c, i, t]) => '<div class="ctl ' + c + '"><i>' + i + '</i><span>' + echapper(t) + '</span></div>').join('');
}

function afficherRapport(r) {
  const a = r.acquisition, g = r.grille, p = r.propositions;
  $('bandeau-generique').hidden = !r.generique;
  $('stats').innerHTML = r.generique ? [
    'Pied GÉNÉRIQUE (mode B, sans scan) : côté ' + a.cote + ', longueur ' + fr(a.longueur_pied_mm) + ' mm, largeur ×' + fr(a.largeur_rel, 2) + ', voûte ' + fr(a.voute_mm, 0) + ' mm',
    'Grille : ' + g.nx + ' × ' + g.ny + ' à ' + fr(g.pas_mm) + ' mm · ' + g.cellules_valides.toLocaleString('fr-FR') + ' cellules couvertes',
    'Hauteur : de ' + fr(g.hauteur_min_mm, 2) + ' à ' + fr(g.hauteur_max_mm, 2) + ' mm', 'Calcul : ' + r.duree_ms + ' ms (dans le worker)',
  ].concat(r.avertissements.map((t) => '⚠ ' + t)).map((t) => '<div>' + t + '</div>').join('') : [
    'Type d\'empreinte : ' + (a.type_empreinte === 'creusee' ? 'boîte creusée' + (r.conversion ? ' (bord ' + fr(r.conversion.plateau_pct, 0) + ' % du scan, creux de ' + fr(r.conversion.profondeur_mm, 0) + ' mm, converti en empreinte unique' + (r.conversion.bords ? ' ; bords gardés jusqu\'à ' + fr(r.conversion.bords.bords_mm, 0) + ' mm au-dessus du pied' : ' ; fond du creux seul') + ')' : '') : 'pied en décharge'),
    'Longueur saisie : ' + fr(a.longueur_pied_mm) + ' mm',
    'Facteur d\'échelle : ×' + fr(a.facteur_echelle, 4) + ' (écart ' + fr(a.ecart_echelle_pct, 2) + ' %)' + (a.unite_probable ? ' · unité probable du fichier : ' + a.unite_probable : ''),
    'Grille : ' + g.nx + ' × ' + g.ny + ' à ' + fr(g.pas_mm) + ' mm · ' + g.cellules_valides.toLocaleString('fr-FR') + ' cellules couvertes',
    'Hauteur : de ' + fr(g.hauteur_min_mm, 2) + ' à ' + fr(g.hauteur_max_mm, 2) + ' mm',
    'Boîte : ' + fr(r.boite.x_max - r.boite.x_min) + ' × ' + fr(r.boite.y_max) + ' mm',
    'Calcul : ' + r.duree_ms + ' ms (dans le worker)',
  ].concat(r.avertissements.map((t) => '⚠ ' + t)).map((t) => '<div>' + t + '</div>').join('');
  majParcours();
  const c = p.cote;
  $('prop-cote').textContent = 'Latéralité proposée : ' + (c.valeur || 'indéterminée') + (c.avertissement ? ' — ATTENTION : ' + c.avertissement : (c.ambigu ? ' — peu fiable (signaux ' + (c.concordants === false ? 'contradictoires' : 'faibles') + ')' : '')) + ' — à confirmer';
  for (const rb of document.querySelectorAll('input[name=cote]')) { rb.disabled = false; rb.checked = false; }
  $('btn-cote').disabled = false;
  $('prop-long').textContent = 'Sens talon / avant-pied proposé : talon en Y = 0 (largeur à 25 % : rapport ' + fr(p.sens_longitudinal.confiance, 2) + (p.sens_longitudinal.ambigu ? ', peu fiable' : '') + ') — à confirmer';
  $('prop-vert').textContent = p.sens_vertical.imposee ? 'Face plantaire : imposée par le type « boîte creusée » (le pied est du côté du bord de la boîte) — modifiable ci-dessous' : 'Face plantaire proposée : le côté qui a le plus de surface plane (rapport ' + fr(p.sens_vertical.confiance, 1) + (p.sens_vertical.ambigu ? ', peu fiable' : '') + ') — à confirmer';
  $('btn-inv-y').disabled = false; $('btn-inv-z').disabled = false;
  if (r.generique) { // mode B : le côté est choisi par le praticien dans la fiche, rien à proposer ni à inverser
    $('prop-cote').textContent = 'Latéralité : ' + c.valeur + ' (choisie dans la fiche « pied générique »)';
    for (const rb of document.querySelectorAll('input[name=cote]')) { rb.checked = rb.value === c.valeur; rb.disabled = true; }
    $('btn-cote').disabled = true; $('btn-inv-y').disabled = true; $('btn-inv-z').disabled = true;
    $('prop-long').textContent = 'Sens talon / avant-pied : sans objet (pied générique)'; $('prop-vert').textContent = 'Face plantaire : sans objet (pied générique)';
  }
}

function viderVue() {
  $('bandeau-generique').hidden = true;
  if (maille) { scene.remove(maille); maille.geometry.dispose(); maille.material.dispose(); maille = null; }
  for (const sp of sprites) { scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); }
  sprites = []; positionsAff = null; indicesAff = null; rapport = null; couleursAff = null; surimpAff = null; transp.reset(); mesure.reset(); pinceau.reset(); henke.reset(); mannequin.reset(); deux.surReset();
  $('prop-cote').textContent = 'Latéralité proposée : —'; $('prop-long').textContent = 'Sens talon / avant-pied proposé : —'; $('prop-vert').textContent = 'Face plantaire proposée : —';
  for (const rb of document.querySelectorAll('input[name=cote]')) { rb.disabled = true; rb.checked = false; }
  for (const id of ['btn-cote', 'btn-inv-y', 'btn-inv-z']) $(id).disabled = true;
  apresVider();
  demanderRendu();
}

async function importer(buffer, nom) {
  viderVue();
  $('etat').textContent = 'lecture du fichier (worker)…';
  $('confirm-ecart').hidden = true; $('stats').innerHTML = '';
  opts = { inverserY: false, inverserZ: false }; coteConfirme = null; majCote(); scanPret = false; $('btn-analyser').disabled = true;
  try {
    const r = await demander({ type: 'importer', buffer, nom }, [buffer]);
    const i = r.info;
    $('info-fichier').innerHTML = '<div class="ok">' + nom + '</div><div>Format reconnu : ' + i.format + ' · ' + (i.octets / 1e6).toFixed(2).replace('.', ',') + ' Mo · ' + i.nbTriangles.toLocaleString('fr-FR') + ' triangles · lu en ' + i.ms_lecture + ' ms</div>' + i.avertissements.map((t) => '<div>⚠ ' + t + '</div>').join('');
    noter('import', nom + ' · ' + i.format + ' · ' + i.nbTriangles + ' triangles');
    for (const rb of document.querySelectorAll('input[name=typeemp]')) rb.checked = rb.value === (i.type_probable === 'creusee' ? 'creusee' : 'decharge'); // pré-sélection seulement : le praticien choisit
    majBlocBords();
    scanPret = true; $('btn-analyser').disabled = false;
    $('etat').textContent = 'scan lu : saisissez la longueur du pied';
    deux.surImport();
  } catch (err) { $('info-fichier').innerHTML = ''; $('etat').textContent = 'erreur : ' + err.message; }
}

async function analyser(confirmeEcart = false) {
  const txt = $('longueur').value.trim().replace(',', '.');
  const L = txt === '' ? NaN : Number(txt);
  $('confirm-ecart').hidden = true;
  $('etat').textContent = 'analyse en cours (worker)…';
  try {
    const r = await demander({ type: 'recaler', longueur_mm: L, confirmeEcart, type_empreinte: typeEmpreinte(), bords_mm: bordsMm(), ...opts });
    if (r.type === 'confirmation_requise') {
      const e = r.echelle;
      $('confirm-ecart').hidden = false;
      $('confirm-ecart').innerHTML = '<b>Changement d\'unité à confirmer.</b> ' + (e.unite_probable ? 'Ce fichier est probablement en <b>' + ({ m: 'mètres', cm: 'centimètres', pouce: 'pouces', mm: 'millimètres' }[e.unite_probable] || e.unite_probable) + '</b>. ' : '') + 'Pour que le pied mesure ' + fr(L) + ' mm, il faut l\'agrandir ×' + fr(e.facteur_echelle, 3) + '. Votre pied mesure-t-il bien ' + fr(L) + ' mm ? <br><button id="btn-conf-ecart">Oui, je confirme</button>';
      $('btn-conf-ecart').onclick = () => { noter('confirmation', 'écart d\'échelle ' + fr(e.ecart_echelle_pct, 1) + ' % confirmé (facteur ' + fr(e.facteur_echelle, 3) + ')'); analyser(true); };
      $('etat').textContent = 'confirmation de l\'échelle requise';
      return;
    }
    positionsAff = r.positions; indicesAff = r.indices; rapport = r.rapport;
    afficher(r.positions, r.indices, { couleurHauteur: true, vue: $('vue-preset').value });
    reperes(rapport.boite);
    afficherRapport(rapport);
    coteConfirme = null; majCote();
    noter('creation', 'H_plantaire · ' + (rapport.acquisition.type_empreinte === 'creusee' ? 'boîte creusée convertie · ' : '') + 'longueur ' + fr(L) + ' mm · facteur ' + fr(rapport.acquisition.facteur_echelle, 4) + ' · écart ' + fr(rapport.acquisition.ecart_echelle_pct, 2) + ' %');
    $('etat').textContent = 'affiché';
    apresAnalyse();
  } catch (err) { $('etat').textContent = 'erreur : ' + err.message; }
}

$('fichier').onchange = async (e) => { const f = e.target.files[0]; if (f) deux.memoriserSuggestion(null); if (f) await importer(await f.arrayBuffer(), f.name); };
$('btn-demo').onclick = async () => {
  const d = await demander({ type: 'demo', scenario: $('demo').value });
  if (d.longueurs_suggerees_mm) deux.memoriserSuggestion(d.longueurs_suggerees_mm); else $('longueur').value = String(d.longueur_suggeree_mm);
  await importer(d.buffer, d.nom);
};
$('btn-modeb').onclick = async () => { // mode B : pied générique, sans scan
  const L = nombreFr('mb-long'), cote = document.querySelector('input[name=mb-cote]:checked').value, largeur_rel = Number($('mb-larg').value), voute_mm = Number($('mb-voute').value);
  viderVue(); $('confirm-ecart').hidden = true; $('info-fichier').innerHTML = ''; opts = { inverserY: false, inverserZ: false }; coteConfirme = null; majCote(); scanPret = false; $('btn-analyser').disabled = true;
  $('etat').textContent = 'création du pied générique (worker)…';
  try {
    const r = await demander({ type: 'pied_generique', longueur_mm: L, cote, largeur_rel, voute_mm });
    positionsAff = r.positions; indicesAff = r.indices; rapport = r.rapport;
    afficher(r.positions, r.indices, { couleurHauteur: true, vue: $('vue-preset').value });
    reperes(rapport.boite); afficherRapport(rapport);
    coteConfirme = cote; majCote(); ficheB = { longueur_mm: L, cote, largeur_rel, voute_mm };
    noter('creation', 'H_plantaire GÉNÉRIQUE (mode B, sans scan) · côté ' + cote + ' · longueur ' + fr(L) + ' mm · largeur ×' + fr(largeur_rel, 2) + ' · voûte ' + fr(voute_mm, 0) + ' mm');
    $('etat').textContent = 'affiché';
    apresAnalyse();
  } catch (err) { $('etat').textContent = 'erreur : ' + err.message; }
};
$('btn-analyser').onclick = () => analyser(false);
$('bords-mm').addEventListener('change', () => { if (!scanPret || !rapport || typeEmpreinte() !== 'creusee') return; coteConfirme = null; majCote(); noter('modification', 'bords gardés : ' + fr(bordsMm(), 0) + ' mm'); analyser(true); });
for (const rb of document.querySelectorAll('input[name=typeemp]')) rb.addEventListener('change', () => { majBlocBords(); if (!scanPret) return; coteConfirme = null; majCote(); noter('modification', 'type d\'empreinte : ' + (rb.value === 'creusee' ? 'boîte creusée' : 'pied en décharge') + ' (choisi par le praticien)'); if (rapport) analyser(true); }); // le côté confirmé n'a plus de valeur : il est à reconfirmer
$('btn-cote').onclick = () => {
  const c = document.querySelector('input[name=cote]:checked');
  if (!c) { $('etat').textContent = 'choisissez D ou G avant de confirmer'; return; }
  coteConfirme = c.value; majCote();
  noter('confirmation', 'latéralité ' + c.value + ' confirmée par le praticien (proposée : ' + (rapport.propositions.cote.valeur || '—') + ')');
  $('etat').textContent = 'latéralité confirmée : ' + c.value;
};
$('btn-inv-y').onclick = () => { opts.inverserY = !opts.inverserY; noter('modification', 'sens talon/avant-pied inversé par le praticien'); analyser(true); };
$('btn-inv-z').onclick = () => { opts.inverserZ = !opts.inverserZ; noter('modification', 'face plantaire inversée par le praticien'); analyser(true); };
$('vue-preset').addEventListener('change', majBoutonsVue);
$('vue-preset').onchange = () => { if (baseAffichee) { afficher(basePos, baseIdx, { vue: $('vue-preset').value, limiteY: limiteDevant(baseRapport), couleurs: couleursAff }); } else if (positionsAff) afficher(positionsAff, indicesAff, { couleurHauteur: true, vue: $('vue-preset').value, couleurs: couleursAff }); };
void indicesAff; void scanPret;

// ======================= Lot 2 : la base =======================
let baseRapport = null, baseAffichee = false, basePos = null, baseIdx = null, ligneCoupe = null, minuteur = null, sequence = 0;
const NOMS_TYPES = { plate: 'Plate', thermoformee: 'Thermoformée', pleine_dessous: 'Intermédiaire' };
const COULEURS_TYPES = { plate: '#7fb2e5', thermoformee: '#8fcf9a', pleine_dessous: '#e5b36f' };
const typeBase = () => document.querySelector('input[name=type-base]:checked').value;
const nombreFr = (id) => { const t = $(id).value.trim().replace(',', '.'); return t === '' ? NaN : Number(t); };

function apresVider() {
  baseAffichee = false; baseRapport = null; viderElements(); edition.reset();
  $('btn-base').disabled = true; $('btn-export-base').disabled = true; $('coupe-panel').hidden = true; $('bloc-elements').hidden = true;
  if (ligneCoupe) { scene.remove(ligneCoupe); ligneCoupe.geometry.dispose(); ligneCoupe.material.dispose(); ligneCoupe = null; }
  $('base-msg').textContent = 'Analysez d\'abord un scan (carte 1).';
  $('controles').innerHTML = '<p class="vide">Construisez la base pour voir les contrôles.</p>'; majParcours();
}
function apresAnalyse() {
  scanReplie = false; apresVider(); majParcours();
  $('btn-base').disabled = false;
  $('base-msg').textContent = 'Choisissez le type de base, puis « Construire la base ».';
}
function majFormulaireBase() {
  $('taux-val').textContent = $('taux').value + ' %';
  $('taux').disabled = typeBase() === 'plate';
  $('ligne-biseau').hidden = typeBase() !== 'pleine_dessous'; $('ligne-biseau-lat').hidden = typeBase() !== 'pleine_dessous';
  const demi = etendue() === 'demi', rien = devant() === 'rien';
  $('bloc-demi').hidden = !demi; $('limite-val').textContent = $('limite').value + ' %';
  $('bloc-devant').hidden = rien; $('bloc-arrondi').hidden = !rien; // l'arrondi n'agit que sans matériau devant
}
const etendue = () => document.querySelector('input[name=etendue]:checked').value;
const devant = () => document.querySelector('input[name=devant]:checked').value;
function baseParams() {
  const t = typeBase();
  const p = { type: t, taux: Number($('taux').value) / 100, epaisseur_mm: nombreFr('epaisseur'), lissage_mm: nombreFr('lissage'), contour_lisse: $('contour-lisse').checked, forme_semelle: $('forme-semelle').checked, moulage_tetes: $('moulage-tetes').checked };
  if (t === 'pleine_dessous') { p.cote = coteConfirme; p.biseau_deg = nombreFr('biseau'); p.biseau_lateral_deg = nombreFr('biseau-lat'); }
  p.materiau_id = $('base-materiau').value || null;
  p.etendue = etendue();
  if (p.etendue === 'demi') {
    p.limite_pct = Number($('limite').value); p.devant = devant();
    p.materiau_devant_id = $('devant-materiau').value || null;
    const ed = String($('ep-devant').value).trim();
    p.epaisseur_devant_mm = ed === '' ? null : nombreFr('ep-devant');
    p.raccord_devant_mm = nombreFr('raccord-devant'); p.arrondi_mm = nombreFr('arrondi');
  }
  return p;
}

function ecrireBaseParams(p) { // inverse de baseParams : remet le formulaire dans l'état d'un jeu de réglages
  const coche = (nom, v) => { for (const r of document.querySelectorAll('input[name=' + nom + ']')) r.checked = r.value === v; };
  const nb = (id, v) => { if (v !== undefined && v !== null && Number.isFinite(v)) $(id).value = texteNombre(v, 3); };
  if (p.type) coche('type-base', p.type);
  if (p.taux !== undefined) $('taux').value = String(Math.round(p.taux * 100));
  nb('epaisseur', p.epaisseur_mm); nb('lissage', p.lissage_mm); nb('biseau', p.biseau_deg); if (p.biseau_lateral_deg !== undefined) nb('biseau-lat', p.biseau_lateral_deg); else if (p.type === 'pleine_dessous' && p.biseau_deg !== undefined) $('biseau-lat').value = '0'; // plan enregistré AVANT le biseau latéral : relu sans biseau latéral (le résultat d'origine ne change pas)
  if (p.contour_lisse !== undefined) $('contour-lisse').checked = !!p.contour_lisse;
  if (p.forme_semelle !== undefined) $('forme-semelle').checked = !!p.forme_semelle;
  if (p.moulage_tetes !== undefined) $('moulage-tetes').checked = !!p.moulage_tetes;
  if ('materiau_id' in p) $('base-materiau').value = p.materiau_id || '';
  if (p.etendue) coche('etendue', p.etendue);
  if (p.limite_pct !== undefined) $('limite').value = String(p.limite_pct);
  if (p.devant) coche('devant', p.devant);
  if ('materiau_devant_id' in p) $('devant-materiau').value = p.materiau_devant_id || '';
  if ('epaisseur_devant_mm' in p) $('ep-devant').value = p.epaisseur_devant_mm === null || !Number.isFinite(p.epaisseur_devant_mm) ? '' : texteNombre(p.epaisseur_devant_mm, 3);
  nb('raccord-devant', p.raccord_devant_mm); nb('arrondi', p.arrondi_mm);
  majFormulaireBase();
}

function statsBase(R) {
  const L = [
    'Base <b>' + NOMS_TYPES[R.type] + '</b> · ' + (R.type === 'plate' ? 'sans moulage' : 'moulage ' + fr(R.taux_effectif * 100, 0) + ' %') + ' · épaisseur ' + fr(R.epaisseur_mm, 2) + ' mm · lissage ' + fr(R.lissage_mm, 1) + ' mm',
    'Épaisseur de matériau : de ' + fr(R.epaisseur_min_mm, 2) + ' à ' + fr(R.epaisseur_max_mm, 2) + ' mm · hauteur totale max. ' + fr(R.hauteur_max_mm, 2) + ' mm',
    'Volume : ' + fr(R.volume_mm3 / 1000, 2) + ' cm³ · ' + R.nbTriangles.toLocaleString('fr-FR') + ' triangles · maillage fermé : ' + (R.ferme ? 'oui' : 'NON') + (R.degeneres ? ' · ' + R.degeneres + ' dégénérés' : ''),
    R.contour_lisse ? 'Contour lissé : les ' + R.contour.noeuds_contour + ' nœuds du bord ont été replacés de ' + fr(R.contour.deplacement_moyen_mm, 2) + ' mm en moyenne (max. ' + fr(R.contour.deplacement_max_mm, 2) + ' mm) par rapport aux marches de la grille' : 'Contour en marches de 0,5 mm (lissage désactivé)',
  ];
  L.push(R.moulage_tetes ? 'Têtes métatarsiennes : relief de l\'empreinte moulé' : 'Têtes métatarsiennes : relief aplati (plateau de ' + fr(Math.max(0, R.tetes_aplaties.plateau_mm), 1) + ' mm), voûte gardée');
  if (R.forme_semelle && R.forme_semelle.applique) L.push('Devant arrondi (semelle classique) : le contour suit l\'empreinte au talon et sur les bords médial et latéral ; le devant ne reproduit plus les orteils');
  if (R.biseau) L.push('Biseau médial : ' + fr(R.biseau.angle_deg, 0) + '° côté ' + (R.biseau.cote === 'D' ? 'droit (bord -X)' : 'gauche (bord +X)') + ', largeur max. ' + fr(R.biseau.largeur_max_mm, 1) + ' mm');
  if (R.biseau && R.biseau.lateral) L.push('Biseau latéral : ' + fr(R.biseau.lateral.angle_deg, 0) + '° côté ' + (R.biseau.cote === 'D' ? 'droit (bord +X)' : 'gauche (bord -X)') + ', largeur max. ' + fr(R.biseau.lateral.largeur_max_mm, 1) + ' mm');
  $('legende-zones').hidden = limiteDevant(R) === null;
  if (R.etendue && R.etendue.mode === 'demi') {
    L.push('Demi-semelle : du talon à <b>' + fr(R.etendue.limite_pct, 0) + ' %</b> (' + fr(R.etendue.limite_mm, 0) + ' mm sur ' + fr(R.etendue.longueur_empreinte_mm, 0) + ' mm) · devant : ' + (R.etendue.devant === 'rien' ? '<b>rien</b> (angles du bout arrondis)' : '<b>2<sup>e</sup> matériau</b> de ' + fr(R.etendue.epaisseur_devant_mm, 2) + ' mm, raccord ' + fr(R.etendue.raccord_devant_mm, 0) + ' mm'));
  }
  for (const z of (R.zones || [])) L.push('Zone « ' + (z.zone === 'base' ? 'base' : 'devant') + ' » (de ' + fr(z.y_de_mm, 0) + ' à ' + fr(z.y_a_mm, 0) + ' mm du talon) : matériau ' + (z.materiau ? echapper(z.materiau.libelle) + ' · Shore ' + (z.materiau.shore === null ? 'n.d.' : z.materiau.shore) + ' · résistance ' + (z.materiau.resistance_kgm3 === null ? 'n.d.' : z.materiau.resistance_kgm3 + ' kg/m³') : '<i>non choisi</i>') + ' · épaisseur ' + fr(z.epaisseur_mm, 2) + ' mm');
  for (const l of lignesElements(R)) L.push(l);
  majControles(R);
  L.push('Calcul : ' + R.duree_ms + ' ms (dans le worker)');
  $('stats').innerHTML = L.map((t) => '<div>' + t + '</div>').join('');
}

async function construireLaBase() {
  if (deux.actif()) return deux.calculer();
  if (!rapport) { $('base-msg').textContent = 'Analysez d\'abord un scan (carte 1).'; return; }
  if (typeBase() === 'pleine_dessous' && !coteConfirme) {
    $('base-msg').innerHTML = '<span style="color:#b03030">Confirmez la latéralité (carte 1) : elle décide quel bord est médial.</span>';
    $('etat').textContent = 'latéralité à confirmer pour la base intermédiaire';
    return;
  }
  const mon = ++sequence;
  $('etat').textContent = 'calcul de la base (worker)…'; $('btn-export-base').disabled = true;
  try {
    const params = baseParams();
    const r = await demander({ type: 'base', params, cote: coteConfirme, elements: elementsPourCalcul(), gravure: gravureCourante(), axe: axeCourant() });
    if (mon !== sequence) return; // une demande plus récente est en cours
    majInfoGravure(r.rapport.gravure); baseRapport = r.rapport; basePos = r.positions; baseIdx = r.indices; surimpAff = [{ pied: null, dx: 0, liste: r.surimpressions, strates: r.strates, isthme: r.isthme }];
    afficher(r.positions, r.indices, { vue: $('vue-preset').value, garderCamera: baseAffichee, limiteY: limiteDevant(r.rapport) });
    majApresElements(r.rapport);
    baseAffichee = true; edition.surAffichage();
    statsBase(r.rapport);
    $('base-msg').textContent = 'Base construite. Les réglages se recalculent seuls.';
    { const z = r.rapport.zones && r.rapport.zones[0], m = z && z.materiau; $('base-mat-info').textContent = m ? 'Shore ' + (m.shore === null ? 'n.d.' : m.shore) + ' · résistance ' + (m.resistance_kgm3 === null ? 'n.d.' : m.resistance_kgm3 + ' kg/m³') + ' · feuille de ' + m.epaisseur_feuille_mm + ' mm' : ''; }
    noter('creation', 'base ' + NOMS_TYPES[params.type] + ' · taux ' + fr(r.rapport.taux_effectif * 100, 0) + ' % · épaisseur ' + fr(params.epaisseur_mm, 2) + ' mm · lissage ' + fr(params.lissage_mm, 1) + ' mm' + (params.cote ? ' · côté ' + params.cote : ''));
    $('btn-export-base').disabled = false;
    $('bloc-elements').hidden = false; majParcours();
    $('coupe-panel').hidden = false;
    redimensionner();
    await dessinerCoupe();
    $('etat').textContent = 'base affichée';
  } catch (err) {
    if (mon !== sequence) return;
    $('base-msg').innerHTML = '<span style="color:#b03030">' + err.message + '</span>';
    $('etat').textContent = 'erreur : ' + err.message;
  }
}

async function dessinerCoupe() {
  if (!baseRapport || !rapport) return;
  const mode = document.querySelector('input[name=coupe-mode]:checked').value;
  const bt = rapport.boite;
  const lo = mode === 'T' ? 0 : bt.x_min, hi = mode === 'T' ? bt.y_max : bt.x_max;
  const pos = lo + ((hi - lo) * Number($('coupe-pos').value)) / 100;
  const c = await demander({ type: 'coupe', mode, position_mm: pos });
  $('coupe-val').textContent = (mode === 'T' ? 'y = ' : 'x = ') + fr(c.position_mm, 0) + ' mm';
  const fact = Number($('relief').value); $('coupe-fact').textContent = String(fact);
  const cv = $('coupe');
  // Le canevas a la taille EXACTE de son affichage : un étirement CSS ferait mentir les angles de la coupe (biseau de 45° vu à 26°).
  cv.width = Math.max(400, Math.round(cv.clientWidth)); cv.height = 170;
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  let a0 = Infinity, a1 = -Infinity, zmax = 1;
  for (let k = 0; k < c.coord.length; k++) if (Number.isFinite(c.haut[k])) { a0 = Math.min(a0, c.coord[k]); a1 = Math.max(a1, c.coord[k]); zmax = Math.max(zmax, c.haut[k], Number.isFinite(c.scan[k]) ? c.scan[k] : 0); }
  if (!(a1 > a0)) { g.fillStyle = '#556'; g.font = '15px sans-serif'; g.fillText('Pas de matière à cette position', 40, 80); return; }
  const marge = 30, ech = Math.min((W - 2 * marge) / (a1 - a0 + 6), (H - 88) / (zmax * fact + 2)); // même échelle en X et en Z ; 28 px de marge en haut pour l'encadré de la cote
  const X = (a) => marge + (a - a0 + 3) * ech, Y = (z) => H - 32 - z * fact * ech;
  g.strokeStyle = '#999'; g.lineWidth = 1; g.beginPath(); g.moveTo(marge, Y(0)); g.lineTo(W - marge, Y(0)); g.stroke();
  const segs = []; let cur = null;
  for (let k = 0; k < c.coord.length; k++) { if (Number.isFinite(c.haut[k])) (cur ||= []).push(k); else if (cur) { segs.push(cur); cur = null; } }
  if (cur) segs.push(cur);
  for (const s of segs) {
    g.beginPath();
    s.forEach((k, n) => (n ? g.lineTo(X(c.coord[k]), Y(c.haut[k])) : g.moveTo(X(c.coord[k]), Y(c.haut[k]))));
    for (let n = s.length - 1; n >= 0; n--) g.lineTo(X(c.coord[s[n]]), Y(c.bas[s[n]]));
    const yl = limiteDevant(baseRapport); g.closePath(); g.fillStyle = mode === 'T' && yl !== null && c.position_mm > yl ? '#f5a01f' : COULEURS_TYPES[baseRapport.type]; g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke();
    // Chaque matériau occupe SON intervalle [avant, après] dans l'empilement (base -> éléments, recouvrement en dernier), borné par [dessous, dessus final] :
    // sinon une couche étalée sur toute la semelle (recouvrement) cacherait celle qu'elle recouvre (voûte). Couleur = couleur du matériau choisi, sinon Shore.
    const cumul = new Float32Array(c.coord.length);
    for (let k = 0; k < c.coord.length; k++) cumul[k] = c.haut_base[k];
    for (const idx of (c.ordre || (c.couches || []).map((_, i) => i))) {
      const q = c.couches[idx]; if (!q || !q.visible) continue;
      const lo = new Float32Array(c.coord.length), hi = new Float32Array(c.coord.length), pres = new Uint8Array(c.coord.length);
      for (const k of s) {
        const z = q.z[k], avant = cumul[k]; cumul[k] += z;
        if (z > 0.005) { lo[k] = Math.min(c.haut[k], Math.max(c.bas[k], avant)); hi[k] = Math.min(c.haut[k], Math.max(c.bas[k], cumul[k])); pres[k] = hi[k] - lo[k] > 1e-4 ? 1 : 0; }
        else if (z < -0.005) { lo[k] = c.haut[k]; hi[k] = c.haut_base[k]; pres[k] = hi[k] - lo[k] > 1e-4 ? 1 : 0; } // creux : la matière retirée reste dessinée, comme avant
      }
      const sg = []; let cs = null;
      for (const k of s) { if (pres[k]) (cs ||= []).push(k); else if (cs) { sg.push(cs); cs = null; } }
      if (cs) sg.push(cs);
      const mat = q.materiau_id && materiauxTable ? materiauxTable.parId.get(q.materiau_id) || null : null; // couleur du matériau choisi (titre du tableau)
      for (const t of sg) {
        g.beginPath();
        t.forEach((k, n) => (n ? g.lineTo(X(c.coord[k]), Y(hi[k])) : g.moveTo(X(c.coord[k]), Y(hi[k]))));
        for (let n = t.length - 1; n >= 0; n--) g.lineTo(X(c.coord[t[n]]), Y(lo[t[n]]));
        g.closePath(); g.fillStyle = mat && mat.couleur_hex ? mat.couleur_hex : couleurShore(q.shore_a); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 1.5; g.stroke();
      }
    }
    g.beginPath(); g.setLineDash([10, 7]); g.strokeStyle = '#c0392b'; g.lineWidth = 2.5;
    let debut = true;
    for (const k of s) { if (!Number.isFinite(c.scan[k])) continue; (debut ? g.moveTo : g.lineTo).call(g, X(c.coord[k]), Y(c.scan[k])); debut = false; }
    g.stroke(); g.setLineDash([]);
  }
  if (c.mesures && c.mesures.epaisseur_max_mm !== null && c.mesures.epaisseur_max_mm !== undefined) { // trait de cote : épaisseur réelle au point le plus épais
    let kk = -1, dm = Infinity; for (let k = 0; k < c.coord.length; k++) if (Number.isFinite(c.haut[k])) { const dd = Math.abs(c.coord[k] - c.mesures.epaisseur_max_pos_mm); if (dd < dm) { dm = dd; kk = k; } }
    if (kk >= 0) {
      const xc = X(c.coord[kk]), yh = Y(c.haut[kk]), yb = Y(c.bas[kk]), ex = c.mesures.epaisseur_max_mm;
      g.save(); g.strokeStyle = '#0b1b3a'; g.fillStyle = '#0b1b3a'; g.lineWidth = 1.5; g.setLineDash([]);
      g.beginPath(); g.moveTo(xc, yh - 2); g.lineTo(xc, yb + 2); g.moveTo(xc - 5, yh - 2); g.lineTo(xc + 5, yh - 2); g.moveTo(xc - 5, yb + 2); g.lineTo(xc + 5, yb + 2); g.stroke();
      // Encadré de la valeur : AU-DESSUS de tout ce qui se trouve dans sa largeur (profil, éléments ET pointillés rouges du scan), relié à la cote par un fin trait
      g.font = 'bold 13px sans-serif'; const t = fr(ex, 1) + ' mm', bw = Math.ceil(g.measureText(t).width + 8), bh = 18, bx = Math.round(xc + 6);
      let haut = yh; // y écran le plus haut (valeur la plus petite) sur la largeur de l'encadré
      for (let k = 0; k < c.coord.length; k++) { const xk = X(c.coord[k]); if (xk < bx - 3 || xk > bx + bw + 3) continue; if (Number.isFinite(c.haut[k])) haut = Math.min(haut, Y(c.haut[k])); if (Number.isFinite(c.scan[k])) haut = Math.min(haut, Y(c.scan[k])); }
      const by = Math.round(Math.max(2, haut - bh - 8));
      g.setLineDash([2, 2]); g.beginPath(); g.moveTo(xc, yh - 2); g.lineTo(xc, by + bh); g.lineTo(bx, by + bh); g.stroke(); g.setLineDash([]); // trait de liaison cote -> encadré
      g.fillStyle = 'rgba(255,255,255,.95)'; g.fillRect(bx, by, bw, bh); g.strokeStyle = '#0b1b3a'; g.lineWidth = 1; g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      g.fillStyle = '#0b1b3a'; g.fillText(t, bx + 4, by + bh - 5);
      if (location.search.includes('test4c')) window.__coteCoupe = { x: bx, y: by, w: bw, h: bh, xc, yh, yb }; // position de l'encadré (contrôles automatiques)
      g.restore();
    }
  }
  g.fillStyle = '#334'; g.font = '13px sans-serif';
  g.fillRect(marge, H - 16, 10 * ech, 3); g.fillText('10 mm', marge + 10 * ech + 8, H - 11);
  if (mode === 'T' && coteConfirme) { // médial = côté -X pour un pied droit, +X pour un pied gauche
    g.font = 'italic 13px sans-serif';
    g.fillText(coteConfirme === 'D' ? 'médial' : 'latéral', marge, 16); g.textAlign = 'right';
    g.fillText(coteConfirme === 'D' ? 'latéral' : 'médial', W - marge, 16); g.textAlign = 'left';
  }
  afficherMesures(c);
  // trait de coupe dans la vue 3D
  if (ligneCoupe) { scene.remove(ligneCoupe); ligneCoupe.geometry.dispose(); ligneCoupe.material.dispose(); }
  const zt = (baseRapport.hauteur_max_mm + 1) * Number($('relief').value);
  const pts = mode === 'T' ? [new THREE.Vector3(bt.x_min - 6, c.position_mm, zt), new THREE.Vector3(bt.x_max + 6, c.position_mm, zt)] : [new THREE.Vector3(c.position_mm, -6, zt), new THREE.Vector3(c.position_mm, bt.y_max + 6, zt)];
  ligneCoupe = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xd02020, depthTest: false }));
  scene.add(ligneCoupe);
  demanderRendu();
}

function programmer() {
  majFormulaireBase();
  if (!baseAffichee) return;
  clearTimeout(minuteur);
  minuteur = setTimeout(construireLaBase, 250);
}
// Épaisseur de la base (et de la zone « devant ») reprise du titre du matériau choisi (demande de Joël, 01/11) ; refusée proprement hors limites.
function epaisseurDepuisMateriau(idMat, idEp, idMsg, nom) {
  const m = materiauxTable && $(idMat).value ? materiauxTable.parId.get($(idMat).value) : null, ep = epaisseurBaseApplicable(m), msg = $(idMsg);
  msg.textContent = '';
  if (ep === null) { if (m) msg.textContent = 'Matériau choisi : pas d\'épaisseur exploitable dans le titre, épaisseur inchangée.'; return; }
  try {
    if (ep < EPAISSEUR_BASE_MIN_MM || ep > EPAISSEUR_BASE_MAX_MM) throw new RangeError('hors de ' + EPAISSEUR_BASE_MIN_MM + ' à ' + EPAISSEUR_BASE_MAX_MM + ' mm');
    $(idEp).value = texteNombre(ep);
    msg.textContent = '→ épaisseur ' + nom + ' ajustée à ' + texteNombre(ep) + ' mm (titre du matériau).';
    noter('modification', 'épaisseur ' + nom + ' ajustée à ' + texteNombre(ep) + ' mm selon le matériau « ' + m.libelle.trim() + ' »');
  } catch (err) { msg.textContent = '⚠ ' + texteNombre(ep) + ' mm (titre du matériau) refusé : ' + err.message + ' — épaisseur inchangée.'; }
}
$('base-materiau').addEventListener('change', () => epaisseurDepuisMateriau('base-materiau', 'epaisseur', 'base-ep-auto', 'de la base'));
$('devant-materiau').addEventListener('change', () => epaisseurDepuisMateriau('devant-materiau', 'ep-devant', 'devant-ep-auto', 'de devant'));
for (const id of ['taux']) $(id).addEventListener('input', programmer);
for (const id of ['epaisseur', 'lissage', 'biseau', 'biseau-lat', 'contour-lisse', 'forme-semelle', 'moulage-tetes', 'base-materiau', 'devant-materiau', 'ep-devant', 'raccord-devant', 'arrondi']) $(id).addEventListener('change', programmer);
$('limite').addEventListener('input', programmer);
for (const id of ['grav-actif', 'grav-nom', 'grav-date', 'grav-prof']) $(id).addEventListener(id === 'grav-actif' ? 'change' : 'input', () => { $('bloc-grav').style.opacity = $('grav-actif').checked ? '' : '.45'; if (deux.actif() || baseAffichee) programmerElements(); });
for (const rb of document.querySelectorAll('input[name=etendue], input[name=devant]')) rb.addEventListener('change', programmer);
for (const rb of document.querySelectorAll('input[name=type-base]')) rb.addEventListener('change', programmer);
$('btn-base').onclick = construireLaBase;
$('coupe-toggle').onclick = () => { const p = $('coupe-panel'); p.classList.toggle('replie'); $('coupe-toggle').textContent = p.classList.contains('replie') ? '▴ Déplier' : '▾ Replier'; if (!p.classList.contains('replie')) dessinerCoupe(); };
$('coupe-pos').addEventListener('input', dessinerCoupe);
for (const rb of document.querySelectorAll('input[name=coupe-mode]')) rb.addEventListener('change', dessinerCoupe);
$('relief').addEventListener('change', () => { dessinerCoupe(); });
$('btn-cote').addEventListener('click', () => { if (baseAffichee && typeBase() === 'pleine_dessous') construireLaBase(); else if (baseRapport) dessinerCoupe(); });
$('btn-export-base').onclick = async () => {
  if (deux.actif()) return deux.exporter();
  if (!coteConfirme) { $('base-msg').innerHTML = '<span style="color:#b03030">Confirmez la latéralité (carte 1) avant d\'exporter.</span>'; return; }
  $('etat').textContent = 'export en cours (worker)…';
  try {
    const r = await demander({ type: 'exporter', cote: coteConfirme });
    const nom = nomFichierSTL((rapport && rapport.generique ? 'INDICATIF-Pied-generique-' : '') + { plate: 'Base-fictive-plate', thermoformee: 'Base-fictive-thermoformee', pleine_dessous: 'Base-fictive-intermediaire' }[baseRapport.type], coteConfirme, new Date().toISOString());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.stl], { type: 'model/stl' })); a.download = nom; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    noter('export', nom + ' · ' + r.octets + ' octets · fichier relu : fermé');
    $('etat').textContent = 'exporté : ' + nom + ' (contrôlé : fermé, ' + r.nbTriangles + ' triangles)';
  } catch (err) { $('base-msg').innerHTML = '<span style="color:#b03030">' + err.message + '</span>'; $('etat').textContent = 'erreur : ' + err.message; }
};
// ======================= Lot 3 : éléments, matériaux (tableau PODAXIA), coupe mesurée =======================
const NOMS_ELEMENTS = new Proxy({ coin_pronateur_posterieur: 'Coin pronateur postérieur', soutien_de_voute: 'Soutien de voûte libre' }, { get: (o, k) => o[k] || (TYPES_ELEMENTS[k] ? TYPES_ELEMENTS[k].libelle : String(k)) }); // les types importés (bibliothèque PODAXIA) donnent leur libellé
const estImporte = (type) => !!(TYPES_ELEMENTS[type] && TYPES_ELEMENTS[type].importe);
const estCoin = (type) => type === 'coin_pronateur_posterieur' || !!(TYPES_ELEMENTS[type] && TYPES_ELEMENTS[type].fiche && TYPES_ELEMENTS[type].fiche.coin);
const estCreux = (type) => !!(TYPES_ELEMENTS[type] && TYPES_ELEMENTS[type].signe_defaut === -1);
const materiauDe = (e) => (e && e.materiau_id && materiauxTable ? materiauxTable.parId.get(e.materiau_id) || null : null);
const couleurElement = (e, i) => { const m = materiauDe(e); return m && m.couleur_hex ? m.couleur_hex : couleurTeinte(e.teinte, i); }; // couleur écrite dans le titre du matériau, sinon teinte de la palette
const textureElement = (e) => { const m = materiauDe(e); return m && m.texture ? m.texture : null; };
const nomCouleur = (e) => { const m = materiauDe(e); return m && m.couleur_nom ? 'couleur du matériau : ' + m.couleur_nom : 'couleur propre à l\'élément'; };
const estPoint = (type) => !!(TYPES_ELEMENTS[type] && TYPES_ELEMENTS[type].point);
const estRotable = (type) => { const T = TYPES_ELEMENTS[type]; return !!T && !T.bord && !T.recouvrement && !T.coteHaut && !T.point && !T.pinceau; }; // comme le noyau : ni bord, ni coin, ni recouvrement, ni point (rond)
const estBord = (type) => !!(TYPES_ELEMENTS[type] && TYPES_ELEMENTS[type].bord);
const NOMS_BORDS = { medial: 'médial', lateral: 'latéral', posterieur: 'postérieur (talon)' };
function couleurShore(shore) { // souple (clair, jaune) -> ferme (foncé, rouge brun) ; gris = Shore non choisi
  if (shore === null || shore === undefined || !Number.isFinite(shore)) return '#c9c9c9';
  const t = Math.min(1, Math.max(0, (shore - 5) / 65));
  return 'hsl(' + Math.round(52 - 52 * t) + ', 80%, ' + Math.round(78 - 38 * t) + '%)';
}
const echapper = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const texteNombre = (v, n = 2) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Number(v.toFixed(n))).replace('.', ','));
const lireNombre = (t) => { const x = String(t).trim().replace(',', '.'); return x === '' ? null : Number(x); };

function modeHauteurTexte(type) {
  const F = TYPES_ELEMENTS[type].fiche;
  return F.mode_hauteur === 'conservee' ? 'forme conservée : la partie fixe de ' + texteNombre(F.plancher_fixe_mm, 1) + ' mm ne change pas' : 'étirement vertical simple';
}
function remplirBibliotheque() { // liste des 23 éléments importés, par zone (arrière-pied, médio-pied…)
  const zones = {};
  for (const [cle, T] of Object.entries(TYPES_ELEMENTS)) if (T.importe) (zones[T.zone] = zones[T.zone] || []).push([cle, T]);
  for (const [zone, liste] of Object.entries(zones)) {
    const g = document.createElement('optgroup'); g.label = 'Bibliothèque PODAXIA — ' + zone;
    for (const [cle, T] of liste) { const o = document.createElement('option'); o.value = cle; o.textContent = T.libelle + (T.signe_defaut === -1 ? ' (en creux)' : '') + (T.fiche.coin ? ' (en degrés)' : ''); g.append(o); }
    $('el-type').append(g);
  }
}
remplirBibliotheque();
{ const g = document.createElement('optgroup'); g.label = 'Points curseurs (hauteur au 1/10 mm)'; const o = document.createElement('option'); o.value = 'point_curseur'; o.textContent = 'Point curseur (bosse ou creux rond)'; g.append(o); $('el-type').append(g); }
{ const g = document.createElement('optgroup'); g.label = 'Toute la semelle'; const o = document.createElement('option'); o.value = 'recouvrement'; o.textContent = 'Matériau de recouvrement (par-dessus tout)'; g.append(o); $('el-type').append(g); }
// ---- gravure sous la semelle (nom complet, pied D/G, date) : lue dans la carte « base », envoyée au worker avec chaque calcul
const dateDuJour = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
if (!$('grav-date').value) $('grav-date').value = dateDuJour();
function gravureCourante() {
  if (!$('grav-actif').checked) return { actif: false };
  const prof = Number(String($('grav-prof').value).replace(',', '.'));
  return { actif: true, nom: $('grav-nom').value, date: $('grav-date').value, profondeur_mm: Number.isFinite(prof) && prof > 0 && prof <= 1 ? prof : 0.4 };
}
window.gravureCourante = gravureCourante;
function majInfoGravure(g) {
  const el = $('grav-info'); if (!el) return;
  if (!g || !g.actif) { el.innerHTML = g && g.avertissements && g.avertissements.length ? '<span style="color:#b03030">' + echapper(g.avertissements.join(' · ')) + '</span>' : ($('grav-actif').checked ? '' : 'Gravure désactivée.'); return; }
  el.innerHTML = 'Gravé : « ' + echapper(g.lignes.join(' / ')) + ' » · lettres de ' + g.hauteur_lettre_mm + ' mm · creux de ' + fr(g.profondeur_mm, 2) + ' mm' + (g.avertissements.length ? '<br><span style="color:#a15c00">' + echapper(g.avertissements.join(' · ')) + '</span>' : '');
}
window.majInfoGravure = majInfoGravure;
// Lot 4 bis : axe de Henke du pied affiché (proposition validée ou non) ; la torsion n'est appliquée que si l'axe est validé
const axeCourant = () => { const o = henke.exporter(); return o && coteConfirme ? o[coteConfirme] : undefined; };
function elementsPourCalcul() {
  return elements.map((e) => ({ ...e }));
}
function optionsMateriaux(choisi) {
  let h = '<option value="">— aucun choisi —</option>';
  for (const m of (materiauxTable ? materiauxTable.liste : [])) {
    h += '<option value="' + echapper(m.id) + '"' + (m.id === choisi ? ' selected' : '') + '>' + echapper(m.libelle + ' · ' + m.epaisseur_texte + ' · Shore ' + (m.shore === null ? 'n.d.' : m.shore) + ' · ' + (m.resistance_kgm3 === null ? 'rés. n.d.' : m.resistance_kgm3 + ' kg/m³')) + '</option>';
  }
  return h;
}
function champ(i, f, v, t = 5) { return '<input type="text" inputmode="decimal" size="' + t + '" data-i="' + i + '" data-f="' + f + '" value="' + texteNombre(v) + '">'; }
function dessinerCartes() {
  const cont = $('liste-elements');
  cont.innerHTML = '';
  elements.forEach((e, i) => {
    const d = document.createElement('div');
    d.className = 'el'; d.dataset.i = String(i);
    const coin = estCoin(e.type), bord = estBord(e.type), imp = estImporte(e.type), creux = estCreux(e.type), rec = e.type === 'recouvrement', pt = estPoint(e.type), pin = e.type === 'pinceau';
    if (e.type === 'skive') { // skive de Kirby : bord, profondeur, pente, longueur ; la largeur de la pente vient du calcul
      const inf = rapportElements[i] && rapportElements[i].skive, lg = inf ? fr(inf.largeur_mm, 1) + ' mm' : fr(e.profondeur_mm / Math.tan((e.angle_skive_deg || 15) * Math.PI / 180), 1) + ' mm';
      d.classList.toggle('autre', deux.autrePied(e));
      d.innerHTML = '<div><span class="carte-teinte" style="background:' + couleurElement(e, i) + '" title="' + echapper(nomCouleur(e)) + '"></span><b>' + (i + 1) + '. ' + NOMS_ELEMENTS[e.type] + '</b> ' + deux.badge(e, i) + ' <label><input type="checkbox" data-i="' + i + '" data-f="visible"' + (e.visible === false ? '' : ' checked') + '> visible</label> <button data-act="suppr" data-i="' + i + '">Retirer</button></div>'
        + '<p>Bord <select data-i="' + i + '" data-f="bord_skive"><option value="medial"' + (e.bord_skive === 'medial' ? ' selected' : '') + '>médial</option><option value="lateral"' + (e.bord_skive === 'lateral' ? ' selected' : '') + '>latéral</option></select> · profondeur ' + champ(i, 'profondeur_mm', e.profondeur_mm, 4) + ' mm <small>(2 à 6)</small></p>'
        + '<p>Pente ' + champ(i, 'angle_skive_deg', e.angle_skive_deg, 4) + ' ° <small>(10 à 25)</small> → <span data-role="skive-largeur">largeur ' + lg + '</span> · longueur ' + champ(i, 'longueur_skive_mm', e.longueur_skive_mm, 4) + ' mm depuis le talon <small>(20 à 120)</small></p>'
        + '<p><small>Rainure au bord de l\'arrière-pied : la profondeur est maximale AU bord et diminue vers l\'intérieur selon la pente. Retire de la matière, sans jamais descendre sous 0,9 mm. Posée à son rang (éléments précédents compris), avant le recouvrement. Pas de matériau propre.</small></p><div class="el-avert" data-role="avert"></div>';
      cont.append(d); return;
    }
    if (e.type === 'torsion') { // torsion autour de l'axe de Henke : phi, zone, charnière, transition ; l'angle frontal obtenu vient du calcul
      const inf = rapportElements[i] && rapportElements[i].torsion, af = inf && inf.angle_frontal_deg !== null && inf.angle_frontal_deg !== undefined ? fr(inf.angle_frontal_deg, 2) + '°' : '—', rouge = Math.abs(e.phi_deg) > 10;
      d.classList.toggle('autre', deux.autrePied(e));
      d.innerHTML = '<div><span class="carte-teinte" style="background:' + couleurElement(e, i) + '" title="' + echapper(nomCouleur(e)) + '"></span><b>' + (i + 1) + '. ' + NOMS_ELEMENTS[e.type] + '</b> ' + deux.badge(e, i) + ' <label><input type="checkbox" data-i="' + i + '" data-f="visible"' + (e.visible === false ? '' : ' checked') + '> visible</label> <button data-act="suppr" data-i="' + i + '">Retirer</button></div>'
        + '<p>phi <input type="range" min="-15" max="15" step="0.5" data-i="' + i + '" data-f="phi_deg" value="' + (Number.isFinite(e.phi_deg) ? e.phi_deg : 0) + '" style="vertical-align:middle;width:150px"> ' + champ(i, 'phi_deg', e.phi_deg, 4) + ' ° <small>(+ supination : côté médial relevé · − pronation ; pas 0,5°)</small></p>'
        + '<p data-role="tor-frontal"><b>Angle frontal obtenu : ' + af + '</b> <small>= atan(tan φ · cos λ · cos δ) : l\'inclinaison de l\'axe réduit l\'effet frontal</small></p>'
        + (rouge ? '<p class="rouge"><label><input type="checkbox" data-i="' + i + '" data-f="phi_confirme"' + (e.phi_confirme ? ' checked' : '') + '> Je confirme une torsion de plus de 10° (' + texteNombre(e.phi_deg, 1) + '°)</label></p>' : '')
        + '<p>Zone <select data-i="' + i + '" data-f="zone_torsion"><option value="totale"' + (e.zone_torsion === 'totale' ? ' selected' : '') + '>toute la semelle</option><option value="arriere"' + (e.zone_torsion === 'arriere' ? ' selected' : '') + '>arrière-pied (derrière la charnière)</option><option value="avant"' + (e.zone_torsion === 'avant' ? ' selected' : '') + '>avant-pied (devant la charnière)</option></select>'
        + (e.zone_torsion === 'totale' ? '' : ' · charnière à ' + champ(i, 's_charniere_mm', e.s_charniere_mm, 4) + ' mm de p0 le long de l\'axe · transition ' + champ(i, 'transition_mm', e.transition_mm, 4) + ' mm <small>(10 mm au moins)</small>') + '</p>'
        + '<p><small>Mode « ajout » : on n\'enlève jamais de matière (la charnière est au bord le plus bas). Appliquée seulement si l\'axe de Henke du pied est <b>validé</b>. Posée à son rang (éléments précédents compris), avant le recouvrement. Pas de matériau propre.</small></p><div class="el-avert" data-role="avert"></div>';
      cont.append(d); return;
    }
    if (pin) { // retouche au pinceau : un résumé, aucun champ (elle se refait au pinceau, se retire ou se masque)
      const c0 = (e.coups || [])[0] || {};
      d.classList.toggle('autre', deux.autrePied(e));
      d.innerHTML = '<div><span class="carte-teinte" style="background:' + couleurElement(e, i) + '" title="' + echapper(nomCouleur(e)) + '"></span><b>' + (i + 1) + '. ' + NOMS_ELEMENTS[e.type] + '</b> ' + deux.badge(e, i) + ' <label><input type="checkbox" data-i="' + i + '" data-f="visible"' + (e.visible === false ? '' : ' checked') + '> visible</label> <button data-act="suppr" data-i="' + i + '">Retirer</button></div>'
        + '<p>' + (e.coups || []).length + ' passage(s) · rayon ' + texteNombre(c0.rayon_mm || 0, 1) + ' mm · ' + (c0.mode === 'remplir' ? 'remplissage (ajoute seulement)' : 'lissage') + '</p><p><small>Retouche de la surface telle qu\'elle est à ce rang (éléments précédents compris), avant le recouvrement. Pas de matériau propre.</small></p><div class="el-avert" data-role="avert"></div>';
      cont.append(d); return;
    }
    d.classList.toggle('autre', deux.autrePied(e)); d.innerHTML = '<div><span class="carte-teinte" style="background:' + couleurElement(e, i) + '" title="' + echapper(nomCouleur(e)) + '"></span><b>' + (i + 1) + '. ' + NOMS_ELEMENTS[e.type] + '</b> ' + deux.badge(e, i) + ' <label><input type="checkbox" data-i="' + i + '" data-f="visible"' + (e.visible === false ? '' : ' checked') + '> visible</label> <button data-act="suppr" data-i="' + i + '">Retirer</button></div>'
      + (pt ? '<p>Hauteur <button class="pas" data-act="pas" data-i="' + i + '" data-pas="-0.1" title="−0,1 mm">−</button> ' + champ(i, 'hauteur_mm', e.hauteur_mm, 5) + ' <button class="pas" data-act="pas" data-i="' + i + '" data-pas="0.1" title="+0,1 mm">+</button> mm <small>(0 = niveau de la semelle ; + monte, − descend ; au 1/10 mm, de −8 à +8)</small></p><p>Rayon ' + champ(i, 'rayon_mm', e.rayon_mm) + ' mm <small>(2 à 60 ; profil en cosinus, nul au bord)</small></p><p><small>Sur la 3D : tirer la BILLE vers le haut ou le bas = monter / descendre la semelle à cet endroit ; tirer le POINT BLANC au sol ou le CERCLE orange = déplacer le point sur la semelle ; poignée rouge = rayon ; molette ou ↑ ↓ = 0,1 mm.</small></p>'
        : bord ? '<p>Hauteur ' + champ(i, 'hauteur_mm', e.hauteur_mm) + ' mm <small>(sommet AU bord, sans décroissance)</small></p><p>Biseau du dessous ' + champ(i, 'biseau_deg', e.biseau_deg) + ' ° <small>(15 à 75, 45 par défaut ; comme la base intermédiaire)</small></p><p><small>Bord(s) : ' + TYPES_ELEMENTS[e.type].bords.map((b) => NOMS_BORDS[b]).join(' + ') + '</small></p>'
        : coin ? '<p>Angle ' + champ(i, 'angle_deg', e.angle_deg) + ' ° &nbsp;ou hauteur au bord ' + champ(i, 'hauteur_mm', e.hauteur_mm) + ' mm <small>(l\'un donne l\'autre : h = largeur × tan θ)</small></p>'
        : rec ? '<p>Épaisseur ' + champ(i, 'hauteur_mm', e.hauteur_mm) + ' mm <small>(0,2 à 5 ; choisir le matériau ci-dessous)</small></p>'
        : imp ? '<p>' + (creux ? 'Profondeur du creux ' : 'Hauteur ') + champ(i, 'hauteur_mm', e.hauteur_mm) + ' mm <small>(' + (creux ? 'au fond du creux' : 'sommet') + ' ; ' + modeHauteurTexte(e.type) + ')</small></p>'
        : '<p>Hauteur ' + champ(i, 'hauteur_mm', e.hauteur_mm) + ' mm <small>(sommet)</small></p>')
      + (rec ? '<p><small>Couche posée sur TOUTE la semelle, par-dessus les éléments (toujours appliquée en dernier).</small></p>' : '')
      + (coin ? '<p>Ancrage <select data-i="' + i + '" data-f="ancrage"><option value="bord"' + (e.ancrage !== 'libre' ? ' selected' : '') + '>au bord de la semelle (côté haut, sommet plein au bord)</option><option value="libre"' + (e.ancrage === 'libre' ? ' selected' : '') + '>libre (je place le centre)</option></select></p>'
        + (e.ancrage === 'libre' ? '<p>Centre à ' + champ(i, 'dy_mm', e.dy_mm) + ' mm du talon · ' + champ(i, 'dx_mm', e.dx_mm) + ' mm vers le médial</p>' : '<p>Début à ' + champ(i, 'dy_mm', e.dy_mm) + ' mm du talon <small>(0 = démarre au bord du talon ; côté haut = ' + (TYPES_ELEMENTS[e.type].coteHaut === 'medial' ? 'médial' : 'latéral') + ')</small></p>') : '')
      + (rec || coin ? '' : imp ? '<p>Début (bord arrière) à ' + champ(i, 'dy_mm', e.dy_mm) + ' mm du talon <small>(0 = démarre au bord du talon)</small> · ' + champ(i, 'dx_mm', e.dx_mm) + ' mm vers le médial</p>' : bord ? '<p>Milieu à ' + champ(i, 'dy_mm', e.dy_mm) + ' mm du talon <small>(le long du pied ; le bord se déduit du type)</small></p>' : '<p>Position : ' + champ(i, 'dy_mm', e.dy_mm) + ' mm du talon (centre) · ' + champ(i, 'dx_mm', e.dx_mm) + ' mm vers le médial</p>')
      + (rec || pt ? '' : imp ? '<p>Largeur ' + champ(i, 'largeur_mm', e.largeur_mm) + ' · longueur (avant-arrière) ' + champ(i, 'longueur_mm', e.longueur_mm) + ' mm <small>(étirement ×0,5 à ×3 du fichier ' + echapper(TYPES_ELEMENTS[e.type].fiche.fichier) + ' : ' + texteNombre(TYPES_ELEMENTS[e.type].largeur_ref_mm, 1) + ' × ' + texteNombre(TYPES_ELEMENTS[e.type].longueur_ref_mm, 1) + ')</small></p>'
        + (coin ? '<p><small>Un coin élargi garde son angle (la hauteur au bord suit la largeur).</small></p>' : '<p>Douceur des bords ' + champ(i, 'douceur_mm', e.douceur_mm) + ' mm <small>(0 = pente du fichier ; plus grand = plus doux)</small></p>')
        + (creux ? '<p>Si le creux traverse la base : trou, ou comblé par <select data-i="' + i + '" data-f="comblement_materiau_id">' + optionsMateriaux(e.comblement_materiau_id).replace('— aucun choisi —', '— pas de comblement (trou) —') + '</select></p>' : '')
        : '<p>' + (bord ? 'Étendue depuis le bord ' : 'Largeur ') + champ(i, 'largeur_mm', e.largeur_mm) + ' · longueur ' + champ(i, 'longueur_mm', e.longueur_mm) + ' · raccord ' + champ(i, 'raccord_mm', e.raccord_mm) + ' mm</p>')
      + (estRotable(e.type) ? '<p>Rotation ' + champ(i, 'angle_plan_deg', e.angle_plan_deg || 0, 4) + ' ° <small>(autour du centre ; 0 = comme le fichier ; + : l\'avant penche vers le médial, pour chaque pied)</small></p>' : '')
      + '<p>Matériau <select data-i="' + i + '" data-f="materiau_id">' + optionsMateriaux(e.materiau_id) + '</select> <small data-role="auto-h"></small></p>'
      + '<p>Densité (Shore) ' + champ(i, 'shore_a', e.shore_a) + ' <span class="pastille" style="background:' + couleurShore(e.shore_a) + '"></span> <small data-role="tab-shore"></small></p>'
      + '<div class="el-avert" data-role="avert"></div>';
    cont.append(d);
  });
  $('el-vide').hidden = elements.length > 0;
  edition.surCartes();
}
function viderElements() { elements = []; rapportElements = []; if (document.getElementById('liste-elements')) dessinerCartes(); }

let noteSuggestion = ''; // message du dernier clic sur « Placer la voûte ici » (la zone se redessine à chaque calcul)
function majSuggestion(rapport) {
  const s = rapport.suggestion_voute, d = $('sugg-voute');
  if (!s) { d.hidden = true; return; }
  d.hidden = false;
  d.innerHTML = '💡 <b>Suggestion</b> : milieu de la voûte à <b>' + fr(s.dy_mm, 0) + ' mm</b> du talon (' + fr(s.pourcentage, 0) + ' % de la longueur), appui médial de l\'isthme à x = ' + fr(s.x_medial_mm, 1) + ' mm. '
    + (s.a_confirmer ? '<b>À confirmer</b> : ' + echapper(s.raison) + '. ' : '') + '<button id="btn-sugg-voute">Placer la voûte ici</button>' + noteSuggestion;
  $('btn-sugg-voute').onclick = () => {
    let i = elements.findIndex((e) => e.type === 'voute_bord');
    if (i < 0) { elements.push({ type: 'voute_bord', ...TYPES_ELEMENTS.voute_bord.defauts, materiau_id: null, shore_a: null, visible: true }); i = elements.length - 1; dessinerCartes(); }
    const autres = elements.filter((_, n) => n !== i), q = positionApres(autres, 'voute_bord', elements[i].longueur_mm, s.dy_mm, s.longueur_pied_mm); // (le paramètre « rapport » est celui de la base, pas du scan)
    elements[i].dy_mm = Math.round(q.dy_mm * 10) / 10; dernierModifie = i;
    noteSuggestion = '';
    if (q.impossible) noteSuggestion = ' <small>Attention : la suggestion chevauche « ' + echapper(q.apres) + ' » et un décalage sortirait du pied : le chevauchement est signalé.</small>';
    if (q.decale) noteSuggestion = ' <small>La suggestion (' + fr(s.dy_mm, 0) + ' mm) chevauchait « ' + echapper(q.apres) + ' » : la voûte démarre après (milieu à ' + fr(q.dy_mm, 0) + ' mm).</small>';
    d.insertAdjacentHTML('beforeend', noteSuggestion);
    const inp = document.querySelector('#liste-elements [data-i="' + i + '"][data-f="dy_mm"]'); if (inp) inp.value = texteNombre(elements[i].dy_mm);
    noter('modification', 'suggestion acceptée : milieu de la voûte à ' + fr(elements[i].dy_mm, 0) + ' mm du talon' + (q.decale ? ' (décalée après ' + q.apres + ')' : ''));
    programmerElements();
  };
}
function majApresElements(rapport) {
  majSuggestion(rapport);
  rapportElements = rapport.elements || [];
  rapportElements.forEach((inf, i) => {
    const carte = document.querySelector('#liste-elements .el[data-i="' + i + '"]');
    if (!carte) return;
    const maj = (f, v) => { const inp = carte.querySelector('[data-f="' + f + '"]'); if (inp && document.activeElement !== inp) inp.value = texteNombre(v); };
    if (estCoin(inf.type)) { maj('angle_deg', inf.angle_deg); maj('hauteur_mm', inf.hauteur_reglee_mm); }
    const mat = materiauxTable && inf.materiau_id ? materiauxTable.parId.get(inf.materiau_id) : null;
    const ts = carte.querySelector('[data-role="tab-shore"]'); if (ts) ts.textContent = mat ? 'tableau : ' + (mat.shore === null ? 'pas de Shore' : mat.shore) + ' · résistance ' + (mat.resistance_kgm3 === null ? 'non indiquée' : mat.resistance_kgm3 + ' kg/m³') + ' · feuille de ' + mat.epaisseur_mm + ' mm' : '';
    const sl = carte.querySelector('[data-role="skive-largeur"]'); if (sl && inf.skive) sl.textContent = 'largeur ' + fr(inf.skive.largeur_mm, 1) + ' mm' + (inf.skive.limitees ? ' · profondeur obtenue ' + fr(inf.skive.profondeur_reelle_mm, 2) + ' mm' : '');
    const tf = carte.querySelector('[data-role="tor-frontal"] b'); if (tf && inf.torsion) tf.textContent = 'Angle frontal obtenu : ' + (inf.torsion.angle_frontal_deg === null ? '—' : fr(inf.torsion.angle_frontal_deg, 2) + '°');
    carte.querySelector('[data-role="avert"]').innerHTML = inf.avertissements.map((a) => '<div>' + (/^[⚠⛔🔴]/u.test(a) ? '' : '⚠ ') + echapper(a) + '</div>').join('');
    const pastille = carte.querySelector('.pastille'); if (pastille) pastille.style.background = couleurShore(inf.shore_a);
  });
}
function lignesElements(R) {
  return (R.elements || []).map((e, i) => 'Élément ' + (i + 1) + ' — <b>' + e.libelle + '</b> : ' + (e.biseau_deg !== null && e.biseau_deg !== undefined ? 'hauteur ' + fr(e.hauteur_reglee_mm, 2) + ' mm au bord ' + e.bords.map((b) => NOMS_BORDS[b]).join(' + ') + ', biseau ' + fr(e.biseau_deg, 0) + '°' : e.angle_deg !== null ? 'angle ' + fr(e.angle_deg, 2) + '° (hauteur au bord ' + fr(e.hauteur_reglee_mm, 2) + ' mm)' : 'hauteur ' + fr(e.hauteur_reglee_mm, 2) + ' mm')
    + ' · matériau ' + (e.materiau ? echapper(e.materiau) : '<i>non choisi</i>') + ' · Shore ' + (e.shore_a === null ? '<i>non choisi</i>' : e.shore_a) + ' · résistance ' + (e.resistance_kgm3 === null || e.resistance_kgm3 === undefined ? '<i>non indiquée</i>' : e.resistance_kgm3 + ' kg/m³') + (e.visible ? '' : ' · <i>masqué</i>') + ' · réf. ' + e.reference_fournisseur);
}

function afficherMesures(c) {
  const L = [];
  const m = c.mesures;
  const ent = (v) => (Math.round(v) === 0 ? 0 : Math.round(v)); // jamais « -0 »
  const lieu = (pos) => (m.mode === 'T' ? 'x = ' + fr(ent(pos), 0) + ' mm' : fr(ent(pos - ((baseRapport && baseRapport.repere_talon && baseRapport.repere_talon.y_mm) || 0)), 0) + ' mm du talon'); // en travers : x ; talon → orteils : distance au talon
  if (m && m.epaisseur_min_mm !== null) L.push('Épaisseur minimale du profil : <b>' + fr(m.epaisseur_min_mm, 2) + ' mm</b> (' + lieu(m.epaisseur_min_pos_mm) + ')');
  if (m && m.epaisseur_max_mm !== null && m.epaisseur_max_mm !== undefined) { // épaisseur RÉELLE de la coupe, avec les éléments : le point le plus épais et le détail par matériau
    const det = (m.epaisseur_max_detail || []).map((q) => echapper(q.nom) + ' ' + fr(q.epaisseur_mm, 2)).join(' + ');
    L.push('Épaisseur réelle maximale de la coupe : <b>' + fr(m.epaisseur_max_mm, 2) + ' mm</b> (' + lieu(m.epaisseur_max_pos_mm) + ')' + (det ? ' = ' + det + ' mm' : ''));
  }
  if (m && m.mode === 'T') {
    m.elements.forEach((e, i) => {
      if (e.torsion) {
        L.push(e.applicable ? 'Élément ' + (i + 1) + ' (' + e.libelle + ') : angle frontal obtenu <b>' + fr(e.angle_mesure_deg, 2) + '°</b> sur la coupe (attendu ' + fr(Math.abs(e.angle_frontal_attendu_deg), 2) + '° pour phi = ' + fr(e.angle_regle_deg, 1) + '° ; écart ' + fr(e.ecart_attendu_deg, 2) + '°)' : 'Élément ' + (i + 1) + ' (' + e.libelle + ') : ' + (e.angle_frontal_attendu_deg !== null && e.angle_frontal_attendu_deg !== undefined ? 'angle frontal attendu ' + fr(Math.abs(e.angle_frontal_attendu_deg), 2) + '° — ' : '') + e.raison);
        return;
      }
      if (e.applicable) {
        L.push('Élément ' + (i + 1) + ' (' + e.libelle + ') : angle mesuré sur la coupe <b>' + fr(e.angle_mesure_deg, 2) + '°</b> pour ' + fr(e.angle_regle_deg, 2) + '° réglés (écart ' + fr(Math.abs(e.angle_mesure_deg - e.angle_regle_deg), 2) + '°) · côté haut : ' + e.cote_haut + ' · zone plane de ' + fr(e.fenetre_mm[0], 0) + ' à ' + fr(e.fenetre_mm[1], 0) + ' mm'
          + (e.zone === 'decroissance' ? ' · <i>ici la rampe diminue vers l\'avant (voulu) : l\'angle est plus petit que le réglage</i>' : '')
          + '<br><small>surface totale (avec la forme de la base) : ' + fr(e.angle_surface_totale_deg, 2) + '°</small>');
      } else L.push('Élément ' + (i + 1) + ' (' + e.libelle + ') : pas d\'angle mesuré — ' + e.raison + (e.hauteur_couche_max_mm ? ' · hauteur de la couche ici : ' + fr(e.hauteur_couche_max_mm, 2) + ' mm' : ''));
    });
  } else if (m && c.couches && c.couches.length) L.push('<small>L\'angle se mesure sur une coupe « en travers ».</small>');
  if (c.couches && c.couches.length) L.push('<small>Couleur des éléments = Shore : clair = souple, foncé = ferme, gris = non choisi.</small>');
  $('coupe-mesures').innerHTML = L.map((t) => '<div>' + t + '</div>').join('');
}

function assurerTeintes() { for (const e of elements) if (!Number.isInteger(e.teinte)) e.teinte = teinteSuivante(elements); } // teinte = couleur de l'élément, attribuée une fois (survit au retrait d'un autre élément)
async function appliquerLesElements() {
  assurerTeintes();
  if (deux.actif()) return deux.calculer();
  if (!baseAffichee || !coteConfirme) return;
  const mon = ++seqEl;
  $('etat').textContent = 'calcul des éléments (worker)…'; $('btn-export-base').disabled = true;
  try {
    const modifie = dernierModifie; dernierModifie = null;
    const r = await demander({ type: 'elements', cote: coteConfirme, elements: elementsPourCalcul(), gravure: gravureCourante(), axe: axeCourant() });
    if (mon !== seqEl) return;
    $('el-msg').textContent = ''; majInfoGravure(r.rapport.gravure);
    baseRapport = r.rapport; basePos = r.positions; baseIdx = r.indices; surimpAff = [{ pied: null, dx: 0, liste: r.surimpressions, strates: r.strates, isthme: r.isthme }];
    afficher(r.positions, r.indices, { vue: $('vue-preset').value, garderCamera: true, limiteY: limiteDevant(r.rapport) });
    statsBase(r.rapport); majApresElements(r.rapport); majParcours();
    if (modifie !== null && r.rapport.elements[modifie] && document.querySelector('input[name=coupe-mode]:checked').value === 'T') { // la coupe se place au centre de l'élément touché
      const yc = r.rapport.elements[modifie].centre.y_mm;
      $('coupe-pos').value = String(Math.max(0, Math.min(100, Math.round((100 * yc) / rapport.boite.y_max))));
    }
    $('btn-export-base').disabled = (r.rapport.torsions_bloquees || []).length > 0; // torsion non appliquée : export bloqué
    await dessinerCoupe();
    $('etat').textContent = 'éléments appliqués';
    if (modifie !== null && r.rapport.elements[modifie]) { const e = r.rapport.elements[modifie]; noter('modification', 'élément ' + (modifie + 1) + ' ' + e.libelle + ' · ' + (e.angle_deg !== null ? 'angle ' + fr(e.angle_deg, 2) + '° (h ' + fr(e.hauteur_reglee_mm, 2) + ' mm)' : 'hauteur ' + fr(e.hauteur_reglee_mm, 2) + ' mm') + ' · matériau ' + (e.materiau_id || '—') + ' · Shore ' + (e.shore_a === null ? '—' : e.shore_a)); }
  } catch (err) {
    if (mon !== seqEl) return;
    $('el-msg').textContent = err.message; $('etat').textContent = 'erreur : ' + err.message;
  }
}
function programmerElements() { clearTimeout(minuteurEl); minuteurEl = setTimeout(appliquerLesElements, 250); }

function ajouterElement(type, surcharge = {}) { // utilisé par le bouton « Ajouter » et par l'outil Point de la 3D ; renvoie {i, calcul}
  const nouveau = { type, ...TYPES_ELEMENTS[type].defauts, materiau_id: null, shore_a: null, visible: true, ...surcharge };
  if (deux.actif() && !nouveau.portee) { nouveau.portee = deux.portee(); nouveau.uid = deux.nouvelUid(); }
  if (estBord(type) && !surcharge.dy_mm) { const q = positionApres(elements, type, nouveau.longueur_mm, nouveau.dy_mm, rapport.boite.y_max); nouveau.dy_mm = q.dy_mm; }
  nouveau.teinte = teinteSuivante(elements);
  elements.push(nouveau);
  dernierModifie = elements.length - 1;
  dessinerCartes();
  noter('creation', 'élément ' + elements.length + ' ajouté : ' + NOMS_ELEMENTS[type] + (nouveau.portee ? ' (portée : ' + nouveau.portee + ')' : ''));
  return { i: elements.length - 1, calcul: appliquerLesElements() };
}
$('btn-el-ajouter').onclick = () => {
  if (!baseAffichee) { $('el-msg').textContent = 'Construisez d\'abord la base.'; return; }
  if (!coteConfirme) { $('el-msg').textContent = 'Confirmez la latéralité (carte 1) : elle décide du côté médial.'; return; }
  ajouterElement($('el-type').value);
};
function majChampsCarte(i) { // recopie dans la carte les valeurs changées à la souris (sans toucher au champ en cours de saisie)
  const carte = document.querySelector('#liste-elements .el[data-i="' + i + '"]'); if (!carte || !elements[i]) return;
  for (const inp of carte.querySelectorAll('input[data-f]')) { if (inp.type === 'checkbox' || document.activeElement === inp) continue; const v = elements[i][inp.dataset.f]; if (typeof v === 'number') inp.value = texteNombre(v); }
}
function modifierElement(i, patch) { // changement venu de la 3D (glisser, poignée, molette) : même chemin de calcul que la saisie dans la carte
  if (!elements[i]) return Promise.resolve();
  Object.assign(elements[i], patch); dernierModifie = null; majChampsCarte(i);
  return appliquerLesElements();
}
$('liste-elements').addEventListener('click', (ev) => {
  const det = ev.target.closest('button[data-act="detacher"]');
  if (det) { deux.detacher(Number(det.dataset.i)); return; }
  const pas = ev.target.closest('button[data-act="pas"]');
  if (pas) { const i = Number(pas.dataset.i), e = elements[i], d = Number(pas.dataset.pas); let v = Math.round(((Number.isFinite(e.hauteur_mm) ? e.hauteur_mm : 1) + d) * 10) / 10; if (Math.abs(v) < 0.05) v = d > 0 ? 0.1 : -0.1; e.hauteur_mm = Math.max(-8, Math.min(8, v)); majChampsCarte(i); dernierModifie = i; programmerElements(); return; }
  const b = ev.target.closest('button[data-act="suppr"]');
  if (!b) return;
  const i = Number(b.dataset.i);
  noter('modification', 'élément ' + (i + 1) + ' (' + NOMS_ELEMENTS[elements[i].type] + ') retiré');
  elements.splice(i, 1); dernierModifie = null; dessinerCartes(); appliquerLesElements();
});
$('liste-elements').addEventListener('change', (ev) => {
  const t = ev.target, f = t.dataset.f;
  if (!f) return;
  const i = Number(t.dataset.i), e = elements[i];
  if (f === 'visible') e.visible = t.checked;
  else if (f === 'ancrage') { // bord -> libre : le centre remplace le début ; libre -> bord : le début remplace le centre
    const L = e.longueur_mm || 0;
    if (t.value === 'libre' && e.ancrage !== 'libre') { e.dy_mm = Math.round((e.dy_mm + L / 2) * 10) / 10; e.dx_mm = 0; }
    if (t.value === 'bord' && e.ancrage === 'libre') { e.dy_mm = Math.max(0, Math.round((e.dy_mm - L / 2) * 10) / 10); e.dx_mm = 0; }
    e.ancrage = t.value; dernierModifie = i; dessinerCartes(); programmerElements(); return;
  }
  else if (f === 'phi_confirme') e.phi_confirme = t.checked;
  else if (f === 'bord_skive') e.bord_skive = t.value;
  else if (f === 'zone_torsion') { e.zone_torsion = t.value; dernierModifie = i; dessinerCartes(); programmerElements(); return; }
  else if (f === 'comblement_materiau_id') e.comblement_materiau_id = t.value || null;
  else if (f === 'materiau_id') {
    e.materiau_id = t.value || null;
    const m = e.materiau_id && materiauxTable ? materiauxTable.parId.get(e.materiau_id) : null;
    if (m && m.shore !== null) { e.shore_a = m.shore; const s = t.closest('.el').querySelector('[data-f="shore_a"]'); s.value = texteNombre(m.shore); }
    // hauteur / épaisseur reprise du titre du matériau (ex. « … 2.0mm … ») ; refusée proprement si elle sort des limites de l'élément
    const carte = t.closest('.el'), info = carte.querySelector('[data-role="auto-h"]'), ep = epaisseurApplicable(e, m);
    if (info) info.textContent = '';
    if (ep !== null) {
      try {
        validerElement({ id: 'essai', ...e, hauteur_mm: ep }, materiauxTable);
        e.hauteur_mm = ep; const h = carte.querySelector('[data-f="hauteur_mm"]'); if (h) h.value = texteNombre(ep);
        if (info) info.textContent = '→ ' + (e.type === 'recouvrement' ? 'épaisseur' : 'hauteur') + ' ajustée à ' + texteNombre(ep) + ' mm (titre du matériau)';
        noter('modification', 'élément ' + (i + 1) + ' : ' + (e.type === 'recouvrement' ? 'épaisseur' : 'hauteur') + ' ajustée à ' + texteNombre(ep) + ' mm selon le matériau « ' + m.libelle.trim() + ' »');
      } catch (err) { if (info) info.textContent = '⚠ ' + texteNombre(ep) + ' mm (titre du matériau) refusé : ' + err.message + ' — hauteur inchangée'; }
    }
  } else if (f === 'shore_a') e.shore_a = lireNombre(t.value);
  else {
    const v = lireNombre(t.value);
    if (estCoin(e.type) && f === 'angle_deg') { e.angle_deg = v; delete e.hauteur_mm; }
    else if (estCoin(e.type) && f === 'hauteur_mm') { e.hauteur_mm = v; delete e.angle_deg; }
    else e[f] = v === null ? NaN : v;
    if (e.type === 'torsion' && f === 'phi_deg') { e.phi_confirme = false; if (Number.isFinite(e.phi_deg)) { dernierModifie = i; dessinerCartes(); programmerElements(); return; } } // une autre valeur de phi : la confirmation est à refaire
  }
  dernierModifie = i; programmerElements();
});
$('btn-cote').addEventListener('click', () => { if (baseAffichee && elements.length) programmerElements(); });
(async () => { // tableau des matériaux fourni par le praticien : chargé une fois, envoyé au worker
  try {
    const json = await (await fetch(new URL('../donnees/materiaux.json', import.meta.url))).json();
    materiauxTable = chargerMateriaux(json);
    for (const id of ['base-materiau', 'devant-materiau']) $(id).innerHTML = optionsMateriaux(null);
    await demander({ type: 'materiaux', json });
    $('el-msg').textContent = '';
    dessinerCartes();
  } catch (err) { $('el-msg').textContent = 'tableau des matériaux non chargé : ' + err.message; }
})();

majFormulaireBase();

redimensionner();

// ======================= Lot 4 « 2 pieds » : l'interface vit dans deuxpieds.js, branchée par ce pont =======================
deux = initDeuxPieds({
  THREE, scene, $, demander, noter, fr, echapper, texteNombre, demanderRendu, redimensionner,
  fixerPas: () => { try { edition.selectionner(null); edition.enregistrer(); } catch (err) { void err; } }, // lot 4d : un miroir = un pas dans Annuler
  ecrireZip, nomFichierZip, afficher, poserEtiquettes, majParcours, majCote, statsBase, majControles, dessinerCartes, dessinerCoupe, viderVue, apresAnalyse, nomFichierSTL,
  baseParams, ecrireBaseParams, majFormulaireBase, estBord, axeHenke: () => henke.exporter(),
  importerAxes: (o) => { for (const c of ['D', 'G']) if (o && o[c]) henke.importer(c, o[c]); }, // V1 : réouverture des 2 pieds
  limiteDevant, couleurShore, majSuggestion,
  masquerCoupe: (b) => { if (ligneCoupe) ligneCoupe.visible = !b; demanderRendu(); },
  get: () => ({ scanPret, elements, rapport, baseRapport, positionsAff, materiaux: materiauxTable }),
  mettre: (p) => {
    if ('elements' in p) elements = p.elements;
    if ('rapport' in p) rapport = p.rapport;
    if ('baseRapport' in p) baseRapport = p.baseRapport;
    if ('basePos' in p) basePos = p.basePos;
    if ('baseIdx' in p) baseIdx = p.baseIdx;
    if ('baseAffichee' in p) baseAffichee = p.baseAffichee;
    if ('coteConfirme' in p) coteConfirme = p.coteConfirme;
    if ('positionsAff' in p) positionsAff = p.positionsAff;
    if ('indicesAff' in p) indicesAff = p.indicesAff;
    if ('couleursAff' in p) couleursAff = p.couleursAff;
    if ('surimpAff' in p) surimpAff = p.surimpAff;
    if ('dernierModifie' in p) dernierModifie = p.dernierModifie;
  },
});

// ======================= Lot 4d : outil Mesure (initialisé avant l'édition : il lui dit de laisser passer le clic) =======================
mesure = initMesure({ THREE, scene, camera, controls, renderer, $, demanderRendu, get: () => ({ baseAffichee }), getMaille: () => maille });
if (location.search.includes('test4d')) window.__mesure4d = mesure;

// ======================= Lot 4b : édition dans la 3D (Annuler/Rétablir, points curseurs, glisser-déposer, poignées) =======================
edition = initEdition3d({
  THREE, scene, camera, controls, renderer, $, noter, fr, echapper, demanderRendu, deux,
  get: () => ({ elements, baseRapport, baseAffichee, coteConfirme }),
  mettre: (p) => { if ('elements' in p) elements = p.elements; if ('dernierModifie' in p) dernierModifie = p.dernierModifie; },
  getMaille: () => maille,
  baseParams, ecrireBaseParams, dessinerCartes,
  reconstruire: construireLaBase, modifier: modifierElement, ajouter: ajouterElement,
  ajouterPlusieurs: (liste) => { for (const p of liste) { if (deux.actif()) p.uid = deux.nouvelUid(); p.teinte = teinteSuivante(elements); elements.push(p); } // identifiant calculé après chaque ajout (sinon doublons)
    dernierModifie = null; dessinerCartes(); appliquerAttente = appliquerLesElements(); },
  attendreCalcul: () => appliquerAttente, mesureActive: () => mesure.actif() || pinceau.actif() || henke.actif(),
});

// ======================= Lot 4d : outil Pinceau (après l'édition : il lui demande les pieds et l'ajout d'un élément) =======================
pinceau = initPinceau({ THREE, scene, camera, controls, renderer, $, demanderRendu, get: () => ({ baseAffichee, baseRapport }), getMaille: () => maille, edition: () => edition });
if (location.search.includes('test4d')) window.__pinceau4d = pinceau;

// ======================= Lot 4c : éléments en transparence, couleurs, ligne de l'isthme, légende =======================
transp = initTransparence({
  THREE, scene, camera, controls, renderer, $, demander, demanderRendu, couleurShore, echapper, noter, deux, mesureActive: () => mesure.actif() || pinceau.actif() || henke.actif(),
  get: () => ({ elements }), edition: () => edition, nomElement: (t) => NOMS_ELEMENTS[t], couleurElement, nomCouleur, textureElement,
});
transp.legende();

// ======================= Lot 4 bis : axe de Henke (étape 2) =======================
henke = initHenke({ THREE, scene, camera, controls, renderer, $, demanderRendu, noter, getMaille: () => maille, mesureActive: () => mesure.actif() || pinceau.actif(),
  ajouterSkive: (d) => { // suggestion acceptée par le praticien : élément propre au pied de l'axe (la suggestion dépend de cet axe)
    if (!baseAffichee || !coteConfirme) return;
    const sur = { type: 'skive', bord_skive: d.bord, profondeur_mm: d.profondeur_mm, angle_skive_deg: d.angle_deg };
    if (deux.actif()) { sur.portee = d.cote; sur.uid = deux.nouvelUid(); }
    ajouterElement('skive', sur); noter('creation', 'skive de Kirby ajoutée (' + d.categorie.replace('_', ' ') + ' · ' + (d.enfant ? 'enfant' : 'adulte') + ') : ' + d.profondeur_mm + ' mm, ' + d.angle_deg + '°, bord ' + (d.bord === 'medial' ? 'médial' : 'latéral') + (deux.actif() ? ' · pied ' + d.cote : ''));
  },
  surAxe: () => { if (elements.some((e) => e.type === 'torsion')) programmerElements(); } }); // l'axe a changé : les torsions se recalculent
mannequin = initMannequin({ THREE, scene, renderer, $, demanderRendu, noter, demander, axeDe: (c) => henke.axeDe(c),
  phiTorsion: (cote) => { const t = elements.find((e) => e.type === 'torsion' && (!e.portee || e.portee === 'commun' || e.portee === cote)); return t && Number.isFinite(t.phi_deg) ? t.phi_deg : null; } }); // phi de la torsion qui s'applique à ce pied (lecture seule) // phi de la première torsion de la pile (lecture seule)
if (location.search.includes('test4bis')) window.__henke = henke;
if (location.search.includes('test4bis')) window.__mannequin = mannequin;
if (location.search.includes('test4bis')) window.__cam = { camera, controls }; // aide des scripts de contrôle : cadrage précis des captures
if (location.search.includes('test4c')) window.__transp4c = transp;
if (location.search.includes('test4b')) window.__edition4b = edition; // aide des scripts de contrôle (tools/verif-navigateur-lot4b.mjs)

// ======================= B3 : image du rapport (dessus + 3/4 médial) =======================
const imageRapport = initImageRapport({ THREE, scene, renderer, $, demanderRendu, redimensionner, getMaille: () => maille, racineTransp: () => transp.racine(), aidesTransp: () => transp.aides(), getGrille: () => grille,
  get: () => ({ baseAffichee, coteConfirme, generique: !!(rapport && rapport.generique), deuxPieds: deux.actif() && !deux.pied(), eclate: transp.eclate() }) });
let derniereImage = null;
$('btn-image-rapport').onclick = () => {
  try {
    derniereImage = imageRapport.creer();
    $('image-apercu').src = derniereImage.canvas.toDataURL('image/png');
    $('image-msg').textContent = derniereImage.largeur + ' × ' + derniereImage.hauteur + ' px · même échelle pour les deux vues' + (derniereImage.generique ? ' · pied générique (indicatif)' : '');
    $('dlg-image').showModal();
  } catch (err) { $('etat').textContent = 'image du rapport : ' + err.message; }
};
$('image-fermer').onclick = () => $('dlg-image').close();
$('image-telecharger').onclick = () => {
  if (!derniereImage) return;
  derniereImage.canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (derniereImage.generique ? 'INDICATIF-' : '') + 'Plan-semelle-pied-' + derniereImage.cote + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }, 'image/png');
};
majParcours(); // le bouton suit l'état de la semelle affichée (majParcours est rappelée à chaque changement)
if (location.search.includes('testb3')) window.__imageRapport = { creer: () => imageRapport.creer() };

// ======================= V1 : pont avec Verticy (page ouverte en iframe plein écran, même origine) =======================
// Verticy ouvre app.html?hote=1 ; ce bloc n'existe que dans ce cas. Messages { s3d: ... } échangés avec la fenêtre mère :
//   mère -> ici : init { etat }  (rouvre un plan enregistré)            ici -> mère : pret, enregistrer { etat, resume, png }, fermer
// Le scan n'est JAMAIS envoyé ni conservé : l'état contient seulement des paramètres (quelques Ko).
const HOTE = new URLSearchParams(location.search).get('hote') === '1' && window.parent !== window;
if (HOTE) {
  const VERSION_ETAT = 1;
  let journalEnregistre = 0, aReprendreA = null;
  const dire = (texte, erreur = false) => { const m = $('hote-msg'); m.textContent = texte; m.style.color = erreur ? '#b03030' : '#0f766e'; };
  const versMere = (msg, transferts = []) => window.parent.postMessage({ s3d: true, ...msg }, location.origin, transferts);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  document.body.classList.add('hote');
  for (const id of ['btn-enregistrer', 'btn-fermer', 'hote-msg']) $(id).hidden = false;
  $('btn-demo').parentElement.hidden = true; if ($('btn-demo').parentElement.previousElementSibling) $('btn-demo').parentElement.previousElementSibling.hidden = true; // scans de démonstration : réservés au banc de contrôle
  document.querySelectorAll('.pill').forEach((e) => { if (e.textContent.trim() === 'Patient fictif') e.hidden = true; });

  function exporterEtat() {
    if (deux.actif()) return deux.etatPieds(); // 2 pieds (v2) : mode, fiches D et G, plan complet
    if (!baseAffichee || !baseRapport || !coteConfirme) throw new Error('affichez d\'abord la semelle (créez la base)');
    const generique = !!(rapport && rapport.generique);
    if (generique && !ficheB) throw new Error('réglages du pied générique introuvables : recréez le pied');
    const axe = henke.exporter();
    return {
      v: VERSION_ETAT, mode: generique ? 'B' : 'A', cote: coteConfirme,
      fiche: generique ? clone(ficheB) : { longueur_mm: nombreFr('longueur'), inverser_y: !!opts.inverserY, inverser_z: !!opts.inverserZ, ...(typeEmpreinte() === 'creusee' ? { type_empreinte: 'creusee', bords_mm: bordsMm() } : {}) },
      base: clone(baseParams()), elements: clone(elements), axe: axe && axe[coteConfirme] ? clone(axe[coteConfirme]) : null,
    };
  }
  async function restaurerB(etat) {
    const f = etat.fiche;
    for (const r of document.querySelectorAll('input[name=mb-cote]')) r.checked = r.value === f.cote;
    $('mb-long').value = texteNombre(f.longueur_mm, 3); $('mb-larg').value = String(f.largeur_rel); $('mb-voute').value = String(f.voute_mm);
    await $('btn-modeb').onclick();
    if (!ficheB || !baseRapport && !rapport) throw new Error('le pied générique n\'a pas pu être recréé');
    if (etat.axe) henke.importer(etat.cote, etat.axe);
    ecrireBaseParams(etat.base);
    await construireLaBase();
    if (!baseAffichee) throw new Error('la base enregistrée n\'a pas pu être reconstruite');
    elements = clone(etat.elements || []); dessinerCartes();
    if (elements.length) await appliquerLesElements();
  }
  const passerEn2Pieds = () => { const rb = document.querySelector('input[name=nbpieds][value="2"]'); rb.checked = true; rb.dispatchEvent(new Event('change', { bubbles: true })); };
  async function init(etat) {
    try {
      if (!etat) { dire('Nouveau plan : créez le pied (sans scan ou avec un scan), puis la base.'); return; }
      if (etat.v === 2 && etat.pieds === 2) { // plan enregistré pour les 2 pieds
        passerEn2Pieds();
        if (etat.mode === 'B') { dire('Réouverture du plan des 2 pieds…'); await deux.restaurerGeneriques(etat); dire('Plan des 2 pieds rouvert.'); }
        else { aReprendreA = etat; dire('Plan enregistré en mode scan (2 pieds) : réimportez le même scan, séparez et validez les 2 pieds, puis « Reprendre le plan enregistré ».'); $('btn-reprendre').hidden = false; }
        journalEnregistre = journal.length; return;
      }
      if (etat.v !== VERSION_ETAT) throw new Error('version de plan inconnue (' + etat.v + ')');
      if (etat.mode === 'B') { dire('Réouverture du plan enregistré…'); await restaurerB(etat); dire('Plan enregistré rouvert.'); }
      else { aReprendreA = etat; dire('Plan enregistré en mode scan : réimportez le même scan (le scan n\'est pas conservé), puis « Reprendre le plan enregistré ».'); $('btn-reprendre').hidden = false; }
      journalEnregistre = journal.length;
    } catch (err) { dire('Réouverture impossible : ' + err.message, true); }
  }
  $('btn-reprendre').onclick = async () => { // mode A : le plan enregistré est réappliqué sur le scan réimporté
    if (!aReprendreA) return;
    try {
      if (aReprendreA.v === 2) { // plan des 2 pieds : le scan doit être séparé et les 2 pieds validés
        if (!deux.actif() || deux.generique()) throw new Error('importez le scan des 2 pieds, indiquez la longueur de chaque pied et validez les 2 pieds (carte 1)');
        await deux.appliquerPlan(aReprendreA.plan);
        aReprendreA = null; $('btn-reprendre').hidden = true; journalEnregistre = journal.length; dire('Plan enregistré réappliqué sur le scan des 2 pieds.'); return;
      }
      if (!rapport || rapport.generique) throw new Error('importez et analysez d\'abord le scan (carte 1)');
      if (!coteConfirme) throw new Error('confirmez le côté du pied (carte 1)');
      if (coteConfirme !== aReprendreA.cote) throw new Error('le scan est un pied ' + (coteConfirme === 'D' ? 'droit' : 'gauche') + ' ; le plan enregistré est pour le pied ' + (aReprendreA.cote === 'D' ? 'droit' : 'gauche'));
      { // le plan a été fait sur UNE empreinte (type + bords) : la même doit être choisie, sinon le relief (donc la base) diffère
        const f = aReprendreA.fiche || {}, typeP = f.type_empreinte || 'decharge', bordsP = typeP === 'creusee' ? (f.bords_mm === undefined ? 5 : f.bords_mm) : null;
        if (typeP !== typeEmpreinte()) throw new Error('le plan enregistré a été fait avec « ' + (typeP === 'creusee' ? 'Boîte creusée' : 'Pied en décharge') + ' » : choisissez le même type d\'empreinte (carte 1)');
        if (bordsP !== null && Math.abs(bordsP - bordsMm()) > 1e-9) throw new Error('le plan enregistré a été fait avec des bords gardés de ' + fr(bordsP, 0) + ' mm : réglez la même valeur (carte 1)');
      }
      if (aReprendreA.axe) henke.importer(aReprendreA.cote, aReprendreA.axe);
      ecrireBaseParams(aReprendreA.base); await construireLaBase();
      if (!baseAffichee) throw new Error('la base n\'a pas pu être reconstruite');
      elements = clone(aReprendreA.elements || []); dessinerCartes(); if (elements.length) await appliquerLesElements();
      aReprendreA = null; $('btn-reprendre').hidden = true; journalEnregistre = journal.length; dire('Plan enregistré réappliqué sur le scan.');
    } catch (err) { dire(err.message, true); }
  };

  let enCours = false;
  const enBlob = (img) => new Promise((ok) => img.canvas.toBlob(ok, 'image/png'));
  $('btn-enregistrer').onclick = async () => {
    if (enCours) return;
    try {
      if (deux.actif()) { // 2 pieds : une image et un résumé PAR pied (chaque pied est affiché seul, D puis G, pour la photo)
        enCours = true; $('btn-enregistrer').disabled = true; dire('Enregistrement des 2 pieds…');
        const etat = exporterEtat();
        const par = await deux.parPied(async (c, R) => { const img = imageRapport.creer(), png = await enBlob(img); if (!png) throw new Error('image du pied ' + c + ' non créée'); return { resume: resumerPlan(R), png, img }; });
        const resume = { deux: true, pieds: { D: par.D.resume, G: par.G.resume }, lignes: ['Pied droit', ...par.D.resume.lignes, 'Pied gauche', ...par.G.resume.lignes] };
        versMere({ type: 'enregistrer', etat, resume, png: par.D.png, pngG: par.G.png, largeur: par.D.img.largeur, hauteur: par.D.img.hauteur, cote: 'DG', generique: par.D.img.generique });
        return;
      }
      const etat = exporterEtat(), resume = resumerPlan(baseRapport), img = imageRapport.creer();
      enCours = true; $('btn-enregistrer').disabled = true; dire('Enregistrement…');
      const png = await enBlob(img);
      if (!png) { enCours = false; $('btn-enregistrer').disabled = false; dire('image non créée', true); return; }
      versMere({ type: 'enregistrer', etat, resume, png, largeur: img.largeur, hauteur: img.hauteur, cote: etat.cote, generique: img.generique });
    } catch (err) { enCours = false; $('btn-enregistrer').disabled = false; dire(err.message, true); }
  };
  let fermetureDemandee = false;
  $('btn-fermer').onclick = () => {
    if (journal.length !== journalEnregistre && !fermetureDemandee) { fermetureDemandee = true; dire('Modifications non enregistrées : cliquez encore sur « Fermer » pour quitter sans enregistrer.', true); return; }
    versMere({ type: 'fermer' });
  };
  window.addEventListener('message', (ev) => {
    if (ev.origin !== location.origin || ev.source !== window.parent || !ev.data || ev.data.s3d !== true) return;
    const m = ev.data;
    if (m.type === 'init') init(m.etat || null);
    else if (m.type === 'enregistre') { enCours = false; $('btn-enregistrer').disabled = false; journalEnregistre = journal.length; fermetureDemandee = false; dire(m.ok ? 'Enregistré dans le bilan ✓' : 'Enregistrement impossible : ' + (m.erreur || 'erreur'), !m.ok); }
  });
  window.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !document.querySelector('dialog[open]')) $('btn-fermer').click(); });
  if (location.search.includes('testhote')) window.__hote = { exporterEtat, restaurerB, init };
  versMere({ type: 'pret' });
}
