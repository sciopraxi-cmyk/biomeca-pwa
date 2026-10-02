import { describe, it, expect } from 'vitest';
import { charger, envCapture } from './helpers/harnais-kfppa.mjs';
import * as calc from '../js/calc.mjs';

// ═══════════════════════════════════════════════════════════════════
// #275-D — affichage du KFPPA : panneau, rapport, alertes
// ═══════════════════════════════════════════════════════════════════
//
// Les deux premiers tests ont été écrits AVANT la correction et vus rouges
// sur le code de l'étape C (01530fe) : la photo bipodale absente du rapport,
// et Δ calculé sur les valeurs brutes au lieu des valeurs affichées.

// Valeurs BRUTES non arrondies, construites pour reproduire l'écart relevé
// par le praticien : l'écran affichait S +2.4 et U −2.4 avec Δ −4.9 au lieu de
// −4.8, et S +3.4 et U +9.3 avec Δ +5.8 au lieu de +5.9.
const BRUT_G = { S: 2.44, U: -2.44 }; // affichés +2.4 / −2.4 ; brut U−S = −4.88 → −4.9
const BRUT_D = { S: 3.44, U: 9.26 }; // affichés +3.4 / +9.3 ; brut U−S = 5.82 → +5.8

// Bilan de réception unipodale, civilité « Mme » (norme femmes 5–12°), avec
// les valeurs brutes ci-dessus et la norme enregistrée avec le bilan.
const bilanUSL = () => ({
  kfppaNorme: {
    min: 5,
    max: 12,
    source:
      'Norme de référence : réception unipodale (Herrington & Munro, 2010) — mesure à la première réception',
    sexe: 'femmes',
  },
  photos: [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: 'data:image/jpeg;base64,QklQ',
      angle: null,
      angleD: BRUT_D.S,
      angleG: BRUT_G.S,
      kfppaSigne: true,
    },
    {
      label: 'Valgum dynamique unipodal G',
      side: 'G',
      dataUrl: 'data:image/jpeg;base64,Rw==',
      angle: BRUT_G.U,
      kfppaSigne: true,
    },
    {
      label: 'Valgum dynamique unipodal D',
      side: 'D',
      dataUrl: 'data:image/jpeg;base64,RA==',
      angle: BRUT_D.U,
      kfppaSigne: true,
    },
  ],
});

