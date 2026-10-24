// Portail patient (lot b2) — documents partagés : fonctions pures de l'interface patient et
// branchements (praticien, SQL, CSP). Les attaques sur la base (RLS, Storage) sont dans
// supabase/tests/portail-documents-partages.test.sql ; le parcours navigateur est joué à part
// avec des patients fictifs.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as L from '../patient/patient-logique.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('patient-logique — documents', () => {
  const liste = [
    {
      id: '1',
      type: 'facture',
      titre: 'Facture F-2026-0001',
      date_document: '2026-10-02',
      created_at: '2026-10-02T10:00:00Z',
      lu_at: null,
    },
    {
      id: '2',
      type: 'devis',
      titre: 'Devis D-2026-0001',
      date_document: '2026-09-20',
      created_at: '2026-09-20T10:00:00Z',
      lu_at: '2026-09-21T08:00:00Z',
    },
    {
      id: '3',
      type: 'devis',
      titre: 'Devis D-2026-0002',
      date_document: '2026-10-01',
      created_at: '2026-10-01T10:00:00Z',
      lu_at: null,
    },
    {
      id: '4',
      type: 'rapport',
      titre: 'Bilan pédicurie',
      date_document: '2026-10-03',
      created_at: '2026-10-03T10:00:00Z',
      lu_at: null,
    },
  ];
  it('nombre de non-lus et phrase de la carte', () => {
    expect(L.nombreNonLus(liste)).toBe(3);
    expect(L.nombreNonLus([])).toBe(0);
    expect(L.nombreNonLus(null)).toBe(0);
    expect(L.phraseDocuments(0)).toMatch(/Devis, factures/);
    expect(L.phraseDocuments(1)).toBe('1 nouveau document');
    expect(L.phraseDocuments(3)).toBe('3 nouveaux documents');
  });
  it('groupes dans l’ordre devis, factures, ordonnances, bilans ; vides omis ; récents d’abord', () => {
    const g = L.grouperDocuments(liste);
    expect(g.map((x) => x.type)).toEqual(['devis', 'facture', 'rapport']);
    expect(g[0].documents.map((d) => d.id)).toEqual(['3', '2']);
  });
  it('groupes : entrées invalides ignorées', () => {
    expect(L.grouperDocuments(null)).toEqual([]);
    expect(L.grouperDocuments([null, {}, { id: 'x', type: 'inconnu' }])).toEqual([]);
  });
  it('date courte', () => {
    expect(L.dateCourte('2026-05-07')).toBe('07/05/2026');
    expect(L.dateCourte('')).toBe('');
    expect(L.dateCourte('pas une date')).toBe('');
  });
  it('chemin de fichier : même forme que côté serveur, jamais un chemin tordu', () => {
    const u = '10000000-0000-0000-0000-0000000000a1';
    const f = 'f0000000-0000-0000-0000-000000000001';
    expect(L.cheminFichierValide(`${u}/${f}.html`)).toBe(true);
    for (const mauvais of [
      `${u}/../${f}.html`,
      `${u}/${f}.exe`,
      `../${f}.html`,
      '',
      null,
      `${u}/${f}.html?x=1`,
      `${u}//${f}.html`,
    ]) {
      expect(L.cheminFichierValide(mauvais)).toBe(false);
    }
  });
});

