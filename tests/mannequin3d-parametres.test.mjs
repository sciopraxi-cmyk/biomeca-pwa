// #265 — Mannequin postural 3D : fonctions pures (aucun WebGL). Les données ne contiennent aucun patient réel.
import { describe, it, expect } from 'vitest';
import { readFileSync, statSync } from 'node:fs';
import {
  CURSEURS,
  PAR_ID,
  TABLEAUX,
  GROUPES,
  POSE_NEUTRE,
  poseDepuisValeurs,
  assemblage,
  REPARTITION_RACHIS,
  nettoyerValeurs,
  decrire,
  qAxe,
  qMul,
  qInv,
} from '../js/mannequin3d/parametres.js';

const proche = (a, b, e = 1e-9) => a.every((x, i) => Math.abs(x - b[i]) < e);

describe('quaternions', () => {
  it('q · q⁻¹ = identité', () => {
    const q = qMul(qAxe('x', 20), qMul(qAxe('y', -35), qAxe('z', 12)));
    expect(proche(qMul(q, qInv(q)), [0, 0, 0, 1])).toBe(true);
  });
  it('rotation de +90° autour de z envoie +y vers -x (haut → droite du patient)', () => {
    const [x, y, z, w] = qAxe('z', 90);
    // v' = q v q⁻¹ pour v = (0,1,0)
    const t = [2 * (y * 0 - z * 1), 2 * (z * 0 - x * 0), 2 * (x * 1 - y * 0)];
    const v = [
      0 + w * t[0] + (y * t[2] - z * t[1]),
      1 + w * t[1] + (z * t[0] - x * t[2]),
      0 + w * t[2] + (x * t[1] - y * t[0]),
    ];
    expect(Math.round(v[0])).toBe(-1);
    expect(Math.round(v[1])).toBe(0);
  });
});

describe('curseurs', () => {
  it('identifiants uniques, bornes cohérentes, groupes connus', () => {
    const ids = new Set();
    for (const c of CURSEURS) {
      expect(ids.has(c.id)).toBe(false);
      ids.add(c.id);
      expect(c.min).toBeLessThan(c.max);
      expect(c.min <= 0 && c.max >= 0).toBe(true);
      expect(GROUPES.map((g) => g[0])).toContain(c.groupe);
      expect(c.fin).toHaveLength(2);
      expect(c.court).toBeTruthy();
    }
    expect(CURSEURS.length).toBeGreaterThanOrEqual(45);
  });
  it('chaque curseur latéralisé D a son jumeau G (même plage, même libellé de fin)', () => {
    for (const c of CURSEURS.filter((x) => x.cote === 'D')) {
      const g = PAR_ID[c.id.slice(0, -1) + 'G'];
      expect(g, c.id).toBeTruthy();
      expect([g.min, g.max, g.unite]).toEqual([c.min, c.max, c.unite]);
      expect(g.fin).toEqual(c.fin);
    }
  });
  it('les opérations ne visent que des os du squelette livré', () => {
    const OS_OK =
      /^(root|spine0[1-5]|neck0[1-3]|clavicle\.[LR]|upperarm01\.[LR]|lowerarm0[12]\.[LR]|lowerarm01\.[LR]|upperleg01\.[LR]|lowerleg01\.[LR]|foot\.[LR]|pelvis\.[LR])$/;
    for (const c of CURSEURS)
      for (const o of c.ops(c.max)) {
        if (o.os) expect(o.os, c.id).toMatch(OS_OK);
      }
  });
  it('tableaux types : seuls des curseurs existants, dans leurs bornes', () => {
    for (const k in TABLEAUX)
      for (const [id, v] of Object.entries(TABLEAUX[k].valeurs)) {
        expect(PAR_ID[id], k + '/' + id).toBeTruthy();
        expect(v).toBeGreaterThanOrEqual(PAR_ID[id].min);
        expect(v).toBeLessThanOrEqual(PAR_ID[id].max);
      }
  });
});

