import { describe, it, expect, afterEach } from 'vitest';
import { charger as chargerBase, envCapture } from './helpers/harnais-kfppa.mjs';
import { surveillerNaN } from './helpers/sans-nan.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 1b (3f-bis) — valeur affichée mais exclue, hors KFPPA
// ═══════════════════════════════════════════════════════════════════
//
// Règle du praticien, étendue aux 6 autres tests (verrou, mobilité, amorti
// marche/course, MLA marche/course) : une valeur dont la photo est NON ENVOYÉE
// ou SANS POINTS DISPONIBLES reste affichée avec sa mention rouge, mais
// n'entre dans AUCUN calcul dérivé (Δ, %, couleur, verdict ou badge, alerte,
// phases). Le motif est dit en clair au même endroit dans le panneau, le
// rapport et les alertes, depuis une seule source.
//   - Verrou : « Stat » seule exclue → RF % conservé, Mollet % exclu ;
//     « Pointe » exclue → RF %, badge et Mollet % exclus.
//   - Mobilité : une photo bipodale exclue exclut les DEUX pieds.
//   - Amorti : les valeurs dérivées ENREGISTRÉES qui en dépendent sont
//     retirées (voir K9 dans exclusion-279f).
// Branche « mode photo » non touchée. Données synthétiques.

// #279 1b — aucun rendu de ce fichier (panneau, rapport, alertes, vignettes)
// ne doit contenir « NaN » : vérifié après CHAQUE test.
const { charger, noter, verifier, vus } = surveillerNaN(chargerBase);
afterEach(() => {
  expect(verifier(), 'rendu contenant « NaN »').toEqual([]);
});

const R_E = (t) =>
  `<span class="kfppa-exclu" style="color:var(--red);font-weight:700;">${t}</span>`;
const R_R = (t) => `<span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;">${t}</span>`;
const NE = (l) => `photo « ${l} » non envoyée — à recapturer`;
const KO = (l) => `points non disponibles sur la photo « ${l} » — à recapturer`;
const EXCLUE = (m) => ` — valeur exclue des calculs (${m})`;
const nb = (h, s) => h.split(s).length - 1;

// Photos d'un test à partir de ses libellés ; `v(i)` : champs du créneau i.
function photos(env, id, v) {
  const t = env.TESTS[id];
  return t.photoLabels.map((label, i) => ({
    label,
    side: t.photoSides[i] || '',
    dataUrl: 'data:image/jpeg;base64,QQ==',
    path: null,
    ...v(i),
  }));
}
const neEnv = (o) => {
  const { dataUrl: _d, ...r } = o;
  return { ...r, nonEnvoyee: true };
};
const sansPoints = (o) => ({ ...o, imageBrute: true, dessin: { taille: 1, opacite: 0.5 } });
const panneau = (env, id, ph) => {
  const res = envCapture(env, id, ph);
  env.updateResults();
  return noter(res.innerHTML);
};
const alertes = (env, id, data) => env._collectTestAlerts(env.TESTS[id], data, { condensed: true });

