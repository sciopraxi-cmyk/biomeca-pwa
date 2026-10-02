import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { RACINE } from './helpers/mirror-diff.mjs';
import { charger, envCapture } from './helpers/harnais-kfppa.mjs';
import { cas, CLES, produire } from './helpers/non-regression-1b-donnees.mjs';

// ═══════════════════════════════════════════════════════════════════
// #279 étape 1b — NON-RÉGRESSION des 6 tests hors KFPPA
// ═══════════════════════════════════════════════════════════════════
//
// La RÉFÉRENCE (tests/golden/non-regression-1b.json) a été produite par le
// code d'AVANT 1b (3361bee, lu via BIOMECA_SRC, blocs compris), sur les
// données SYNTHÉTIQUES de tests/helpers/non-regression-1b-donnees.mjs, qui ne
// portent ni nonEnvoyee ni imageBrute. Elle n'est JAMAIS régénérée.
// Sur ces données, le code actuel doit donner :
//   - les MÊMES ratios de chaque calculateur (mla, rf, mollet, mob, am, pr),
//     valeurs enregistrées incohérentes avec les photos comprises ;
//   - les MÊMES alertes, détaillées et condensées ;
//   - le MÊME HTML, octet pour octet (empreinte SHA-256), panneau, côtés D et
//     G du rapport, section complète — SAUF 57 exceptions STRICTES, validées
//     par le praticien, dont le texte de HEAD est conservé dans
//     tests/golden/non-regression-1b-exceptions.json (empreinte vérifiée) :
//       • 'mla-nan' (27) : défaut de HEAD, « NaN% » dans la jauge du rapport
//         d'un côté MLA sans ses deux photos (pctD jamais enregistré en vidéo).
//         Attendu : le HTML de HEAD avec l'arc vide retiré et « NaN% » → « — »,
//         identique à l'octet près ;
//       • 'amorti-nan' (14) : défaut de HEAD, « Amorti NaN% » dans les lignes
//         de la section amorti (amD absent : pied sans photo). Attendu : le
//         HTML de HEAD avec « Amorti NaN% » → « Amorti — », à l'octet près ;
//       • 'amorti-propulsion-format' (20) : défaut de HEAD, `${prD||'—'}%`
//         dans les mêmes lignes — « —% » sans valeur, et une propulsion
//         mesurée à 0 affichée comme absente. Attendu : « — » si la valeur
//         enregistrée est absente, « 0% » si elle vaut 0 ;
//       • 'amorti-propulsion' (12) : incohérence de HEAD, le rapport et les
//         alertes n'appliquaient pas la même priorité « enregistré / recalcul »
//         à la propulsion, sur des valeurs enregistrées que l'application ne
//         produit pas. Attendu : seul le rendu de la propulsion change, et il
//         vaut celle des alertes (ratio du calculateur).
// Tout autre écart, ou une exception sans écart, fait échouer le test.

const REF = JSON.parse(readFileSync(join(RACINE, 'tests/golden/non-regression-1b.json'), 'utf8'));
const EXC = JSON.parse(
  readFileSync(join(RACINE, 'tests/golden/non-regression-1b-exceptions.json'), 'utf8')
);
const empreinte = (h) => createHash('sha256').update(h).digest('hex');
const DONNEES = Object.fromEntries(cas(charger().TESTS).map((c) => [c.nom, c.data]));

const ARC_VIDE =
  '<circle cx="40" cy="40" r="35" fill="none" stroke="#aaa" stroke-width="8" stroke-dasharray="0 219.9114857512855" stroke-linecap="round" transform="rotate(-90,40,40)"/>';
const corrigerNaN = (h) => h.split(ARC_VIDE).join('').split('>NaN%</div>').join('>—</div>');
// Rendu de la propulsion (jauge « Propuls. » et ligne « Propulsion: … »).
const JAUGE_PR =
  /<div class="rp-gauge" style="width:80px;height:80px;">(?:(?!<div class="rp-gauge")[\s\S])*?Propuls\.<\/div>/g;
const LIGNE_PR = /Propulsion: <b style="color:[^"]*;">([^<]*)<\/b>/g;
const neutraliser = (h) =>
  h.replace(JAUGE_PR, '«PROPULSION»').replace(LIGNE_PR, 'Propulsion: «PROPULSION»');
const pctTxt = (r) => (r == null ? '—' : Math.round(Math.abs(r) * 100) + '%');