describe('#275-D — rouges sur le code de l’étape C', () => {
  it('D1. La photo Station bipodale apparaît dans la section KFPPA du rapport, légende « D x° · G y° »', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const html = env.buildPrintSection(t, bilanUSL(), []);
    expect(html, 'image bipodale absente du rapport').toContain(
      'src="data:image/jpeg;base64,QklQ"'
    );
    expect(html).toContain('D 3.4° · G 2.4°');
  });

  it('D2. Δ est calculé sur les valeurs AFFICHÉES de S et U (panneau Résultats)', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const res = envCapture(env, 'kfppa-sldj', bilanUSL().photos);
    env.poser({ patient: { civilite: 'Mme' } });
    env.updateResults();
    expect(t.name).toBe('KFPPA USL');
    expect(res.innerHTML).toContain('−4.8° (vers le varus)');
    expect(res.innerHTML).toContain('+5.9° (vers le valgus)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Fonctions pures de #275-D — vérifiées sur les DEUX copies
// ═══════════════════════════════════════════════════════════════════
const COPIES = () => [
  ['calc.mjs', calc],
  ['biomeca.js', charger()],
];

describe('#275-D — norme incohérente dans l’analyse d’un genou', () => {
  it('D5. {statut:"ok"} sans bornes, ou min > max : ni classe, ni verdict, « norme non définie »', () => {
    const normes = [
      { statut: 'ok' },
      { statut: 'ok', min: 8, max: 3, source: 's', sexe: null },
      { statut: 'ok', min: 3, max: NaN },
      { statut: 'ok', min: '3', max: 7 },
    ];
    let n = 0;
    for (const [nom, f] of COPIES()) {
      for (const norme of normes) {
        const a = f.kfppaAnalyseGenou({ S: 0, U: -2.4, sSigne: true, uSigne: true, norme });
        const cas = `${nom} ${JSON.stringify(norme)}`;
        expect(a.classeU, cas).toBeNull();
        expect(a.couleur, cas).toBe('neutre');
        expect(a.norme, cas).toEqual({ statut: 'non-definie' });
        const phrase = f.kfppaPhraseGenou('G', a);
        expect(phrase, cas).toContain('valeur unipodale −2.4° (norme non définie)');
        expect(phrase, cas).not.toMatch(/undefined|NaN|varus faible|varus modéré|excessif/);
        n++;
      }
    }
    expect(n).toBe(8);
  });
});

describe('#275-D — couleur de chacune des huit classes', () => {
  it('D3. Les huit classes sont atteintes et reçoivent vert, orange ou rouge — jamais neutre', () => {
    const NORMES = [
      ['marche', 'kfppa-marche', ''],
      ['course', 'kfppa-course', ''],
      ['USL femmes', 'kfppa-sldj', 'Mme'],
      ['USL hommes', 'kfppa-sldj', 'M.'],
    ];
    const ATTENDU = {
      'Varus excessif': 'rouge',
      'Varus modéré': 'orange',
      'Varus faible': 'orange',
      'Valgus faible': 'orange',
      'Valgus modéré (insuffisant)': 'orange',
      'Dans la norme': 'vert',
      'Valgus modéré (au-dessus de la norme)': 'orange',
      'Valgus excessif': 'rouge',
    };
    for (const [nom, f] of COPIES()) {
      for (const [lib, testId, civ] of NORMES) {
        const { min, max } = f.kfppaNormeApplicable(testId, civ);
        const vues = new Set();
        // Balayage de −25° à +30° au dixième : couvre toutes les zones de la
        // grille pour ces quatre normes (−0,6 m ≥ −5,1 ; max + 0,3 m ≤ 14,55).
        for (let k = -250; k <= 300; k++) {
          const c = f.kfppaClasseU(k / 10, min, max);
          vues.add(c);
          expect(f.kfppaCouleurClasse(c), `${nom} ${lib} ${k / 10} → ${c}`).not.toBe('neutre');
        }
        expect([...vues].sort(), `${nom} ${lib}`).toEqual(Object.keys(ATTENDU).sort());
        for (const [c, coul] of Object.entries(ATTENDU)) {
          expect(f.kfppaCouleurClasse(c), `${nom} ${c}`).toBe(coul);
        }
      }
      // Sans classe (valeur non signée, norme non appliquée) : neutre.
      expect(f.kfppaCouleurClasse(null), nom).toBe('neutre');
    }
  });
});

describe('#275-D — phrase du genou quand la norme n’est pas appliquée', () => {
  it('D4. Message entre parenthèses, jamais de double deux-points', () => {
    for (const [nom, f] of COPIES()) {
      const aC = f.kfppaAnalyseGenou({
        S: 2.4,
        U: -2.4,
        sSigne: true,
        uSigne: true,
        norme: { statut: 'civilite' },
      });
      expect(f.kfppaPhraseGenou('G', aC), nom).toBe(
        'Genou gauche : statique +2.4° (neutre), composante dynamique −4.8° (vers le varus), ' +
          'valeur unipodale −2.4° (civilité non renseignée : norme non appliquée).'
      );
      const aN = f.kfppaAnalyseGenou({
        S: 2.4,
        U: -2.4,
        sSigne: true,
        uSigne: true,
        norme: { statut: 'non-definie' },
      });
      expect(f.kfppaPhraseGenou('G', aN), nom).toContain(
        'valeur unipodale −2.4° (norme non définie).'
      );
      expect(f.kfppaPhraseGenou('G', aC), nom).not.toMatch(/valeur unipodale [^,]*: civilité/);
    }
  });
});

// Photos déjà envoyées au stockage dont le rechargement a ÉCHOUÉ : path, pas de dataURL.
const photosNonRechargees = () =>
  bilanUSL().photos.map(({ dataUrl: _d, ...p }, i) => ({
    ...p,
    path: `u/kfppa-${i}.jpg`,
    dataUrl: null,
  }));

describe('#275-D — photo présente mais non rechargée', () => {
  it('D6. Panneau : trois créneaux avec path sans dataURL → bloc de la grille, pas « Capturez 3 photos »', () => {
    const env = charger();
    const res = envCapture(env, 'kfppa-sldj', photosNonRechargees());
    env.poser({ patient: { civilite: 'Mme' } });
    env.updateResults();
    const h = res.innerHTML;
    expect(h).not.toContain('Capturez 3 photos');
    expect(h.split('class="kfppa-grille"').length - 1, 'un bloc par genou').toBe(2);
    expect(h).toContain('+5.9° (vers le valgus)');
  });

  it('D7. Rapport : photo avec path sans dataURL → mention rouge de _photoNonRechargeeHTML', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const html = env.buildPrintSection(t, { ...bilanUSL(), photos: photosNonRechargees() }, []);
    // Par le chemin RÉEL du rapport : buildPrintSection → buildPrintSide →
    // buildPrintPhotos (photos unipodales) et la photo bipodale de la section.
    expect(html).toContain('class="rp-photo-ko"');
    expect(html).toContain(
      '⚠️ Photo « Valgum dynamique unipodal D » non rechargée depuis le stockage'
    );
    expect(html).toContain(
      '⚠️ Photo « Valgum dynamique unipodal G » non rechargée depuis le stockage'
    );
    expect(html).toContain('color:#b91c1c;background:#fef2f2;border:1px solid #fecaca');
    // La photo SIGNALÉE par le praticien : « Station bipodale », path sans dataURL.
    expect(html).toContain('⚠️ Photo « Station bipodale » non rechargée depuis le stockage');
    expect(html).not.toContain('src="data:image/jpeg;base64,QklQ"');
    // Témoin : une photo JAMAIS prise (ni dataURL ni path) reste silencieuse.
    const jamais = bilanUSL().photos.map(({ dataUrl: _d, ...p }) => ({ ...p, dataUrl: null }));
    const html2 = env.buildPrintSection(t, { ...bilanUSL(), photos: jamais }, []);
    expect(html2).not.toContain('rp-photo-ko');
  });
});

describe('#275-D — les deux copies rendent exactement la même chose', () => {
  it('D8. Parité par exécution des fonctions pures du bloc #275-D', () => {
    const env = charger();
    const normes = [
      { statut: 'ok', min: 3, max: 7, source: 's', sexe: null },
      { statut: 'ok', min: 5, max: 12, source: 's', sexe: 'femmes' },
      { statut: 'ok', min: 1, max: 9, source: 's', sexe: 'hommes' },
      { statut: 'civilite' },
      { statut: 'non-definie' },
      { statut: 'ok' },
    ];
    let n = 0;
    // Genou précédent PAR combinaison de signes : l'asymétrie n'existe
    // qu'entre deux genoux entièrement signés.
    const prec = {};
    let asymNonNulles = 0;
    const eq = (a, b, cas) => {
      expect(a, cas).toEqual(b);
      n++;
    };
    for (let k = -60; k <= 60; k += 7) {
      const v = k / 4.3;
      eq(env.kfppaSigneTxt(v), calc.kfppaSigneTxt(v), `signe ${v}`);
      eq(env.kfppaTexteDelta(v), calc.kfppaTexteDelta(v), `delta ${v}`);
      eq(env.kfppaTexteS(v, true), calc.kfppaTexteS(v, true), `S ${v}`);
      eq(env.kfppaTexteS(v, false), calc.kfppaTexteS(v, false), `S ns ${v}`);
      for (let j = -40; j <= 40; j += 13) {
        const u = j / 3.7;
        eq(env.kfppaDelta(v, u), calc.kfppaDelta(v, u), `Δ ${v} ${u}`);
        for (const norme of normes) {
          for (const [sS, uS] of [
            [true, true],
            [true, false],
            [false, true],
          ]) {
            const e = { S: v, U: u, sSigne: sS, uSigne: uS, norme };
            const aE = env.kfppaAnalyseGenou(e);
            const aC = calc.kfppaAnalyseGenou(e);
            eq(aE, aC, `analyse ${JSON.stringify(e)}`);
            eq(env.kfppaPhraseGenou('D', aE), calc.kfppaPhraseGenou('D', aC), 'phrase');
            eq(env.kfppaTexteUnipodal(aE), calc.kfppaTexteUnipodal(aC), 'unipodal');
            // Asymétrie entre DEUX genoux différents : l'analyse courante et
            // la précédente de la boucle. Un genou avec lui-même donnerait
            // toujours 0.0° et ne comparerait rien.
            const cle = `${sS}${uS}`;
            if (prec[cle]) {
              const asE = env.kfppaPhraseAsymetrie(aE, prec[cle][0]);
              eq(asE, calc.kfppaPhraseAsymetrie(aC, prec[cle][1]), 'asym');
              if (asE && !asE.startsWith('Asymétrie D − G : 0.0°')) asymNonNulles++;
            }
            prec[cle] = [aE, aC];
            eq(env.clrKfppa(aE.classeU), calc.clrKfppa(aC.classeU), 'couleur');
          }
        }
      }
    }
    for (const d of [
      undefined,
      {},
      { kfppaNorme: { statut: 'civilite' } },
      { kfppaNorme: { min: 3, max: 7 } },
    ]) {
      eq(env.kfppaNormeBilan(d), calc.kfppaNormeBilan(d), `normeBilan ${JSON.stringify(d)}`);
    }
    expect(n).toBeGreaterThan(1000);
    // Témoin : des asymétries NON NULLES ont bien été comparées.
    expect(asymNonNulles).toBeGreaterThan(50);
  });
});

describe('#275-D — section KFPPA complète du rapport (données du praticien)', () => {
  it('D9. Ni %, ni undefined, ni NaN, ni normeMin ; phrases, asymétrie et norme « 5–12°, femmes »', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const html = env.buildPrintSection(t, bilanUSL(), []);
    for (const interdit of ['%', 'undefined', 'NaN', 'normeMin', 'normeMax']) {
      expect(html.includes(interdit), `« ${interdit} » dans la section KFPPA`).toBe(false);
    }
    expect(html).toContain(
      '<strong>Genou droit :</strong> statique +3.4° (valgus constitutionnel), composante dynamique ' +
        '+5.9° (vers le valgus), valeur unipodale +9.3° : dans la norme (norme 5–12°, femmes).'
    );
    expect(html).toContain(
      '<strong>Genou gauche :</strong> statique +2.4° (neutre), composante dynamique ' +
        '−4.8° (vers le varus), valeur unipodale −2.4° : varus faible (norme 5–12°, femmes).'
    );
    expect(html).toContain(
      'Asymétrie D − G : +11.7° en unipodal, dont +1.0° de statique et +10.7° de dynamique.'
    );
    expect(html).toContain("Norme appliquée : 5–12°, femmes (d'après la civilité)");
    expect(html).toContain('Norme : 5–12°, femmes');
    // Témoin : le motif « % » sait trouver un pourcentage dans la section
    // MLA voisine, qui en affiche encore.
    const mla = env.buildPrintSection(env.TESTS['mla-marche'], { pctD: 0.8, pctG: 0.5 }, []);
    expect(mla.includes('%')).toBe(true);
  });

  it('D9b. Asymétrie : trois nombres tirés des valeurs AFFICHÉES, somme exacte', () => {
    // Valeurs brutes choisies pour que « différence des arrondis » et
    // « arrondi de la différence » DIVERGENT :
    //   U : D 9.26 → +9.3, G −2.46 → −2.5 ; affiché +11.8, brut 11.72 → 11.7
    //   S : D 3.44 → +3.4, G 2.36 → +2.4 ; affiché +1.0,  brut 1.08 → 1.1
    const env = charger();
    const data = bilanUSL();
    data.photos[0].angleD = 3.44;
    data.photos[0].angleG = 2.36;
    data.photos[1].angle = -2.46;
    data.photos[2].angle = 9.26;
    const html = env.buildPrintSection(env.TESTS['kfppa-sldj'], data, []);
    const m = html.match(
      /Asymétrie D − G : ([+−]\d+\.\d)° en unipodal, dont ([+−]\d+\.\d)° de statique et ([+−]\d+\.\d)° de dynamique/
    );
    expect(m).not.toBeNull();
    expect([m[1], m[2], m[3]]).toEqual(['+11.8', '+1.0', '+10.8']);
    const n = (x) => Number(x.replace('−', '-'));
    expect(Math.round((n(m[2]) + n(m[3])) * 10)).toBe(Math.round(n(m[1]) * 10));
  });
});

describe('#275-D — alertes KFPPA par le chemin réel _collectTestAlerts', () => {
  const lib = 'KFPPA USL (valgus dynamique en réception unipodale)';
  const propres = (as) => {
    for (const a of as) {
      expect(typeof a).toBe('string');
      expect(a.trim().length, 'alerte vide').toBeGreaterThan(0);
      for (const x of ['%', 'undefined', 'NaN'])
        expect(a.includes(x), `« ${x} » dans ${a}`).toBe(false);
    }
  };

  it('D10a. Détaillée et condensée : G −2.4° → Varus faible ; D +9.3° dans la norme → rien', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const det = env._collectTestAlerts(t, bilanUSL());
    const con = env._collectTestAlerts(t, bilanUSL(), { condensed: true });
    expect(det).toEqual([`Genou gauche · ${lib} : U −2.4° — Varus faible (norme 5–12°, femmes)`]);
    expect(con).toEqual([`Genou gauche · ${lib} — Varus faible`]);
    propres(det);
    propres(con);
  });

  it('D10b. U sans kfppaSigne : aucune alerte de classe', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const data = bilanUSL();
    for (const p of data.photos) delete p.kfppaSigne;
    const as = env._collectTestAlerts(t, data);
    expect(as).toEqual([]);
  });

  it('D10c. Photo bipodale manquante : le message, sans alerte vide', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const data = bilanUSL();
    data.photos[0] = {
      label: 'Station bipodale',
      side: '',
      dataUrl: null,
      path: null,
      angle: null,
    };
    const as = env._collectTestAlerts(t, data, { condensed: true });
    expect(as).toContain(`Genou droit · ${lib} — photo bipodale manquante`);
    expect(as).toContain(`Genou gauche · ${lib} — photo bipodale manquante`);
    propres(as);
  });

  it('D10d. Norme non enregistrée avec le bilan : « norme non définie », jamais un défaut', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const { kfppaNorme: _n, ...sansNorme } = bilanUSL();
    const as = env._collectTestAlerts(t, sansNorme, { condensed: true });
    expect(as).toEqual([
      `Genou droit · ${lib} — norme non définie`,
      `Genou gauche · ${lib} — norme non définie`,
    ]);
  });
});