describe('patient — sécurité de l’affichage des documents', () => {
  const html = lire('patient/index.html');
  const js = lire('patient/patient.js');
  it('document affiché dans un cadre isolé sans script', () => {
    expect(js).toMatch(/setAttribute\('sandbox', 'allow-same-origin allow-modals'\)/);
    expect(js).not.toMatch(/allow-scripts/);
  });
  it('CSP : toujours aucun script ni style en ligne autorisé pour la page elle-même', () => {
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
    expect(csp).toMatch(/script-src 'self'(;|$)/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toMatch(/img-src 'self' data:/);
    expect(csp).toMatch(/connect-src 'self' https:\/\/tzivizoacdyopwfzerrb\.supabase\.co/);
    // le style en ligne n'est admis que pour le rendu des documents du praticien (cadre sans script)
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/);
    expect(html).not.toMatch(/\sstyle="/);
    expect(html).not.toMatch(/\son[a-z]+="/);
  });
  it('le fichier est lu par le chemin renvoyé par la base, après contrôle de sa forme', () => {
    expect(js).toMatch(/cheminFichierValide\(d\.fichier_chemin\)/);
    expect(js).toMatch(/\/storage\/v1\/object\/authenticated\/patient-documents\//);
  });
  it('le patient ne fait que lire : seule écriture = marquer lu', () => {
    const ecritures = js.match(/method: '(POST|PUT|PATCH|DELETE)'/g) || [];
    // connexion, renouvellement, déconnexion, choix du mot de passe, marquer lu : aucune route documents_partages
    expect(js).not.toMatch(/documents_partages[^']*',\s*\{\s*method/);
    expect(js).toMatch(/rpc\/portail_document_lu/);
    expect(ecritures.length).toBeGreaterThan(0);
  });
  it('le service worker du portail ne met jamais en cache les documents (Supabase = réseau direct)', () => {
    const sw = lire('patient/sw.js');
    expect(sw).toMatch(/url\.origin !== self\.location\.origin\) return/);
    expect(sw).toMatch(/verticy-patient-v16/);
  });
});

describe('migration portail-documents-partages.sql', () => {
  const sql = lire('supabase/migrations/portail-documents-partages.sql');
  it('aucun droit d’écriture directe pour le client', () => {
    expect(sql).toMatch(/REVOKE ALL ON public\.documents_partages FROM anon, authenticated;/);
    expect(sql).toMatch(/GRANT SELECT ON public\.documents_partages TO authenticated;/);
    expect(sql).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)/i);
  });
  it('lecture patient : fiche du compte actif, document non retiré', () => {
    expect(sql).toMatch(/patient_id = public\.portail_patient_actuel\(\) AND NOT retire/);
    expect(sql).toMatch(/portail_peut_lire_fichier/);
  });
  it('aucune modification ni suppression de fichier (pas de purge)', () => {
    expect(sql).not.toMatch(/ON storage\.objects FOR (UPDATE|DELETE)/);
  });
  it('toutes les fonctions SECURITY DEFINER fixent leur search_path', () => {
    const defs = sql.split('CREATE OR REPLACE FUNCTION').slice(1);
    expect(defs.length).toBeGreaterThanOrEqual(8);
    for (const d of defs) {
      if (/SECURITY DEFINER/.test(d)) expect(d).toMatch(/SET search_path = /);
    }
  });
  it('bucket privé, HTML seulement, 20 Mo', () => {
    expect(sql).toMatch(
      /'patient-documents', 'patient-documents', false, 20971520, ARRAY\['text\/html'\]/
    );
  });
});

describe('application praticien — partage automatique et publication', () => {
  const bm = lire('js/biomeca.js');
  const idx = lire('index.html');
  it('le partage suit l’émission d’un devis/facture et l’enregistrement d’une ordonnance, sans jamais bloquer', () => {
    expect(bm).toMatch(
      /typeof _portailPartagerAuto === 'function'\) _portailPartagerAuto\('facturation', currentPatient, emis\);/
    );
    expect(bm).toMatch(
      /typeof _portailPartagerAuto === 'function'\) _portailPartagerAuto\('ordonnance', currentPatient, o\);/
    );
    expect(bm).toMatch(/function _portailPartagerAuto[\s\S]*?catch \(_e\) \{ \/\* jamais bloquant/);
  });
  it('rien n’est partagé en mode consultation, hors connexion, ou pour un brouillon', () => {
    expect(bm).toMatch(
      /function _portailPartagePossible[\s\S]*?_modeConsultation[\s\S]*?_horsConnexion/
    );
    expect(bm).toMatch(/row\.statut !== 'emis'/);
  });
  it('le document est nettoyé (scripts, liens, attributs on*) et ses images réduites avant dépôt', () => {
    const f = bm.slice(
      bm.indexOf('async function _portailPreparerHtml'),
      bm.indexOf('async function _portailDeposerFichier')
    );
    expect(f).toMatch(/script, iframe, object, embed, link, base, meta\[http-equiv\]/);
    expect(f).toMatch(/\^on/);
    expect(f).toMatch(/_portailReduireImage/);
    expect(f).toMatch(/_PORTAIL_HTML_MAX/);
  });
  it('un bouton « Publier au patient » par module de bilan', () => {
    for (const m of ['sport', 'posturo', 'podopediatrie', 'pedicurie']) {
      expect(idx).toContain(`portailPublierRapport('${m}')`);
    }
    expect(bm).toMatch(/portailPublierRapport,\n\s+portailRetirerDocument,/);
  });
  it('le praticien peut retirer puis remettre, avec confirmation avant retrait', () => {
    expect(bm).toMatch(/documents_partages_retirer/);
    expect(bm).toMatch(/if \(retirer && !confirm\(/);
  });
  it('aucune mention interdite par la CI', () => {
    expect(bm).not.toMatch(/service_role/);
  });
});