describe('pose', () => {
  it('neutre : seulement la pose « bras le long du corps », bassin = identité', () => {
    const P = poseDepuisValeurs({});
    expect(proche(P.bassin, [0, 0, 0, 1])).toBe(true);
    for (const o of POSE_NEUTRE) expect(P.rot[o.os]).toBeTruthy();
    expect(Object.keys(P.pos)).toHaveLength(0);
  });
  it('inclinaison de la tête répartie sur 3 vertèbres cervicales (somme = valeur)', () => {
    const P = poseDepuisValeurs({ tete_incl: 15 });
    let ang = 0;
    for (const n of ['neck01', 'neck02', 'neck03'])
      ang += (2 * Math.asin(P.rot[n][2]) * 180) / Math.PI;
    expect(Math.round(ang)).toBe(15);
  });
  it('inégalité de 22 mm sur 220 mm de large ≈ 5,7° de bascule', () => {
    const P = poseDepuisValeurs({ bassin_inegalite: 22 });
    expect(Math.round(((2 * Math.asin(P.bassin[2]) * 180) / Math.PI) * 10) / 10).toBe(5.7);
  });
  it('courbures du dos : déformation locale (blend shape), aucun os du tronc ne tourne', () => {
    const P = poseDepuisValeurs({ tronc_lordose: 15, tronc_cyphose: 20 });
    expect(P.morph.lordose).toBeCloseTo(0.5, 9);
    expect(P.morph.cyphose).toBeCloseTo(0.5, 9);
    for (const n of ['spine01', 'spine02', 'spine03', 'spine04', 'spine05'])
      expect(proche(P.rot[n] || [0, 0, 0, 1], [0, 0, 0, 1])).toBe(true);
  });
  it('bassin : le mouvement se répartit sur le rachis et revient à zéro au sommet ; les cuisses restent d’aplomb', () => {
    const P = poseDepuisValeurs({ bassin_bascule: 7, bassin_antev: 5, bassin_rot: -9 });
    const A = assemblage(P);
    // rotation nette de chaque niveau = root × contre-rotations cumulées
    let net = A.root;
    const nets = {};
    for (const [n] of REPARTITION_RACHIS) {
      net = qMul(net, A.counters[n]);
      nets[n] = net;
    }
    expect(proche(nets.spine01, [0, 0, 0, 1])).toBe(true); // épaules, cou et tête ne bougent pas
    expect(Math.abs((2 * Math.asin(nets.spine05[2]) * 180) / Math.PI)).toBeGreaterThan(
      Math.abs((2 * Math.asin(nets.spine03[2]) * 180) / Math.PI)
    ); // fondu décroissant
    for (const c of ['L', 'R'])
      expect(proche(qMul(A.root, A.counters['upperleg01.' + c]), [0, 0, 0, 1])).toBe(true);
    expect(P.rot.neck02).toBeUndefined();
    expect(REPARTITION_RACHIS.reduce((s, x) => s + x[1], 0)).toBeCloseTo(1, 9);
  });
  it('antériorisation globale : en bloc au-dessus de l’articulation choisie, segments inférieurs fixes, pieds à plat', () => {
    for (const [id, cle] of [
      ['glob_chev', 'a'],
      ['glob_gen', 'k'],
      ['glob_bassin', 'h'],
    ]) {
      const P = poseDepuisValeurs({ [id]: 6 });
      expect(P.glob[cle]).toBe(6);
      const A = assemblage(P);
      expect((2 * Math.asin(A.root[0]) * 180) / Math.PI).toBeCloseTo(6, 6); // tout le haut du corps s’incline de 6°
      // pieds : orientation monde nulle quelle que soit l’articulation ; jambes / cuisses selon le pivot
      const mondeFoot = qMul(
        qMul(qMul(A.root, A.counters['upperleg01.L']), A.counters['lowerleg01.L']),
        A.counters['foot.L']
      );
      expect(proche(mondeFoot, [0, 0, 0, 1])).toBe(true);
    }
    const ch = assemblage(poseDepuisValeurs({ glob_chev: 6 }));
    const cuisse = qMul(ch.root, ch.counters['upperleg01.L']);
    expect((2 * Math.asin(cuisse[0]) * 180) / Math.PI).toBeCloseTo(6, 6); // depuis les chevilles : les cuisses s’inclinent aussi
    const ba = assemblage(poseDepuisValeurs({ glob_bassin: 6 }));
    expect(proche(qMul(ba.root, ba.counters['upperleg01.L']), [0, 0, 0, 1])).toBe(true); // depuis le bassin : cuisses fixes
    expect(poseDepuisValeurs({ glob_chev: -4 }).glob.a).toBe(-4); // postériorisation
  });
  it('antéversion : les fessiers bombent (poids > 0), rétroversion : ils s’aplatissent (poids < 0), sans flexion des genoux', () => {
    expect(poseDepuisValeurs({ bassin_antev: 6 }).morph.fessiers).toBeCloseTo(1, 9);
    expect(poseDepuisValeurs({ bassin_antev: 6 }).morph.lordose).toBeCloseTo(1, 9); // antéversion : bas du dos creusé
    const R = poseDepuisValeurs({ bassin_antev: -10 });
    expect(R.morph.fessiers).toBeLessThan(0);
    expect(R.morph.lordose).toBeLessThan(0); // rétroversion : lombaires moins creusées
    expect(Object.keys(R.morph).filter((k) => k.startsWith('genou'))).toHaveLength(0);
  });
  it('genou : seule la déformation locale du genou bouge (flessum + = en avant, recurvatum − = en arrière)', () => {
    const P = poseDepuisValeurs({ genou_flex_D: 15, genou_flex_G: -15, genou_valgus_D: 15 });
    expect(P.morph.genou_flex_R).toBeCloseTo(0.5, 9);
    expect(P.morph.genou_flex_L).toBeCloseTo(-0.5, 9);
    expect(P.morph.genou_valgus_R).toBeCloseTo(1, 9);
    expect(P.rot['lowerleg01.R']).toBeUndefined();
    expect(P.rot['foot.R']).toBeUndefined();
  });
  it('ceinture scapulaire : seules les clavicules bougent, pas la tête ni le tronc', () => {
    const P = poseDepuisValeurs({ ceinture_incl: 6, ceinture_rot: 10 });
    expect(P.rot['clavicle.L']).toBeTruthy();
    expect(P.rot['clavicle.R']).toBeTruthy();
    for (const n of ['neck01', 'neck02', 'neck03', 'head', 'spine01', 'spine02'])
      expect(P.rot[n]).toBeUndefined();
  });
  it('pronation / supination : torsion pure (aucune rotation du coude), + = pronation', () => {
    const P = poseDepuisValeurs({ avbras_pron_D: 40, avbras_pron_G: -30 });
    expect(P.twist).toEqual({ R: 40, L: -30 });
    const N = poseDepuisValeurs({}).rot;
    expect(P.rot['lowerarm01.R']).toEqual(N['lowerarm01.R']);
    expect(P.rot['lowerarm02.R']).toBeUndefined();
  });
  it('côtés du patient : abduction identique D/G = mouvement symétrique (z opposés)', () => {
    const P = poseDepuisValeurs({ bras_abd_D: 20, bras_abd_G: 20 });
    const l = P.rot['upperarm01.L'],
      r = P.rot['upperarm01.R'];
    expect(Math.sign(l[2])).toBe(-Math.sign(r[2]));
  });
  it('translations en mètres (cm saisis)', () => {
    const P = poseDepuisValeurs({ tete_antep: 6 });
    expect(P.pos.neck02[2]).toBeCloseTo(0.06, 9);
  });
});

