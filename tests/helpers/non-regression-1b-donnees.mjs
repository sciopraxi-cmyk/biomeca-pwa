// ═══════════════════════════════════════════════════════════════════
// #279 étape 1b — données de NON-RÉGRESSION des 6 tests hors KFPPA
// ═══════════════════════════════════════════════════════════════════
//
// Données SYNTHÉTIQUES uniquement (angles inventés, dataURL factice), SANS
// nonEnvoyee ni imageBrute : sur elles, les calculs et l'affichage doivent
// être identiques à ceux d'avant 1b (référence tests/golden/non-regression-1b.json,
// produite par le code de HEAD lu via BIOMECA_SRC).
//
// Valeurs enregistrées : COHÉRENTES avec les photos, calculées par les mêmes
// formules que _construireResultatTest (elles sont écrites ensemble par
// l'application). Cas sans valeurs enregistrées, valeurs manquantes (null,
// créneau absent), et valeurs enregistrées sans photos.

const IMG = 'data:image/jpeg;base64,QQ==';
// Variante SYNTHÉTIQUE du MLA en mode photo : seule source de pctD/deltaD.
export const ID_MLA_PHOTO = 'mla-photo-synthetique';
export const ajouterVariantes = (TESTS) => {
  TESTS[ID_MLA_PHOTO] = { ...TESTS['mla-marche'], mode: 'photo' };
  return TESTS;
};

const photo = (t, i, champs) => ({
  label: t.photoLabels[i],
  side: t.photoSides[i] || '',
  dataUrl: IMG,
  path: null,
  ...champs,
});

// Jeux d'angles par créneau ; null = valeur absente (jamais mesurée).
const JEUX_SIMPLES = {
  complet: [12.4, 15.1, -3.6, 9.8, 4.2, -6.7],
  negatifs: [-2.2, -8.9, 1.3, -0.4, -5.5, 3.3],
  manquantes: [7.1, null, null, 11.6, -4.4, null],
  zero: [0, 0, 5, 5, 0, 5],
};

export function cas(TESTS) {
  ajouterVariantes(TESTS);
  const out = [];
  const pousser = (id, nom, data) => out.push({ id, nom: `${id}#${nom}`, data });

  // MLA (vidéo) et variante photo : prop/écr par pied.
  for (const id of ['mla-marche', 'mla-course', ID_MLA_PHOTO]) {
    const t = TESTS[id];
    const valeurs = {
      complet: [118.2, 133.7, 121.5, 129.9],
      manquantes: [120, null, 117.4, 141.2],
      plat: [125, 125, 130, 130],
    };
    for (const [n, v] of Object.entries(valeurs)) {
      const photos = t.photoLabels.map((_l, i) => photo(t, i, { angle: v[i] }));
      pousser(id, n, { photos });
      // Valeurs enregistrées cohérentes (écrites par le mode photo).
      const enr = { photos };
      for (const [s, a, b] of [
        ['D', 0, 1],
        ['G', 2, 3],
      ]) {
        if (v[a] != null && v[b] != null) {
          enr['delta' + s] = v[b] - v[a];
          enr['pct' + s] = enr['delta' + s] / t.normDiv;
        }
      }
      pousser(id, n + '+enregistre', enr);
    }
    pousser(id, 'enregistre-sans-photos', {
      deltaD: 14.5,
      pctD: 14.5 / t.normDiv,
      deltaG: -3,
      pctG: -3 / t.normDiv,
    });
    pousser(id, 'vide', { photos: [] });
  }

  // Verrouillage : stat D, stat G, pointe D, pointe G.
  {
    const t = TESTS.verrou;
    for (const [n, v] of Object.entries({
      ...JEUX_SIMPLES,
      pointeSeule: [null, null, 9.4, -2.1],
    })) {
      pousser('verrou', n, { photos: t.photoLabels.map((_l, i) => photo(t, i, { angle: v[i] })) });
    }
    pousser('verrou', 'vide', { photos: [] });
  }

  // Mobilité : inversion et éversion bipodales, angleD/angleG.
  {
    const t = TESTS.mobilite;
    for (const [n, [iD, iG, eD, eG]] of Object.entries({
      complet: [18.3, 14.9, -9.2, -12.6],
      inverses: [-3.1, 2.2, 6.4, -1.8],
      manquantes: [16, null, null, -7.5],
    })) {
      pousser('mobilite', n, {
        photos: [
          photo(t, 0, { angle: null, angleD: iD, angleG: iG }),
          photo(t, 1, { angle: null, angleD: eD, angleG: eG }),
        ],
      });
    }
    pousser('mobilite', 'anciennes-sans-angleDG', {
      photos: [photo(t, 0, { angle: 12 }), photo(t, 1, { angle: -4 })],
    });
    pousser('mobilite', 'vide', { photos: [] });
  }

  // Amorti : tal G, tal D, plan G, plan D, dig G, dig D.
  for (const id of ['amorti-marche', 'amorti-course']) {
    const t = TESTS[id];
    for (const [n, v] of Object.entries({
      ...JEUX_SIMPLES,
      unCote: [2.5, null, -6.1, null, 3.9, null],
    })) {
      const photos = t.photoLabels.map((_l, i) => photo(t, i, { angle: v[i] }));
      pousser(id, n, { photos });
      // Valeurs enregistrées cohérentes : mêmes formules que l'enregistrement.
      const enr = { photos };
      for (const s of ['D', 'G']) {
        const idx = t.photoSides.map((x, i) => (x === s ? i : -1)).filter((i) => i >= 0);
        const [tal, plan, dig] = idx.map((i) => v[i]);
        if (tal != null || plan != null || dig != null) {
          enr['am' + s] = tal != null && plan != null ? Math.abs(tal - plan) / t.normAm : null;
          enr['pr' + s] = dig != null && plan != null ? Math.abs(dig - plan) / t.normAm : null;
          enr.phases = { ...(enr.phases || {}), [s]: { tal, plan, dig } };
        }
      }
      pousser(id, n + '+enregistre', enr);
    }
    pousser(id, 'enregistre-sans-photos', {
      amD: 0.5,
      prD: 1.25,
      amG: 0.875,
      prG: null,
      phases: { D: { tal: 2, plan: -2, dig: 8 }, G: { tal: 1, plan: -6, dig: null } },
    });
    pousser(id, 'vide', { photos: [] });
  }

  // Valeurs enregistrées INCOHÉRENTES avec les photos : prouvent que la
  // priorité « valeur enregistrée / recalcul depuis les photos » est restée
  // exactement celle d'avant 1b, site par site (rapport, alertes).
  for (const id of ['mla-marche', ID_MLA_PHOTO]) {
    const t = TESTS[id];
    const ph = (v) => t.photoLabels.map((_l, i) => photo(t, i, { angle: v[i] }));
    const plein = [118.2, 133.7, 121.5, 129.9];
    pousser(id, 'incoherent-pct-et-delta', {
      photos: ph(plein),
      pctD: 2.5,
      deltaD: -40,
      pctG: 0.1,
      deltaG: 99,
    });
    pousser(id, 'incoherent-pct-seul', { photos: ph(plein), pctD: 2.5, pctG: 0.1 });
    pousser(id, 'incoherent-delta-seul', { photos: ph(plein), deltaD: -40, deltaG: 99 });
    pousser(id, 'incoherent-delta-photos-incompletes', {
      photos: ph([118.2, null, null, 129.9]),
      deltaD: -40,
      deltaG: 99,
    });
  }
  for (const id of ['amorti-marche', 'amorti-course']) {
    const t = TESTS[id];
    const v = JEUX_SIMPLES.complet;
    const photos = t.photoLabels.map((_l, i) => photo(t, i, { angle: v[i] }));
    const phases = { D: { tal: 99, plan: -99, dig: 42 }, G: { tal: -50, plan: 50, dig: 7 } };
    pousser(id, 'incoherent-tout', { photos, amD: 3.3, prD: 0.05, amG: 0.2, prG: 2.75, phases });
    pousser(id, 'incoherent-am-absent', { photos, prD: 0.05, prG: 2.75, phases });
    pousser(id, 'incoherent-pr-absent', { photos, amD: 3.3, amG: 0.2, phases });
    pousser(id, 'incoherent-sans-phases', { photos, amD: 3.3, prD: 0.05, amG: 0.2, prG: 2.75 });
  }
  return out;
}

