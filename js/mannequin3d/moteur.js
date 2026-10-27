// Mannequin postural 3D — moteur WebGL (Three.js auto-hébergé, chargé à la demande).
import * as THREE from '../../assets/vendor/three/three.module.min.js';
import { GLTFLoader } from '../../assets/vendor/three/GLTFLoader.js';
import { poseDepuisValeurs, CURSEURS } from './parametres.js';

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
          o.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.42,
            metalness: 0,
          });
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

  // ── pose : cinématique directe (curseurs) puis cinématique inverse (pieds au sol)
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
    etat.racine.updateMatrixWorld(true);
  }
  const _v = new THREE.Vector3(),
    _q = new THREE.Quaternion(),
    _q2 = new THREE.Quaternion();
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
  // Résolution analytique à deux os (hanche → genou → cheville) : la cheville rejoint la cible sans étirer le modèle
  function pieds(hanche, genou, cheville, cible) {
    const H = monde(hanche),
      K = monde(genou),
      A = monde(cheville);
    const l1 = H.distanceTo(K),
      l2 = K.distanceTo(A);
    const dv = cible.clone().sub(H);
    let d = dv.length();
    const u = dv.clone().normalize();
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d),
      alpha = Math.acos(Math.max(-1, Math.min(1, cosA)));
    const pole = new THREE.Vector3(0, 0, 1);
    pole.sub(u.clone().multiplyScalar(pole.dot(u))).normalize();
    const Kd = H.clone()
      .add(u.clone().multiplyScalar(Math.cos(alpha) * l1))
      .add(pole.multiplyScalar(Math.sin(alpha) * l1));
    tournerMonde(
      hanche,
      new THREE.Quaternion().setFromUnitVectors(
        K.clone().sub(H).normalize(),
        Kd.clone().sub(H).normalize()
      )
    );
    const K2 = monde(genou),
      A2 = monde(cheville),
      T = H.clone().add(u.multiplyScalar(d));
    tournerMonde(
      genou,
      new THREE.Quaternion().setFromUnitVectors(
        A2.clone().sub(K2).normalize(),
        T.clone().sub(K2).normalize()
      )
    );
  }

  function pose(valeurs) {
    etat.valeurs = valeurs || {};
    if (!etat.racine) return;
    const P = poseDepuisValeurs(etat.valeurs);
    const bassinNeutre =
      Math.abs(P.bassin[0]) + Math.abs(P.bassin[1]) + Math.abs(P.bassin[2]) < 1e-6;
    let cibles = null;
    if (!bassinNeutre) {
      // 1) pose des curseurs SANS le bassin : on mémorise où se trouvent les pieds (au sol)
      const sans = {};
      for (const c of CURSEURS)
        if (!c.id.startsWith('bassin_') && etat.valeurs[c.id]) sans[c.id] = etat.valeurs[c.id];
      poserBrut(poseDepuisValeurs(sans));
      cibles = {};
      for (const s of ['L', 'R']) {
        const f = etat.bones['foot.' + s];
        cibles[s] = { pos: monde(f), q: f.getWorldQuaternion(new THREE.Quaternion()) };
      }
    }
    poserBrut(P);
    if (cibles) {
      for (const s of ['L', 'R']) {
        pieds(
          etat.bones['upperleg01.' + s],
          etat.bones['lowerleg01.' + s],
          etat.bones['foot.' + s],
          cibles[s].pos
        );
        const f = etat.bones['foot.' + s];
        f.parent.getWorldQuaternion(_q);
        f.quaternion.copy(_q.invert().multiply(cibles[s].q));
        f.updateMatrixWorld(true);
      }
    }
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