describe('enregistrement', () => {
  it('nettoyerValeurs borne, arrondit et retire les zéros et valeurs inconnues', () => {
    const v = nettoyerValeurs({
      tete_incl: 99,
      tronc_incl: 0,
      bassin_bascule: -3.14159,
      inconnu: 5,
      genou_flex_D: 'abc',
    });
    expect(v).toEqual({ tete_incl: 20, bassin_bascule: -3.1 });
  });
  it('compte rendu : une ligne par valeur non nulle, libellés du côté du patient', () => {
    const l = decrire({ tete_incl: -5, genou_valgus_D: 9 });
    expect(l).toEqual(['Inclinaison de la tête : G 5 °', 'Valgus / varus du genou D : valgus 9 °']);
    expect(decrire({})).toEqual([]);
  });
});

describe('isolation du module (règle CLAUDE.md : import dynamique, hors précache)', () => {
  const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  it('index.html ne charge ni Three.js ni le module ; biomeca.js n’importe qu’en dynamique', () => {
    expect(lire('index.html')).not.toMatch(/mannequin3d|vendor\/three/);
    const b = lire('js/biomeca.js');
    expect(b).not.toMatch(/^import .*mannequin3d/m);
    expect(b.match(/import\('\.\/mannequin3d\/index\.js\?v=' \+ APP_BUILD\)/g)).toHaveLength(2);
  });
  it('le service worker ne précache ni Three.js ni les modèles 3D', () => {
    const sw = lire('service-worker.js');
    const pre = sw.slice(sw.indexOf('PRECACHE_URLS'), sw.indexOf(']', sw.indexOf('PRECACHE_URLS')));
    expect(pre).not.toMatch(/three|mannequin/);
  });
  it('modèles livrés, compressés, et licence de Three.js jointe', () => {
    for (const f of ['homme', 'femme'])
      expect(
        statSync(new URL('../assets/mannequin/' + f + '.glb.gz', import.meta.url)).size
      ).toBeGreaterThan(1e6);
    expect(lire('assets/vendor/three/LICENSE')).toMatch(/MIT License/);
    expect(lire('assets/vendor/three/GLTFLoader.js')).not.toMatch(/from 'three'/);
  });
  it('les deux modèles sont de vrais GLB : squelette + peau + muscles', async () => {
    const { gunzipSync } = await import('node:zlib');
    for (const f of ['homme', 'femme']) {
      const b = gunzipSync(
        readFileSync(new URL('../assets/mannequin/' + f + '.glb.gz', import.meta.url))
      );
      expect(b.toString('latin1', 0, 4)).toBe('glTF');
      const n = b.readUInt32LE(12);
      const j = JSON.parse(b.toString('utf8', 20, 20 + n));
      const noms = j.nodes.map((x) => x.name);
      expect(noms).toEqual(
        expect.arrayContaining(['Corps', 'Muscles', 'root', 'upperarm01.L', 'foot.R', 'neck03'])
      );
      expect(j.skins[0].joints.length).toBeGreaterThan(90);
    }
  });
});