// Clés des calculateurs par test.
export const CLES = {
  'mla-marche': ['mla'],
  'mla-course': ['mla'],
  [ID_MLA_PHOTO]: ['mla'],
  verrou: ['rf', 'mollet'],
  mobilite: ['mob'],
  'amorti-marche': ['am', 'pr'],
  'amorti-course': ['am', 'pr'],
};

// Ce que produit UNE version du code sur un cas : ratios des calculateurs
// (D et G), alertes détaillées et condensées, et HTML du panneau, des deux
// côtés du rapport et de la section complète (empreinte + texte intégral).
// `charger` est celui du harnais ; la version lue dépend de BIOMECA_SRC.
export function produire(charger, envCapture, c, cles, empreinte) {
  const ratio = (r) => (r && typeof r === 'object' ? r.ratio : r);
  const norm = (v) => (v === undefined ? 'undefined' : Number.isNaN(v) ? 'NaN' : v);
  const env = charger();
  ajouterVariantes(env.TESTS);
  const t = env.TESTS[c.id];
  const data = () => JSON.parse(JSON.stringify(c.data));
  const calc = {};
  for (const k of cles) {
    // Les calculateurs sont lus via les alertes : MEASURE_COMPUTERS n'est
    // exposé que par _collectTestAlerts ; on reconstruit leur entrée.
    calc[k] = {};
  }
  const res = envCapture(env, c.id, data().photos || []);
  env.updateResults();
  const html = {
    panneau: res.innerHTML,
    D: env.buildPrintSide('D', t, data()),
    G: env.buildPrintSide('G', t, data()),
    section: env.buildPrintSection(t, data(), []),
  };
  for (const k of cles) {
    for (const s of ['D', 'G']) calc[k][s] = norm(ratio(env.MEASURE_COMPUTERS[k](t, data(), s)));
  }
  return {
    calc,
    alertes: {
      det: env._collectTestAlerts(t, data()),
      cond: env._collectTestAlerts(t, data(), { condensed: true }),
    },
    html: Object.fromEntries(Object.entries(html).map(([k, v]) => [k, empreinte(v)])),
    texte: html,
  };
}
