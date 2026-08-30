import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// #132 — extraction par marqueurs et gardes anti-succès-vacant mises en
// commun : #243 en a besoin à son tour, et les recopier aurait été résoudre
// une duplication en en créant une autre.
import { extraireBloc, fabriquer, TAILLE_PLANCHER, RACINE } from './helpers/mirror-diff.mjs';
import {
  scrubText,
  scrubUrl,
  scrubValue,
  scrubTitleAttr,
  scrubBreadcrumb,
  isExtensionEvent,
  scrubEvent,
  pgrestErrorCode,
  NIVEAUX_CONSOLE_GARDES,
  MASQUE_EMAIL,
  MASQUE_UUID,
  MASQUE_TITRE,
  MASQUE_QUERY,
  MASQUE_FRAGMENT,
} from '../js/sentry-scrub.mjs';

// ═══════════════════════════════════════════════════════════════════
// #47 — aucune donnée de santé ni personnelle vers Sentry
// ═══════════════════════════════════════════════════════════════════
//
// Obligation du contrat HDS (matrice de responsabilités, point 4).
//
// Ce fichier couvre DEUX choses distinctes :
//   1. le comportement du miroir js/sentry-scrub.mjs (tests unitaires) ;
//   2. la NON-DIVERGENCE de ses deux copies runtime — l'inline d'index.html
//      et _pgrestErrorCode de js/biomeca.js — par test différentiel.
//
// Le point 2 remplace un commentaire « répercuter dans les deux fichiers »
// que personne ne relit. Il compare des COMPORTEMENTS, pas du texte : une
// égalité de chaînes entre un fichier formaté par Prettier et un fichier
// qui ne l'est pas crierait en permanence pour de l'indentation, et un test
// qui crie tout le temps finit ignoré — pire que pas de test.

// Fixtures réalistes, calquées sur les fuites réelles de l'inventaire.
const EMAIL = 'dr.martin@cabinet-lyon.fr';
const UUID_USER = '3f9a1c22-7b4e-4d18-9a6f-2c8e1b5d0a37';
const UUID_PATIENT = '8c1d4e55-2a9b-4f70-b3c1-6d2e9a0f4b88';
const UUID_BILAN = '1b7e3d90-5c4a-42f8-8e11-9f0a2c6b7d34';
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzZjlhIn0.7Hq2mXvLpQ';
const URL_POSTGREST = `https://xyz.supabase.co/rest/v1/user_data?email=eq.${encodeURIComponent(EMAIL)}&select=*`;
const URL_STORAGE = `https://xyz.supabase.co/storage/v1/object/sign/bilans/${UUID_USER}/${UUID_PATIENT}/posturo/${UUID_BILAN}/photo.jpg`;
const URL_RECOVERY = `https://sciopraxi-cmyk.github.io/biomeca-pwa/#access_token=${JWT}&type=recovery`;
const CLIC_AGENDA = 'div.cal-evchip[title="Durand Marie — contrôle semelles 14h30"]';
const CORPS_PGREST =
  '{"code":"23505","details":"Key (nom, prenom, ddn)=(Durand, Marie, 1981-03-04) already exists.","hint":null,"message":"duplicate key value violates unique constraint"}';

