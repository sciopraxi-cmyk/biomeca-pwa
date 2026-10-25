// Edge Function patient-connexion — connexion du patient au portail (lot b).
//
// Appelable SANS jeton (le patient n'est pas encore connecté) : déployer avec
// `--no-verify-jwt`. Toute la défense est ici et dans les fonctions SQL
// atomiques de portail-patient-base.sql :
//  - 5 essais par compte puis blocage de 15 min (compteur incrémenté AVANT la
//    vérification : des requêtes parallèles ne donnent jamais plus de 5 essais) ;
//  - 30 échecs par adresse IP sur 15 min ;
//  - mot de passe initial (date de naissance AAAAMMJJ) à usage unique, vérifié
//    ICI : le mot de passe Supabase initial est aléatoire et inconnu ;
//  - réponse identique pour « identifiant inconnu » et « mauvais secret ».
//
// Actions (POST JSON) :
//  { action:'connexion', identifiant, secret }
//     compte « initial » : secret = date AAAAMMJJ → { etape:'choisir_mot_de_passe', billet }
//     compte « actif »   : secret = mot de passe → { etape:'ok', session }
//  { action:'definir', billet, mot_de_passe }  → { ok:true } (le patient se connecte ensuite)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  BLOCAGE_MINUTES,
  ECHECS_IP_MAX,
  ESSAIS_MAX,
  ddnVersSecret,
  normaliserCodeProvisoire,
  egalConstant,
  ipClient,
  minutesRestantes,
  nonceAleatoire,
  normaliserIdentifiant,
  normaliserSecretDdn,
  signerBillet,
  validerMotDePasse,
  verifierBillet,
  emailTechnique,
} from '../_shared/portail-v1.ts';

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const supaAdmin = createClient(SUPA_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
const ECHEC = {
  error: 'identifiants_incorrects',
  message: 'Identifiant ou mot de passe incorrect.',
};

async function journal(
  compte: { id: string; praticien_id: string } | null,
  type: string,
  ip: string
): Promise<void> {
  await supaAdmin.from('patient_connexions').insert({
    compte_id: compte?.id ?? null,
    praticien_id: compte?.praticien_id ?? null,
    type,
    ip,
  });
}

async function echecsIpRecents(ip: string): Promise<number> {
  const depuis = new Date(Date.now() - BLOCAGE_MINUTES * 60000).toISOString();
  const { count } = await supaAdmin
    .from('patient_connexions')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .like('type', 'echec%')
    .gte('at', depuis);
  return count ?? 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'requete_invalide' }, 400);
  }
  const ip = ipClient(req.headers);
  const maintenantS = Math.floor(Date.now() / 1000);

  // ─── Choix du mot de passe (billet obtenu à l'étape « date de naissance ») ───
  if (body.action === 'definir') {
    const billet = await verifierBillet(SERVICE_KEY, body.billet, maintenantS);
    if (!billet)
      return json(
        { error: 'billet_invalide', message: 'Session expirée : recommencez votre connexion.' },
        401
      );

    const { data: compte } = await supaAdmin
      .from('patient_comptes')
      .select(
        'id, praticien_id, patient_id, auth_user_id, identifiant, statut, ticket_nonce, bloque_jusqu'
      )
      .eq('id', billet.c)
      .maybeSingle();
    if (
      !compte ||
      compte.statut !== 'initial' ||
      !compte.ticket_nonce ||
      !egalConstant(compte.ticket_nonce, billet.n)
    ) {
      return json(
        { error: 'billet_invalide', message: 'Session expirée : recommencez votre connexion.' },
        401
      );
    }
    if (compte.bloque_jusqu && Date.parse(compte.bloque_jusqu) > Date.now()) {
      return json(
        { error: 'bloque', minutes: minutesRestantes(compte.bloque_jusqu, Date.now()) },
        429
      );
    }
    const { data: pat } = await supaAdmin
      .from('patients')
      .select('ddn')
      .eq('id', compte.patient_id)
      .maybeSingle();
    const faible = validerMotDePasse(body.mot_de_passe, {
      identifiant: compte.identifiant,
      ddnSecret: ddnVersSecret(pat?.ddn),
    });
    if (faible) return json({ error: 'mot_de_passe_faible', message: faible }, 400);

    // Consommation atomique du billet : un seul appel peut réussir.
    const { data: consomme } = await supaAdmin
      .from('patient_comptes')
      .update({ ticket_nonce: null })
      .eq('id', compte.id)
      .eq('ticket_nonce', billet.n)
      .eq('statut', 'initial')
      .select('id');
    if (!consomme || consomme.length !== 1) {
      return json(
        { error: 'billet_invalide', message: 'Session expirée : recommencez votre connexion.' },
        401
      );
    }
    const { error: mdpErr } = await supaAdmin.auth.admin.updateUserById(compte.auth_user_id, {
      password: body.mot_de_passe as string,
    });
    if (mdpErr) {
      // Supabase a refusé le mot de passe : on rend le billet pour que le patient puisse réessayer.
      await supaAdmin
        .from('patient_comptes')
        .update({ ticket_nonce: billet.n })
        .eq('id', compte.id)
        .eq('statut', 'initial');
      return json(
        {
          error: 'mot_de_passe_faible',
          message: 'Ce mot de passe est refusé. Essayez-en un autre, plus long.',
        },
        400
      );
    }

    await supaAdmin
      .from('patient_comptes')
      .update({
        statut: 'actif',
        premier_acces_at: new Date().toISOString(),
        code_provisoire: null, // le code ne sert qu'une fois
      })
      .eq('id', compte.id);
    await supaAdmin.rpc('portail_succes', { p_compte: compte.id });
    await journal(compte, 'mot_de_passe_defini', ip);
    return json({ ok: true });
  }

  // ─── Connexion ───
  if (body.action !== 'connexion') return json({ error: 'action_inconnue' }, 400);

  if ((await echecsIpRecents(ip)) >= ECHECS_IP_MAX) {
    return json({ error: 'bloque', minutes: BLOCAGE_MINUTES }, 429);
  }
  const identifiant = normaliserIdentifiant(body.identifiant);
  const secretBrut = typeof body.secret === 'string' ? body.secret : '';
  if (!identifiant || !secretBrut || secretBrut.length > 200) {
    await journal(null, 'echec_format', ip);
    return json(ECHEC, 401);
  }

  const { data: lignes, error: rpcErr } = await supaAdmin.rpc('portail_reserver_tentative', {
    p_identifiant: identifiant,
  });
  if (rpcErr)
    return json({ error: 'indisponible', message: 'Service momentanément indisponible.' }, 503);
  const compte = Array.isArray(lignes) ? lignes[0] : null;
  if (!compte || !compte.compte_id) {
    await journal(null, 'echec_inconnu', ip);
    return json(ECHEC, 401);
  }
  const c = { id: compte.compte_id as string, praticien_id: compte.praticien_id as string };
  if (compte.bloque) {
    await journal(c, 'echec_bloque', ip);
    return json(
      { error: 'bloque', minutes: minutesRestantes(compte.bloque_jusqu, Date.now()) },
      429
    );
  }

  // Essais restants APRÈS cet essai (le compteur vient d'être incrémenté).
  async function restants(): Promise<number> {
    const { data } = await supaAdmin
      .from('patient_comptes')
      .select('essais_echoues, bloque_jusqu')
      .eq('id', c.id)
      .maybeSingle();
    if (data?.bloque_jusqu && Date.parse(data.bloque_jusqu) > Date.now()) return 0;
    return Math.max(0, ESSAIS_MAX - (data?.essais_echoues ?? 0));
  }
  async function refuser(type: string): Promise<Response> {
    await journal(c, type, ip);
    const r = await restants();
    if (r === 0) return json({ error: 'bloque', minutes: BLOCAGE_MINUTES }, 429);
    return json({ ...ECHEC, restants: r }, 401);
  }

  // Compte à choisir : le secret attendu est la date de naissance (usage unique).
  if (compte.statut === 'initial') {
    // Deux secrets possibles : la date de naissance de la fiche (si elle existe) ou le code provisoire.
    const saisi = normaliserSecretDdn(secretBrut);
    const saisiCode = normaliserCodeProvisoire(secretBrut);
    const { data: pat } = await supaAdmin
      .from('patients')
      .select('ddn')
      .eq('id', compte.patient_id)
      .maybeSingle();
    const { data: cp } = await supaAdmin
      .from('patient_comptes')
      .select('code_provisoire')
      .eq('id', c.id)
      .maybeSingle();
    const attendu = ddnVersSecret(pat?.ddn);
    const attenduCode = typeof cp?.code_provisoire === 'string' ? cp.code_provisoire : null;
    const okDdn = !!saisi && !!attendu && egalConstant(saisi, attendu);
    const okCode = !!saisiCode && !!attenduCode && egalConstant(saisiCode, attenduCode);
    if (!okDdn && !okCode) return await refuser('echec_ddn');
    const nonce = nonceAleatoire();
    await supaAdmin
      .from('patient_comptes')
      .update({ ticket_nonce: nonce })
      .eq('id', c.id)
      .eq('statut', 'initial');
    const billet = await signerBillet(SERVICE_KEY, { c: c.id, n: nonce }, maintenantS);
    await supaAdmin.rpc('portail_succes', { p_compte: c.id });
    await journal(c, 'ddn_ok', ip);
    return json({ etape: 'choisir_mot_de_passe', billet });
  }

  // Compte actif ou suspendu : mot de passe vérifié par Supabase Auth, côté serveur.
  const r = await fetch(SUPA_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailTechnique(identifiant), password: secretBrut }),
  });
  if (!r.ok) return await refuser('echec_mot_de_passe');
  const session = await r.json();
  if (compte.statut === 'suspendu') {
    await journal(c, 'echec_suspendu', ip);
    return json(
      { error: 'acces_ferme', message: 'Votre accès est fermé. Contactez votre praticien.' },
      403
    );
  }
  await supaAdmin.rpc('portail_succes', { p_compte: c.id });
  await journal(c, 'connexion_ok', ip);
  return json({
    etape: 'ok',
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
    },
  });
});