describe('#279 1b — MLA', () => {
  // Prop D 120 (non envoyée), Écr D 135, Prop G 118, Écr G 140.
  const data = (env) => ({
    photos: photos(env, 'mla-marche', (i) => ({ angle: [120, 135, 118, 140][i] })).map((p, i) =>
      i === 0 ? neEnv(p) : p
    ),
  });
  const M = NE('Attaque/Propulsion pied D');

  it('Q1. Panneau : valeur affichée et exclue, Δ et % non calculés avec le motif ; G intact', () => {
    const env = charger();
    const h = panneau(env, 'mla-marche', data(env).photos);
    expect(h).toContain(`Att/Prop: <b>120.0°${R_E(EXCLUE(M))}</b>`);
    expect(h).toContain(`Fonction amortisseur MLA: <b>${R_E(`non calculé (${M})`)}</b>`);
    expect(h, 'Δ D calculé').not.toContain('15.0°');
    expect(h, '% D calculé').not.toContain('75%');
    expect(h, 'G intact').toContain('22.0°');
    expect(h).toContain('110%');
  });

  it('Q2. Rapport : jauge, degré et badge du côté exclu jamais calculés ; motif en rouge', () => {
    const env = charger();
    const t = env.TESTS['mla-marche'];
    const d = env.buildPrintSide('D', t, data(env));
    expect(d).toContain(R_R(`non calculé (${M})`));
    expect(d).not.toContain('75%');
    expect(d).not.toContain('15.0°');
    expect(d, 'badge').not.toContain('rp-badge');
    expect(d).toContain('⚠️ Photo « Attaque/Propulsion pied D » non envoyée — à recapturer');
    const g = env.buildPrintSide('G', t, data(env));
    expect(g).toContain('110%');
    expect(g).toContain('rp-badge-g');
  });

  it('Q3. Alertes : motif puis conséquence', () => {
    const env = charger();
    expect(alertes(env, 'mla-marche', data(env))).toEqual([
      `Pied droit · MLA Marche (ressort médio-pied) — ${M} : non calculé`,
    ]);
  });

  it('Q4. Points non disponibles sur « Écrasement pied G » : G non calculé, motif dit', () => {
    const env = charger();
    const ph = photos(env, 'mla-marche', (i) => ({ angle: [120, 135, 118, null][i] })).map(
      (p, i) => (i === 3 ? sansPoints(p) : p)
    );
    const K = KO('Écrasement pied G');
    const h = panneau(env, 'mla-marche', ph);
    expect(h).toContain(`Écrasement: <b>${R_E(K)}</b>`);
    expect(h).toContain(`Fonction amortisseur MLA: <b>${R_E(`non calculé (${K})`)}</b>`);
    expect(alertes(env, 'mla-marche', { photos: ph })).toEqual([
      `Pied gauche · MLA Marche (ressort médio-pied) — ${K} : non calculé`,
    ]);
  });
});

describe('#279 1b — Verrouillage', () => {
  // Stat D 2 (non envoyée), Stat G 1, Pointe D 8, Pointe G 9 (non envoyée).
  const data = (env) => ({
    photos: photos(env, 'verrou', (i) => ({ angle: [2, 1, 8, 9][i] })).map((p, i) =>
      i === 0 || i === 3 ? neEnv(p) : p
    ),
  });
  const MS = NE('Statique bipodal D');
  const MP = NE('Pointe pieds G');

  it('Q5. Stat D seule exclue : RF D conservé, Mollet D exclu ; Pointe G exclue : RF G, badge et Mollet G exclus', () => {
    const env = charger();
    const h = panneau(env, 'verrou', data(env).photos);
    expect(h).toContain(`Statique: <b>Inv (+) 2.0°${R_E(EXCLUE(MS))}</b>`);
    expect(h, 'RF D conservé').toContain('Verrouillage RF: <b>8.0°</b>');
    expect(h).toContain('80%');
    expect(h).toContain(`Force mollet: <b>${R_E(`non calculé (${MS})`)}</b>`);
    expect(h).toContain(`Pointe: <b>Inv (+) 9.0°${R_E(EXCLUE(MP))}</b>`);
    expect(h).toContain(`Verrouillage RF: <b>${R_E(`non calculé (${MP})`)}</b>`);
    expect(h).toContain(`Force mollet: <b>${R_E(`non calculé (${MP})`)}</b>`);
    expect(h, 'Mollet D calculé (60%)').not.toContain('60%');
    expect(h, 'RF G calculé (90%)').not.toContain('90%');
    const t = env.TESTS.verrou;
    const d = env.buildPrintSide('D', t, data(env));
    expect(d).toContain('80%');
    expect(d, 'badge RF D').toContain('Normal');
    expect(d).toContain(`Mollet: ${R_R(`non calculé (${MS})`)}`);
    const g = env.buildPrintSide('G', t, data(env));
    expect(g).toContain(`RF: ${R_R(`non calculé (${MP})`)}`);
    expect(g).toContain(`Mollet: ${R_R(`non calculé (${MP})`)}`);
    expect(g, 'badge RF G').not.toMatch(/Normal|Limite|Hors norme/);
    expect(g).not.toContain('90%');
  });

  it('Q6. Alertes : RF G, Mollet D et Mollet G avec leur motif ; RF D dans la norme, rien', () => {
    const env = charger();
    expect(alertes(env, 'verrou', data(env))).toEqual([
      `Pied gauche · Capacité de verrouillage de l'arrière-pied — ${MP} : non calculé`,
      `Pied droit · Force du mollet — ${MS} : non calculé`,
      `Pied gauche · Force du mollet — ${MP} : non calculé`,
    ]);
  });
});

