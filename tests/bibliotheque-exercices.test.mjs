// Bibliothèque d'exercices (lot e, étape 1). Fonctions extraites de js/biomeca.js ; réseau simulé ; données FICTIVES.
import { describe, it, expect } from 'vitest';
import { fonction, SRC_BIOMECA } from './helpers/extraire-biomeca.mjs';

const constanteBloc = (debut, fin) => {
  const i = SRC_BIOMECA.indexOf(debut);
  return SRC_BIOMECA.slice(i, SRC_BIOMECA.indexOf(fin, i) + fin.length);
};
const FICHES = constanteBloc('const FICHES_SYSTEMES = {', '\n};\n');
const PIED = constanteBloc('const EXERCICES_PIED_ENFANT = [', '\n];\n');
const EXO_RE = SRC_BIOMECA.slice(
  SRC_BIOMECA.indexOf('const EXO_LIEN_RE'),
  SRC_BIOMECA.indexOf('\n', SRC_BIOMECA.indexOf('const EXO_LIEN_RE')) + 1
);

function monter(o = {}) {
  const appels = [];
  const alertes = [];
  const ouvertures = [];
  const champs = o.champs || {};
  const authFetch = async (url, options = {}) => {
    appels.push({
      url,
      methode: options.method || 'GET',
      corps:
        options.body && typeof options.body === 'string' ? JSON.parse(options.body) : options.body,
    });
    if (o.refuserDelete && (options.method || 'GET') === 'DELETE')
      return { ok: false, status: 403, json: async () => [] };
    if (o.echec) return { ok: false, status: 500, json: async () => [] };
    return { ok: true, status: 200, json: async () => (o.reponse ? o.reponse(url) : []) };
  };
  const document = {
    getElementById: (id) => (id in champs ? champs[id] : { value: '', files: [] }),
  };
  const corps = [
    'const SUPA_URL = "https://x.supabase.co"; const VERTICY_ADMIN_EMAIL = "contact@verticy.fr";',
    'let pwaUser = { id: "u1" }; const loadPwaSession = () => ({ user: { email: __email } });',
    'const _escHtml = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");',
    'const crypto = { randomUUID: () => "uuid-1" };',
    FICHES,
    PIED,
    EXO_RE,
    'const EXO_PDF_MAX_OCTETS = 10 * 1024 * 1024;',
    'let _exoEtat = { base: [], baseAdmin: { cats: [], exos: [] }, persoCats: [], perso: [] }; const _exoJson = { "Content-Type": "application/json", "Prefer": "return=minimal" };',
    ...[
      '_exoLienValide',
      '_exoLiensDepuisTexte',
      '_exoEstAdmin',
      '_exoBaseDepuisFiches',
      '_exoRequete',
      'chargerExercices',
      'exercicesImporterBase',
      'exercicesCreerExercice',
      '_exoDeposerPdf',
      'exercicesCreerCategorie',
      '_exoCheminPdfBase',
      'exercicesOuvrirPdfBase',
      'exercicesSupprimerPerso',
      '_exoHtmlPerso',
      '_exoHtmlNomsBase',
      '_exoHtmlBase',
      'renderExercicesPage',
    ].map(fonction),
    'return { _exoLienValide, _exoLiensDepuisTexte, _exoEstAdmin, _exoBaseDepuisFiches, chargerExercices, exercicesImporterBase, exercicesCreerExercice, exercicesCreerCategorie, _exoCheminPdfBase, exercicesOuvrirPdfBase, exercicesSupprimerPerso, _exoHtmlPerso, _exoHtmlNomsBase, _exoHtmlBase, etat: () => _exoEtat };',
  ].join('\n');
  // eslint-disable-next-line no-new-func -- extraction contrôlée de code du dépôt
  const f = new Function('authFetch', 'document', 'alert', '__email', 'confirm', 'window', corps)(
    authFetch,
    document,
    (m) => alertes.push(m),
    o.email || 'a@exemple.invalid',
    () => o.confirmer !== false,
    { open: (u) => ouvertures.push(u) }
  );
  return { f, appels, alertes, ouvertures };
}