describe('#275-D — générer le rapport ou le panneau ne sauvegarde JAMAIS', () => {
  it('D11. Aucune fonction KFPPA du rapport, du panneau ni des alertes n’écrit', () => {
    const env = charger();
    // Témoin : les espions fonctionnent — un appel direct est noté et lève.
    expect(() => env.saveBilanSilent()).toThrow('écriture interdite');
    expect(() => env.localStorage.setItem('k', 'v')).toThrow('écriture interdite');
    expect(env.espions()).toEqual(['saveBilanSilent', 'localStorage.setItem']);

    const e = charger();
    const t = e.TESTS['kfppa-sldj'];
    const sansSigne = bilanUSL();
    for (const p of sansSigne.photos) delete p.kfppaSigne;
    const sansBip = bilanUSL();
    sansBip.photos[0] = {
      label: 'Station bipodale',
      side: '',
      dataUrl: null,
      path: null,
      angle: null,
    };
    const jeux = [
      bilanUSL(),
      sansSigne,
      sansBip,
      { ...bilanUSL(), photos: photosNonRechargees() },
      { ...bilanUSL(), kfppaNorme: { statut: 'civilite' } },
      { photos: [] },
    ];
    let appels = 0;
    for (const data of jeux) {
      e.buildPrintSection(t, data, []);
      for (const side of ['D', 'G']) {
        e._kfppaPrintSideHTML(side, t, data);
        e._kfppaBlocGrilleHTML('kfppa-sldj', { civilite: 'Mme' }, data.photos, side);
      }
      e._kfppaPhotoBipodaleHTML(data, t);
      e._kfppaAlertes(t, t.measures[0], data, false);
      e._kfppaAlertes(t, t.measures[0], data, true);
      envCapture(e, 'kfppa-sldj', data.photos);
      e.poser({ patient: { civilite: 'Mme' } });
      e.updateResults();
      appels += 9;
    }
    expect(appels).toBe(54);
    expect(e.espions(), 'écriture déclenchée par un affichage KFPPA').toEqual([]);
  });
});

