import { describe, it, expect } from 'vitest';
import { charger, envCapture, MARQUEURS_DEMO } from './helpers/harnais-kfppa.mjs';
import { patientFictif } from './helpers/resultats-279-donnees.mjs';
import * as calc from '../js/calc.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 3f — fin du correctif : « points non disponibles » au KFPPA
// ═══════════════════════════════════════════════════════════════════
//
// Une capture NEUVE sans points (imageBrute, angle null) affichait
// « valgus dynamique non recalculable (bilan antérieur) » pour S et
// « valeur unipodale — » pour U : l'état 'nonRecalc' de #275-B supposait
// qu'un angle null ne pouvait venir que d'un ancien bilan.
//
// Décision : état distinct, fondé sur imageBrute — posé SEULEMENT par la
// capture (3b), jamais présent dans un ancien bilan. Message rouge « points
// non disponibles sur la photo bipodale / unipodale — à recapturer », sur
// tous les sites : panneau, alertes (donc synthèse), lignes du rapport, bloc
// de chaque genou. Sans imageBrute : « bilan antérieur » et « — » inchangés.
// Aucune heuristique.
//
// Et deletePhotoSlot efface aussi markers, dims et markersConnus.
// Données synthétiques : dataURL factices, valeurs inventées.

const BIP = 'points non disponibles sur la photo bipodale — à recapturer';
const UNI = 'points non disponibles sur la photo unipodale — à recapturer';
const LES_DEUX = 'points non disponibles sur les photos bipodale et unipodale — à recapturer';
const LIB = 'KFPPA USL (valgus dynamique en réception unipodale)';
const ROUGE_R = (t) =>
  `<span class="kfppa-exclu" style="color:#b91c1c;font-weight:700;">${t}</span>`;
const ROUGE_E = (t) =>
  `<span class="kfppa-exclu" style="color:var(--red);font-weight:700;">${t}</span>`;
const nb = (h, s) => h.split(s).length - 1;

// Capture neuve sans points : bipodale et unipodale D ; G mesurée.
const neuf = () => ({
  kfppaNorme: { min: 5, max: 12, source: 'source synthétique', sexe: 'femmes' },
  photos: [
    {
      label: 'Station bipodale',
      side: '',
      dataUrl: 'data:image/jpeg;base64,QklQ',
      path: null,
      angle: null,
      angleD: null,
      angleG: null,
      imageBrute: true,
      dessin: { taille: 1, opacite: 0.5, testId: 'kfppa-sldj' },
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
      dataUrl: 'data:image/jpeg;base64,RA==',
      path: null,
      angle: null,
      imageBrute: true,
      dessin: { taille: 1, opacite: 0.5, testId: 'kfppa-sldj' },
    },
  ],
});
// Ancien bilan : mêmes angles null, SANS imageBrute (photos envoyées).
const ancien = () => {
  const d = neuf();
  for (const p of d.photos) {
    delete p.imageBrute;
    delete p.dessin;
    p.path = 'u/' + p.side + '.jpg';
  }
  return d;
};
const rapport = (env, d) => env.buildPrintSection(env.TESTS['kfppa-sldj'], d, []);
const panneau = (env, d) => {
  const res = envCapture(env, 'kfppa-sldj', d.photos);
  env.poser({ patient: { civilite: 'Mme' } });
  env.updateResults();
  return res.innerHTML;
};
const alertes = (env, d) => env._collectTestAlerts(env.TESTS['kfppa-sldj'], d, { condensed: true });

describe('#279 étape 3f — capture neuve sans points : « points non disponibles »', () => {
  it('P1. Rapport : lignes et blocs des genoux, jamais « bilan antérieur » ni « — »', () => {
    const h = rapport(charger(), neuf());
    expect(h).not.toContain('bilan antérieur');
    expect(h).not.toContain('valeur unipodale —');
    expect(h).toContain(`<strong>Genou droit :</strong> ${BIP} ; valeur unipodale : ${UNI}.`);
    expect(h).toContain(
      `<strong>Genou gauche :</strong> ${BIP} ; valeur unipodale +7.6° : dans la norme (norme 5–12°, femmes).`
    );
    expect(nb(h, `Statique (S) : ${ROUGE_R(BIP)}`), 'S de chaque genou').toBe(2);
    expect(h, 'U de D').toContain(`<div style="font-size:7px;">${ROUGE_R(UNI)}</div>`);
    expect(nb(h, ROUGE_R(`verdict non calculé (${UNI})`)), 'verdict de D').toBe(1);
    expect(h, 'Δ de D').toContain(
      `Composante dynamique (Δ) : ${ROUGE_R(`non calculé (${LES_DEUX})`)}`
    );
    expect(h, 'Δ de G').toContain(`Composante dynamique (Δ) : ${ROUGE_R(`non calculé (${BIP})`)}`);
  });

  it('P2. Panneau : S et U en rouge, Δ et verdict avec le motif, message une seule fois', () => {
    const h = panneau(charger(), neuf());
    expect(h).not.toContain('bilan antérieur');
    expect(nb(h, `Statique S : <b>${ROUGE_E(BIP)}</b>`)).toBe(2);
    expect(h).toContain(`Unipodal U : <b>${ROUGE_E(UNI)}</b>`);
    expect(h).toContain(`Δ = U − S : <b>${ROUGE_E(`non calculé (${LES_DEUX})`)}</b>`);
    expect(h).toContain(`Δ = U − S : <b>${ROUGE_E(`non calculé (${BIP})`)}</b>`);
    expect(h).toContain(ROUGE_E(`non calculé (${UNI})`) + '</b>');
    // Pas de second message orange sous le bloc : l'état est dit dans S.
    expect(nb(h, `${BIP}</div>`), 'message orange répété').toBe(0);
    expect(h, 'G garde son verdict').toContain('>Dans la norme</b>');
  });

  it('P3. Alertes (et donc synthèse) : motif puis conséquence, comme les photos non envoyées', () => {
    // Même format et même logique (kfppaMotifDelta) que pour une photo non
    // envoyée : « <motif> : composante dynamique non calculée », puis
    // « <motif de U> : verdict non calculé ».
    expect(alertes(charger(), neuf())).toEqual([
      `Genou droit · ${LIB} — ${LES_DEUX} : composante dynamique non calculée`,
      `Genou droit · ${LIB} — ${UNI} : verdict non calculé`,
      `Genou gauche · ${LIB} — ${BIP} : composante dynamique non calculée`,
    ]);
  });
});