// Lignes « Pied … : Amorti X · Propulsion Y » de la section amorti, telles que
// le code actuel les écrit à partir des MÊMES données que HEAD : « NaN% » →
// « — » (amorti-nan) ; « —% » → « — » si la propulsion enregistrée est absente,
// « 0% » si elle vaut 0 (amorti-propulsion-format). Rend aussi les familles
// réellement appliquées.
function corrigerLignes(h, data) {
  const appliquees = new Set();
  const t = h.replace(
    /<strong>Pied (droit|gauche) :<\/strong> Amorti ([^ ]*) · Propulsion ([^<]*)/g,
    (_m, cote, am, pr) => {
      const s = cote === 'droit' ? 'D' : 'G';
      if (am === 'NaN%') {
        am = '—';
        appliquees.add('amorti-nan');
      }
      if (pr === '—%') {
        const v = data['pr' + s];
        if (v == null || Number.isNaN(v)) {
          pr = '—';
          appliquees.add('amorti-propulsion-format');
        } else if (Math.round(v * 100) === 0) {
          pr = '0%';
          appliquees.add('amorti-propulsion-format');
        }
      }
      return `<strong>Pied ${cote} :</strong> Amorti ${am} · Propulsion ${pr}`;
    }
  );
  return { t, appliquees };
}

// Vérifie une exception ; rend la violation, ou null.
function regle(e, actuel, calc, h, data) {
  const fams = new Set(e.familles);
  if (fams.has('mla-nan')) {
    if (fams.size !== 1) return 'famille mla-nan combinée';
    if (!e.head.includes('NaN%')) return 'exception MLA sans « NaN% » dans HEAD';
    return corrigerNaN(e.head) === actuel
      ? null
      : 'HTML ≠ HEAD corrigé (arc vide retiré, NaN% → —)';
  }
  const { t, appliquees } = corrigerLignes(e.head, data);
  const lignesAttendues = [...fams].filter((f) => f !== 'amorti-propulsion').sort();
  if (JSON.stringify([...appliquees].sort()) !== JSON.stringify(lignesAttendues))
    return `familles appliquées ${[...appliquees]} ≠ déclarées ${lignesAttendues}`;
  if (!fams.has('amorti-propulsion'))
    return t === actuel ? null : 'HTML ≠ HEAD corrigé (lignes de l’amorti)';
  if (neutraliser(t) !== neutraliser(actuel)) return 'écart hors du rendu de la propulsion';
  const cotes = h === 'section' ? ['D', 'G'] : [h];
  const lignes = [...actuel.matchAll(LIGNE_PR)].map((m) => m[1]);
  const jauges = [...actuel.matchAll(JAUGE_PR)].map(
    (m) => (m[0].match(/rp-gauge-pct[^>]*>([^<]*)</) || [])[1]
  );
  const attendu = cotes.map((s) => pctTxt(calc.pr[s]));
  if (JSON.stringify(lignes) !== JSON.stringify(attendu))
    return `propulsion ${lignes} ≠ alertes ${attendu}`;
  if (JSON.stringify(jauges) !== JSON.stringify(attendu))
    return `jauge ${jauges} ≠ alertes ${attendu}`;
  return null;
}

// Écarts entre une production et la référence, exceptions vérifiées.
function ecarts(ref, prod, exc = EXC, donnees = DONNEES) {
  const out = [];
  for (const [nom, r] of Object.entries(ref)) {
    const p = prod[nom];
    if (!p) {
      out.push(`${nom} : cas absent`);
      continue;
    }
    for (const k of Object.keys(r.calc))
      for (const s of ['D', 'G'])
        if (!Object.is(r.calc[k][s], p.calc[k]?.[s]))
          out.push(`${nom} calc.${k}.${s} : ${r.calc[k][s]} ≠ ${p.calc[k]?.[s]}`);
    for (const m of ['det', 'cond'])
      if (JSON.stringify(r.alertes[m]) !== JSON.stringify(p.alertes[m]))
        out.push(`${nom} alertes.${m}`);
    for (const h of Object.keys(r.html)) {
      const cle = `${nom}|${h}`;
      const e = exc[cle];
      if (r.html[h] === p.html[h]) {
        if (e) out.push(`${cle} : exception attendue, aucun écart`);
        continue;
      }
      if (!e) {
        out.push(`${cle} : écart hors exceptions`);
        continue;
      }
      if (empreinte(e.head) !== r.html[h]) {
        out.push(`${cle} : texte d'exception ≠ HEAD`);
        continue;
      }
      const v = regle(e, p.texte[h], r.calc, h, donnees[nom]);
      if (v) out.push(`${cle} : ${v}`);
    }
  }
  return out;
}

