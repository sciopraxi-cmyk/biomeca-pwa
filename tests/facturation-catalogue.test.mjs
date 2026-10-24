// ═══════════════════════════════════════════════════════════════════
// Facturation, étape 1 — catalogue d'actes
// ═══════════════════════════════════════════════════════════════════
// Fonctions EXTRAITES de js/biomeca.js ; réseau simulé. Données FICTIVES.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RACINE } from './helpers/mirror-diff.mjs';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const constante = (nom) => {
  const m = SRC_BIOMECA.match(new RegExp(`\\nconst ${nom} = ([\\s\\S]*?\\n)(?:\\};|\\];)\\n`));
  if (!m) throw new Error(nom + ' introuvable');
  const fin = SRC_BIOMECA.indexOf('\n};\n', SRC_BIOMECA.indexOf(`\nconst ${nom} = `));
  return `const ${nom} = ${SRC_BIOMECA.slice(SRC_BIOMECA.indexOf(`\nconst ${nom} = `) + `\nconst ${nom} = `.length, fin + 3)};`;
};
const NOMS = [
  '_eurosVersCentimes',
  '_centimesVersEuros',
  '_validerActe',
  '_actesAImporter',
  '_actesACompleter',
  '_partsRemboursement',
  '_actesRequete',
  'chargerActes',
  'importerReferentielActes',
  'enregistrerActe',
  'basculerActeActif',
  'modifierActe',
  'annulerEditionActe',
  'renderActesPage',
  '_categorieActe',
  '_actesDeCategorie',
  '_remplirCategoriesActe',
  'choisirCategorieActe',
  'choisirActeReference',
  '_htmlLigneActe',
];