describe('#279 étape 3f — ancien bilan sans imageBrute : inchangé', () => {
  it('P4. « bilan antérieur » et « — » conservés partout', () => {
    const env = charger();
    const h = rapport(env, ancien());
    expect(nb(h, 'Statique (S) : valgus dynamique non recalculable (bilan antérieur)')).toBe(2);
    expect(h).toContain(
      '<strong>Genou droit :</strong> valgus dynamique non recalculable (bilan antérieur) ; valeur unipodale —.'
    );
    expect(h).not.toContain('points non disponibles sur la photo');
    const p = panneau(charger(), ancien());
    expect(p).toContain('valgus dynamique non recalculable (bilan antérieur)');
    expect(p).not.toContain('points non disponibles sur la photo');
    expect(alertes(env, ancien())).toEqual([
      `Genou droit · ${LIB} — valgus dynamique non recalculable (bilan antérieur)`,
      `Genou gauche · ${LIB} — valgus dynamique non recalculable (bilan antérieur)`,
    ]);
  });
});

describe('#279 étape 3f — suppression : le créneau est vraiment vide', () => {
  it('P5. deletePhotoSlot efface markers, dims, markersConnus ; rien n’est enregistré de l’ancienne capture', async () => {
    const env = charger({ persistance: true, envoiReel: true, envois: ['ok'] });
    const res = envCapture(env, 'kfppa-sldj', [
      { label: 'Station bipodale', side: '', dataUrl: null, angle: null, path: null },
      { label: 'Valgum dynamique unipodal G', side: 'G', dataUrl: null, angle: null, path: null },
      { label: 'Valgum dynamique unipodal D', side: 'D', dataUrl: null, angle: null, path: null },
    ]);
    expect(res).toBeTruthy();
    env.poser({ patient: { ...patientFictif('Mme'), bilanData: {} } });
    await env.captureVidPhotoSlot(2);
    expect(env.slots()[2].markers.length, 'capture avec points').toBe(3);
    env.deletePhotoSlot(2);
    const s = env.slots()[2];
    expect('markers' in s, 'markers').toBe(false);
    expect('dims' in s, 'dims').toBe(false);
    expect(s.markersConnus).toBe(false);
    await env.validateAndSave();
    const e = env.patient().mesures['kfppa-sldj'].photos[2];
    expect('markers' in e).toBe(false);
    expect('dims' in e).toBe(false);
    // Témoin : les marqueurs de démonstration servaient bien à la capture.
    expect(MARQUEURS_DEMO.length).toBe(6);
  });
});

describe('#279 étape 3f — les deux copies', () => {
  it('P6. Parité par exécution, « points non disponibles » compris', () => {
    const env = charger();
    const norme = { statut: 'ok', min: 5, max: 12, source: 's', sexe: 'femmes' };
    const vals = [null, -2.46, 7.6];
    const analyses = [];
    for (const S of vals)
      for (const U of vals)
        for (const sPointsKo of [false, true])
          for (const uPointsKo of [false, true])
            for (const sExclu of [false, true]) {
              const e = { S, U, sSigne: true, uSigne: true, sPointsKo, uPointsKo, sExclu, norme };
              const aE = env.kfppaAnalyseGenou(e);
              const aC = calc.kfppaAnalyseGenou(e);
              expect(aE).toEqual(aC);
              expect(env.kfppaPhraseGenou('D', aE)).toBe(calc.kfppaPhraseGenou('D', aC));
              expect(env.kfppaTexteUnipodal(aE)).toBe(calc.kfppaTexteUnipodal(aC));
              expect(env.kfppaMotifDelta(aE)).toBe(calc.kfppaMotifDelta(aC));
              analyses.push(aE);
            }
    expect(analyses).toHaveLength(72);
    // Témoin : le texte de « points non disponibles » a bien été produit.
    const ko = env.kfppaAnalyseGenou({ S: null, U: null, sPointsKo: true, uPointsKo: true, norme });
    expect(env.kfppaPhraseGenou('G', ko)).toBe(
      `Genou gauche : statique : ${BIP}, composante dynamique non calculée (${LES_DEUX}), valeur unipodale : ${UNI}.`
    );
    // Un drapeau sur une valeur PRÉSENTE n'a aucun effet.
    const v = env.kfppaAnalyseGenou({
      S: 2.4,
      U: 7.6,
      sSigne: true,
      uSigne: true,
      sPointsKo: true,
      uPointsKo: true,
      norme,
    });
    expect([v.sPointsKo, v.uPointsKo, v.delta]).toEqual([false, false, 5.2]);
  });
});