describe('#279 1b — non-régression : calculs, alertes et affichage d’avant 1b', () => {
  it('R1. Mêmes ratios et alertes ; même HTML sauf les 57 exceptions strictes, vérifiées', () => {
    const liste = cas(charger().TESTS);
    const prod = {};
    for (const c of liste) prod[c.nom] = produire(charger, envCapture, c, CLES[c.id], empreinte);
    // Pour l'analyse d'un écart : textes intégraux, hors dépôt, sur demande.
    if (process.env.NR_1B_TEXTES)
      writeFileSync(
        process.env.NR_1B_TEXTES,
        JSON.stringify(Object.fromEntries(Object.entries(prod).map(([n, p]) => [n, p.texte])))
      );
    const nbCas = Object.keys(REF).length;
    const nbRatios = Object.values(REF).reduce((n, r) => n + Object.keys(r.calc).length * 2, 0);
    const nbHtml = Object.values(REF).reduce((n, r) => n + Object.keys(r.html).length, 0);
    const fam = (f) => Object.values(EXC).filter((e) => e.familles.includes(f)).length;
    expect(liste).toHaveLength(nbCas);
    expect([nbCas, nbRatios, nbHtml], 'cas, ratios, HTML comparés').toEqual([75, 226, 300]);
    expect(
      [
        Object.keys(EXC).length,
        fam('mla-nan'),
        fam('amorti-nan'),
        fam('amorti-propulsion-format'),
        fam('amorti-propulsion'),
      ],
      'exceptions (une clé peut relever de plusieurs familles)'
    ).toEqual([57, 27, 16, 20, 12]);
    expect(ecarts(REF, prod)).toEqual([]);
  }, 60000);

  it('R3. Aucun « NaN » dans le HTML actuel ni dans les alertes, sur les 75 cas', () => {
    let n = 0;
    const trouves = [];
    for (const c of cas(charger().TESTS)) {
      const p = produire(charger, envCapture, c, CLES[c.id], empreinte);
      for (const [k, t] of Object.entries(p.texte)) {
        n++;
        if (t.includes('NaN')) trouves.push(`${c.nom}|${k}`);
      }
      for (const m of ['det', 'cond']) {
        n++;
        if (p.alertes[m].some((x) => x.includes('NaN'))) trouves.push(`${c.nom}|alertes.${m}`);
      }
    }
    expect(n, 'textes examinés').toBe(450);
    expect(trouves).toEqual([]);
    // Témoin : la recherche sait trouver « NaN » dans le HTML de HEAD — 27 MLA,
    // 14 lignes de l'amorti, et les 2 sections « incoherent-am-absent », qui
    // portent aussi la ligne « Amorti NaN% ».
    expect(Object.values(EXC).filter((e) => e.head.includes('NaN')).length).toBe(43);
    expect(Object.values(EXC).filter((e) => e.head.includes('—%')).length, '« —% » dans HEAD').toBe(
      20
    );
  }, 60000);

  it('R2. Témoin : écart de calcul, écart d’affichage hors exceptions, exception mal transformée — détectés', () => {
    const produireCas = (nom) => {
      const c = cas(charger().TESTS).find((x) => x.nom === nom);
      return produire(charger, envCapture, c, CLES[c.id], empreinte);
    };
    // (a) Cas SANS exception : calcul et HTML.
    const nom = 'verrou#complet';
    const p = produireCas(nom);
    expect(ecarts({ [nom]: REF[nom] }, { [nom]: p }), 'identique au départ').toEqual([]);
    const ref = { [nom]: JSON.parse(JSON.stringify(REF[nom])) };
    ref[nom].calc.rf.D = ref[nom].calc.rf.D + 1e-12;
    ref[nom].alertes.cond = [...ref[nom].alertes.cond, 'alerte inventée'];
    const pHtml = { ...p, html: { ...p.html, D: empreinte(p.texte.D + ' ') } };
    expect(ecarts(ref, { [nom]: pHtml })).toEqual([
      `${nom} calc.rf.D : ${ref[nom].calc.rf.D} ≠ ${p.calc.rf.D}`,
      `${nom} alertes.cond`,
      `${nom}|D : écart hors exceptions`,
    ]);
    // (b) Exceptions : un écart HORS de la transformation admise.
    for (const [n, h, alterer, motif] of [
      [
        'mla-marche#vide',
        'D',
        (t) => t.replace('rp-side-title', 'rp-side-titre'),
        'HTML ≠ HEAD corrigé',
      ],
      [
        'amorti-marche#incoherent-am-absent',
        'D',
        (t) => t.replace('Taligrade:', 'Taligrad:'),
        'écart hors du rendu de la propulsion',
      ],
      [
        'amorti-marche#incoherent-am-absent',
        'G',
        (t) => t.replace(/(Propulsion: <b style="color:[^"]*;">)[^<]*/, '$199%'),
        'propulsion',
      ],
      // Propulsion mesurée à 0 réaffichée comme absente : hors transformation.
      [
        'amorti-marche#zero+enregistre',
        'section',
        (t) => t.replace('Propulsion 0%', 'Propulsion —'),
        'HTML ≠ HEAD corrigé (lignes de l’amorti)',
      ],
    ]) {
      const q = produireCas(n);
      expect(ecarts({ [n]: REF[n] }, { [n]: q }), `${n} conforme au départ`).toEqual([]);
      const t2 = alterer(q.texte[h]);
      expect(t2, 'altération effective').not.toBe(q.texte[h]);
      const q2 = { ...q, texte: { ...q.texte, [h]: t2 }, html: { ...q.html, [h]: empreinte(t2) } };
      const v = ecarts({ [n]: REF[n] }, { [n]: q2 });
      expect(v).toHaveLength(1);
      expect(v[0]).toContain(`${n}|${h} : ${motif}`);
    }
  }, 60000);
});
