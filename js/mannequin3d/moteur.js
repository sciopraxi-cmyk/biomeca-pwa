// Mannequin postural 3D — moteur WebGL (Three.js auto-hébergé, chargé à la demande).
import * as THREE from '../../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../assets/vendor/three/GLTFLoader.js';
import { poseDepuisValeurs, assemblage } from './parametres.js?v=v312';

// ?v= : le modèle 3D est dans /assets/ (cache sans limite de durée) ; l'URL change à chaque version
// Modèles : adultes (homme, femme) et enfants par période de la podopédiatrie (II, III, IV), garçon et fille.
export const MODELES = [
  'homme',
  'femme',
  ...['garcon', 'fille'].flatMap((s) => ['II', 'III', 'IV'].map((p) => s + '_p' + p)),
];
export function nomModele(sexe, profil) {
  if (profil === 'II' || profil === 'III' || profil === 'IV')
    return (sexe === 'femme' ? 'fille' : 'garcon') + '_p' + profil;
  return sexe === 'femme' ? 'femme' : 'homme';
}
const CHEMIN = (nom) =>
  new URL(
    '../../assets/mannequin/' + (MODELES.includes(nom) ? nom : 'homme') + '.glb.gz?v=v312',
    import.meta.url
  ).href;
const cacheModeles = {};

// Mandibule : deux blend shapes (décalage latéral « mandi_x », avancée « mandi_z », 1 cm par unité de poids) créés au
// chargement : seuls les sommets de la partie basse du visage (sous la ligne des lèvres, devant les oreilles, pondérés
// 100 % tête) bougent, avec un fondu doux. Ils suivent la tête (déformation avant skinning).
export function ajouterMorphMandibule(scene, enfant = false) {
  scene.updateMatrixWorld(true);
  let tete = null;
  scene.traverse((o) => {
    if (o.isBone && (o.userData.name || o.name) === 'head') tete = o;
  });
  if (!tete) return false;
  const k = enfant ? hauteurModele(scene) / 1.75 : 1;
  const hp = tete.getWorldPosition(new THREE.Vector3());
  const yLevres = hp.y + (0.037 - 0.071) * k, // ligne des lèvres (yeux = tête + 3,7 cm ; lèvres = yeux − 7,1 cm)
    zOreille = hp.z - 0.02 * k;
  const lisse = (t) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  let fait = false;
  scene.traverse((m) => {
    if (!m.isSkinnedMesh || !m.geometry || !m.geometry.attributes.skinIndex) return;
    const g = m.geometry;
    if (g.userData.mandibule) return;
    const pos = g.attributes.position,
      si = g.attributes.skinIndex,
      sw = g.attributes.skinWeight,
      n = pos.count;
    const jTete = m.skeleton.bones.indexOf(tete);
    const dx = new Float32Array(n * 3),
      dz = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      let wt = 0;
      for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === jTete) wt += sw.getComponent(i, j);
      if (wt <= 0) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      const f =
        lisse((yLevres + 0.012 * k - v.y) / (0.024 * k)) *
        lisse((v.z - zOreille) / (0.03 * k)) *
        lisse((wt - 0.5) / 0.5);
      if (f <= 0) continue;
      dx[i * 3] = 0.01 * f;
      dz[i * 3 + 2] = 0.01 * f;
    }
    g.morphTargetsRelative = true;
    const cibles = g.morphAttributes.position || [];
    const ix = cibles.length;
    cibles.push(new THREE.BufferAttribute(dx, 3), new THREE.BufferAttribute(dz, 3));
    g.morphAttributes.position = cibles;
    g.userData.mandibule = true;
    // on COMPLÈTE la table existante (cyphose, lordose, genoux…) : updateMorphTargets() la réécrirait
    const dico = Object.assign({}, m.morphTargetDictionary || {});
    dico.mandi_x = ix;
    dico.mandi_z = ix + 1;
    m.morphTargetDictionary = dico;
    m.morphTargetInfluences = new Array(cibles.length).fill(0);
    fait = true;
  });
  return fait;
}

