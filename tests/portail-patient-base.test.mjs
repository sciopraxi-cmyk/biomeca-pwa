// Portail patient (lot b) — fonctions pures, interface, et parcours COMPLETS des deux Edge Functions
// (patient-connexion, patient-compte) sur une base simulée en mémoire. Aucune donnée réelle :
// patients fictifs uniquement. Les attaques sur la vraie base (RLS, compteur atomique) sont
// dans supabase/tests/portail-patient-base.test.sql.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import * as P from '../supabase/functions/_shared/portail-v1.ts';
import * as L from '../patient/patient-logique.mjs';

const lire = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe('portail-v1 — identifiant, date, mot de passe', () => {
  it('identifiant : 8 caractères lisibles, format XXXX-XXXX, sans I O 0 1', () => {
    const vus = new Set();
    for (let i = 0; i < 300; i++) {
      const id = P.genererIdentifiant();
      expect(id).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
      vus.add(id);
    }
    expect(vus.size).toBe(300);
    expect(P.ALPHABET_IDENTIFIANT.length).toBe(32);
  });
  it('normaliserIdentifiant accepte minuscules/espaces et refuse le reste', () => {
    expect(P.normaliserIdentifiant('k7m2 9qxp')).toBe('K7M2-9QXP');
    expect(P.normaliserIdentifiant('K7M29QXP')).toBe('K7M2-9QXP');
    expect(P.normaliserIdentifiant('K7M2-9QX')).toBeNull();
    expect(P.normaliserIdentifiant('K7M2-9QX0')).toBeNull(); // 0 absent de l'alphabet
    expect(P.normaliserIdentifiant("K7M2-9QXP'; --")).toBe('K7M2-9QXP');
    expect(P.normaliserIdentifiant(123)).toBeNull();
    expect(P.normaliserIdentifiant('A'.repeat(500))).toBeNull();
  });
  it('adresse technique : jamais une vraie adresse', () => {
    expect(P.emailTechnique('K7M2-9QXP')).toBe('k7m29qxp@patients.verticy.invalid');
  });
  it('date de naissance → mot de passe initial AAAAMMJJ', () => {
    expect(P.ddnVersSecret('2010-05-17')).toBe('20100517');
    expect(P.ddnVersSecret('2010-02-30')).toBeNull();
    expect(P.ddnVersSecret('')).toBeNull();
    expect(P.ddnVersSecret(null)).toBeNull();
    expect(P.normaliserSecretDdn('2010 05 17')).toBe('20100517');
    expect(P.normaliserSecretDdn('17/05/2010')).toBeNull(); // pas à l'envers : refusé
    expect(P.normaliserSecretDdn('20101340')).toBeNull();
  });
  it('mot de passe choisi : 10 caractères, pas la date, pas l’identifiant', () => {
    const ctx = { identifiant: 'K7M2-9QXP', ddnSecret: '20100517' };
    expect(P.validerMotDePasse('court', ctx)).toMatch(/10 caractères/);
    expect(P.validerMotDePasse('aaaaaaaaaaaa', ctx)).toMatch(/simple/);
    expect(P.validerMotDePasse('x20100517x', ctx)).toMatch(/naissance/);
    expect(P.validerMotDePasse('zz-k7m2-9qxp-zz', ctx)).toMatch(/identifiant/);
    expect(P.validerMotDePasse('a'.repeat(73), ctx)).toMatch(/Au plus/);
    expect(P.validerMotDePasse('Soleil-du-matin', ctx)).toBeNull();
    expect(P.validerMotDePasse(undefined, ctx)).not.toBeNull();
  });
  it('comparaison en temps constant', () => {
    expect(P.egalConstant('abc', 'abc')).toBe(true);
    expect(P.egalConstant('abc', 'abd')).toBe(false);
    expect(P.egalConstant('abc', 'abcd')).toBe(false);
  });
  it('billet : valide, falsifié, expiré, mauvais secret', async () => {
    const t0 = 1_000_000;
    const b = await P.signerBillet('secret-serveur', { c: 'compte-1', n: 'nonce-1' }, t0);
    expect(await P.verifierBillet('secret-serveur', b, t0 + 10)).toEqual({
      c: 'compte-1',
      n: 'nonce-1',
    });
    expect(await P.verifierBillet('autre-secret', b, t0 + 10)).toBeNull();
    expect(
      await P.verifierBillet('secret-serveur', b, t0 + P.VALIDITE_BILLET_SECONDES + 1)
    ).toBeNull();
    const [corps, sig] = b.split('.');
    const faux = btoa(JSON.stringify({ c: 'compte-2', n: 'nonce-1', e: t0 + 9999 }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(await P.verifierBillet('secret-serveur', faux + '.' + sig, t0)).toBeNull();
    expect(
      await P.verifierBillet('secret-serveur', corps + '.' + sig.slice(0, -2) + 'AA', t0)
    ).toBeNull();
    expect(await P.verifierBillet('secret-serveur', 'pas-un-billet', t0)).toBeNull();
    expect(await P.verifierBillet('secret-serveur', 42, t0)).toBeNull();
  });
  it('minutes de blocage et adresse IP', () => {
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(P.minutesRestantes('2026-10-22T10:14:10Z', now)).toBe(15);
    expect(P.minutesRestantes('2026-10-22T10:00:05Z', now)).toBe(1);
    expect(P.minutesRestantes(null, now)).toBe(0);
    const h = new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' });
    expect(P.ipClient(h)).toBe('203.0.113.7');
    expect(P.ipClient(new Headers())).toBe('inconnue');
  });
});

describe('interface patient — logique pure', () => {
  it('formaterIdentifiant et identifiantComplet', () => {
    expect(L.formaterIdentifiant('k7m29qxp')).toBe('K7M2-9QXP');
    expect(L.formaterIdentifiant('k7m')).toBe('K7M');
    expect(L.formaterIdentifiant('k7m29qxpzzz')).toBe('K7M2-9QXP');
    expect(L.identifiantComplet('K7M2-9QXP')).toBe(true);
    expect(L.identifiantComplet('K7M2-9QX')).toBe(false);
    expect(L.identifiantComplet('K7M2-9QX0')).toBe(false);
  });
  it('règles du mot de passe affichées en direct', () => {
    expect(L.reglesMotDePasse('').every((r) => !r.ok)).toBe(true);
    expect(L.reglesMotDePasse('abcdefghij').every((r) => r.ok)).toBe(true);
    expect(L.motDePasseAcceptable('abcdefghij', 'abcdefghij')).toBe(true);
    expect(L.motDePasseAcceptable('abcdefghij', 'abcdefghiX')).toBe(false);
    expect(L.motDePasseAcceptable('court', 'court')).toBe(false);
  });
  it('messages d’erreur en français clair', () => {
    expect(L.messageErreur(429, { error: 'bloque', minutes: 15 })).toMatch(/15 minutes/);
    expect(L.messageErreur(429, { error: 'bloque', minutes: 1 })).toMatch(/1 minute\./);
    expect(L.messageErreur(401, { error: 'identifiants_incorrects', restants: 2 })).toMatch(
      /2 essais/
    );
    expect(L.messageErreur(401, { error: 'identifiants_incorrects', restants: 1 })).toMatch(
      /1 essai\./
    );
    expect(L.messageErreur(401, { error: 'identifiants_incorrects' })).toBe(
      'Identifiant ou mot de passe incorrect.'
    );
    expect(L.messageErreur(0, null)).toMatch(/internet/);
    expect(L.messageErreur(503, null)).toMatch(/Réessayez/);
    expect(L.messageErreur(403, { error: 'acces_ferme' })).toMatch(/fermé/);
  });
  it('session à renouveler et salutation sans injection', () => {
    expect(L.sessionAExpirer(null, 100)).toBe(true);
    expect(L.sessionAExpirer({ expires_at: 100 + 30 }, 100)).toBe(true);
    expect(L.sessionAExpirer({ expires_at: 100 + 3600 }, 100)).toBe(false);
    expect(L.salutation('Léa')).toBe('Bonjour Léa 👋');
    expect(L.salutation('')).toBe('Bonjour 👋');
    expect(L.salutation('x'.repeat(200)).length).toBeLessThan(60);
  });
});

describe('interface patient — garde-fous du dépôt', () => {
  const html = lire('patient/index.html');
  it('CSP stricte : ni script ni style en ligne, aucun gestionnaire onclick', () => {
    const csp = html.match(/Content-Security-Policy"\s+content="([^"]+)"/)[1];
    expect(csp).toMatch(/script-src 'self';/);
    expect(csp).toMatch(/style-src 'self';/);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });
  it('page non indexée et manifeste séparé, portée /patient/', () => {
    expect(html).toMatch(/noindex/);
    const m = JSON.parse(lire('patient/manifest.json'));
    expect(m.scope).toBe('./');
    expect(m.id).toBe('/patient/');
    expect(m.start_url).toBe('./');
  });
  it('service worker : préfixe de cache distinct, jamais Supabase', () => {
    const sw = lire('patient/sw.js');
    expect(sw).toMatch(/PREFIXE = 'verticy-patient-'/);
    expect(sw).not.toMatch(/'biomeca-/);
    expect(sw).not.toMatch(/supabase\.co/i);
    // l'autre service worker ne purge que « biomeca-* »
    expect(lire('service-worker.js')).toMatch(/startsWith\(CACHE_PREFIX\)/);
    expect(lire('service-worker.js')).toMatch(/CACHE_PREFIX\s*=\s*'biomeca-'/);
    // ne met en cache que des GET de même origine
    expect(sw).toMatch(/req\.method !== 'GET' \|\| url\.origin !== self\.location\.origin/);
  });
  it('aucun secret ni donnée réelle dans /patient/', () => {
    for (const f of ['index.html', 'patient.js', 'patient-logique.mjs', 'sw.js', 'patient.css']) {
      const t = lire('patient/' + f);
      expect(t).not.toMatch(/service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
    }
  });
  it('le client n’affiche jamais de texte venu du serveur en HTML', () => {
    const js = lire('patient/patient.js');
    expect(js).not.toMatch(/innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  });
});

describe('landing et application praticien — branchements', () => {
  const idx = lire('index.html');
  const bm = lire('js/biomeca.js');
  it('landing : deux cartes, patient vers /patient/, praticien vers la connexion', () => {
    expect(idx).toMatch(/id="lp-carte-patient" href="patient\/"/);
    expect(idx).toMatch(/Je suis un patient/);
    expect(idx).toMatch(/id="lp-carte-praticien"[^>]*pwa-login-form/);
    expect(idx).toMatch(/Je suis un praticien/);
  });
  it('un compte patient est refusé à la connexion praticien et par les fonctions praticien', () => {
    expect(bm).toMatch(/body\.user\?\.app_metadata\?\.role === 'patient'/);
    for (const f of ['start-trial', 'help-chat', 'prepare-module-change', 'patient-compte']) {
      expect(lire(`supabase/functions/${f}/index.ts`)).toMatch(
        /app_metadata[^\n]*\)\??\.role === 'patient'/
      );
    }
  });
  it('la création automatique est facultative pour le harnais de l’agenda et ne bloque jamais', () => {
    expect(bm).toMatch(
      /typeof _portailCreerAccesAuto === 'function'\) _portailCreerAccesAuto\(patientId\)/
    );
    expect(bm).toMatch(
      /function _portailCreerAccesAuto[\s\S]*?catch \(_e\) \{ \/\* jamais bloquant/
    );
  });
  it('la fiche patient a le bouton d’accès au portail', () => {
    expect(bm).toMatch(/onclick="ouvrirPortailPatient\(\$\{i\}\)"/);
  });
  it('la migration réserve le compteur au service_role et verrouille les écritures client', () => {
    const sql = lire('supabase/migrations/portail-patient-base.sql');
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.portail_reserver_tentative\(text\) FROM PUBLIC, anon, authenticated/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.portail_reserver_tentative\(text\) TO service_role/
    );
    expect(sql).toMatch(/GRANT UPDATE \(representant_legal_nom, representant_legal_lien\)/);
    expect(sql).not.toMatch(/GRANT[^;]*\b(INSERT|DELETE)\b[^;]*patient_comptes/);
    expect(sql).toMatch(/AS RESTRICTIVE/);
  });
});

// ─── Parcours des Edge Functions sur une base simulée ───────────────────────
const SERVICE_KEY = 'cle-de-service-fictive';
const MDP_PATIENT_OK = 'Soleil-du-matin-42';

function creerBase() {
  return {
    patients: [
      { id: 'pat-1', user_id: 'prat-1', ddn: '2010-05-17' },
      { id: 'pat-2', user_id: 'prat-2', ddn: '1980-01-02' },
      { id: 'pat-sans-ddn', user_id: 'prat-1', ddn: null },
    ],
    patient_comptes: [],
    patient_connexions: [],
    users: {
      'prat-1': { app_metadata: {} },
      'prat-2': { app_metadata: {} },
      'pat-user': { app_metadata: { role: 'patient' } },
    },
    mdp: {}, // auth_user_id → mot de passe Supabase
    seq: 0,
    updates_mdp: [],
  };
}

function monterSupabaseFactice(db) {
  const correspond = (ligne, filtres) =>
    filtres.every((f) => {
      const v = ligne[f.col];
      if (f.op === 'eq') return v === f.val;
      if (f.op === 'like') return typeof v === 'string' && v.startsWith(f.val.replace('%', ''));
      if (f.op === 'gte') return String(v) >= String(f.val);
      return false;
    });
  class Q {
    constructor(table) {
      this.t = table;
      this.filtres = [];
      this.op = 'select';
      this.retourne = false;
    }
    select(_c, opts) {
      if (this.op === 'select') this.opts = opts;
      else this.retourne = true;
      return this;
    }
    eq(col, val) {
      this.filtres.push({ op: 'eq', col, val });
      return this;
    }
    like(col, val) {
      this.filtres.push({ op: 'like', col, val });
      return this;
    }
    gte(col, val) {
      this.filtres.push({ op: 'gte', col, val });
      return this;
    }
    update(v) {
      this.op = 'update';
      this.v = v;
      return this;
    }
    insert(v) {
      this.op = 'insert';
      this.v = v;
      return this;
    }
    maybeSingle() {
      this.un = 'maybe';
      return this;
    }
    single() {
      this.un = 'single';
      return this;
    }
    then(res, rej) {
      // un tour de boucle d'événements par requête : deux appels simultanés s'entrelacent vraiment
      return new Promise((ok) => setTimeout(ok, 0)).then(() => this.exec()).then(res, rej);
    }
    exec() {
      const tab = db[this.t];
      if (this.op === 'insert') {
        const ligne = Object.assign(
          {
            id: this.t + '-' + ++db.seq,
            at: new Date().toISOString(),
            statut: 'initial',
            essais_echoues: 0,
            bloque_jusqu: null,
            ticket_nonce: null,
            premier_acces_at: null,
          },
          this.v
        );
        if (
          this.t === 'patient_comptes' &&
          tab.some((c) => c.patient_id === ligne.patient_id || c.identifiant === ligne.identifiant)
        ) {
          return { data: null, error: { code: '23505', message: 'duplicate' } };
        }
        tab.push(ligne);
        return { data: this.retourne ? (this.un ? ligne : [ligne]) : null, error: null };
      }
      const lignes = tab.filter((l) => correspond(l, this.filtres));
      if (this.op === 'update') {
        lignes.forEach((l) => Object.assign(l, this.v));
        return { data: this.retourne ? lignes : null, error: null };
      }
      if (this.opts && this.opts.head) return { count: lignes.length, error: null };
      if (this.un) return { data: lignes[0] ?? null, error: null };
      return { data: lignes, error: null };
    }
  }
  const fake = {
    from: (t) => new Q(t),
    rpc: async (nom, args) => {
      if (nom === 'portail_reserver_tentative') {
        const id = String(args.p_identifiant).toUpperCase().trim();
        const c = db.patient_comptes.find((x) => x.identifiant === id);
        if (!c) return { data: [], error: null };
        const libre = !c.bloque_jusqu || Date.parse(c.bloque_jusqu) <= Date.now();
        if (libre) {
          const n =
            c.bloque_jusqu && Date.parse(c.bloque_jusqu) <= Date.now() ? 1 : c.essais_echoues + 1;
          c.essais_echoues = n;
          c.bloque_jusqu = n >= 5 ? new Date(Date.now() + 15 * 60000).toISOString() : null;
        }
        return {
          data: [
            {
              compte_id: c.id,
              auth_user_id: c.auth_user_id,
              patient_id: c.patient_id,
              praticien_id: c.praticien_id,
              statut: c.statut,
              ticket_nonce: c.ticket_nonce,
              bloque: !libre,
              bloque_jusqu: c.bloque_jusqu,
            },
          ],
          error: null,
        };
      }
      if (nom === 'portail_succes') {
        const c = db.patient_comptes.find((x) => x.id === args.p_compte);
        if (c) {
          c.essais_echoues = 0;
          c.bloque_jusqu = null;
        }
        return { data: null, error: null };
      }
      return { data: null, error: { message: 'rpc inconnue' } };
    },
    auth: {
      getUser: async (token) => {
        const u = db.users[token];
        return u
          ? { data: { user: { id: token, app_metadata: u.app_metadata } }, error: null }
          : { data: { user: null }, error: { message: 'bad' } };
      },
      admin: {
        createUser: async (a) => {
          const id = 'auth-' + ++db.seq;
          db.users[id] = { app_metadata: a.app_metadata, email: a.email };
          db.mdp[id] = a.password;
          return { data: { user: { id } }, error: null };
        },
        deleteUser: async (id) => {
          delete db.users[id];
          return { error: null };
        },
        updateUserById: async (id, a) => {
          if (a.password) {
            db.mdp[id] = a.password;
            db.updates_mdp.push(id);
          }
          return { data: {}, error: null };
        },
      },
    },
  };
  return fake;
}

async function charger(chemin, db) {
  vi.resetModules();
  let gestionnaire = null;
  globalThis.Deno = {
    env: {
      get: (k) =>
        ({
          SUPABASE_URL: 'https://x.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
          SUPABASE_ANON_KEY: 'anon',
        })[k],
    },
    serve: (h) => {
      gestionnaire = h;
    },
  };
  vi.doMock('https://esm.sh/@supabase/supabase-js@2', () => ({
    createClient: () => monterSupabaseFactice(db),
  }));
  await import(/* @vite-ignore */ chemin);
  return gestionnaire;
}
function requete(corps, entetes = {}) {
  return new Request('http://local/fn', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.9', ...entetes },
    body: JSON.stringify(corps),
  });
}
async function appeler(h, corps, entetes) {
  const r = await h(requete(corps, entetes));
  return { statut: r.status, corps: await r.json() };
}

describe('patient-connexion — parcours complet', () => {
  let db, h, compte;
  beforeEach(async () => {
    db = creerBase();
    compte = {
      id: 'cpt-1',
      praticien_id: 'prat-1',
      patient_id: 'pat-1',
      auth_user_id: 'auth-p1',
      identifiant: 'K7M2-9QXP',
      statut: 'initial',
      essais_echoues: 0,
      bloque_jusqu: null,
      ticket_nonce: null,
      premier_acces_at: null,
    };
    db.patient_comptes.push(compte);
    db.users['auth-p1'] = { app_metadata: { role: 'patient' } };
    db.mdp['auth-p1'] = 'aleatoire-inconnu';
    h = await charger('../supabase/functions/patient-connexion/index.ts', db);
    // GoTrue simulé : n'accepte que le mot de passe réellement enregistré
    globalThis.fetch = vi.fn(async (url, init) => {
      const b = JSON.parse(init.body);
      const id =
        Object.keys(db.users).find((k) => db.users[k].email === b.email) ||
        (b.email === 'k7m29qxp@patients.verticy.invalid' ? 'auth-p1' : null);
      if (id && db.mdp[id] === b.password)
        return new Response(
          JSON.stringify({
            access_token: 'jwt-' + id,
            refresh_token: 'r',
            expires_in: 3600,
            expires_at: 9999999999,
            user: { id },
          }),
          { status: 200 }
        );
      return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
    });
  });

  const conn = (secret, id = 'k7m2 9qxp') =>
    appeler(h, { action: 'connexion', identifiant: id, secret });

  it('identifiant inconnu ou mal formé : refus générique, journalisé', async () => {
    expect((await conn('20100517', 'ZZZZ-ZZZZ')).statut).toBe(401);
    expect((await conn('20100517', 'abc')).statut).toBe(401);
    expect(db.patient_connexions.map((j) => j.type)).toEqual(['echec_inconnu', 'echec_format']);
  });
  it('mauvaise date : refus avec essais restants ; aucune session ni billet', async () => {
    const r = await conn('19990101');
    expect(r.statut).toBe(401);
    expect(r.corps.error).toBe('identifiants_incorrects');
    expect(r.corps.restants).toBe(4);
    expect(JSON.stringify(r.corps)).not.toMatch(/billet|session|token/);
  });
  it('5 essais puis blocage : la BONNE date est refusée pendant le blocage', async () => {
    for (let i = 0; i < 4; i++) expect((await conn('19990101')).statut).toBe(401);
    const cinq = await conn('19990101');
    expect(cinq.statut).toBe(429);
    expect(cinq.corps.error).toBe('bloque');
    const six = await conn('20100517'); // la bonne date
    expect(six.statut).toBe(429);
    expect(six.corps.billet).toBeUndefined();
    expect(db.patient_comptes[0].ticket_nonce).toBeNull();
    // la bonne date n'a rien débloqué, même avec un mot de passe : toujours 429
    expect((await conn(MDP_PATIENT_OK)).statut).toBe(429);
  });
  it('blocage levé après 15 minutes : un nouvel essai est permis', async () => {
    for (let i = 0; i < 5; i++) await conn('19990101');
    db.patient_comptes[0].bloque_jusqu = new Date(Date.now() - 1000).toISOString();
    const r = await conn('20100517');
    expect(r.statut).toBe(200);
    expect(r.corps.etape).toBe('choisir_mot_de_passe');
  });
  it('bonne date : billet à usage unique, puis mot de passe choisi → compte actif', async () => {
    const r = await conn('2010 05 17');
    expect(r.statut).toBe(200);
    expect(r.corps.etape).toBe('choisir_mot_de_passe');
    const billet = r.corps.billet;
    // mot de passe trop faible : refusé, le billet reste utilisable
    const faible = await appeler(h, { action: 'definir', billet, mot_de_passe: 'court' });
    expect(faible.statut).toBe(400);
    expect(db.patient_comptes[0].statut).toBe('initial');
    // la date de naissance comme mot de passe : refusé
    expect(
      (await appeler(h, { action: 'definir', billet, mot_de_passe: 'x20100517x' })).statut
    ).toBe(400);
    const ok = await appeler(h, { action: 'definir', billet, mot_de_passe: MDP_PATIENT_OK });
    expect(ok.statut).toBe(200);
    expect(db.patient_comptes[0].statut).toBe('actif');
    expect(db.mdp['auth-p1']).toBe(MDP_PATIENT_OK);
    // le billet ne sert qu'une fois
    const rejoue = await appeler(h, {
      action: 'definir',
      billet,
      mot_de_passe: 'Un-autre-mot-de-passe-9',
    });
    expect(rejoue.statut).toBe(401);
    expect(db.mdp['auth-p1']).toBe(MDP_PATIENT_OK);
  });
  it('deux envois simultanés du même billet : un seul réussit (consommation atomique)', async () => {
    const r = await conn('20100517');
    const [a, b] = await Promise.all([
      appeler(h, {
        action: 'definir',
        billet: r.corps.billet,
        mot_de_passe: 'Premier-choix-du-patient-1',
      }),
      appeler(h, {
        action: 'definir',
        billet: r.corps.billet,
        mot_de_passe: 'Second-choix-du-pirate-22',
      }),
    ]);
    expect([a.statut, b.statut].sort()).toEqual([200, 401]);
    const gagnant = a.statut === 200 ? 'Premier-choix-du-patient-1' : 'Second-choix-du-pirate-22';
    expect(db.mdp['auth-p1']).toBe(gagnant);
    expect(db.updates_mdp.length).toBe(1);
  });
  it('mot de passe initial à usage unique : la date ne marche plus une fois le mot de passe choisi', async () => {
    const r = await conn('20100517');
    await appeler(h, { action: 'definir', billet: r.corps.billet, mot_de_passe: MDP_PATIENT_OK });
    const rejoue = await conn('20100517');
    expect(rejoue.statut).toBe(401);
    expect(rejoue.corps.etape).toBeUndefined();
    expect(JSON.stringify(rejoue.corps)).not.toMatch(/token/);
  });
  it('connexion avec le mot de passe choisi : session ; mauvais mot de passe : refus compté', async () => {
    const r = await conn('20100517');
    await appeler(h, { action: 'definir', billet: r.corps.billet, mot_de_passe: MDP_PATIENT_OK });
    const bon = await conn(MDP_PATIENT_OK);
    expect(bon.statut).toBe(200);
    expect(bon.corps.etape).toBe('ok');
    expect(bon.corps.session.access_token).toBe('jwt-auth-p1');
    expect(bon.corps.session.user).toBeUndefined(); // pas de fiche utilisateur renvoyée
    const mauvais = await conn('Mauvais-mot-de-passe-1');
    expect(mauvais.statut).toBe(401);
    expect(mauvais.corps.restants).toBe(4);
    for (let i = 0; i < 4; i++) await conn('Mauvais-mot-de-passe-1');
    expect((await conn(MDP_PATIENT_OK)).statut).toBe(429); // bloqué même avec le bon mot de passe
  });
  it('billets falsifiés, expirés ou d’un autre compte : refusés', async () => {
    expect(
      (await appeler(h, { action: 'definir', billet: 'n.importe', mot_de_passe: MDP_PATIENT_OK }))
        .statut
    ).toBe(401);
    // billet signé avec une autre clé
    const faux = await P.signerBillet(
      'autre-cle',
      { c: 'cpt-1', n: 'n' },
      Math.floor(Date.now() / 1000)
    );
    expect(
      (await appeler(h, { action: 'definir', billet: faux, mot_de_passe: MDP_PATIENT_OK })).statut
    ).toBe(401);
    // billet bien signé mais nonce jamais délivré (aucune étape « date » faite)
    const sansEtape = await P.signerBillet(
      SERVICE_KEY,
      { c: 'cpt-1', n: 'nonce-invente' },
      Math.floor(Date.now() / 1000)
    );
    expect(
      (await appeler(h, { action: 'definir', billet: sansEtape, mot_de_passe: MDP_PATIENT_OK }))
        .statut
    ).toBe(401);
    // billet expiré
    const vieux = await P.signerBillet(
      SERVICE_KEY,
      { c: 'cpt-1', n: 'n' },
      Math.floor(Date.now() / 1000) - 3600
    );
    expect(
      (await appeler(h, { action: 'definir', billet: vieux, mot_de_passe: MDP_PATIENT_OK })).statut
    ).toBe(401);
    expect(db.updates_mdp).toEqual([]);
  });
  it('le billet d’un patient ne change pas le mot de passe d’un autre', async () => {
    db.patients.push({ id: 'pat-3', user_id: 'prat-1', ddn: '1975-03-04' });
    db.patient_comptes.push({
      id: 'cpt-3',
      praticien_id: 'prat-1',
      patient_id: 'pat-3',
      auth_user_id: 'auth-p3',
      identifiant: 'M3N4-5PQR',
      statut: 'initial',
      essais_echoues: 0,
      bloque_jusqu: null,
      ticket_nonce: null,
    });
    db.mdp['auth-p3'] = 'aleatoire-3';
    const r1 = await conn('20100517'); // billet du compte 1
    const forge = await P.signerBillet(
      SERVICE_KEY,
      {
        c: 'cpt-3',
        n: JSON.parse(atob(r1.corps.billet.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).n,
      },
      Math.floor(Date.now() / 1000)
    );
    expect(
      (await appeler(h, { action: 'definir', billet: forge, mot_de_passe: MDP_PATIENT_OK })).statut
    ).toBe(401);
    expect(db.mdp['auth-p3']).toBe('aleatoire-3');
  });
  it('limite par adresse IP : 30 échecs bloquent même une bonne connexion', async () => {
    for (let i = 0; i < 30; i++)
      db.patient_connexions.push({
        compte_id: null,
        type: 'echec_inconnu',
        ip: '198.51.100.9',
        at: new Date().toISOString(),
      });
    const r = await conn('20100517');
    expect(r.statut).toBe(429);
    // une autre adresse n'est pas touchée
    const autre = await appeler(
      h,
      { action: 'connexion', identifiant: 'K7M2-9QXP', secret: '20100517' },
      { 'x-forwarded-for': '203.0.113.50' }
    );
    expect(autre.statut).toBe(200);
  });
  it('accès fermé par le praticien : aucune session même avec le bon mot de passe', async () => {
    const r = await conn('20100517');
    await appeler(h, { action: 'definir', billet: r.corps.billet, mot_de_passe: MDP_PATIENT_OK });
    db.patient_comptes[0].statut = 'suspendu';
    const f = await conn(MDP_PATIENT_OK);
    expect(f.statut).toBe(403);
    expect(f.corps.session).toBeUndefined();
  });
  it('actions inconnues, corps invalide, mauvaise méthode', async () => {
    expect((await appeler(h, { action: 'x' })).statut).toBe(400);
    const r = await h(new Request('http://local/fn', { method: 'POST', body: 'pas du json' }));
    expect(r.status).toBe(400);
    const g = await h(new Request('http://local/fn', { method: 'GET' }));
    expect(g.status).toBe(405);
  });
  it('la date de naissance n’est jamais renvoyée', async () => {
    const reponses = [await conn('19990101'), await conn('20100517')];
    for (const r of reponses) expect(JSON.stringify(r.corps)).not.toMatch(/2010|ddn/);
  });
});

describe('patient-compte — gestion par le praticien', () => {
  let db, h;
  beforeEach(async () => {
    db = creerBase();
    h = await charger('../supabase/functions/patient-compte/index.ts', db);
  });
  const avec = (corps, token = 'prat-1') => appeler(h, corps, { authorization: 'Bearer ' + token });

  it('sans jeton ou avec un faux jeton : refusé', async () => {
    expect((await appeler(h, { action: 'creer', patient_id: 'x' })).statut).toBe(401);
    expect(
      (await avec({ action: 'creer', patient_id: '11111111-1111-1111-1111-111111111111' }, 'faux'))
        .statut
    ).toBe(401);
  });
  it('un compte patient ne peut rien créer', async () => {
    const r = await avec(
      { action: 'creer', patient_id: '11111111-1111-1111-1111-111111111111' },
      'pat-user'
    );
    expect(r.statut).toBe(403);
    expect(db.patient_comptes).toEqual([]);
  });
  it('identifiant de fiche invalide : refusé', async () => {
    expect((await avec({ action: 'creer', patient_id: "1' or '1'='1" })).statut).toBe(400);
  });
  it('fiche d’un autre praticien : introuvable, aucun compte créé', async () => {
    db.patients.push({
      id: '22222222-2222-2222-2222-222222222222',
      user_id: 'prat-2',
      ddn: '1980-01-02',
    });
    const r = await avec({ action: 'creer', patient_id: '22222222-2222-2222-2222-222222222222' });
    expect(r.statut).toBe(404);
    expect(db.patient_comptes).toEqual([]);
    expect(Object.keys(db.users)).toEqual(['prat-1', 'prat-2', 'pat-user']);
  });
  it('fiche sans date de naissance : refusé (pas de compte à moitié créé)', async () => {
    db.patients.push({ id: '33333333-3333-3333-3333-333333333333', user_id: 'prat-1', ddn: null });
    const r = await avec({ action: 'creer', patient_id: '33333333-3333-3333-3333-333333333333' });
    expect(r.statut).toBe(400);
    expect(r.corps.error).toBe('ddn_manquante');
    expect(db.patient_comptes).toEqual([]);
  });
  const PID = '44444444-4444-4444-4444-444444444444';
  it('création : identifiant lisible, compte Auth marqué patient, mot de passe aléatoire, idempotent', async () => {
    db.patients.push({ id: PID, user_id: 'prat-1', ddn: '2010-05-17' });
    const r = await avec({ action: 'creer', patient_id: PID, cabinet: '  Cabinet Fictif  ' });
    expect(r.statut).toBe(200);
    expect(r.corps.identifiant).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(r.corps.statut).toBe('initial');
    expect(JSON.stringify(r.corps)).not.toMatch(/2010|password|mot_de_passe/);
    const c = db.patient_comptes[0];
    expect(c.praticien_id).toBe('prat-1');
    expect(c.cabinet).toBe('Cabinet Fictif');
    expect(db.users[c.auth_user_id].app_metadata).toEqual({ role: 'patient' });
    expect(db.mdp[c.auth_user_id]).toMatch(/^[0-9a-f]{64}$/);
    expect(db.mdp[c.auth_user_id]).not.toContain('20100517');
    const encore = await avec({ action: 'creer', patient_id: PID });
    expect(encore.corps.existe).toBe(true);
    expect(encore.corps.identifiant).toBe(r.corps.identifiant);
    expect(db.patient_comptes.length).toBe(1);
  });
  it('réinitialiser : nouveau mot de passe inconnu, retour à « initial » ; autre praticien refusé', async () => {
    db.patients.push({ id: PID, user_id: 'prat-1', ddn: '2010-05-17' });
    await avec({ action: 'creer', patient_id: PID });
    const c = db.patient_comptes[0];
    c.statut = 'actif';
    c.essais_echoues = 3;
    c.premier_acces_at = 'x';
    const avant = db.mdp[c.auth_user_id];
    const r = await avec({ action: 'reinitialiser', patient_id: PID });
    expect(r.corps.statut).toBe('initial');
    expect(db.mdp[c.auth_user_id]).not.toBe(avant);
    expect(c.essais_echoues).toBe(0);
    const autre = await avec({ action: 'reinitialiser', patient_id: PID }, 'prat-2');
    expect(autre.statut).toBe(404);
  });
  it('suspendre / réactiver : un accès jamais utilisé revient à « initial »', async () => {
    db.patients.push({ id: PID, user_id: 'prat-1', ddn: '2010-05-17' });
    await avec({ action: 'creer', patient_id: PID });
    expect((await avec({ action: 'suspendre', patient_id: PID })).corps.statut).toBe('suspendu');
    expect((await avec({ action: 'reactiver', patient_id: PID })).corps.statut).toBe('initial');
    db.patient_comptes[0].premier_acces_at = '2026-10-22';
    await avec({ action: 'suspendre', patient_id: PID });
    expect((await avec({ action: 'reactiver', patient_id: PID })).corps.statut).toBe('actif');
  });
  it('action sans compte, action inconnue', async () => {
    db.patients.push({ id: PID, user_id: 'prat-1', ddn: '2010-05-17' });
    expect((await avec({ action: 'suspendre', patient_id: PID })).statut).toBe(404);
    await avec({ action: 'creer', patient_id: PID });
    expect((await avec({ action: 'effacer', patient_id: PID })).statut).toBe(400);
  });
});