describe('#279 1b — Mobilité', () => {
  // Inversion (D 18, G 15) NON ENVOYÉE ; Éversion (D −9, G −12).
  const data = () => ({
    photos: [
      neEnv({
        label: 'Inversion forcée bipodal',
        side: '',
        dataUrl: 'x',
        path: null,
        angle: null,
        angleD: 18,
        angleG: 15,
      }),
      {
        label: 'Éversion forcée bipodal',
        side: '',
        dataUrl: 'data:image/jpeg;base64,QQ==',
        path: null,
        angle: null,
        angleD: -9,
        angleG: -12,
      },
    ],
  });
  const M = NE('Inversion forcée bipodal');

  it('Q7. Photo bipodale non envoyée : les DEUX pieds exclus, partout', () => {
    const env = charger();
    const h = panneau(env, 'mobilite', data().photos);
    expect(nb(h, `Mobilité: <b>${R_E(`non calculé (${M})`)}</b>`)).toBe(2);
    expect(h).toContain(`Inversion: <b>Inv (+) 18.0°${R_E(EXCLUE(M))}</b>`);
    expect(h).not.toContain('90%');
    const t = env.TESTS.mobilite;
    for (const s of ['D', 'G']) {
      const r = env.buildPrintSide(s, t, data());
      expect(r, s).toContain(`Mobilité: ${R_R(`non calculé (${M})`)}`);
      expect(r, s).not.toContain('90%');
      expect(r, `${s} badge`).not.toMatch(/Normal|Limite|Hors norme/);
    }
    expect(alertes(env, 'mobilite', data())).toEqual([
      `Pied droit · Mobilité AP (mobilité arrière-pied) — ${M} : non calculé`,
      `Pied gauche · Mobilité AP (mobilité arrière-pied) — ${M} : non calculé`,
    ]);
  });

  it('Q8. Points non disponibles côté G seulement : G exclu, D calculé', () => {
    const env = charger();
    const d = data();
    d.photos[0] = { ...d.photos[0], nonEnvoyee: undefined, dataUrl: 'data:image/jpeg;base64,QQ==' };
    delete d.photos[0].nonEnvoyee;
    d.photos[1] = sansPoints({ ...d.photos[1], angleG: null });
    const K = KO('Éversion forcée bipodal');
    expect(alertes(env, 'mobilite', d)).toEqual([
      `Pied gauche · Mobilité AP (mobilité arrière-pied) — ${K} : non calculé`,
    ]);
    const t = env.TESTS.mobilite;
    expect(env.buildPrintSide('D', t, d)).toContain('90%');
    expect(env.buildPrintSide('G', t, d)).toContain(`Mobilité: ${R_R(`non calculé (${K})`)}`);
  });
});

