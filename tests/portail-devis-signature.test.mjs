// Signature du devis par le patient : logique pure du portail, garde-fous de source (patient + SQL),
// bloc « Signé électroniquement » et notification côté praticien. Données FICTIVES.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fonction } from './helpers/extraire-biomeca.mjs';
import {
  TRACE_MIN_PX,
  traceSuffisant,
  indexerEtatsDevis,
  statutDevis,
  libelleStatutDevis,
  codeConfirmationValide,
  nettoyerCode,
  dateHeureFr,
  messageErreurSignature,
  messageCodeInvalide,
  longueurTrace,
} from '../patient/patient-logique.mjs';

const PATIENT_JS = readFileSync(new URL('../patient/patient.js', import.meta.url), 'utf8');
const PATIENT_HTML = readFileSync(new URL('../patient/index.html', import.meta.url), 'utf8');
const MIGRATIONS = new URL('../supabase/migrations/', import.meta.url);

describe('état et badge d’un devis', () => {
  const doc = { id: 'd1', type: 'devis' };
  it('à signer / signé / expiré ; jamais de badge pour un autre type ou sans état', () => {
    expect(statutDevis(doc, { signable: true, signe_at: null })).toBe('a_signer');
    expect(statutDevis(doc, { signable: false, signe_at: '2026-10-25T10:00:00Z' })).toBe('signe');
    expect(statutDevis(doc, { signable: false, signe_at: null, expire: true })).toBe('expire');
    expect(statutDevis({ id: 'f', type: 'facture' }, { signable: true })).toBeNull();
    expect(statutDevis(doc, undefined)).toBeNull();
    expect(libelleStatutDevis('a_signer')).toBe('✍️ À signer');
    expect(libelleStatutDevis('signe')).toBe('✓ Signé');
    expect(libelleStatutDevis(null)).toBeNull();
  });
  it('indexe les états par identifiant de document', () => {
    const c = indexerEtatsDevis([{ document_id: 'a', signable: true }, null, { x: 1 }]);
    expect(Object.keys(c)).toEqual(['a']);
    expect(indexerEtatsDevis(null)).toEqual({});
  });
});

describe('tracé et code', () => {
  it('un point ou un cadre vide ne suffit pas', () => {
    expect(traceSuffisant(0)).toBe(false);
    expect(traceSuffisant(TRACE_MIN_PX - 1)).toBe(false);
    expect(traceSuffisant(TRACE_MIN_PX)).toBe(true);
    expect(longueurTrace([[0, 0, 3, 4]])).toBe(5);
    expect(longueurTrace([[0, 0, 3]])).toBe(0);
    expect(longueurTrace(null)).toBe(0);
  });
  it('code : exactement 6 chiffres', () => {
    expect(codeConfirmationValide('123456')).toBe(true);
    expect(codeConfirmationValide('123 456')).toBe(true);
    expect(codeConfirmationValide('12345')).toBe(false);
    expect(codeConfirmationValide('12345a')).toBe(false);
    expect(nettoyerCode('12a3-456789')).toBe('123456');
  });
  it('date lisible à l’heure de Paris', () => {
    expect(dateHeureFr('2026-10-25T14:03:00Z')).toBe('25/10/2026 à 15:03');
    expect(dateHeureFr('n’importe quoi')).toBe('');
  });
});

describe('messages d’erreur : une phrase claire, jamais le code brut', () => {
  it('chaque code du serveur', () => {
    for (const code of [
      'devis_expire',
      'devis_introuvable',
      'deja_signe',
      'devis_modifie',
      'trace_invalide',
      'code_requis',
      'trop_de_codes',
    ]) {
      const m = messageErreurSignature(400, { message: code });
      expect(m).not.toContain('_');
      expect(m.length).toBeGreaterThan(20);
    }
    expect(messageErreurSignature(0, null)).toMatch(/Pas de réseau/);
    expect(messageErreurSignature(500, null)).toMatch(/Petit souci/);
    expect(messageErreurSignature(400, { message: 'ERREUR SQL secrète' })).not.toContain('secrète');
  });
  it('code faux : nombre d’essais restants', () => {
    expect(messageCodeInvalide(4)).toMatch(/4 essais/);
    expect(messageCodeInvalide(1)).toMatch(/1 essai\./);
    expect(messageCodeInvalide(0)).toMatch(/nouveau code/);
  });
});