function monter(o = {}) {
  const appels = [];
  const alertes = [];
  const champs = o.champs || {};
  const authFetch = async (url, options = {}) => {
    appels.push({
      url,
      methode: options.method || 'GET',
      corps: options.body && JSON.parse(options.body),
    });
    if (o.echec) return { ok: false, status: 500, json: async () => [] };
    return { ok: true, status: 200, json: async () => o.lignes || [] };
  };
  const document = {
    getElementById: (id) =>
      id in champs ? champs[id] : { value: '', style: {}, textContent: '', scrollIntoView() {} },
  };
  const corps = [
    'const SUPA_URL = "https://x.supabase.co";',
    'const ACTE_MONTANT_MAX_CENTS = 10000000;',
    'let _actesCache = [], _acteEnEdition = null;',
    'const _escHtml = (s) => String(s ?? "");',
    constante('REFERENTIEL_ACTES_POD'),
    constante('REGIMES_REMBOURSEMENT'),
    SRC_BIOMECA.slice(
      SRC_BIOMECA.indexOf('const CATEGORIES_ACTES = ['),
      SRC_BIOMECA.indexOf('\n];\n', SRC_BIOMECA.indexOf('const CATEGORIES_ACTES = [')) + 4
    ),
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, REFERENTIEL_ACTES_POD, REGIMES_REMBOURSEMENT, cache: () => _actesCache, edition: () => _acteEnEdition };`,
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function('authFetch', 'document', 'alert', corps)(authFetch, document, (m) =>
    alertes.push(m)
  );
  return { f, appels, alertes };
}
const champ = (value) => ({ value, style: {}, textContent: '', scrollIntoView() {} });

describe('montants : euros ↔ centimes, jamais de flottant', () => {
  const { f } = monter();
  it.each([
    ['30', 3000],
    ['30,5', 3050],
    ['30.50', 3050],
    ['0,07', 7],
    [' 1 234,56 € ', 123456],
    ['0', 0],
    ['100000', 10000000],
  ])('« %s » → %i centimes', (saisie, attendu) =>
    expect(f._eurosVersCentimes(saisie)).toBe(attendu)
  );
  it.each(['', 'abc', '-5', '30,555', '30,', ',5', '100000,01', '1e3', '12 €€x', null, undefined])(
    '« %s » refusé',
    (saisie) => expect(f._eurosVersCentimes(saisie)).toBeNull()
  );
  it('0,29 € ne devient pas 28 centimes (piège du flottant)', () => {
    expect(f._eurosVersCentimes('0,29')).toBe(29);
    expect(f._eurosVersCentimes('19,99')).toBe(1999);
  });
  it("affichage : séparateur de milliers, virgule, jamais d'exception", () => {
    expect(f._centimesVersEuros(3000)).toBe('30,00\u00a0€');
    expect(f._centimesVersEuros(123456)).toBe('1\u00a0234,56\u00a0€');
    expect(f._centimesVersEuros(7)).toBe('0,07\u00a0€');
    expect(f._centimesVersEuros(-1)).toBe('—');
    expect(f._centimesVersEuros(1.5)).toBe('—');
    expect(f._centimesVersEuros(undefined)).toBe('—');
  });
});

describe("validation d'un acte", () => {
  const { f } = monter();
  it('acte valide : champs prêts pour la base, vides → null', () => {
    const r = f._validerActe({
      libelle: '  Consultation  ',
      montant: '45',
      cotation: '',
      note: ' ',
    });
    expect(r).toEqual({
      ok: true,
      acte: {
        libelle: 'Consultation',
        montant_cents: 4500,
        base_remboursable_cents: null,
        franchise: true,
        cotation: null,
        remboursement: null,
        note: null,
        acte_reference: null,
        regime_defaut: null,
        sync_doctolib: false,
        devis_mode: 'simple',
      },
    });
  });
  it('titre vide, titre trop long, montant invalide : refusés avec un message', () => {
    expect(f._validerActe({ libelle: ' ', montant: '10' }).ok).toBe(false);
    expect(f._validerActe({ libelle: 'x'.repeat(121), montant: '10' }).ok).toBe(false);
    const r = f._validerActe({ libelle: 'A', montant: '10,999' });
    expect(r.ok).toBe(false);
    expect(r.erreur).toMatch(/Montant invalide/);
  });
  it('un montant à 0 € est accepté (acte offert)', () => {
    expect(f._validerActe({ libelle: 'Geste commercial', montant: '0' }).acte.montant_cents).toBe(
      0
    );
  });
});

describe('référentiel : données datées, sourcées, cohérentes', () => {
  const { f } = monter();
  const ref = f.REFERENTIEL_ACTES_POD;
  it('version, source et codes uniques', () => {
    expect(ref.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(ref.source).toMatch(/ameli/);
    const codes = ref.actes.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('montants entiers, cohérents avec la cotation × la lettre-clé (POD 30 €, AMP 0,63 €)', () => {
    let verifies = 0;
    for (const a of ref.actes) {
      expect(Number.isInteger(a.montant_cents), a.code).toBe(true);
      const m = /^(POD|AMP) ([\d,]+)$/.exec(a.cotation ?? '');
      if (!m) continue;
      const base = { POD: 3000, AMP: 63 }[m[1]];
      expect(
        Math.abs(a.montant_cents - parseFloat(m[2].replace(',', '.')) * base),
        a.code
      ).toBeLessThanOrEqual(1);
      verifies++;
    }
    expect(verifies).toBe(15);
  });
  it('chaque montant correspond au document de référence du praticien (20/10/2026)', () => {
    const doc = {
      'POD-0,67': 2010,
      'POD-1': 3000,
      'POD-1,17': 3510,
      'AMP-31,7': 1997,
      'AMP-REED-1': 860,
      'AMP-REED-2': 1292,
      'AMP-MASS-1': 428,
      'AMP-MASS-2': 643,
      'AMP-MPS': 3024,
      'AMP-PATHO-1': 126,
      'AMP-PATHO-2': 95,
      'AMP-PANS-S': 47,
      'AMP-PANS-M1': 79,
      'AMP-PANS-M2': 126,
      'AMP-PANS-HYG': 95,
      'LPP-2180450': 2588,
      'LPP-2122121': 2804,
      'LPP-2140455': 2886,
      'LPP-2158449': 5468,
      'TEL-POT': 3000,
      'TEL-TMP': 63,
      'TEL-RQD': 1000,
      'FRAIS-IFD': 250,
      'FRAIS-IK-PLAINE': 35,
      'FRAIS-IK-MONTAGNE': 50,
      'MAJ-NUIT': 76,
      'MAJ-DIMANCHE': 61,
    };
    const m = Object.fromEntries(ref.actes.map((a) => [a.code, a.montant_cents]));
    expect(m).toEqual(doc);
  });
  it('part Sécu + part mutuelle = base, pour chaque acte chiffré (60 % / 40 %)', () => {
    for (const a of ref.actes) {
      const x = /Sécu 60 % : ([\d,]+) €.*?mutuelle 40 % : ([\d,]+) €/.exec(a.remboursement ?? '');
      if (!x) continue;
      const [secu, mut] = [x[1], x[2]].map((v) =>
        Math.round(parseFloat(v.replace(',', '.')) * 100)
      );
      const base = /Base LPP paire ([\d,]+) €/.exec(a.remboursement)?.[1];
      const total = base ? Math.round(parseFloat(base.replace(',', '.')) * 100) : a.montant_cents;
      expect(Math.abs(secu + mut - total), a.code).toBeLessThanOrEqual(1);
    }
  });
  it('semelles LPP : base de la PAIRE = 2 × le tarif officiel par orthèse, datée du 07/07/2023', () => {
    const parOrtheseOfficiel = {
      'LPP-2180450': 1294,
      'LPP-2122121': 1402,
      'LPP-2140455': 1443,
      'LPP-2158449': 2734,
    };
    const lpp = ref.actes.filter((a) => a.code.startsWith('LPP-'));
    expect(lpp).toHaveLength(4);
    for (const a of lpp) {
      expect(a.date_effet).toBe('2023-07-07');
      expect(a.montant_cents, a.code).toBe(2 * parOrtheseOfficiel[a.code]);
      expect(a.note).toMatch(/PAIRE/);
      expect(a.note).toMatch(/prix de vente libre/);
      expect(a.note).not.toMatch(/à confirmer/);
    }
  });
  it('les majorations ne sont jamais proposées avec une séance POD', () => {
    for (const c of ['MAJ-NUIT', 'MAJ-DIMANCHE'])
      expect(ref.actes.find((a) => a.code === c).note).toMatch(/Jamais sur une séance POD/);
  });
});

describe('remboursement : parts calculées sur la base, au centime, comme dans le document', () => {
  const { f } = monter();
  const ref = f.REFERENTIEL_ACTES_POD;
  const eur = (v) => Math.round(parseFloat(v.replace(',', '.')) * 100);
  it('Sécu 60 % : chaque acte reproduit les chiffres du document (arrondi au centime)', () => {
    let n = 0;
    for (const a of ref.actes) {
      const x = /Sécu 60 % : ([\d,]+) €/.exec(a.remboursement ?? '');
      if (!x) continue;
      expect(f._partsRemboursement(a.base_remboursable_cents, 'standard').secu, a.code).toBe(
        eur(x[1])
      );
      n++;
    }
    expect(n).toBe(19);
  });
  it('ticket modérateur (reste) = base − Sécu : mutuelle du document', () => {
    for (const a of ref.actes) {
      const x = /mutuelle 40 % : ([\d,]+) €/.exec(a.remboursement ?? '');
      if (!x) continue;
      expect(f._partsRemboursement(a.base_remboursable_cents, 'standard').resteTM, a.code).toBe(
        eur(x[1])
      );
    }
  });
  it('100 % en ALD pour les actes POD : 20,10 / 30,00 / 35,10 €, reste 0', () => {
    for (const [code, ald] of [
      ['POD-0,67', 2010],
      ['POD-1', 3000],
      ['POD-1,17', 3510],
    ]) {
      const a = ref.actes.find((x) => x.code === code);
      expect(f._partsRemboursement(a.base_remboursable_cents, 'ald')).toMatchObject({
        secu: ald,
        resteTM: 0,
      });
    }
  });
  it('Alsace-Moselle 90 %, arrondi : 19,97 € → 17,97 € (1 797 centimes)', () => {
    expect(f._partsRemboursement(1997, 'alsace_moselle')).toMatchObject({
      secu: 1797,
      resteTM: 200,
    });
  });
  it('semelles : la Sécu se calcule sur la base LPP de la paire, pas sur un prix de vente', () => {
    expect(f._partsRemboursement(2804, 'standard')).toMatchObject({ secu: 1682, resteTM: 1122 });
  });
  it('sans base, base invalide ou régime inconnu : null (jamais de calcul inventé)', () => {
    for (const b of [null, undefined, -1, 1.5, '30'])
      expect(f._partsRemboursement(b, 'standard'), String(b)).toBeNull();
    expect(f._partsRemboursement(3000, 'inconnu')).toBeNull();
    expect(f._partsRemboursement(0, 'standard')).toMatchObject({ secu: 0, resteTM: 0 });
  });
  it('base ≤ montant, sans franchise pour les semelles, aucune base pour frais et majorations', () => {
    for (const a of ref.actes) {
      if (a.base_remboursable_cents != null)
        expect(a.base_remboursable_cents, a.code).toBeLessThanOrEqual(a.montant_cents);
      expect(a.franchise === false, a.code).toBe(a.code.startsWith('LPP-'));
      if (/^(FRAIS|MAJ|TEL)-/.test(a.code))
        expect(a.base_remboursable_cents, a.code).toBeUndefined();
    }
  });
  it('validation : base facultative, invalide refusée, franchise par défaut', () => {
    expect(
      f._validerActe({ libelle: 'A', montant: '10', base: '' }).acte.base_remboursable_cents
    ).toBeNull();
    expect(
      f._validerActe({ libelle: 'A', montant: '10', base: '8,5' }).acte.base_remboursable_cents
    ).toBe(850);
    expect(f._validerActe({ libelle: 'A', montant: '10', base: 'x' }).ok).toBe(false);
    expect(f._validerActe({ libelle: 'A', montant: '10', franchise: false }).acte.franchise).toBe(
      false
    );
  });
});

describe('import du référentiel : idempotent, jamais destructif', () => {
  const { f } = monter();
  const ref = f.REFERENTIEL_ACTES_POD;
  it('catalogue vide : tout est importé, daté et sourcé, non personnalisé', () => {
    const r = f._actesAImporter([], ref);
    expect(r).toHaveLength(ref.actes.length);
    for (const a of r) {
      expect(a).toMatchObject({
        perso: false,
        actif: true,
        source: ref.source,
      });
      expect(a.date_effet).toBe(ref.actes.find((x) => x.code === a.code).date_effet || ref.version);
    }
  });
  it('un acte déjà présent (même modifié) est ignoré : jamais écrasé', () => {
    const r = f._actesAImporter([{ code: 'POD-1', montant_cents: 3100 }, { code: null }], ref);
    expect(r.map((a) => a.code)).not.toContain('POD-1');
    expect(r).toHaveLength(ref.actes.length - 1);
  });
  it('tout présent : rien à importer', () => {
    expect(f._actesAImporter(ref.actes, ref)).toEqual([]);
  });
  it('importerReferentielActes : un seul POST des seuls actes absents ; message si déjà fait', async () => {
    const ref = monter().f.REFERENTIEL_ACTES_POD;
    const e = monter({ lignes: [{ id: '1', code: 'POD-1' }] });
    await e.f.importerReferentielActes();
    const post = e.appels.filter((a) => a.methode === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0].corps).toHaveLength(ref.actes.length - 1);
    expect(post[0].corps.map((a) => a.code)).not.toContain('POD-1');
    const e2 = monter({
      lignes: ref.actes.map((a, i) => ({
        id: String(i),
        code: a.code,
        base_remboursable_cents: a.base_remboursable_cents ?? null,
      })),
    });
    await e2.f.importerReferentielActes();
    expect(e2.appels.filter((a) => a.methode === 'POST')).toHaveLength(0);
    expect(e2.alertes[0]).toMatch(/déjà/);
  });
  it('échec réseau : message clair, aucune écriture supposée', async () => {
    const e = monter({ echec: true });
    await e.f.importerReferentielActes();
    expect(e.appels.every((a) => a.methode === 'GET')).toBe(true);
    expect(e.alertes[0]).toMatch(/Rien n'a été modifié/);
  });
});

describe("enregistrement, modification et désactivation d'un acte", () => {
  const saisie = (o) => ({
    'acte-libelle': champ(o.libelle),
    'acte-montant': champ(o.montant),
    'acte-cotation': champ(o.cotation || ''),
    'acte-remboursement': champ(''),
    'acte-note': champ(''),
  });
  it('création : POST perso = true, montant en centimes, jamais de user_id envoyé', async () => {
    const e = monter({ champs: saisie({ libelle: 'Consultation', montant: '45,50' }) });
    await e.f.enregistrerActe();
    const post = e.appels.find((a) => a.methode === 'POST');
    expect(post.corps).toMatchObject({
      libelle: 'Consultation',
      montant_cents: 4550,
      perso: true,
      actif: true,
    });
    expect(post.corps).not.toHaveProperty('user_id');
  });
  it('saisie invalide : alerte, aucun appel réseau', async () => {
    const e = monter({ champs: saisie({ libelle: 'X', montant: 'abc' }) });
    await e.f.enregistrerActe();
    expect(e.appels).toHaveLength(0);
    expect(e.alertes[0]).toMatch(/Montant invalide/);
  });
  it('modification : PATCH ciblé par id, sans changer perso ni user_id', async () => {
    const champs = saisie({ libelle: 'Séance', montant: '' });
    const e = monter({
      lignes: [
        {
          id: 'a-1',
          code: 'POD-1',
          libelle: 'Séance',
          montant_cents: 3000,
          perso: false,
          actif: true,
        },
      ],
      champs,
    });
    await e.f.chargerActes();
    e.f.modifierActe('a-1');
    expect(champs['acte-montant'].value).toBe('30,00'); // formulaire prérempli
    champs['acte-montant'].value = '31';
    expect(e.f.edition()).toBe('a-1');
    await e.f.enregistrerActe();
    const p = e.appels.find((a) => a.methode === 'PATCH');
    expect(p.url).toMatch(/\?id=eq\.a-1$/);
    expect(p.corps.montant_cents).toBe(3100);
    expect(p.corps).not.toHaveProperty('perso');
    expect(p.corps).not.toHaveProperty('user_id');
    expect(e.f.edition()).toBeNull();
  });
  it('désactivation : PATCH { actif: false } et jamais de DELETE', async () => {
    const e = monter({ lignes: [{ id: 'a-2', libelle: 'X', montant_cents: 100, actif: true }] });
    await e.f.chargerActes();
    await e.f.basculerActeActif('a-2');
    expect(e.appels.find((a) => a.methode === 'PATCH').corps).toEqual({ actif: false });
    expect(e.appels.some((a) => a.methode === 'DELETE')).toBe(false);
  });
  it("l'affichage échappe le HTML (aucune injection par un titre d'acte)", () => {
    expect(fonction('_htmlLigneActe')).toContain('_escHtml(a.libelle)');
    expect(fonction('_htmlLigneActe')).toContain('_escHtml(a.id)');
  });
});

describe('complétion des actes importés avant l’ajout de la base remboursable', () => {
  const { f } = monter();
  const ref = f.REFERENTIEL_ACTES_POD;
  it('complète UNIQUEMENT base et franchise, jamais montant ni titre', () => {
    const r = f._actesACompleter(
      [{ id: 'a', code: 'POD-1', montant_cents: 3100, libelle: 'Modifié' }],
      ref
    );
    expect(r).toEqual([{ id: 'a', champs: { base_remboursable_cents: 3000, franchise: true } }]);
  });
  it("montant d'une version antérieure du référentiel (20,00 → 20,10 ; 35,00 → 35,10) corrigé ; montant choisi par le praticien jamais changé", () => {
    const r = f._actesACompleter(
      [
        { id: 'a', code: 'POD-0,67', montant_cents: 2000, base_remboursable_cents: 2010 },
        {
          id: 'b',
          code: 'POD-1,17',
          montant_cents: 3500,
          base_remboursable_cents: 3510,
          libelle: 'Mon titre',
        },
        { id: 'c', code: 'POD-0,67', montant_cents: 2500, base_remboursable_cents: 2010 },
        { id: 'd', code: 'POD-1', montant_cents: 3000, base_remboursable_cents: 3000 },
      ],
      ref
    );
    expect(r).toEqual([
      { id: 'a', champs: { montant_cents: 2010 } },
      { id: 'b', champs: { montant_cents: 3510 } },
    ]);
  });
  it('semelle : franchise false ; déjà renseigné, personnalisé, frais ou inconnu : ignorés', () => {
    expect(f._actesACompleter([{ id: 'l', code: 'LPP-2122121' }], ref)[0].champs).toEqual({
      base_remboursable_cents: 2804,
      franchise: false,
    });
    const ignores = [
      { id: '1', code: 'POD-1', base_remboursable_cents: 2500 },
      { id: '2', code: 'POD-1', perso: true },
      { id: '3', code: 'FRAIS-IFD' },
      { id: '4', code: 'INCONNU' },
      { id: '5', code: null },
    ];
    expect(f._actesACompleter(ignores, ref)).toEqual([]);
  });
  it('importerReferentielActes : PATCH ciblés (id) pour compléter, POST pour les absents', async () => {
    const e = monter({ lignes: [{ id: 'a-9', code: 'POD-1', montant_cents: 3000 }] });
    await e.f.importerReferentielActes();
    const patchs = e.appels.filter((a) => a.methode === 'PATCH');
    expect(patchs).toHaveLength(1);
    expect(patchs[0].url).toMatch(/\?id=eq\.a-9$/);
    expect(Object.keys(patchs[0].corps).sort()).toEqual(['base_remboursable_cents', 'franchise']);
    expect(e.appels.filter((a) => a.methode === 'POST')).toHaveLength(1);
  });
});

describe('migration SQL et branchement', () => {
  const sql = readFileSync(join(RACINE, 'supabase/migrations/actes-catalogue.sql'), 'utf8');
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');
  it('RLS activée, 3 policies « propriétaire », aucune policy DELETE, anon révoqué', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    for (const op of ['SELECT', 'INSERT', 'UPDATE'])
      expect(sql).toMatch(new RegExp(`FOR ${op} TO authenticated`));
    expect(sql).not.toMatch(/FOR DELETE/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE/);
    expect(sql).toMatch(/REVOKE ALL ON public\.actes_catalogue FROM anon/);
  });
  it('montant en entier borné, propriétaire immuable, search_path figé, index unique par code', () => {
    expect(sql).toMatch(
      /montant_cents integer NOT NULL CHECK \(montant_cents BETWEEN 0 AND 10000000\)/
    );
    expect(sql).toContain('NEW.user_id := OLD.user_id');
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(/UNIQUE INDEX[\s\S]*\(user_id, code\) WHERE code IS NOT NULL/);
  });
  it("page, onglet « Facturation » à côté d'Agenda (ouvert à tous les praticiens, hors Paramètres) et ouverture de la page", () => {
    expect(html).toContain('id="pg-actes"');
    expect(html).toContain('onclick="nav(\'pg-actes\')"');
    expect(fonction('nav')).toContain("id === 'pg-actes'");
    expect(fonction('nav')).toContain('renderActesPage()');
  });
  it('le plafond JS est celui du SQL', () => {
    expect(SRC_BIOMECA).toContain('ACTE_MONTANT_MAX_CENTS = 10000000');
  });
});

describe('catégories, acte de référence, prise en charge (lot C1)', () => {
  const REF = [
    {
      id: 'r1',
      code: 'POD-1',
      libelle: 'Séance',
      cotation: 'POD 1',
      montant_cents: 3000,
      base_remboursable_cents: 3000,
      franchise: true,
      perso: false,
      actif: true,
    },
    {
      id: 'r2',
      code: 'LPP-1',
      libelle: 'Semelles',
      cotation: 'LPP 1',
      montant_cents: 5000,
      base_remboursable_cents: 2804,
      franchise: false,
      perso: false,
      actif: true,
    },
    { id: 'p1', code: null, libelle: 'Mon acte', montant_cents: 4000, perso: true, actif: true },
  ];
  it('catégorie : perso à part, préfixe du code sinon, « autre » par défaut', () => {
    const { f } = monter();
    expect(f._categorieActe(REF[0])).toBe('POD');
    expect(f._categorieActe(REF[1])).toBe('LPP');
    expect(f._categorieActe(REF[2])).toBe('perso');
    expect(f._categorieActe({ code: 'XYZ-1', perso: false })).toBe('autre');
    expect(f._categorieActe({ code: null, perso: false })).toBe('autre');
  });
  it("l'acte exact choisi reprend cotation, base, franchise ; prise en charge Sécu par défaut", async () => {
    const champs = {
      'acte-cotation': champ(''),
      'acte-remboursement': champ(''),
      'acte-base': champ(''),
      'acte-franchise': { checked: true },
      'acte-regime': champ(''),
    };
    const e = monter({ lignes: REF, champs });
    await e.f.chargerActes();
    e.f.choisirActeReference('LPP-1');
    expect(champs['acte-cotation'].value).toBe('LPP 1');
    expect(champs['acte-base'].value).toBe('28,04');
    expect(champs['acte-franchise'].checked).toBe(false);
    expect(champs['acte-regime'].value).toBe('standard');
  });
  it('enregistrement : référence, prise en charge et Doctolib envoyés ; valeur inconnue refusée', async () => {
    const champs = {
      'acte-libelle': champ('Séance cabinet'),
      'acte-montant': champ('35'),
      'acte-cotation': champ(''),
      'acte-remboursement': champ(''),
      'acte-note': champ(''),
      'acte-reference': champ('POD-1'),
      'acte-regime': champ('c2s'),
      'acte-sync-doctolib': { checked: true },
    };
    const e = monter({ champs });
    await e.f.enregistrerActe();
    expect(e.appels.find((a) => a.methode === 'POST').corps).toMatchObject({
      acte_reference: 'POD-1',
      regime_defaut: 'c2s',
      sync_doctolib: true,
      perso: true,
    });
    expect(
      e.f._validerActe({ libelle: 'A', montant: '1', regime: 'pirate' }).acte.regime_defaut
    ).toBeNull();
  });
  it('C2S / CMU : 100 % de la base', () => {
    const { f } = monter();
    expect(f.REGIMES_REMBOURSEMENT.c2s.taux).toBe(100);
    expect(f._partsRemboursement(2804, 'c2s').secu).toBe(2804);
  });
});