describe('#279 1b — Amorti', () => {
  // Tal G 2, Tal D 3 (non envoyée), Plan G −6, Plan D −5, Dig G 2, Dig D 4.
  const ph = (env) =>
    photos(env, 'amorti-marche', (i) => ({ angle: [2, 3, -6, -5, 2, 4][i] })).map((p, i) =>
      i === 1 ? neEnv(p) : p
    );
  const M = NE('Attaque taligrade D');

  it('Q9. Panneau : amorti D exclu avec le motif, propulsion D et pied G calculés', () => {
    const env = charger();
    const h = panneau(env, 'amorti-marche', ph(env));
    expect(h).toContain(`Taligrade: <b>Inv (+) 3.0°${R_E(EXCLUE(M))}</b>`);
    expect(h).toContain(`Amorti: <b>${R_E(`non calculé (${M})`)}</b>`);
    expect(h, 'propulsion D calculée').toContain('>113%</div>'); // |4 − (−5)| / 8
    // Pourcentages affichés (hors lignes de norme) : propulsion D, amorti et propulsion G.
    expect(h.match(/class="rs-pct"[^>]*>[^<]*%<\/div>/g)).toHaveLength(3);
  });

  it('Q10. Rapport : valeurs ENREGISTRÉES retirées ou non, l’amorti D n’est jamais calculé', () => {
    const env = charger();
    const t = env.TESTS['amorti-marche'];
    // (a) après retrait (enregistrement 1b) ; (b) valeurs enregistrées par une
    // version antérieure, alors qu'une photo est non envoyée.
    for (const [cas, extra] of [
      ['retirées', { prD: 1.125, amG: 1, prG: 1, phases: { G: { tal: 2, plan: -6, dig: 2 } } }],
      [
        'enregistrées',
        {
          amD: 1,
          prD: 1.125,
          amG: 1,
          prG: 1,
          phases: { D: { tal: 3, plan: -5, dig: 4 }, G: { tal: 2, plan: -6, dig: 2 } },
        },
      ],
    ]) {
      const data = { photos: ph(env), ...extra };
      const d = env.buildPrintSide('D', t, data);
      expect(d, cas).toContain(`Amorti: ${R_R(`non calculé (${M})`)}`);
      expect(d, cas).toContain('113%');
      expect(d, `${cas} : taligrade affichée`).toContain(
        `Taligrade: Inv (+) 3.0°${R_R(EXCLUE(M))}`
      );
      const s = env.buildPrintSection(t, data, []);
      expect(s, cas).not.toContain('NaN');
      expect(s, cas).toContain(
        `<strong>Pied droit :</strong> Amorti ${R_R(`non calculé (${M})`)} · Propulsion 113%`
      );
      expect(alertes(env, 'amorti-marche', data), cas).toEqual([
        `Pied droit · Amorti à la marche (cinétique arrière-pied) — ${M} : non calculé`,
      ]);
    }
  });

  it('Q11. Enregistrement : amD et phases.D retirés, prD et le pied G conservés', async () => {
    const env = charger({
      persistance: true,
      envoiReel: true,
      envois: ['ok', 'echec', 'ok', 'ok', 'ok', 'ok'],
      reponses: [false, true],
    });
    env.poser({
      test: 'amorti-marche',
      slots: photos(env, 'amorti-marche', (i) => ({ angle: [2, 3, -6, -5, 2, 4][i] })),
      frames: [],
      patient: { ...patientFictif('M.'), bilanData: {} },
    });
    await env.validateAndSave();
    const r = env.patient().mesures['amorti-marche'];
    expect(r.photos[1].nonEnvoyee).toBe(true);
    expect('amD' in r, 'amD').toBe(false);
    expect(r.phases && 'D' in r.phases, 'phases.D').toBe(false);
    expect(r.prD).toBeCloseTo(1.125, 9);
    expect([r.amG, r.prG]).toEqual([1, 1]);
    expect(r.phases.G).toEqual({ tal: 2, plan: -6, dig: 2 });
  });
});

describe('#279 1b — témoin : rien d’exclu, tout est calculé comme avant', () => {
  it('Q12. Sans photo non envoyée ni sans points : aucun motif, valeurs calculées', () => {
    const env = charger();
    const v = photos(env, 'verrou', (i) => ({ angle: [2, 1, 8, 9][i] }));
    const h = panneau(env, 'verrou', v);
    expect(h).not.toContain('kfppa-exclu');
    expect(h).toContain('60%');
    expect(h).toContain('90%');
    expect(alertes(env, 'verrou', { photos: v })).toEqual([
      `Pied droit · Force du mollet — valeur limite`,
    ]);
  });
});

