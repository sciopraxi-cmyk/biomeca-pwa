import { describe, it, expect } from 'vitest';
import { charger, envCapture } from './helpers/harnais-kfppa.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';
import * as calc from '../js/calc.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3f — photo non envoyée : valeur affichée, exclue des calculs
// ═══════════════════════════════════════════════════════════════════
//
// Règle du praticien : la valeur d'une photo NON ENVOYÉE reste affichée, avec
// sa mention rouge, mais n'entre dans AUCUN calcul dérivé (classe, verdict, Δ,
// décomposition de l'asymétrie) tant qu'elle n'est pas recapturée. Le texte dit
// pourquoi. « Valeur exclue » ne ressemble jamais à « valeur absente ». Panneau,
// rapport et alertes passent par la même analyse (_kfppaGenou).
//
// Cas relevé sur localhost : photo bipodale non envoyée, D 0.0° et G 0.0° ;
// unipodales G +7.6° et D +14.6°. Le rapport disait « photo bipodale
// manquante » tout en calculant Δ et l'asymétrie avec S = 0.0°.
// Données synthétiques : dataURL factices, valeurs inventées.

const BIP = 'photo bipodale non envoyée — à recapturer';
const UNI = 'photo unipodale non envoyée — à recapturer';
const LIB = 'KFPPA USL (valgus dynamique en réception unipodale)';

const bilan = ({ bipNE = false, uniDNE = false } = {}) => ({
  kfppaNorme: { min: 5, max: 12, source: 'source synthétique', sexe: 'femmes' },
  photos: [
    {
      label: 'Station bipodale',
      side: '',
      ...(bipNE ? { nonEnvoyee: true } : { dataUrl: 'data:image/jpeg;base64,QklQ' }),
      path: null,
      angle: null,
      angleD: 0,
      angleG: 0,
      kfppaSigne: true,
    },
    {
      label: 'Valgum dynamique unipodal G',
      side: 'G',
      dataUrl: 'data:image/jpeg;base64,Rw==',
      path: null,
      angle: 7.6,
      kfppaSigne: true,
    },
    {
      label: 'Valgum dynamique unipodal D',
      side: 'D',
      ...(uniDNE ? { nonEnvoyee: true } : { dataUrl: 'data:image/jpeg;base64,RA==' }),
      path: null,
      angle: 14.6,
      kfppaSigne: true,
    },
  ],
});
const rapport = (env, data) => env.buildPrintSection(env.TESTS['kfppa-sldj'], data, []);
const panneau = (env, data) => {
  const res = envCapture(env, 'kfppa-sldj', data.photos);
  env.poser({ patient: { civilite: 'Mme' } });
  env.updateResults();
  return res.innerHTML;
};
const nb = (h, s) => h.split(s).length - 1;