// ═══════════════════════════════════════════════════════════════════
// TABLE DE CAS PARTAGÉE
// ═══════════════════════════════════════════════════════════════════
//
// Une seule table sert aux tests unitaires ET aux tests différentiels : la
// couverture de la garde anti-dérive grandit donc avec celle des tests.
// `fn` nomme la fonction du miroir ; `inline` son homologue dans la copie
// d'index.html (null quand la copie ne la contient pas).
const TABLE_CAS = [
  {
    nom: 'e-mail dans un message',
    fn: 'scrubText',
    inline: '_vScrubText',
    args: [`échec pour ${EMAIL}`],
  },
  {
    nom: 'UUID dans un message',
    fn: 'scrubText',
    inline: '_vScrubText',
    args: [`bilan ${UUID_BILAN} absent`],
  },
  { nom: 'JWT dans un message', fn: 'scrubText', inline: '_vScrubText', args: [`token=${JWT}`] },
  {
    nom: 'rien à masquer',
    fn: 'scrubText',
    inline: '_vScrubText',
    args: ['TypeError in renderBilan()'],
  },
  { nom: 'chaîne vide', fn: 'scrubText', inline: '_vScrubText', args: [''] },
  { nom: 'valeur non-chaîne', fn: 'scrubText', inline: '_vScrubText', args: [42] },
  { nom: 'URL PostgREST ?email=eq.', fn: 'scrubUrl', inline: '_vScrubUrl', args: [URL_POSTGREST] },
  { nom: 'chemin Storage complet', fn: 'scrubUrl', inline: '_vScrubUrl', args: [URL_STORAGE] },
  { nom: 'fragment #access_token', fn: 'scrubUrl', inline: '_vScrubUrl', args: [URL_RECOVERY] },
  {
    nom: 'URL sans query ni fragment',
    fn: 'scrubUrl',
    inline: '_vScrubUrl',
    args: ['https://x.fr/rest/v1/ping'],
  },
  { nom: 'title agenda', fn: 'scrubTitleAttr', inline: '_vScrubTitleAttr', args: [CLIC_AGENDA] },
  {
    nom: 'objet imbriqué',
    fn: 'scrubValue',
    inline: '_vScrubValue',
    args: [{ a: { b: [EMAIL, UUID_USER] } }],
  },
  {
    nom: 'breadcrumb console log (écarté)',
    fn: 'scrubBreadcrumb',
    inline: '_vScrubBreadcrumb',
    args: [{ category: 'console', level: 'log', message: EMAIL }],
  },
  {
    nom: 'breadcrumb console warning (conservé)',
    fn: 'scrubBreadcrumb',
    inline: '_vScrubBreadcrumb',
    args: [{ category: 'console', level: 'warning', message: `sync échouée ${EMAIL}` }],
  },
  {
    nom: 'breadcrumb console error (conservé)',
    fn: 'scrubBreadcrumb',
    inline: '_vScrubBreadcrumb',
    args: [{ category: 'console', level: 'error', data: { arguments: [{ email: EMAIL }] } }],
  },
  {
    nom: 'breadcrumb fetch',
    fn: 'scrubBreadcrumb',
    inline: '_vScrubBreadcrumb',
    args: [{ category: 'fetch', level: 'info', data: { url: URL_STORAGE, status_code: 403 } }],
  },
  {
    nom: 'breadcrumb ui.click',
    fn: 'scrubBreadcrumb',
    inline: '_vScrubBreadcrumb',
    args: [{ category: 'ui.click', level: 'info', message: CLIC_AGENDA }],
  },
  {
    nom: 'événement extension',
    fn: 'isExtensionEvent',
    inline: '_vIsExtensionEvent',
    args: [
      {
        exception: {
          values: [{ stacktrace: { frames: [{ filename: 'chrome-extension://abc/x.js' }] } }],
        },
      },
    ],
  },
  {
    nom: 'événement complet',
    fn: 'scrubEvent',
    inline: '_vScrubEvent',
    args: [
      { message: `échec ${EMAIL}`, request: { url: URL_RECOVERY }, extra: { bilan: UUID_BILAN } },
    ],
  },
  { nom: 'corps PostgREST', fn: 'pgrestErrorCode', inline: null, args: [CORPS_PGREST] },
  { nom: 'corps non-JSON', fn: 'pgrestErrorCode', inline: null, args: ['<html>502</html>'] },
  { nom: 'corps vide', fn: 'pgrestErrorCode', inline: null, args: [''] },
];