describe('liens YouTube', () => {
  const { f } = monter();
  it.each([
    '',
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://youtu.be/abcdefghijk',
    'https://www.youtube.com/shorts/abcdefghijk',
    'https://youtu.be/abcdefghijk?t=5',
  ])('« %s » accepté', (v) => expect(f._exoLienValide(v)).toBe(true));
  it.each([
    'http://youtu.be/abcdefghijk',
    'https://evil.example/watch?v=abcdefghijk',
    'javascript:alert(1)',
    'https://youtube.com.evil.io/watch?v=abcdefghijk',
    'https://youtu.be/court',
  ])('« %s » refusé', (v) => expect(f._exoLienValide(v)).toBe(false));
});

describe('plusieurs liens par exercice', () => {
  const { f } = monter();
  it('un lien par ligne, lignes vides ignorées, ordre conservé', () => {
    expect(
      f._exoLiensDepuisTexte('https://youtu.be/abcdefghijk\n\n  https://youtu.be/bcdefghijkl  \r\n')
    ).toEqual({
      ok: true,
      liens: ['https://youtu.be/abcdefghijk', 'https://youtu.be/bcdefghijkl'],
    });
    expect(f._exoLiensDepuisTexte('')).toEqual({ ok: true, liens: [] });
  });
  it('un seul lien faux, ou plus de 20 liens : tout est refusé', () => {
    expect(f._exoLiensDepuisTexte('https://youtu.be/abcdefghijk\nhttp://pirate.io').ok).toBe(false);
    expect(
      f._exoLiensDepuisTexte(Array(21).fill('https://youtu.be/abcdefghijk').join('\n')).ok
    ).toBe(false);
    expect(
      f._exoLiensDepuisTexte(Array(20).fill('https://youtu.be/abcdefghijk').join('\n')).ok
    ).toBe(true);
  });
});

describe('base issue des fiches existantes', () => {
  it('15 catégories, 56 fiches + 12 exercices du pied, codes uniques, chemins PDF conformes', () => {
    const { cats, exos } = monter().f._exoBaseDepuisFiches();
    expect(cats).toHaveLength(15);
    expect(exos).toHaveLength(56 + 12);
    expect(new Set(exos.map((e) => e.code)).size).toBe(68);
    expect(
      exos
        .filter((e) => e.pdf_fichier)
        .every(
          (e) =>
            e.pdf_fichier.startsWith('assets/fiches/' + e.categorie_code + '/') &&
            e.pdf_fichier.endsWith('.pdf')
        )
    ).toBe(true);
    expect(exos.filter((e) => !e.pdf_fichier)).toHaveLength(12); // les 12 exercices du pied
    expect(
      exos.filter((e) => !e.pdf_fichier).every((e) => e.code.startsWith('reeduc-pied|pied-enfant|'))
    ).toBe(true);
    expect(exos[0].libelle).not.toMatch(/^\d+\./);
  });
  it("l'administrateur seul voit la base", () => {
    expect(monter({ email: 'Contact@Verticy.fr' }).f._exoEstAdmin()).toBe(true);
    expect(monter({ email: 'a@exemple.invalid' }).f._exoEstAdmin()).toBe(false);
  });
});