describe('dictée', () => {
  it('« genu valgum bilatéral marqué » → deux genoux, 11° (amplitude propre au curseur)', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    const r = interpreter('genu valgum bilatéral marqué');
    expect(r.propositions.map((p) => [p.id, p.valeur])).toEqual([
      ['genou_valgus_D', 11],
      ['genou_valgus_G', 11],
    ]);
  });
  it('côté, qualificatif, chiffre dicté (le chiffre l’emporte), niveau par défaut signalé', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    const r = interpreter(
      'bascule du bassin à droite légère, tête penchée à gauche de 8 degrés, épaule droite haute, recurvatum du genou gauche sévère'
    );
    const m = Object.fromEntries(r.propositions.map((p) => [p.id, p]));
    expect(m.bassin_bascule.valeur).toBe(2);
    expect(m.tete_incl.valeur).toBe(-8);
    expect(m.epaule_elev_D.valeur).toBe(5);
    expect(m.epaule_elev_D.defaut).toBe(true);
    expect(m.genou_flex_G.valeur).toBe(-15);
  });
  it('inégalité de longueur : la jambe nommée courte ou longue donne le bon signe', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    expect(interpreter('jambe droite plus courte de 12 mm').propositions[0].valeur).toBe(12);
    expect(interpreter('jambe droite plus longue de 12 mm').propositions[0].valeur).toBe(-12);
  });
  it('côté manquant sur un curseur non latéralisé : rien n’est deviné', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    const r = interpreter('bascule du bassin marquée, phrase incompréhensible');
    expect(r.propositions).toEqual([]);
    expect(r.ignorees.length).toBe(2);
  });
  it('toutes les propositions respectent les bornes des curseurs', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    const t =
      'genu valgum bilatéral sévère, hyperlordose sévère, pieds en dedans sévère, tête en avant 99 cm, rotation interne des cuisses marquée';
    for (const p of interpreter(t).propositions) {
      expect(p.valeur).toBeGreaterThanOrEqual(PAR_ID[p.id].min);
      expect(p.valeur).toBeLessThanOrEqual(PAR_ID[p.id].max);
    }
  });
});