async function lireGlb(sexe) {
  if (!cacheModeles[sexe]) {
    cacheModeles[sexe] = (async () => {
      const rep = await fetch(CHEMIN(sexe));
      if (!rep.ok) throw new Error('mannequin introuvable (' + rep.status + ')');
      let buf;
      if (typeof DecompressionStream === 'function') {
        buf = await new Response(
          rep.body.pipeThrough(new DecompressionStream('gzip'))
        ).arrayBuffer();
      } else {
        throw new Error('Navigateur trop ancien pour le mannequin 3D');
      }
      // La politique de sécurité de l'application (connect-src sans blob:) interdit à ImageBitmapLoader de lire les
      // textures du GLB : on lui fait choisir le chargeur par balise <img> (img-src autorise blob:). Le choix se fait
      // dans le constructeur du parseur, appelé de façon synchrone par parse().
      const cib = globalThis.createImageBitmap;
      globalThis.createImageBitmap = undefined;
      try {
        const gltf = await new Promise((ok, ko) => new GLTFLoader().parse(buf, '', ok, ko));
        ajouterMorphMandibule(gltf.scene, /_p(II|III|IV)$/.test(sexe));
        return gltf;
      } finally {
        globalThis.createImageBitmap = cib;
      }
    })();
    cacheModeles[sexe].catch(() => {
      delete cacheModeles[sexe];
    });
  }
  return cacheModeles[sexe];
}

function hauteurModele(racine) {
  let h = 1.75;
  racine.traverse((o) => {
    if (o.isSkinnedMesh && (o.name === 'peau' || o.name === 'Corps') && o.geometry) {
      o.geometry.computeBoundingBox();
      h = o.geometry.boundingBox.max.y - o.geometry.boundingBox.min.y;
    }
  });
  return h;
}

// Clone indépendant (squelette inclus) pour que plusieurs moteurs (écran + rapport) cohabitent
function cloner(gltf) {
  const racine = gltf.scene.clone(true);
  const bonesOrig = [];
  gltf.scene.traverse((o) => {
    if (o.isBone) bonesOrig.push(o);
  });
  const bonesCopie = [];
  racine.traverse((o) => {
    if (o.isBone) bonesCopie.push(o);
  });
  const skinned = [];
  racine.traverse((o) => {
    if (o.isSkinnedMesh) skinned.push(o);
  });
  const origSkinned = [];
  gltf.scene.traverse((o) => {
    if (o.isSkinnedMesh) origSkinned.push(o);
  });
  skinned.forEach((m, i) => {
    const sq = origSkinned[i].skeleton;
    const bones = sq.bones.map((b) => bonesCopie[bonesOrig.indexOf(b)]);
    m.bind(
      new THREE.Skeleton(
        bones,
        sq.boneInverses.map((x) => x.clone())
      ),
      m.bindMatrix
    );
  });
  return racine;
}

export const VUES = {
  face: { az: 0, label: 'Face' },
  profilD: { az: -Math.PI / 2, label: 'Profil D' },
  dos: { az: Math.PI, label: 'Dos' },
  profilG: { az: Math.PI / 2, label: 'Profil G' },
};

const COUL_PEAU = 0xd9a487;