describe('création côté praticien', () => {
  const champs = (o) => ({
    'exo-libelle': { value: o.libelle ?? '' },
    'exo-lien': { value: o.lien ?? '' },
    'exo-texte': { value: o.texte ?? '' },
    'exo-cat': { value: o.cat ?? '' },
    'exo-pdf': { files: o.pdf ? [o.pdf] : [] },
  });
  it('refuse sans nom, sans catégorie, avec un lien invalide : aucun appel réseau', async () => {
    for (const c of [
      { libelle: '', cat: 'perso:c1' },
      { libelle: 'X', cat: '' },
      { libelle: 'X', cat: 'perso:c1', lien: 'http://x.io' },
    ]) {
      const e = monter({ champs: champs(c) });
      await e.f.exercicesCreerExercice();
      expect(e.appels).toHaveLength(0);
      expect(e.alertes).toHaveLength(1);
    }
  });
  it('catégorie de base ou personnelle ; jamais user_id envoyé', async () => {
    let e = monter({
      champs: champs({
        libelle: 'Mon exo',
        cat: 'base:b1',
        lien: 'https://youtu.be/abcdefghijk',
        texte: 'Consigne',
      }),
    });
    await e.f.exercicesCreerExercice();
    const post = e.appels.find((a) => a.methode === 'POST' && /exercices_perso\b/.test(a.url));
    expect(post.corps).toEqual({
      libelle: 'Mon exo',
      liens_youtube: ['https://youtu.be/abcdefghijk'],
      texte: 'Consigne',
      categorie_base_id: 'b1',
    });
    e = monter({ champs: champs({ libelle: 'Autre', cat: 'perso:c9' }) });
    await e.f.exercicesCreerExercice();
    expect(e.appels.find((a) => a.methode === 'POST').corps).toMatchObject({
      categorie_perso_id: 'c9',
    });
  });
  it('PDF : type et taille contrôlés, dépôt dans le dossier du praticien', async () => {
    let e = monter({
      champs: champs({ libelle: 'X', cat: 'perso:c1', pdf: { type: 'image/png', size: 10 } }),
    });
    await e.f.exercicesCreerExercice();
    expect(e.appels).toHaveLength(0);
    e = monter({
      champs: champs({
        libelle: 'X',
        cat: 'perso:c1',
        pdf: { type: 'application/pdf', size: 11 * 1024 * 1024 },
      }),
    });
    await e.f.exercicesCreerExercice();
    expect(e.appels).toHaveLength(0);
    e = monter({
      champs: champs({
        libelle: 'X',
        cat: 'perso:c1',
        pdf: { type: 'application/pdf', size: 100 },
      }),
    });
    await e.f.exercicesCreerExercice();
    expect(e.appels[0].url).toBe(
      'https://x.supabase.co/storage/v1/object/exercices-pdf/u1/uuid-1.pdf'
    );
    expect(e.appels[1].corps).toMatchObject({ pdf_chemin: 'u1/uuid-1.pdf' });
  });
});

describe('affichage', () => {
  it('le praticien ne voit jamais lien ni texte de la base, seulement des pastilles', async () => {
    const base = [
      {
        categorie_id: 'b1',
        categorie_libelle: 'Visuel',
        exercice_id: 'e1',
        libelle: 'Fixation',
        a_video: true,
        a_pdf: true,
        a_texte: false,
      },
    ];
    const e = monter({ reponse: (u) => (u.includes('rpc/exercices_base_liste') ? base : []) });
    await e.f.chargerExercices();
    const html = e.f._exoHtmlNomsBase();
    expect(html).toContain('Fixation');
    expect(html).toContain('🎬');
    expect(html).not.toMatch(/youtube|liens_youtube/i);
    expect(e.appels.some((a) => /exercices_base(\?|_categories)/.test(a.url))).toBe(false); // pas de lecture directe
  });
  it("l'administrateur charge aussi la base complète ; le texte est échappé", async () => {
    const e = monter({
      email: 'contact@verticy.fr',
      reponse: (u) =>
        u.includes('exercices_base?')
          ? [
              {
                id: 'x',
                categorie_id: 'c',
                libelle: '<b>Hack</b>',
                liens_youtube: [],
                texte: '"><script>',
              },
            ]
          : u.includes('exercices_base_categories')
            ? [{ id: 'c', libelle: 'Cat', bilans: ['sport'] }]
            : [],
    });
    await e.f.chargerExercices();
    const html = e.f._exoHtmlBase();
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Hack');
  });
  it('import : insère catégories puis exercices sans écraser (ignore-duplicates)', async () => {
    const e = monter({
      email: 'contact@verticy.fr',
      reponse: (u) => (u.includes('select=id,code') ? [{ id: 'c1', code: 'systeme-visuel' }] : []),
    });
    await e.f.exercicesImporterBase();
    const posts = e.appels.filter((a) => a.methode === 'POST' && !a.url.includes('rpc'));
    expect(posts.every((p) => p.url.includes('on_conflict=code'))).toBe(true);
    expect(posts).toHaveLength(2);
  });
});