const MIROIR = {
  scrubText,
  scrubUrl,
  scrubValue,
  scrubTitleAttr,
  scrubBreadcrumb,
  isExtensionEvent,
  scrubEvent,
  pgrestErrorCode,
};

const NOMS_INLINE = [
  '_vScrubText',
  '_vScrubUrl',
  '_vScrubValue',
  '_vScrubTitleAttr',
  '_vScrubBreadcrumb',
  '_vIsExtensionEvent',
  '_vScrubEvent',
];

// ═══════════════════════════════════════════════════════════════════
// 1. Tests unitaires du miroir
// ═══════════════════════════════════════════════════════════════════

describe('#47 scrubText / scrubUrl — masquage', () => {
  it('1. E-mail dans un message → masqué, le reste intact', () => {
    expect(scrubText(`saveToSupabase a échoué pour ${EMAIL} (statut 409)`)).toBe(
      `saveToSupabase a échoué pour ${MASQUE_EMAIL} (statut 409)`
    );
  });

  it('2. UUID dans une URL → masqué', () => {
    expect(scrubText(`/bilans/${UUID_BILAN}/photo`)).toBe(`/bilans/${MASQUE_UUID}/photo`);
  });

  it('3. Chaîne de requête ?email=eq. → retirée EN BLOC, marqueur laissé', () => {
    const r = scrubUrl(URL_POSTGREST);
    expect(r).toBe(`https://xyz.supabase.co/rest/v1/user_data?${MASQUE_QUERY}`);
    expect(r).not.toContain('cabinet-lyon');
    expect(r).not.toContain('%40');
  });

  it('4. Chemin Storage complet → les trois UUID masqués, le chemin reste lisible', () => {
    const r = scrubUrl(URL_STORAGE);
    expect(r).toBe(
      `https://xyz.supabase.co/storage/v1/object/sign/bilans/${MASQUE_UUID}/${MASQUE_UUID}/posturo/${MASQUE_UUID}/photo.jpg`
    );
    // Le type de bilan est conservé : il sert au diagnostic, il n'identifie personne.
    expect(r).toContain('posturo');
  });

  it('5. Fragment #access_token → retiré EN BLOC, jeton absent', () => {
    const r = scrubUrl(URL_RECOVERY);
    expect(r).toBe(`https://sciopraxi-cmyk.github.io/biomeca-pwa/#${MASQUE_FRAGMENT}`);
    expect(r).not.toContain('eyJ');
    expect(r).not.toContain('recovery');
  });

  it('6. Title d’agenda → masqué, le sélecteur reste identifiable', () => {
    const r = scrubTitleAttr(CLIC_AGENDA);
    expect(r).toBe(`div.cal-evchip[title="${MASQUE_TITRE}"]`);
    expect(r).not.toContain('Durand');
    // Reste reconnaissable comme un clic sur une pastille d'agenda.
    expect(r).toContain('cal-evchip');
  });

  it('7. Rien à masquer → message rendu STRICTEMENT inchangé', () => {
    // Un filtre qui écrase tout passerait les six cas précédents.
    const sain = 'TypeError: undefined is not a function in renderBilan() at line 42';
    expect(scrubText(sain)).toBe(sain);
    expect(scrubEvent({ message: sain }).message).toBe(sain);
    expect(scrubUrl('https://x.fr/rest/v1/ping')).toBe('https://x.fr/rest/v1/ping');
  });

  it('8. Types non-chaîne traversés sans transformation', () => {
    expect(scrubText(42)).toBe(42);
    expect(scrubText(null)).toBeNull();
    expect(scrubText(undefined)).toBeUndefined();
    expect(scrubUrl('')).toBe('');
  });
});