describe('#279 étape 3f — photo bipodale non envoyée (cas relevé)', () => {
  it('K1. Rapport : S affiché et exclu, Δ non calculé avec le motif, asymétrie sans décomposition', () => {
    const h = rapport(charger(), bilan({ bipNE: true }));
    expect(h).not.toContain('photo bipodale manquante');
    expect(h, 'aucune décomposition avec S = 0.0°').not.toContain('de statique');
    expect(h, 'aucun Δ').not.toContain('(vers le');
    for (const nom of ['Genou droit', 'Genou gauche']) {
      expect(h).toContain(
        `<strong>${nom} :</strong> statique 0.0° — valeur exclue des calculs (${BIP}), ` +
          `composante dynamique non calculée (${BIP}), valeur unipodale`
      );
    }
    expect(h).toContain(
      `Asymétrie D − G : +7.0° en unipodal ; décomposition statique / dynamique non calculée (${BIP}).`
    );
    // Blocs des genoux : la valeur, la mention rouge, Δ et son motif.
    expect(nb(h, 'Statique (S) : 0.0°'), 'S affiché sur chaque genou').toBe(2);
    expect(
      nb(
        h,
        `<span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;"> — valeur exclue des calculs (${BIP})</span>`
      )
    ).toBe(2);
    expect(
      nb(
        h,
        `Composante dynamique (Δ) : <span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;">non calculé (${BIP})</span>`
      )
    ).toBe(2);
    expect(h, 'S n’est pas classé').not.toContain('Neutre');
    // La photo elle-même porte sa mention rouge (3e).
    expect(h).toContain('⚠️ Photo « Station bipodale » non envoyée — à recapturer');
  });

  it('K2. Panneau : S affiché et exclu en rouge, Δ non calculé, jamais « manquante » ni « Neutre »', () => {
    const h = panneau(charger(), bilan({ bipNE: true }));
    expect(h).not.toContain('photo bipodale manquante');
    expect(h).not.toContain('Capturez 3 photos');
    expect(h).not.toContain('Neutre');
    expect(
      nb(
        h,
        `Statique S : <b>0.0°<span class="kfppa-exclu" style="color:var(--red);font-weight:700;"> — valeur exclue des calculs (${BIP})</span></b>`
      )
    ).toBe(2);
    expect(
      nb(
        h,
        `Δ = U − S : <b><span class="kfppa-exclu" style="color:var(--red);font-weight:700;">non calculé (${BIP})</span></b>`
      )
    ).toBe(2);
    // U reste valide : D et G gardent leur valeur.
    expect(h).toContain('Unipodal U : <b>+14.6°</b>');
    expect(h).toContain('Unipodal U : <b>+7.6°</b>');
    // Les TROIS photos non envoyées : le panneau garde ses valeurs, exclues,
    // et ne retombe jamais sur « Capturez 3 photos » (photos prises).
    const tout = bilan({ bipNE: true, uniDNE: true });
    delete tout.photos[1].dataUrl;
    tout.photos[1].nonEnvoyee = true;
    const h3 = panneau(charger(), tout);
    expect(h3).not.toContain('Capturez 3 photos');
    expect(nb(h3, 'valeur exclue des calculs'), 'S et U, deux genoux').toBe(4);
  });

  it('K3. Alertes : le motif, jamais « manquante »', () => {
    const env = charger();
    const as = env._collectTestAlerts(env.TESTS['kfppa-sldj'], bilan({ bipNE: true }), {
      condensed: true,
    });
    expect(as).toContain(`Genou droit · ${LIB} — ${BIP} : composante dynamique non calculée`);
    expect(as).toContain(`Genou gauche · ${LIB} — ${BIP} : composante dynamique non calculée`);
    expect(as.join('\n')).not.toContain('manquante');
  });
});

describe('#279 étape 3f — photo unipodale non envoyée', () => {
  it('K4. U affiché et exclu : ni verdict, ni Δ, ni asymétrie ; l’autre genou intact', () => {
    const env = charger();
    const h = rapport(env, bilan({ uniDNE: true }));
    expect(h).toContain(
      `<strong>Genou droit :</strong> statique 0.0° (neutre), composante dynamique non calculée (${UNI}), ` +
        `valeur unipodale +14.6° — valeur exclue des calculs (${UNI}).`
    );
    expect(h).toContain(
      '<strong>Genou gauche :</strong> statique 0.0° (neutre), composante dynamique +7.6° (vers le valgus), ' +
        'valeur unipodale +7.6° : dans la norme (norme 5–12°, femmes).'
    );
    expect(h).toContain(`Asymétrie D − G non calculée (${UNI}).`);
    expect(h).not.toContain('en unipodal');
    expect(nb(h, `verdict non calculé (${UNI})`), 'place du verdict D').toBe(1);
    expect(h).toContain('⚠️ Photo « Valgum dynamique unipodal D » non envoyée — à recapturer');
    const p = panneau(charger(), bilan({ uniDNE: true }));
    expect(p).toContain(
      `Unipodal U : <b>+14.6°<span class="kfppa-exclu" style="color:var(--red);font-weight:700;"> — valeur exclue des calculs (${UNI})</span></b>`
    );
    expect(nb(p, `non calculé (${UNI})`), 'Δ et verdict de D').toBe(2);
    const as = env._collectTestAlerts(env.TESTS['kfppa-sldj'], bilan({ uniDNE: true }), {
      condensed: true,
    });
    // Même motif que le Δ du panneau et du rapport.
    expect(as).toEqual([
      `Genou droit · ${LIB} — ${UNI} : composante dynamique non calculée`,
      `Genou droit · ${LIB} — ${UNI} : verdict non calculé`,
    ]);
  });
});