describe('fiches PDF de la base et suppression', () => {
  it('chemin PDF reconstruit et contrôlé : jamais un chemin libre', () => {
    const { f } = monter();
    expect(f._exoCheminPdfBase('systeme-visuel|2. Rééducation problème de fixation')).toBe(
      encodeURI('assets/fiches/systeme-visuel/2. Rééducation problème de fixation.pdf')
    );
    expect(f._exoCheminPdfBase('reeduc-pied|pied-enfant|short-foot')).toBeNull();
    expect(f._exoCheminPdfBase('../../etc|passwd')).toBeNull();
    expect(f._exoCheminPdfBase('systeme-visuel|../../x')).toBeNull();
    expect(f._exoCheminPdfBase('')).toBeNull();
  });
  it('ouvre la fiche dans un nouvel onglet ; message si aucune fiche', () => {
    const e = monter();
    e.f.exercicesOuvrirPdfBase('systeme-visuel|2. Rééducation problème de fixation');
    expect(e.ouvertures).toHaveLength(1);
    expect(e.ouvertures[0]).toMatch(/^assets\/fiches\/systeme-visuel\/.*\.pdf$/);
    e.f.exercicesOuvrirPdfBase('reeduc-pied|pied-enfant|short-foot');
    expect(e.ouvertures).toHaveLength(1);
    expect(e.alertes).toHaveLength(1);
  });
  it('le praticien voit le bouton « Ouvrir la fiche » seulement pour les exercices à fiche', async () => {
    const base = [
      {
        categorie_id: 'b1',
        categorie_libelle: 'Visuel',
        exercice_id: 'e1',
        exercice_code: 'systeme-visuel|2. Rééducation problème de fixation',
        libelle: 'Fixation',
        a_video: true,
        a_pdf: true,
        a_texte: false,
      },
      {
        categorie_id: 'b1',
        categorie_libelle: 'Visuel',
        exercice_id: 'e2',
        exercice_code: 'reeduc-pied|pied-enfant|short-foot',
        libelle: 'Short foot',
        a_video: true,
        a_pdf: false,
        a_texte: false,
      },
    ];
    const e = monter({ reponse: (u) => (u.includes('rpc/exercices_base_liste') ? base : []) });
    await e.f.chargerExercices();
    const html = e.f._exoHtmlNomsBase();
    expect(html.match(/Ouvrir la fiche/g)).toHaveLength(1);
    expect(html).not.toMatch(/youtube/i);
  });
  it('suppression : confirmation obligatoire, ligne puis PDF ; annulée = aucun appel', async () => {
    const perso = [
      { id: 'p1', libelle: 'Mon exo', pdf_chemin: 'u1/uuid-1.pdf', actif: true, liens_youtube: [] },
    ];
    const rep = (u) => (u.includes('exercices_perso?select') ? perso : []);
    let e = monter({ reponse: rep, confirmer: false });
    await e.f.chargerExercices();
    await e.f.exercicesSupprimerPerso('p1');
    expect(e.appels.some((a) => a.methode === 'DELETE')).toBe(false);
    e = monter({ reponse: rep });
    await e.f.chargerExercices();
    await e.f.exercicesSupprimerPerso('p1');
    const dels = e.appels.filter((a) => a.methode === 'DELETE');
    expect(dels[0].url).toMatch(/exercices_perso\?id=eq\.p1$/);
    expect(dels[1].url).toMatch(/storage\/v1\/object\/exercices-pdf$/);
    expect(dels[1].corps).toEqual({ prefixes: ['u1/uuid-1.pdf'] });
  });
  it("refus du serveur sur la ligne : le PDF n'est pas supprimé et un message s'affiche", async () => {
    const perso = [
      { id: 'p1', libelle: 'Mon exo', pdf_chemin: 'u1/uuid-1.pdf', actif: true, liens_youtube: [] },
    ];
    const e = monter({
      reponse: (u) => (u.includes('exercices_perso?select') ? perso : []),
      refuserDelete: true,
    });
    await e.f.chargerExercices();
    await e.f.exercicesSupprimerPerso('p1');
    const dels = e.appels.filter((a) => a.methode === 'DELETE');
    expect(dels).toHaveLength(1);
    expect(dels[0].url).toMatch(/exercices_perso\?id=/);
    expect(e.alertes[0]).toMatch(/Suppression impossible/);
  });
});