describe('dictée : phrases libres, vocabulaire médical', () => {
  const val = async (t) => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    return Object.fromEntries(interpreter(t).propositions.map((p) => [p.id, p.valeur]));
  };
  it('phrase de compte rendu complète, mots dans le désordre, nombre en lettres', async () => {
    const m = await val(
      'Le patient présente un genu valgum bilatéral marqué, une bascule du bassin à droite légère et la tête penchée à gauche de huit degrés.'
    );
    expect(m).toEqual({ genou_valgus_D: 11, genou_valgus_G: 11, bassin_bascule: 2, tete_incl: -8 });
  });
  it('comparatif « plus haute que la gauche » : seul le premier côté est concerné', async () => {
    const m = await val('épaule droite plus haute que la gauche');
    expect(Object.keys(m)).toEqual(['epaule_elev_D']);
  });
  it('un chiffre ou un niveau isolé après une virgule se rattache à la phrase précédente', async () => {
    expect(await val('antériorisation globale à partir des genoux, 6 degrés')).toEqual({
      glob_gen: 6,
    });
    expect(await val('hyperlordose, sévère')).toEqual({ tronc_lordose: 30 });
  });
  it('unités : 1 centimètre = 10 mm ; « un centimètre » écrit en toutes lettres', async () => {
    expect(await val('jambe gauche plus courte de 1 cm')).toEqual({ bassin_inegalite: -10 });
    expect(await val("la jambe gauche est plus courte d'un centimètre")).toEqual({
      bassin_inegalite: -10,
    });
  });
  it('antériorisation / postériorisation globale : pivot et sens', async () => {
    expect(await val('antériorisation globale depuis les chevilles marquée')).toEqual({
      glob_chev: 6,
    });
    expect(await val('postériorisation globale depuis le bassin modérée')).toEqual({
      glob_bassin: -5,
    });
    expect(await val('le corps penche en bloc vers l’avant depuis les genoux')).toEqual({
      glob_gen: 4,
    });
  });
  it('« coude » ne déclenche pas la tête (le mot cou n’est pas lu dans coude)', async () => {
    expect(await val('flexion du coude droit marquée')).toEqual({ coude_flex_D: 105 });
  });
  it('une proposition à niveau explicite l’emporte sur un doublon à niveau par défaut', async () => {
    expect(await val('rétroversion du bassin marquée, dos plat')).toEqual({ bassin_antev: -9 });
  });
  it('texte sans rapport : rien n’est proposé', async () => {
    expect(await val('bonjour docteur ceci est un test')).toEqual({});
  });
});

import { appliquerTableau, TABLEAUX as TAB_CUMUL } from '../js/mannequin3d/parametres.js';
describe('tableaux types cumulables', () => {
  it('un second tableau s’ajoute au premier au lieu de le remplacer', () => {
    const a = appliquerTableau({}, 'genu_valgum_bilat');
    const b = appliquerTableau(a, 'bascule_bassin_D');
    for (const k in TAB_CUMUL.genu_valgum_bilat.valeurs)
      expect(b[k]).toBe(TAB_CUMUL.genu_valgum_bilat.valeurs[k]);
    for (const k in TAB_CUMUL.bascule_bassin_D.valeurs)
      expect(b[k]).toBe(TAB_CUMUL.bascule_bassin_D.valeurs[k]);
  });
  it('conserve aussi les curseurs réglés à la main ; en cas de conflit la valeur du tableau choisi l’emporte', () => {
    const b = appliquerTableau({ tete_incl: 6, genou_valgus_D: 1 }, 'genu_valgum_bilat');
    expect(b.tete_incl).toBe(6);
    expect(b.genou_valgus_D).toBe(TAB_CUMUL.genu_valgum_bilat.valeurs.genou_valgus_D);
  });
  it('« Neutre » remet tout à zéro ; l’entrée n’est pas modifiée', () => {
    const v = { tete_incl: 6 };
    expect(appliquerTableau(v, 'neutre')).toEqual({});
    appliquerTableau(v, 'genu_valgum_bilat');
    expect(v).toEqual({ tete_incl: 6 });
  });
});