describe('#47 scrubBreadcrumb — niveaux console et catégories', () => {
  it("9. NIVEAUX_CONSOLE_GARDES vaut exactement ['error', 'warning']", () => {
    // ⚠️ Sentry normalise console.warn en 'warning', PAS 'warn'. Un tableau
    // contenant 'warn' laisserait tomber les avertissements de sync sans
    // que rien ne le signale.
    expect(NIVEAUX_CONSOLE_GARDES).toEqual(['error', 'warning']);
    expect(NIVEAUX_CONSOLE_GARDES).not.toContain('warn');
  });

  it('10. console.log → breadcrumb ÉCARTÉ (c’est lui qui portait l’e-mail)', () => {
    expect(scrubBreadcrumb({ category: 'console', level: 'log', message: EMAIL })).toBeNull();
    expect(scrubBreadcrumb({ category: 'console', level: 'info', message: EMAIL })).toBeNull();
    expect(scrubBreadcrumb({ category: 'console', level: 'debug', message: EMAIL })).toBeNull();
  });

  it("11. console.warn (niveau 'warning') → CONSERVÉ et nettoyé", () => {
    // Les avertissements de sync #102 Phase 2a sont des console.warn : ce
    // sont précisément les traces qui servent au diagnostic.
    const r = scrubBreadcrumb({
      category: 'console',
      level: 'warning',
      message: `[#102 Phase 2a] sync patients échouée (409) code 23505 pour ${EMAIL}`,
    });
    expect(r).not.toBeNull();
    expect(r.message).toContain('[#102 Phase 2a]');
    expect(r.message).toContain('23505');
    expect(r.message).toContain(MASQUE_EMAIL);
    expect(r.message).not.toContain('cabinet-lyon');
  });

  it('12. console.error → conservé, arguments nettoyés en profondeur', () => {
    const r = scrubBreadcrumb({
      category: 'console',
      level: 'error',
      data: { arguments: [{ userId: UUID_USER, email: EMAIL, patientsCount: 12 }] },
    });
    expect(r).not.toBeNull();
    expect(r.data.arguments[0].email).toBe(MASQUE_EMAIL);
    expect(r.data.arguments[0].userId).toBe(MASQUE_UUID);
    // Le compteur, non identifiant, sert au diagnostic : conservé tel quel.
    expect(r.data.arguments[0].patientsCount).toBe(12);
  });

  it('13. Breadcrumb fetch → URL nettoyée, code de statut conservé', () => {
    const r = scrubBreadcrumb({
      category: 'fetch',
      level: 'info',
      data: { url: URL_POSTGREST, status_code: 403, method: 'GET' },
    });
    expect(r.data.url).not.toContain('cabinet-lyon');
    expect(r.data.url).toContain(MASQUE_QUERY);
    expect(r.data.status_code).toBe(403);
    expect(r.data.method).toBe('GET');
  });

  it('14. Breadcrumb ui.click → title masqué, breadcrumb CONSERVÉ', () => {
    const r = scrubBreadcrumb({ category: 'ui.click', level: 'info', message: CLIC_AGENDA });
    expect(r).not.toBeNull();
    expect(r.message).toBe(`div.cal-evchip[title="${MASQUE_TITRE}"]`);
  });
});

describe('#47 scrubEvent — événement complet', () => {
  it('15. Événement d’extension → écarté', () => {
    const ev = {
      exception: {
        values: [{ stacktrace: { frames: [{ filename: 'moz-extension://abc/inject.js' }] } }],
      },
    };
    expect(scrubEvent(ev)).toBeNull();
  });

  it('16. request.url porteur du jeton → fragment retiré', () => {
    const r = scrubEvent({ message: 'boom', request: { url: URL_RECOVERY } });
    expect(r.request.url).not.toContain('eyJ');
    expect(r.request.url).toContain(MASQUE_FRAGMENT);
  });

  it('17. exception.value nettoyée, type et pile INTACTS', () => {
    const r = scrubEvent({
      exception: {
        values: [
          {
            type: 'TypeError',
            value: `échec sur ${EMAIL}`,
            stacktrace: { frames: [{ filename: 'js/biomeca.js', function: 'saveToSupabase' }] },
          },
        ],
      },
    });
    expect(r.exception.values[0].value).toBe(`échec sur ${MASQUE_EMAIL}`);
    // Ce qui fait le diagnostic est préservé.
    expect(r.exception.values[0].type).toBe('TypeError');
    expect(r.exception.values[0].stacktrace.frames[0].function).toBe('saveToSupabase');
  });

  it('18. breadcrumbs de l’événement re-nettoyés et filtrés', () => {
    const r = scrubEvent({
      message: 'boom',
      breadcrumbs: [
        { category: 'console', level: 'log', message: EMAIL },
        { category: 'fetch', level: 'info', data: { url: URL_STORAGE } },
      ],
    });
    expect(r.breadcrumbs).toHaveLength(1);
    expect(r.breadcrumbs[0].data.url).not.toContain(UUID_USER);
  });
});