describe('#279 1b — défaut « NaN% » de HEAD : une photo manquante ne s’affiche jamais NaN', () => {
  it('Q13. MLA sans « Écrasement pied D », amorti sans aucune photo du pied G : ni panneau, ni rapport, ni synthèse', () => {
    const env = charger();
    // MLA en vidéo : rien n'est enregistré (pctD jamais écrit) ; D incomplet.
    const mla = photos(env, 'mla-marche', (i) => ({ angle: [120, null, 118, 140][i] }));
    const h = [
      panneau(env, 'mla-marche', mla),
      env.buildPrintSide('D', env.TESTS['mla-marche'], { photos: mla }),
      env.buildPrintSide('G', env.TESTS['mla-marche'], { photos: mla }),
      env.buildPrintSection(env.TESTS['mla-marche'], { photos: mla }, []),
      alertes(env, 'mla-marche', { photos: mla }).join('\n'),
    ];
    for (const x of h) expect(x).not.toContain('NaN');
    expect(h[1], 'jauge D').toContain('<div class="rp-gauge-pct" style="color:#aaa;">—</div>');
    // Amorti : pied G sans aucune photo — amG et prG jamais enregistrés.
    const am = photos(env, 'amorti-marche', (i) => ({ angle: [null, 3, null, -5, null, 4][i] }));
    const data = { photos: am, amD: 1, prD: 1.125, phases: { D: { tal: 3, plan: -5, dig: 4 } } };
    const s = env.buildPrintSection(env.TESTS['amorti-marche'], data, []);
    expect(s).not.toContain('NaN');
    expect(s).toContain('<strong>Pied gauche :</strong> Amorti — · Propulsion —');
    expect(s, '« —% » sans valeur').not.toContain('—%');
  });
});

describe('#279 1b — lignes de la section amorti : 0 n’est pas une absence', () => {
  it('Q14. Propulsion mesurée à 0 : « 0% », jamais « —% » ni « — »', () => {
    const env = charger();
    // Dig D = Plan D : propulsion D exactement nulle, enregistrée comme telle.
    const am = photos(env, 'amorti-marche', (i) => ({ angle: [2, 3, -6, -5, 2, -5][i] }));
    const data = {
      photos: am,
      amD: 1,
      prD: 0,
      amG: 1,
      prG: 1,
      phases: { D: { tal: 3, plan: -5, dig: -5 }, G: { tal: 2, plan: -6, dig: 2 } },
    };
    const s = env.buildPrintSection(env.TESTS['amorti-marche'], data, []);
    expect(s).toContain('<strong>Pied droit :</strong> Amorti 100% · Propulsion 0%');
    expect(s).not.toContain('—%');
  });

  it('Q15. Photo d’amorti non envoyée : UNE seule ligne par pied dans la section', () => {
    const env = charger();
    // Valeurs enregistrées par une version antérieure, photo Tal D non envoyée :
    // la ligne avec le motif REMPLACE la ligne normale, elle ne s'y ajoute pas.
    const am = photos(env, 'amorti-marche', (i) => ({ angle: [2, 3, -6, -5, 2, 4][i] })).map(
      (p, i) => (i === 1 ? neEnv(p) : p)
    );
    const data = {
      photos: am,
      amD: 1,
      prD: 1.125,
      amG: 1,
      prG: 1,
      phases: { D: { tal: 3, plan: -5, dig: 4 }, G: { tal: 2, plan: -6, dig: 2 } },
    };
    const s = env.buildPrintSection(env.TESTS['amorti-marche'], data, []);
    expect(nb(s, '<strong>Pied droit :</strong>'), 'lignes « Pied droit »').toBe(1);
    expect(nb(s, '<strong>Pied gauche :</strong>'), 'lignes « Pied gauche »').toBe(1);
    expect(s).toContain(
      `<strong>Pied droit :</strong> Amorti ${R_R(`non calculé (${NE('Attaque taligrade D')})`)} · Propulsion 113%`
    );
  });
});

describe('#279 1b — surveillance « jamais de NaN »', () => {
  it('ZZ. Les rendus de ce fichier ont été examinés ; la surveillance sait trouver « NaN »', () => {
    expect(vus(), 'rendus examinés (tous les tests précédents du fichier)').toBe(34);
    noter('<div>Amorti NaN%</div>');
    noter('<div>valeur sans défaut</div>');
    expect(verifier()).toEqual(['<div>Amorti NaN%</div>']);
  });
});
