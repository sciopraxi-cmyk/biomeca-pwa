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
  '_actesRequete',
  'chargerActes',
  'importerReferentielActes',
  'enregistrerActe',
  'basculerActeActif',
  'modifierActe',
  'annulerEditionActe',
  'renderActesPage',
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
    ...NOMS.map(fonction),
    `return { ${NOMS.join(', ')}, REFERENTIEL_ACTES_POD, cache: () => _actesCache, edition: () => _acteEnEdition };`,
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
        cotation: null,
        remboursement: null,
        note: null,
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
    for (const a of ref.actes) {
      expect(Number.isInteger(a.montant_cents), a.code).toBe(true);
      const [lettre, coef] = [
        a.cotation.split(' ')[0],
        parseFloat(a.cotation.split(' ')[1].replace(',', '.')),
      ];
      const base = { POD: 3000, AMP: 63 }[lettre];
      expect(Math.abs(a.montant_cents - coef * base), a.code).toBeLessThanOrEqual(15);
    }
  });
  it('les 3 cotations POD de la fiche du 19/10/2026', () => {
    const m = Object.fromEntries(ref.actes.map((a) => [a.code, a.montant_cents]));
    expect(m['POD-0,67']).toBe(2000);
    expect(m['POD-1']).toBe(3000);
    expect(m['POD-1,17']).toBe(3500);
  });
  it('un tarif de source secondaire est signalé « à confirmer »', () => {
    expect(ref.actes.find((a) => a.code === 'AMP-31,7').note).toMatch(/à confirmer/);
  });
  it('aucun tarif LPP de semelle (ambigus : unité ou paire) ni majoration', () => {
    expect(JSON.stringify(ref)).not.toMatch(/LPP|semelle|nuit|dimanche/i);
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
        date_effet: ref.version,
        source: ref.source,
      });
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
    const e = monter({ lignes: [{ id: '1', code: 'POD-1' }] });
    await e.f.importerReferentielActes();
    const post = e.appels.filter((a) => a.methode === 'POST');
    expect(post).toHaveLength(1);
    expect(post[0].corps.map((a) => a.code)).toEqual(['POD-0,67', 'POD-1,17', 'AMP-31,7']);
    const e2 = monter({ lignes: ref.actes.map((a, i) => ({ id: String(i), code: a.code })) });
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
    expect(fonction('renderActesPage')).toContain('_escHtml(a.libelle)');
    expect(fonction('renderActesPage')).toContain('_escHtml(a.id)');
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
  it('page, accès depuis Paramètres et ouverture de la page', () => {
    expect(html).toContain('id="pg-actes"');
    expect(html).toContain('onclick="nav(\'pg-actes\')"');
    expect(fonction('nav')).toContain("id === 'pg-actes'");
    expect(fonction('nav')).toContain('renderActesPage()');
  });
  it('le plafond JS est celui du SQL', () => {
    expect(SRC_BIOMECA).toContain('ACTE_MONTANT_MAX_CENTS = 10000000');
  });
});