describe('#47 pgrestErrorCode — corps PostgREST', () => {
  it('19. Corps complet → SQLSTATE seul, contenu clinique absent', () => {
    const r = pgrestErrorCode(CORPS_PGREST);
    expect(r).toBe('23505');
    expect(r).not.toContain('Durand');
    expect(r).not.toContain('1981');
  });

  it('20. Corps non-JSON, sans code, vide → marqueurs explicites', () => {
    expect(pgrestErrorCode('<html>502 Bad Gateway</html>')).toBe('(corps non-JSON)');
    expect(pgrestErrorCode('{"message":"boom"}')).toBe('(code absent)');
    expect(pgrestErrorCode('')).toBe('(corps absent)');
    expect(pgrestErrorCode(null)).toBe('(corps absent)');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Tests différentiels — les copies runtime ne doivent pas dériver
// ═══════════════════════════════════════════════════════════════════

describe('#47 non-divergence des copies runtime', () => {
  it('21. La table de cas est non vide (garde anti-succès-vacant)', () => {
    // Sans cette garde, vider la table rendrait TOUS les tests différentiels
    // verts sans avoir rien comparé. La faille se déplacerait d'un cran.
    expect(TABLE_CAS.length).toBeGreaterThan(15);
    expect(TABLE_CAS.filter((c) => c.inline !== null).length).toBeGreaterThan(12);
    expect(TABLE_CAS.filter((c) => c.fn === 'pgrestErrorCode').length).toBeGreaterThan(0);
  });

  it('22. index.html : extraction du bloc inline, marqueurs uniques et bloc substantiel', () => {
    const bloc = extraireBloc('index.html', '#47 SCRUB INLINE — DÉBUT', '#47 SCRUB INLINE — FIN');
    expect(bloc.length).toBeGreaterThan(TAILLE_PLANCHER);
    // L'extraction a bien ramené du code, pas seulement des commentaires.
    for (const nom of NOMS_INLINE) {
      expect(bloc).toContain('function ' + nom);
    }
  });

  it('23. index.html : comportement IDENTIQUE au miroir sur toute la table', () => {
    const copie = fabriquer(
      extraireBloc('index.html', '#47 SCRUB INLINE — DÉBUT', '#47 SCRUB INLINE — FIN'),
      NOMS_INLINE
    );

    let executes = 0;
    for (const cas of TABLE_CAS) {
      if (cas.inline === null) continue;
      const attendu = MIROIR[cas.fn](...cas.args);
      const obtenu = copie[cas.inline](...cas.args);
      expect(JSON.stringify(obtenu), `cas « ${cas.nom} »`).toBe(JSON.stringify(attendu));
      executes++;
    }

    // Garde anti-succès-vacant : une boucle qui n'itère jamais passerait.
    expect(executes).toBe(TABLE_CAS.filter((c) => c.inline !== null).length);
    expect(executes).toBeGreaterThan(12);
  });

  it('24. js/biomeca.js : _pgrestErrorCode identique au miroir', () => {
    const bloc = extraireBloc('js/biomeca.js', '#47 PGREST — DÉBUT', '#47 PGREST — FIN');
    expect(bloc).toContain('function _pgrestErrorCode');
    const copie = fabriquer(bloc, ['_pgrestErrorCode']);

    const cas = TABLE_CAS.filter((c) => c.fn === 'pgrestErrorCode');
    let executes = 0;
    for (const c of cas) {
      expect(copie._pgrestErrorCode(...c.args), `cas « ${c.nom} »`).toBe(
        pgrestErrorCode(...c.args)
      );
      executes++;
    }
    expect(executes).toBe(cas.length);
    expect(executes).toBeGreaterThan(0);
  });

  it('25. L’extraction ÉCHOUE bruyamment si un marqueur manque', () => {
    // Vérifie que la garde anti-succès-vacant mord réellement : sans elle,
    // une extraction ratée passerait pour une comparaison réussie.
    expect(() =>
      extraireBloc('index.html', '#47 MARQUEUR-INEXISTANT', '#47 SCRUB INLINE — FIN')
    ).toThrow(/marqueurs attendus une seule fois/);
    expect(() => extraireBloc('js/biomeca.js', '#47 PGREST — FIN', '#47 PGREST — DÉBUT')).toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Assertions de configuration sur index.html
// ═══════════════════════════════════════════════════════════════════
//
// Le sixième cas de l'inventaire — sampleRate non posé, donc 100 % des
// erreurs expédiées — n'est pas un nettoyage mais une valeur de
// configuration : rien à faire passer dans le miroir. Il est couvert ici.

describe('#47 configuration Sentry (index.html)', () => {
  const html = readFileSync(join(RACINE, 'index.html'), 'utf8');

  it('26. sampleRate explicite et ≤ 0.25', () => {
    const m = html.match(/sampleRate:\s*([0-9.]+)/);
    expect(m, 'sampleRate absent de index.html').not.toBeNull();
    expect(Number(m[1])).toBeLessThanOrEqual(0.25);
    expect(Number(m[1])).toBeGreaterThan(0);
  });

  it('27. maxBreadcrumbs explicite et ≤ 20', () => {
    const m = html.match(/maxBreadcrumbs:\s*(\d+)/);
    expect(m, 'maxBreadcrumbs absent de index.html').not.toBeNull();
    expect(Number(m[1])).toBeLessThanOrEqual(20);
    expect(Number(m[1])).toBeGreaterThan(0);
  });

  it('28. sendDefaultPii ABSENT — garde de non-régression', () => {
    // L'option n'existe pas dans le bundle @sentry/browser 8.55.0 embarqué :
    // elle était ignorée en silence et donnait une fausse impression de
    // protection. Empêche quiconque de la remettre en croyant renforcer.
    //
    // L'assertion porte sur TOUT le fichier, commentaires compris — elle
    // n'est PAS assouplie pour les ignorer : un test qu'on assouplit pour
    // qu'il passe cesse d'être un test. C'est le commentaire d'index.html
    // qui a été reformulé pour ne pas faire suivre le nom d'un deux-points.
    expect(html).not.toMatch(/sendDefaultPii\s*:/);
  });

  it('29. beforeSend et beforeBreadcrumb branchés sur le nettoyage', () => {
    expect(html).toMatch(/beforeBreadcrumb:\s*function/);
    expect(html).toMatch(/beforeSend:\s*function/);
    expect(html).toContain('_vScrubBreadcrumb(breadcrumb)');
    expect(html).toContain('_vScrubEvent(event)');
    // Les deux catch laissent une trace au lieu d'être muets. On compte les
    // APPELS (instruction terminée par `;`), pas les occurrences : la ligne
    // de définition `function _vSignalerEchecScrub(e) {` n'en est pas un.
    expect(html.match(/^\s*_vSignalerEchecScrub\(e\);$/gm)).toHaveLength(2);
  });
});