describe('#279 étape 3f — bipodale ET unipodale D non envoyées', () => {
  const LES_DEUX = 'photos bipodale et unipodale non envoyées — à recapturer';

  it('K8. Rapport, panneau, alertes : les deux motifs, aucune contradiction, G garde son verdict', () => {
    const env = charger();
    const data = () => bilan({ bipNE: true, uniDNE: true });
    const h = rapport(env, data());
    expect(h).toContain(
      `<strong>Genou droit :</strong> statique 0.0° — valeur exclue des calculs (${BIP}), ` +
        `composante dynamique non calculée (${LES_DEUX}), ` +
        `valeur unipodale +14.6° — valeur exclue des calculs (${UNI}).`
    );
    expect(h).toContain(
      `<strong>Genou gauche :</strong> statique 0.0° — valeur exclue des calculs (${BIP}), ` +
        `composante dynamique non calculée (${BIP}), ` +
        'valeur unipodale +7.6° : dans la norme (norme 5–12°, femmes).'
    );
    expect(h).toContain(`Asymétrie D − G non calculée (${UNI}).`);
    expect(h).not.toContain('en unipodal');
    expect(h).not.toContain('de statique');
    expect(h).not.toContain('(vers le');
    // Verdict : D non calculé, G conservé (badge du bloc G).
    expect(nb(h, `verdict non calculé (${UNI})`)).toBe(1);
    expect(h).toContain('<span class="rp-badge-g">Dans la norme</span>');
    expect(h).toContain('⚠️ Photo « Station bipodale » non envoyée — à recapturer');
    expect(h).toContain('⚠️ Photo « Valgum dynamique unipodal D » non envoyée — à recapturer');

    const p = panneau(charger(), data());
    expect(nb(p, `non calculé (${LES_DEUX})`), 'Δ de D').toBe(1);
    expect(nb(p, `non calculé (${BIP})`), 'Δ de G').toBe(1);
    expect(nb(p, `non calculé (${UNI})`), 'verdict de D').toBe(1);
    expect(p).toContain('>Dans la norme</b>');

    const as = env._collectTestAlerts(env.TESTS['kfppa-sldj'], data(), { condensed: true });
    // Motif du Δ de D : LES DEUX photos, le même que dans le rapport et le
    // panneau (une seule analyse, _kfppaGenou → kfppaMotifDelta).
    expect(as).toEqual([
      `Genou droit · ${LIB} — ${LES_DEUX} : composante dynamique non calculée`,
      `Genou droit · ${LIB} — ${UNI} : verdict non calculé`,
      `Genou gauche · ${LIB} — ${BIP} : composante dynamique non calculée`,
    ]);

    for (const [site, x] of [
      ['rapport', h],
      ['panneau', p],
      ['alertes', as.join('\n')],
    ]) {
      expect(x, `${site} : « manquante »`).not.toContain('manquante');
      expect(x, `${site} : « Neutre »`).not.toMatch(/neutre/i);
    }
  });
});

describe('#279 étape 3f — témoins : seule la photo non envoyée est exclue', () => {
  it('K5. Même valeurs, photo envoyée OU non rechargée : calculs complets', () => {
    const env = charger();
    const ok = rapport(env, bilan());
    expect(ok).toContain(
      'Asymétrie D − G : +7.0° en unipodal, dont 0.0° de statique et +7.0° de dynamique.'
    );
    expect(ok).not.toContain('kfppa-exclu');
    // Non rechargée (path, sans dataURL) : la photo EST envoyée, sa valeur compte.
    const nr = bilan();
    delete nr.photos[0].dataUrl;
    nr.photos[0].path = 'u/bip.jpg';
    const h = rapport(env, nr);
    expect(h).toContain('dont 0.0° de statique et +7.0° de dynamique.');
    expect(h).not.toContain('kfppa-exclu');
  });
});