describe('#275-D — retours de la vérification sur localhost', () => {
  it('D12. Sans norme appliquée, le message figure UNE fois par genou, place du verdict vide', () => {
    const env = charger();
    const t = env.TESTS['kfppa-sldj'];
    const { kfppaNorme: _n, ...sansNorme } = bilanUSL();
    const cas = [
      ['norme non définie', sansNorme],
      [
        'civilité non renseignée : norme non appliquée',
        { ...bilanUSL(), kfppaNorme: { statut: 'civilite' } },
      ],
    ];
    for (const [msg, data] of cas) {
      for (const side of ['D', 'G']) {
        const h = env._kfppaPrintSideHTML(side, t, data);
        expect(h.split(msg).length - 1, `${side} : « ${msg} »`).toBe(1);
        expect(h, `${side} : place du verdict`).toContain(
          '<div style="margin-top:4px;text-align:center;"></div>'
        );
      }
    }
  });

  it('D13. Grand chiffre U et légende de la photo : même texte ; sans signe, magnitude seule et mention une fois', () => {
    const env = charger();
    const MENTION = 'sens valgus/varus non enregistré';
    const lire = (h) => ({
      u: h.match(/class="rp-gauge-deg"[^>]*>([^<]*)</)[1],
      legende: h.match(/font-size:8px;font-weight:700;color:#333;">([^<]*)</)[1],
    });
    // Données par test : statique signé (0.0°), U signé D +11.2° et G −3.4°.
    const donnees = (signeU) => ({
      kfppaNorme: { min: 3, max: 7, source: 's', sexe: null },
      photos: [
        {
          label: 'Station bipodale',
          side: '',
          dataUrl: 'data:b',
          angle: null,
          angleD: 0,
          angleG: 0,
          kfppaSigne: true,
        },
        {
          label: 'Unipodal G',
          side: 'G',
          dataUrl: 'data:g',
          angle: -3.4,
          ...(signeU ? { kfppaSigne: true } : {}),
        },
        {
          label: 'Unipodal D',
          side: 'D',
          dataUrl: 'data:d',
          angle: 11.2,
          ...(signeU ? { kfppaSigne: true } : {}),
        },
      ],
    });
    let n = 0;
    for (const id of ['kfppa-marche', 'kfppa-course', 'kfppa-sldj']) {
      const t = env.TESTS[id];
      // Sans kfppaPhotos, la légende retomberait EN SILENCE sur l'ancien format.
      expect(t.kfppaPhotos, `${id} : kfppaPhotos`).toBe(true);
      // Positive et négative, signées.
      expect(lire(env._kfppaPrintSideHTML('D', t, donnees(true))), `${id} D`).toEqual({
        u: '+11.2°',
        legende: '+11.2°',
      });
      expect(lire(env._kfppaPrintSideHTML('G', t, donnees(true))), `${id} G`).toEqual({
        u: '−3.4°',
        legende: '−3.4°',
      });
      // Non signée : magnitude seule des deux côtés, mention UNE fois, en petit.
      for (const [side, mag] of [
        ['D', '11.2°'],
        ['G', '3.4°'],
      ]) {
        const h = env._kfppaPrintSideHTML(side, t, donnees(false));
        expect(lire(h), `${id} ${side} non signé`).toEqual({ u: mag, legende: mag });
        expect(h.split(MENTION).length - 1, `${id} ${side} : mention`).toBe(1);
        expect(h).toContain(
          `<div class="rp-kfppa-sans-signe" style="font-size:7px;color:#888;">${MENTION}</div>`
        );
        n++;
      }
    }
    expect(n).toBe(6);
    // CAS LIMITE, non signé : 2.45 et −3.05 (−3.05 vaut −3.0499… en binaire).
    // Grand chiffre, légende et phrase du genou : EXACTEMENT la même magnitude.
    const limite = donnees(false);
    limite.photos[2].angle = 2.45;
    limite.photos[1].angle = -3.05;
    const phrase = env.buildPrintSection(env.TESTS['kfppa-marche'], limite, []);
    for (const [side, nom, mag] of [
      ['D', 'Genou droit', '2.5°'],
      ['G', 'Genou gauche', '3.0°'],
    ]) {
      const h = env._kfppaPrintSideHTML(side, env.TESTS['kfppa-marche'], limite);
      expect(lire(h), `limite ${side}`).toEqual({ u: mag, legende: mag });
      const ligne = phrase.match(new RegExp(`<strong>${nom} :</strong>[^<]*`))[0];
      expect(ligne, `phrase ${side}`).toContain(
        `valeur unipodale ${mag} (sens valgus/varus non enregistré)`
      );
    }
    // Témoin : les autres tests gardent leur légende (MLA : « -3.4° »).
    const mla = env.buildPrintPhotos(
      { photos: [{ label: 'Propulsion', side: 'D', dataUrl: 'data:m', angle: -3.4 }] },
      'D',
      env.TESTS['mla-marche']
    );
    expect(mla).toContain('>-3.4°<');
  });
});
