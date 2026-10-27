// Mannequin postural 3D — moteur WebGL (Three.js auto-hébergé, chargé à la demande).
import * as THREE from '../../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../assets/vendor/three/GLTFLoader.js';
import { poseDepuisValeurs } from './parametres.js';

const CHEMIN = (sexe) =>
  new URL(
    '../../assets/mannequin/' + (sexe === 'femme' ? 'femme' : 'homme') + '.glb.gz',
    import.meta.url
  ).href;
const cacheModeles = {};

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
      return await new Promise((ok, ko) => new GLTFLoader().parse(buf, '', ok, ko));
    })();
    cacheModeles[sexe].catch(() => {
      delete cacheModeles[sexe];
    });
  }
  return cacheModeles[sexe];
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
  };

  function taille(w, h) {
    etat.w = w;
    etat.h = h;
    renderer.setSize(w, h, false);
    const asp = w / h,
      demi = 1.0; // 1 m de demi-hauteur, identique pour tous les bilans
    cam.left = -demi * asp;
    cam.right = demi * asp;
    cam.top = demi;
    cam.bottom = -demi;
    cam.updateProjectionMatrix();
  }
  function placerCamera() {
    const d = 6,
      y = 0.9;
    cam.position.set(Math.sin(etat.az) * d, y, Math.cos(etat.az) * d);
    cam.lookAt(0, y, 0);
    cam.updateMatrixWorld(true);
  }
  function afficher() {
    placerCamera();
    renderer.render(scene, cam);
  }

  async function chargerSexe(sexe) {
    if (etat.sexe === sexe && etat.racine) return;
    const gltf = await lireGlb(sexe);
    if (etat.racine) scene.remove(etat.racine);
    const racine = cloner(gltf);
    etat.racine = racine;
    etat.sexe = sexe;
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
    // positions de repos (monde) : pivot du bassin (L5/S1) et hanches
    for (const n in etat.bones) {
      const b = etat.bones[n];
      b.position.copy(etat.repos[n].p);
      b.quaternion.copy(etat.repos[n].q);
    }
    etat.racine.updateMatrixWorld(true);
    etat.pivot = monde(etat.bones.spine05);
    etat.hanche = { L: monde(etat.bones['upperleg01.L']), R: monde(etat.bones['upperleg01.R']) };
  }
  function poserBrut(P) {
    for (const n in etat.bones) {
      const b = etat.bones[n],
        r = etat.repos[n];
      b.position.copy(r.p);
      b.quaternion.copy(r.q);
      const q = P.rot[n];
      if (q) b.quaternion.set(q[0], q[1], q[2], q[3]).multiply(r.q);
      const d = P.pos[n];
      if (d) b.position.add(new THREE.Vector3(d[0], d[1], d[2]));
    }
    // le bassin tourne autour du point L5/S1 (la colonne au-dessus reste en place grâce à la contre-rotation de spine05)
    const root = etat.bones.root,
      r = etat.repos.root;
    root.position.copy(r.p).sub(etat.pivot).applyQuaternion(root.quaternion).add(etat.pivot);
    etat.racine.updateMatrixWorld(true);
    // hanches épinglées : les jambes restent exactement où elles étaient (pieds au sol, genoux non fléchis)
    for (const s of ['L', 'R']) {
      const pel = etat.bones['pelvis.' + s];
      const delta = etat.hanche[s].clone().sub(monde(etat.bones['upperleg01.' + s]));
      if (delta.lengthSq() > 1e-12) {
        pel.parent.getWorldQuaternion(_q);
        pel.position.add(delta.applyQuaternion(_q.invert()));
      }
    }
    etat.racine.updateMatrixWorld(true);
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
    poserBrut(poseDepuisValeurs(etat.valeurs));
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

  return { chargerSexe, peau, pose, vue, tourner, taille, afficher, png, liberer, etat, THREE };
}

// Rendu hors écran des 4 vues pour le rapport (mêmes valeurs → mêmes images, échelle identique)
export async function rendreVues(
  valeurs,
  { sexe = 'homme', peau = true, largeur = 360, hauteur = 640 } = {}
) {
  const c = document.createElement('canvas');
  const m = await creerMoteur(c, { preserve: true });
  m.etat.peau = peau;
  m.taille(largeur, hauteur);
  await m.chargerSexe(sexe);
  m.peau(peau);
  m.pose(valeurs);
  const out = {};
  for (const k of ['face', 'dos', 'profilD', 'profilG']) {
    m.vue(k);
    out[k] = m.png();
  }
  m.liberer();
  return out;
}