describe('#279 étape 3f — l’analyse, source unique', () => {
  it('K10. Valeur exclue : gardée, sans classe, sans Δ, couleur neutre', () => {
    // Les affichages testent l'exclusion AVANT de lire la classe : seule une
    // vérification de l'analyse elle-même garde ses champs dérivés.
    const env = charger();
    const norme = { statut: 'ok', min: 5, max: 12, source: 's', sexe: 'femmes' };
    const base = { S: 2.4, U: 14.6, sSigne: true, uSigne: true, norme };
    const ok = env.kfppaAnalyseGenou(base);
    expect([ok.classeS, ok.classeU, ok.delta, ok.couleur]).toEqual([
      'Neutre',
      'Valgus excessif',
      12.2,
      'rouge',
    ]);
    const s = env.kfppaAnalyseGenou({ ...base, sExclu: true });
    expect([s.S, s.sExclu, s.classeS, s.delta]).toEqual([2.4, true, null, null]);
    expect([s.classeU, s.couleur], 'U intact').toEqual(['Valgus excessif', 'rouge']);
    const u = env.kfppaAnalyseGenou({ ...base, uExclu: true });
    expect([u.U, u.uExclu, u.classeU, u.couleur, u.delta]).toEqual([
      14.6,
      true,
      null,
      'neutre',
      null,
    ]);
    expect(u.classeS, 'S intact').toBe('Neutre');
  });
});

describe('#279 étape 3f — les deux copies', () => {
  it('K6. Parité par exécution, exclusions comprises', () => {
    const env = charger();
    const norme = { statut: 'ok', min: 5, max: 12, source: 's', sexe: 'femmes' };
    let n = 0;
    const analyses = [];
    for (const S of [-3.44, 0, 2.36])
      for (const U of [-2.46, 7.6, 14.6])
        for (const sExclu of [false, true])
          for (const uExclu of [false, true])
            for (const sSigne of [false, true]) {
              const e = { S, U, sSigne, uSigne: true, sExclu, uExclu, norme };
              const aE = env.kfppaAnalyseGenou(e);
              const aC = calc.kfppaAnalyseGenou(e);
              expect(aE).toEqual(aC);
              expect(env.kfppaPhraseGenou('G', aE)).toBe(calc.kfppaPhraseGenou('G', aC));
              expect(env.kfppaTexteUnipodal(aE)).toBe(calc.kfppaTexteUnipodal(aC));
              analyses.push([aE, aC]);
              n++;
            }
    let asym = 0;
    for (const [dE, dC] of analyses)
      for (const [gE, gC] of analyses) {
        expect(env.kfppaPhraseAsymetrie(dE, gE)).toBe(calc.kfppaPhraseAsymetrie(dC, gC));
        asym++;
      }
    expect(n).toBe(72);
    expect(asym).toBe(72 * 72);
  });
});