export async function creerMoteur(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: !!opts.preserve,
  });
  renderer.setPixelRatio(Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa7b4, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.7);
  scene.add(fill, fill.target);
  // Lumière attachée à la caméra : même éclairage dans les 4 vues (comparaison entre bilans)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  scene.add(cam);
  cam.add(key);
  key.position.set(1.5, 2.5, 3);
  key.target.position.set(0, 0, -5);
  cam.add(key.target);
  cam.add(fill);
  fill.position.set(-2.5, 0.5, 1.5);
  fill.target.position.set(0, 0, -5);
  cam.add(fill.target);

  const reperes = { groupe: null, actif: false, lignes: [] };
  const etat = {
    sexe: null,
    racine: null,
    bones: {},
    repos: {},
    peau: true,
    vue: 'face',
    az: 0,
    w: 0,
    h: 0,
    valeurs: {},
    k: 1, // échelle de cadrage (1 = adulte)
  };

  function taille(w, h) {
    etat.w = w;
    etat.h = h;
    renderer.setSize(w, h, false);
    // 1 m de demi-hauteur pour un adulte, identique pour tous les bilans ; un enfant est cadré à l'échelle de sa taille
    const asp = w / h,
      demi = etat.k;
    cam.left = -demi * asp;
    cam.right = demi * asp;
    cam.top = demi;
    cam.bottom = -demi;
    cam.updateProjectionMatrix();
  }
  function placerCamera() {
    const d = 6,
      y = 0.9 * etat.k;
    cam.position.set(Math.sin(etat.az) * d, y, Math.cos(etat.az) * d);
    cam.lookAt(0, y, 0);
    cam.updateMatrixWorld(true);
  }
  function afficher() {
    placerCamera();
    renderer.render(scene, cam);
  }

  async function chargerSexe(sexe0, profil) {
    const sexe = nomModele(sexe0, profil);
    if (etat.sexe === sexe && etat.racine) return;
    const gltf = await lireGlb(sexe);
    if (etat.racine) scene.remove(etat.racine);
    const racine = cloner(gltf);
    etat.racine = racine;
    etat.sexe = sexe;
    // échelle de cadrage : adulte = 1 ; enfant = taille / 1,75 m (il remplit le cadre comme un adulte)
    etat.k = /_p(II|III|IV)$/.test(sexe) ? hauteurModele(racine) / 1.75 : 1;
    if (etat.w) taille(etat.w, etat.h);
    etat.bones = {};
    etat.repos = {};
    racine.traverse((o) => {
      if (o.isBone) {
        const n = o.userData.name || o.name;
        etat.bones[n] = o;
        etat.repos[n] = { p: o.position.clone(), q: o.quaternion.clone() };
      }
      if (o.isMesh) {
        o.frustumCulled = false;
        if (o.name === 'peau' || o.name === 'Corps') {
          o.userData.role = 'peau';
          o.material = new THREE.MeshPhysicalMaterial({
            color: COUL_PEAU,
            roughness: 0.62,
            metalness: 0,
            sheen: 0.35,
            sheenColor: new THREE.Color(0xffd6c4),
            sheenRoughness: 0.6,
          });
        } else if (o.name === 'muscles' || o.name === 'Muscles') {
          o.userData.role = 'muscles';
        }
      }
    });
    scene.add(racine);
    peau(etat.peau);
    pose(etat.valeurs);
    creerReperes();
    majReperes();
  }

  function peau(oui) {
    etat.peau = !!oui;
    if (!etat.racine) return;
    etat.racine.traverse((o) => {
      if (o.userData.role === 'peau') o.visible = etat.peau;
      if (o.userData.role === 'muscles') o.visible = !etat.peau;
    });
  }

  // ── pose : cinématique directe (curseurs), rotation du bassin autour des hanches, hanches épinglées, torsion d'avant-bras
  const _v = new THREE.Vector3(),
    _q = new THREE.Quaternion(),
    _q2 = new THREE.Quaternion(),
    _m = new THREE.Matrix4();
  function monde(b) {
    return b.getWorldPosition(new THREE.Vector3());
  }
  function tournerMonde(b, qDelta) {
    b.parent.getWorldQuaternion(_q);
    b.getWorldQuaternion(_q2);
    _q2.premultiply(qDelta);
    b.quaternion.copy(_q.invert().multiply(_q2));
    b.updateMatrixWorld(true);
  }
  function repere() {
    // positions de repos (monde) : hanches, genoux, chevilles et centre des hanches (pivot du bassin)
    for (const n in etat.bones) {
      const b = etat.bones[n];
      b.position.copy(etat.repos[n].p);
      b.quaternion.copy(etat.repos[n].q);
    }
    etat.racine.updateMatrixWorld(true);
    const R = { hanche: {}, genou: {}, cheville: {} };
    for (const c of ['L', 'R']) {
      R.hanche[c] = monde(etat.bones['upperleg01.' + c]);
      R.genou[c] = monde(etat.bones['lowerleg01.' + c]);
      R.cheville[c] = monde(etat.bones['foot.' + c]);
    }
    const mid = (o) => o.L.clone().add(o.R).multiplyScalar(0.5);
    R.hancheC = mid(R.hanche);
    R.genouC = mid(R.genou);
    R.chevilleC = mid(R.cheville);
    R.root = monde(etat.bones.root);
    etat.pivot = R;
  }
  // rotation d'angle (rad) autour de l'axe x passant par le point c (plan sagittal y-z)
  function tourneX(p, c, rad) {
    const dy = p.y - c.y,
      dz = p.z - c.z,
      co = Math.cos(rad),
      si = Math.sin(rad);
    return new THREE.Vector3(p.x, c.y + dy * co - dz * si, c.z + dy * si + dz * co);
  }
  // rotation d'angle (rad) autour de l'axe z passant par le point c (plan frontal x-y) : + = haut du corps vers la droite du patient
  function tourneZ(p, c, rad) {
    const dx = p.x - c.x,
      dy = p.y - c.y,
      co = Math.cos(rad),
      si = Math.sin(rad);
    return new THREE.Vector3(c.x + dx * co - dy * si, c.y + dx * si + dy * co, p.z);
  }
  function epingler(os, cible) {
    const b = etat.bones[os];
    const delta = cible.clone().sub(monde(b));
    if (delta.lengthSq() < 1e-14) return;
    b.parent.getWorldQuaternion(_q);
    b.position.add(delta.applyQuaternion(_q.invert()));
    b.updateMatrixWorld(true);
  }
  function poserBrut(P) {
    const A = assemblage(P),
      R = etat.pivot,
      rad = (d) => (d * Math.PI) / 180;
    const qc = new THREE.Quaternion();
    for (const n in etat.bones) {
      const b = etat.bones[n],
        r = etat.repos[n];
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
      const q = P.rot[n];
      if (q) b.quaternion.set(q[0], q[1], q[2], q[3]).multiply(r.q);
      const c = A.counters[n];
      if (c) b.quaternion.premultiply(qc.set(c[0], c[1], c[2], c[3]));
      const d = P.pos[n];
      if (d) b.position.add(new THREE.Vector3(d[0], d[1], d[2]));
    }
    // bassin : rotation autour du centre des hanches ; puis bascule globale (chevilles, genoux, hanches) en bloc
    const root = etat.bones.root;
    root.quaternion.set(A.root[0], A.root[1], A.root[2], A.root[3]).multiply(etat.repos.root.q);
    const Qb = new THREE.Quaternion(P.bassin[0], P.bassin[1], P.bassin[2], P.bassin[3]);
    let p0 = R.root.clone().sub(R.hancheC).applyQuaternion(Qb).add(R.hancheC);
    p0 = tourneX(p0, R.hancheC, rad(P.glob.h));
    p0 = tourneX(p0, R.genouC, rad(P.glob.k));
    p0 = tourneX(p0, R.chevilleC, rad(P.glob.a));
    p0 = tourneZ(p0, R.chevilleC, rad(P.glob.z));
    const dzB = P.bassinZ || 0;
    p0.z += dzB * etat.k;
    root.position.copy(p0);
    etat.racine.updateMatrixWorld(true);
    // hanches épinglées : la rotation du bassin ne déplace pas les cuisses (seules les hanches sont recalées ; genoux et
    // pieds suivent par la chaîne du squelette, donc aucun segment de jambe n'est étiré). Avec une bascule globale, les
    // hanches suivent la rotation du corps autour des genoux ou des chevilles.
    for (const c of ['L', 'R']) {
      let h = tourneX(R.hanche[c], R.genouC, rad(P.glob.k));
      h = tourneX(h, R.chevilleC, rad(P.glob.a));
      h = tourneZ(h, R.chevilleC, rad(P.glob.z));
      h.z += dzB * etat.k;
      epingler('upperleg01.' + c, h);
    }
    etat.racine.updateMatrixWorld(true);
    // avancement / recul du bassin SEUL : le thorax reste en place, genoux et pieds aussi (la cuisse s'incline autour
    // de la hanche, la jambe reste d'aplomb)
    if (dzB) {
      const dv = new THREE.Vector3(0, 0, dzB * etat.k);
      epingler('spine05', monde(etat.bones.spine05).sub(dv));
      etat.racine.updateMatrixWorld(true);
      for (const c of ['L', 'R']) {
        const cuisse = etat.bones['upperleg01.' + c],
          jambe = etat.bones['lowerleg01.' + c];
        const hanche = monde(cuisse),
          genou = monde(jambe);
        const de = genou.clone().sub(hanche),
          vers = genou.clone().sub(dv).sub(hanche);
        const qd = new THREE.Quaternion().setFromUnitVectors(de.normalize(), vers.normalize());
        tournerMonde(cuisse, qd);
        tournerMonde(jambe, qd.clone().invert());
      }
      etat.racine.updateMatrixWorld(true);
    }
    // pronation / supination : torsion autour de l'axe coude → poignet, répartie sur les deux os de l'avant-bras
    for (const s of ['L', 'R']) {
      const deg = P.twist[s];
      if (!deg) continue;
      const axe = monde(etat.bones['wrist.' + s])
        .sub(monde(etat.bones['lowerarm01.' + s]))
        .normalize();
      const sens = s === 'L' ? 1 : -1; // + = pronation (dos de la main vers l'avant), - = supination (paume vers l'avant)
      tournerMonde(
        etat.bones['lowerarm01.' + s],
        new THREE.Quaternion().setFromAxisAngle(axe, (sens * deg * 0.3 * Math.PI) / 180)
      );
      tournerMonde(
        etat.bones['lowerarm02.' + s],
        new THREE.Quaternion().setFromAxisAngle(axe, (sens * deg * 0.7 * Math.PI) / 180)
      );
    }
    etat.racine.updateMatrixWorld(true);
    // déformations locales (blend shapes) : courbures du dos, fessiers, genoux
    etat.racine.traverse((o) => {
      if (!o.morphTargetDictionary) return;
      o.morphTargetInfluences.fill(0);
      for (const k in P.morph) {
        const i = o.morphTargetDictionary[k];
        if (i !== undefined) o.morphTargetInfluences[i] = P.morph[k];
      }
    });
  }

  function pose(valeurs) {
    etat.valeurs = valeurs || {};
    if (!etat.racine) return;
    if (!etat.pivot) repere();
    poserBrut(poseDepuisValeurs(etat.valeurs, etat.sexe));
    if (reperes.groupe) {
      etat.racine.updateMatrixWorld(true);
      majReperes();
    }
  }

  // ── repères cliniques (optionnels) : lignes bi-acromiales, bi-iliaques, bi-oculaire, bi-genoux, fil à plomb
  const COUL_REP = {
    epaules: 0x2563eb,
    bassin: 0xdc2626,
    yeux: 0x16a34a,
    genoux: 0xea580c,
    plomb: 0x6b7280,
  };
  function creerReperes() {
    if (reperes.groupe) etat.racine.remove(reperes.groupe);
    const g = new THREE.Group();
    g.visible = reperes.actif;
    const pt = (os, local) => {
      const o = new THREE.Object3D();
      o.position.copy(local);
      etat.bones[os].add(o);
      return o;
    };
    const W = (os) => monde(etat.bones[os]);
    // les os sont au repos : positions monde de repos → décalages locaux (axes identiques au repos)
    etat.racine.updateMatrixWorld(true);
    const off = (os, ref, d) => W(ref).clone().add(d).sub(W(os));
    const defs = {
      epaules: [
        pt(
          'clavicle.R',
          off('clavicle.R', 'upperarm01.R', new THREE.Vector3(0.0, 0.05 * etat.k, 0.0))
        ),
        pt(
          'clavicle.L',
          off('clavicle.L', 'upperarm01.L', new THREE.Vector3(0.0, 0.05 * etat.k, 0.0))
        ),
      ],
      bassin: [
        pt(
          'pelvis.R',
          off('pelvis.R', 'upperleg01.R', new THREE.Vector3(0.05 * etat.k, 0.1 * etat.k, 0.0))
        ),
        pt(
          'pelvis.L',
          off('pelvis.L', 'upperleg01.L', new THREE.Vector3(-0.05 * etat.k, 0.1 * etat.k, 0.0))
        ),
      ],
      // ligne bi-oculaire (axe des yeux) : si elle n'est pas horizontale, le regard n'est pas horizontal
      // (entrée haute « visuelle » du profil du patient)
      yeux: [
        pt('head', off('head', 'head', new THREE.Vector3(-0.032 * etat.k, 0.037 * etat.k, 0.0))),
        pt('head', off('head', 'head', new THREE.Vector3(0.032 * etat.k, 0.037 * etat.k, 0.0))),
      ],
      genoux: [
        pt('lowerleg01.R', new THREE.Vector3(0, 0, 0)),
        pt('lowerleg01.L', new THREE.Vector3(0, 0, 0)),
      ],
    };
    reperes.lignes = [];
    for (const k in defs) {
      // trait épais (cylindre de 4 mm de rayon) : lisible aussi sur les vignettes du rapport
      const ligne = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004 * etat.k, 0.004 * etat.k, 1, 6),
        new THREE.MeshBasicMaterial({ color: COUL_REP[k], depthTest: false, transparent: true })
      );
      ligne.renderOrder = 20;
      ligne.frustumCulled = false;
      g.add(ligne);
      reperes.lignes.push({ k, a: defs[k][0], b: defs[k][1], ligne });
    }
    // fil à plomb : vertical passant par le milieu des chevilles
    const gp = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const plomb = new THREE.Line(
      gp,
      new THREE.LineDashedMaterial({
        color: COUL_REP.plomb,
        dashSize: 0.03,
        gapSize: 0.02,
        depthTest: false,
        transparent: true,
      })
    );
    plomb.renderOrder = 20;
    plomb.frustumCulled = false;
    g.add(plomb);
    reperes.plomb = plomb;
    reperes.groupe = g;
    etat.racine.add(g);
  }
  // angles (°) vus de face : + = côté droit du patient plus haut (côté gauche de l'écran monte)
  function majReperes() {
    if (!reperes.groupe) return null;
    const out = {};
    for (const r of reperes.lignes) {
      const a = r.a.getWorldPosition(new THREE.Vector3()),
        b = r.b.getWorldPosition(new THREE.Vector3());
      const dir = b.clone().sub(a).normalize(),
        ext = 0.12 * etat.k;
      const p1 = a.clone().addScaledVector(dir, -ext),
        p2 = b.clone().addScaledVector(dir, ext);
      r.ligne.position.copy(p1).add(p2).multiplyScalar(0.5);
      r.ligne.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      r.ligne.scale.set(1, p1.distanceTo(p2), 1);
      out[r.k] =
        Math.round(((Math.atan2(a.y - b.y, Math.abs(b.x - a.x)) * 180) / Math.PI) * 10) / 10;
    }
    const c = etat.pivot ? etat.pivot.chevilleC : new THREE.Vector3();
    reperes.plomb.geometry.setFromPoints([
      new THREE.Vector3(0, 0.0, c.z),
      new THREE.Vector3(0, 1.95 * etat.k, c.z),
    ]);
    reperes.plomb.computeLineDistances();
    reperes.angles = out;
    return out;
  }
  function montrerReperes(oui) {
    reperes.actif = !!oui;
    if (reperes.groupe) reperes.groupe.visible = reperes.actif;
    if (reperes.actif) majReperes();
    afficher();
    return reperes.angles;
  }

  function vue(nom) {
    etat.vue = nom;
    etat.az = VUES[nom].az;
    afficher();
  }
  function tourner(daz) {
    etat.vue = null;
    etat.az += daz;
    afficher();
  }
  function png() {
    afficher();
    return canvas.toDataURL('image/png');
  }
  function liberer() {
    renderer.dispose();
  }

  // Diagnostic (tests) : la couche musculaire a-t-elle sa texture, quelle couche est visible ?
  function diag() {
    const r = { peauVisible: false, muscleVisible: false, textureMuscle: false };
    if (etat.racine)
      etat.racine.traverse((o) => {
        if (o.userData.role === 'peau') r.peauVisible = o.visible;
        if (o.userData.role === 'muscles') {
          r.muscleVisible = o.visible;
          const m = o.material.map;
          r.textureMuscle = !!(m && m.image && m.image.width > 0);
        }
      });
    return r;
  }
  return {
    chargerSexe,
    peau,
    pose,
    montrerReperes,
    angles: () => reperes.angles || null,
    vue,
    tourner,
    taille,
    afficher,
    png,
    liberer,
    etat,
    diag,
    THREE,
  };
}

// Rendu hors écran des 4 vues pour le rapport (mêmes valeurs → mêmes images, échelle identique)
export async function rendreVues(
  valeurs,
  {
    sexe = 'homme',
    profil = 'adulte',
    peau = true,
    largeur = 360,
    hauteur = 640,
    reperes: avecReperes = true,
  } = {}
) {
  const c = document.createElement('canvas');
  const m = await creerMoteur(c, { preserve: true });
  m.etat.peau = peau;
  m.taille(largeur, hauteur);
  await m.chargerSexe(sexe, profil);
  m.peau(peau);
  m.pose(valeurs);
  // repères cliniques (épaules, bassin, yeux, genoux, fil à plomb) tracés sur les 4 vues du rapport
  const angles = avecReperes ? m.montrerReperes(true) : null;
  const out = {};
  for (const k of ['face', 'dos', 'profilD', 'profilG']) {
    m.vue(k);
    out[k] = m.png();
  }
  m.liberer();
  if (angles) out.angles = angles;
  return out;
}