import { BUILD as BUILD_UI, decrire as decrireVal } from '../js/mannequin3d/parametres.js';
describe('répartition du poids G/D et version affichée', () => {
  it('le compte rendu indique la répartition ; le curseur incline le corps entier du côté chargé', () => {
    expect(decrireVal({ poids_lr: 10 })).toEqual(['Répartition du poids : 40 % G / 60 % D']);
    expect(decrireVal({ poids_lr: -15 })).toEqual(['Répartition du poids : 65 % G / 35 % D']);
  });
  it('la dictée comprend « poids sur la jambe droite »', async () => {
    const { interpreter } = await import('../js/mannequin3d/dictee.js');
    const r = interpreter('poids du corps sur la jambe droite modéré');
    expect(r.propositions.map((p) => p.id)).toContain('poids_lr');
    expect(r.propositions.find((p) => p.id === 'poids_lr').valeur).toBeGreaterThan(0);
  });
  it('la version affichée (BUILD) suit la version du service worker', async () => {
    const fs = await import('node:fs');
    const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
    expect(sw).toContain("CACHE_VERSION = 'biomeca-" + BUILD_UI + "'");
    const app = fs.readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
    expect(app).toContain("const APP_BUILD = '" + BUILD_UI + "'"); // version du code de la page affichée dans « Mon compte »
  });
});

describe('chargement des modules : jamais de mélange entre deux versions', () => {
  it('chaque import relatif du mannequin porte ?v=<version> ; biomeca.js aussi ; le modèle 3D aussi', async () => {
    const fs = await import('node:fs');
    const dir = new URL('../js/mannequin3d/', import.meta.url);
    const fichiers = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    for (const f of fichiers) {
      const src = fs.readFileSync(new URL(f, dir), 'utf8');
      for (const m of src.matchAll(/from '(\.\/[^']+)'/g))
        expect(m[1], f + ' → ' + m[1]).toBe(m[1].split('?')[0] + '?v=' + BUILD_UI);
    }
    const moteur = fs.readFileSync(new URL('moteur.js', dir), 'utf8');
    expect(moteur).toContain('glb.gz?v=' + BUILD_UI + "'");
    const app = fs.readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
    expect(app).not.toContain("import('./mannequin3d/index.js')");
    expect(app).toContain("import('./mannequin3d/index.js?v=' + APP_BUILD)");
  });
});

import { assemblage, qMul, qInv, LATERALISATION_PAR_POINT } from '../js/mannequin3d/parametres.js';
describe('répartition du poids G/D : latéralisation globale depuis les chevilles', () => {
  const eq = (a, b) =>
    a.every((x, i) => Math.abs(x - b[i]) < 1e-9) || a.every((x, i) => Math.abs(x + b[i]) < 1e-9);
  it('le corps penche du côté le plus chargé : D (+) → rotation z positive (haut vers la droite du patient), G (−) → négative', () => {
    expect(poseDepuisValeurs({ poids_lr: 20 }).glob.z).toBeCloseTo(
      20 * LATERALISATION_PAR_POINT,
      9
    );
    expect(poseDepuisValeurs({ poids_lr: -20 }).glob.z).toBeCloseTo(
      -20 * LATERALISATION_PAR_POINT,
      9
    );
    expect(poseDepuisValeurs({ poids_lr: 0 }).glob.z).toBe(0);
    expect(poseDepuisValeurs({ poids_lr: 30 }).glob.z).toBeCloseTo(7.5, 9);
  });
  it('rotation du bassin intacte, jambes rigides et pieds à plat : rotation monde du pied = identité', () => {
    for (const v of [
      { poids_lr: 30 },
      { poids_lr: -30, glob_chev: 4, bassin_bascule: 5, bassin_antev: 3 },
    ]) {
      const P = poseDepuisValeurs(v);
      const A = assemblage(P);
      for (const c of ['L', 'R']) {
        const monde = qMul(
          A.root,
          qMul(
            A.counters['upperleg01.' + c],
            qMul(A.counters['lowerleg01.' + c], A.counters['foot.' + c])
          )
        );
        expect(eq(monde, [0, 0, 0, 1]), v.poids_lr + ' / ' + c).toBe(true);
      }
    }
  });
  it('le curseur compte aussi les autres bascules globales (cumul avec l’antériorisation)', () => {
    const P = poseDepuisValeurs({ poids_lr: 10, glob_chev: 5 });
    expect(P.glob.a).toBe(5);
    expect(P.glob.z).toBeCloseTo(2.5, 9);
  });
});