describe('#279 étape 3f — enregistrement', () => {
  const valider = async (envois) => {
    const env = charger({
      persistance: true,
      envoiReel: true,
      envois,
      // Réessayer : non (autres choix) ; enregistrer sans la photo : oui.
      reponses: [false, true],
    });
    const slots = bilan().photos.map((p) => ({ ...p, path: null }));
    env.poser({
      test: 'kfppa-sldj',
      slots,
      frames: [],
      patient: { ...patientFictif('Mme'), bilanData: {} },
    });
    await env.validateAndSave();
    return env.patient().mesures['kfppa-sldj'];
  };

  it('K7. Δ persisté retiré pour le côté dont une photo n’est pas envoyée', async () => {
    // Envois dans l'ordre des créneaux : bipodal, G, D.
    const bip = await valider(['echec', 'ok', 'ok', 'echec']);
    expect(bip.photos[0].nonEnvoyee).toBe(true);
    expect('deltaD' in bip, 'deltaD').toBe(false);
    expect('deltaG' in bip, 'deltaG').toBe(false);
    const uniD = await valider(['ok', 'ok', 'echec', 'echec']);
    expect(uniD.photos[2].nonEnvoyee).toBe(true);
    expect('deltaD' in uniD).toBe(false);
    expect(uniD.deltaG).toBeCloseTo(7.6, 9);
    // Témoin : tout envoyé, les deux Δ sont là.
    const env = charger({ persistance: true, envoiReel: true, envois: ['ok', 'ok', 'ok'] });
    env.poser({
      test: 'kfppa-sldj',
      slots: bilan().photos.map((p) => ({ ...p, path: null })),
      frames: [],
      patient: { ...patientFictif('Mme'), bilanData: {} },
    });
    await env.validateAndSave();
    const r = env.patient().mesures['kfppa-sldj'];
    expect(r.deltaD).toBeCloseTo(14.6, 9);
    expect(r.deltaG).toBeCloseTo(7.6, 9);
  });

  it('K9. Hors KFPPA, le retrait du Δ ne touche à rien (amorti réel, MLA en mode photo)', async () => {
    // Comportement ACTUEL hors KFPPA, pas une règle voulue : à revoir avec la
    // décision sur les 6 autres tests (3g). Ce test devra être modifié si la
    // règle d'exclusion de 3f est étendue à ces tests.
    // Critère du retrait : t.div !== undefined, porté par les 3 KFPPA seuls.
    const env0 = charger();
    expect(Object.keys(env0.TESTS).filter((k) => env0.TESTS[k].div !== undefined)).toEqual([
      'kfppa-marche',
      'kfppa-course',
      'kfppa-sldj',
    ]);
    // Aucun test vidéo hors KFPPA n'écrit deltaD/deltaG : la branche MLA qui
    // les écrit est celle du mode photo — variante SYNTHÉTIQUE ajoutée ici.
    const derives = (r) =>
      Object.fromEntries(
        Object.entries(r).filter(([k]) => !['photos', 'frames', 'date'].includes(k))
      );
    const enregistrer = async (id, echecIdx) => {
      const labels = env0.TESTS[id === 'mla-photo-synthetique' ? 'mla-marche' : id].photoLabels;
      const env = charger({
        persistance: true,
        envoiReel: true,
        // Réponses d'envoi, dans l'ordre des créneaux : celui d'echecIdx échoue.
        envois: labels.map((_l, i) => (i === echecIdx ? 'echec' : 'ok')),
        // Réessayer : non (autres choix) ; enregistrer sans la photo : oui.
        reponses: echecIdx == null ? [] : [false, true],
      });
      env.TESTS['mla-photo-synthetique'] = { ...env.TESTS['mla-marche'], mode: 'photo' };
      const t = env.TESTS[id];
      const slots = t.photoLabels.map((l, i) => ({
        label: l,
        side: t.photoSides[i] || '',
        dataUrl: 'data:image/jpeg;base64,QQ==',
        path: null,
        angle: 3 + 4 * i,
      }));
      env.poser({
        test: id,
        slots,
        frames: [],
        patient: { ...patientFictif('M.'), bilanData: {} },
      });
      await env.validateAndSave();
      return env.patient().mesures[id];
    };
    for (const [id, champs] of [
      ['amorti-marche', ['amD', 'prD', 'amG', 'prG', 'phases']],
      ['mla-photo-synthetique', ['deltaD', 'deltaG', 'pctD', 'pctG']],
    ]) {
      const temoin = await enregistrer(id, null);
      for (const c of champs) expect(temoin[c], `${id} : ${c} enregistré`).not.toBeUndefined();
      const ne = await enregistrer(id, 0);
      expect(ne.photos[0].nonEnvoyee, `${id} : photo non envoyée`).toBe(true);
      expect(derives(ne), id).toEqual(derives(temoin));
    }
  });
});