describe('garde-fous de source — portail patient', () => {
  const signer = PATIENT_JS.slice(PATIENT_JS.indexOf('async function signerDevis()'));
  const corpsSigner = signer.slice(0, signer.indexOf('(() => {'));
  it('le client n’envoie ni IP ni date : seulement document, empreinte, tracé, code', () => {
    const bloc = corpsSigner.slice(
      corpsSigner.indexOf('const corps = {'),
      corpsSigner.indexOf('};')
    );
    expect(bloc).toMatch(/p_document/);
    expect(bloc).toMatch(/p_empreinte/);
    expect(bloc).toMatch(/p_trace/);
    expect(corpsSigner).not.toMatch(/p_ip|p_date|p_signe/);
    expect(corpsSigner).toMatch(/corps\.p_code = code/);
  });
  it('aucune signature dans l’aperçu praticien (lecture seule)', () => {
    expect(PATIENT_JS).toMatch(
      /async function chargerEtatsDevis\(\) \{\s*if \(APERCU\) return null;/
    );
    expect(PATIENT_JS).toMatch(
      /async function preparerSignature\(d\) \{\s*if \(APERCU \|\| d\.type !== 'devis'\) return;/
    );
  });
  it('la case « j’ai lu » et un tracé suffisant sont exigés avant tout envoi', () => {
    expect(corpsSigner.indexOf('signature-accord')).toBeGreaterThan(-1);
    expect(corpsSigner.indexOf('signature-accord')).toBeLessThan(corpsSigner.indexOf('appelAuth('));
    expect(corpsSigner.indexOf('traceSuffisant')).toBeGreaterThan(-1);
    expect(corpsSigner.indexOf('traceSuffisant')).toBeLessThan(corpsSigner.indexOf('appelAuth('));
  });
  it('un document quitté pendant le chargement ne fait pas apparaître la signature d’un autre', () => {
    expect(PATIENT_JS).toMatch(/if \(documentOuvertId !== d\.id\) return;/);
  });
  it('le tracé part en PNG ; aucune donnée de signature dans localStorage / sessionStorage', () => {
    expect(corpsSigner).toMatch(/toDataURL\('image\/png'\)/);
    expect(/(local|session)Storage[^;]*signature/i.test(PATIENT_JS)).toBe(false);
  });
  it('le canvas ignore le défilement tactile (touch-action) et la zone est cachée au départ', () => {
    const css = readFileSync(new URL('../patient/patient.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.signature-canvas \{[^}]*touch-action: none/);
    expect(PATIENT_HTML).toMatch(/id="zone-signature" class="zone-signature" hidden/);
  });
  it('mode essai : le code n’est affiché que s’il est rendu par le serveur', () => {
    expect(PATIENT_JS).toMatch(/if \(j && j\.code_essai\)/);
  });
});

describe('garde-fous de source — SQL', () => {
  const fichiers = readdirSync(MIGRATIONS).filter((f) => f.startsWith('portail-devis-signature-'));
  it('six blocs, chacun de moins de 4000 caractères (collés en texte dans Supabase)', () => {
    expect(fichiers.length).toBe(6);
    for (const f of fichiers) {
      const t = readFileSync(new URL(f, MIGRATIONS), 'utf8');
      expect(t.length, f).toBeLessThan(4000);
    }
  });
  const tout = fichiers.map((f) => readFileSync(new URL(f, MIGRATIONS), 'utf8')).join('\n');
  it('l’IP vient des en-têtes de la requête, jamais d’un paramètre', () => {
    expect(tout).toMatch(/request\.headers/);
    expect(tout).not.toMatch(/p_ip/);
  });
  it('aucun droit direct d’écriture ; fonctions réservées aux utilisateurs connectés', () => {
    expect(tout).toMatch(/REVOKE ALL ON public\.devis_signatures FROM anon, authenticated/);
    expect(tout).toMatch(/REVOKE ALL ON public\.devis_signature_codes FROM anon, authenticated/);
    expect(tout).not.toMatch(/GRANT (INSERT|UPDATE|DELETE)[^;]*devis_signature/i);
    expect(tout).not.toMatch(/TO anon/);
  });
  it('le repartage reprend la dernière version de la fonction et protège un devis signé', () => {
    const d = readFileSync(new URL('portail-devis-signature-d-repartage.sql', MIGRATIONS), 'utf8');
    expect(d).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM public\.devis_signatures/);
    expect(d).toMatch(/'paiement_mode', d\.paiement_mode/);
  });
});

describe('praticien : bloc de preuve et notification', () => {
  const echapper = new Function(`${fonction('_escHtml')}; return _escHtml;`)();
  const blocSignature = new Function(
    '_escHtml',
    '_notifDateHeure',
    `${fonction('_htmlBlocSignature')}; return _htmlBlocSignature;`
  )(echapper, (iso) => 'LE ' + iso);
  const trace = 'data:image/png;base64,' + 'iVBORw0KGgo'.repeat(5);

  it('affiche date, IP, empreinte et tracé ; rien sans signature', () => {
    expect(blocSignature(null)).toBe('');
    const h = blocSignature({
      signe_at: '2026-10-25T10:00:00Z',
      ip: '203.0.113.7',
      empreinte: 'ab'.repeat(32),
      trace,
      code_verifie: true,
    });
    expect(h).toContain('Signé électroniquement');
    expect(h).toContain('203.0.113.7');
    expect(h).toContain('ab'.repeat(32));
    expect(h).toContain('<img');
    expect(h).toContain('code de confirmation vérifié');
  });
  it('échappe les champs et refuse un tracé qui n’est pas un PNG en base64', () => {
    const h = blocSignature({
      signe_at: 'x',
      ip: '<script>alert(1)</script>',
      empreinte: '"><b>',
      trace: 'javascript:alert(1)',
    });
    expect(h).not.toContain('<script>');
    expect(h).not.toContain('<b>');
    expect(h).not.toContain('<img');
  });

  async function verifier({
    lignes,
    source = 'doc-reel',
    notifie = true,
    fiche = true,
    lectureOk = true,
  }) {
    const notifs = [];
    const appels = [];
    const patients = fiche ? [{ id: 7, _cloudId: 'cloud-1' }] : [];
    const corps = `${fonction('_portailVerifierSignatures')}; return _portailVerifierSignatures;`;
    const f = new Function(
      'globalThis',
      'pwaUser',
      '_horsConnexion',
      'patients',
      '_portailRpc',
      'authFetch',
      'SUPA_URL',
      'notifierEvenement',
      `let _sigEnCours = false; ${corps}`
    )(
      { _modeConsultation: false },
      { id: 'u' },
      () => false,
      patients,
      async (nom, args) => {
        appels.push([nom, args]);
        if (nom === 'devis_signatures_a_notifier') return lignes;
        if (nom === 'devis_signature_notifie') return notifie;
        throw new Error('inattendu');
      },
      async () => ({ ok: lectureOk, json: async () => [{ source_ref: source }] }),
      'https://x.invalid',
      (type, o) => notifs.push([type, o])
    );
    await f();
    return { notifs, appels };
  }

  it('crée UNE notification (identifiants seuls) puis marque « notifié »', async () => {
    const r = await verifier({ lignes: [{ id: 's1', patient_id: 'cloud-1', document_id: 'dp1' }] });
    expect(r.notifs).toEqual([['patient_devis_signe', { patientId: 7, documentId: 'doc-reel' }]]);
    expect(r.appels.map((a) => a[0])).toEqual([
      'devis_signatures_a_notifier',
      'devis_signature_notifie',
    ]);
  });
  it('déjà notifié ailleurs (deux onglets) : aucune seconde notification', async () => {
    const r = await verifier({
      lignes: [{ id: 's1', patient_id: 'cloud-1', document_id: 'dp1' }],
      notifie: false,
    });
    expect(r.notifs).toEqual([]);
  });
  it('fiche inconnue sur cet appareil : ni notification ni marquage', async () => {
    const r = await verifier({
      lignes: [{ id: 's1', patient_id: 'cloud-1', document_id: 'dp1' }],
      fiche: false,
    });
    expect(r.notifs).toEqual([]);
    expect(r.appels.map((a) => a[0])).toEqual(['devis_signatures_a_notifier']);
  });
  it('lecture du devis impossible : pas de marquage (réessayé plus tard)', async () => {
    const r = await verifier({
      lignes: [{ id: 's1', patient_id: 'cloud-1', document_id: 'dp1' }],
      lectureOk: false,
    });
    expect(r.notifs).toEqual([]);
    expect(r.appels.map((a) => a[0])).toEqual(['devis_signatures_a_notifier']);
  });
  it('la notification est branchée dans le sondage de 30 s', () => {
    const src = readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
    expect(src).toMatch(
      /_portailVerifierSignatures === 'function'\) _portailVerifierSignatures\(\)/
    );
  });
});

describe('praticien : où la preuve apparaît', () => {
  const src = readFileSync(new URL('../js/biomeca.js', import.meta.url), 'utf8');
  it('dans la fenêtre du devis émis, la liste 🧾, l’impression, la fenêtre 🔑 et le détail de la notification', () => {
    expect(fonction('_htmlDocumentEmis')).toMatch(
      /_htmlBlocSignature\(_docSignatures\[d\.numero\]\)/
    );
    expect(fonction('_htmlPageImpressionDocument')).toMatch(
      /d\.type === 'devis' \? _htmlBlocSignature\(_docSignatures\[d\.numero\]\)/
    );
    expect(fonction('_htmlListeDocuments')).toMatch(/_docSignatures\[d\.numero\]/);
    expect(src).toMatch(/_portailHtmlDocs\(idx, l, sigs\)/);
    expect(src).toMatch(/e\.type === 'patient_devis_signe'\) _notifChargerSignature\(e\.id, e\)/);
  });
  it('sans identifiant cloud ou sans le SQL : aucune erreur, aucune signature affichée', () => {
    const f = fonction('_chargerSignaturesDevis');
    expect(f).toMatch(/if \(!patient \|\| !patient\._cloudId\) return;/);
    expect(f).toMatch(/catch \(_e\)/);
  });
  it('le retrait d’un devis explique que la preuve d’une signature reste conservée', () => {
    expect(src).toMatch(/la preuve d\\'une signature reste conservée/);
  });
});
