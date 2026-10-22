// Edge Function patient-compte — gestion des accès au portail par le PRATICIEN (lot b).
//
// Seul le serveur (clé service_role) peut créer un compte Auth : le client
// n'écrit jamais dans patient_comptes. Auth : jeton du praticien (verify_jwt
// actif) ; la fonction vérifie en plus que la fiche patient lui appartient et
// refuse tout jeton de compte patient.
//
// Actions (POST JSON, toutes avec { patient_id }) :
//  creer          → crée le compte (identifiant généré) ; idempotent
//  reinitialiser  → redonne un accès « première connexion » (date de naissance)
//  suspendre      → ferme l'accès ; reactiver → le rouvre
// Réponse : { ok:true, identifiant, statut }. Jamais de mot de passe ni de date.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ddnVersSecret,
  emailTechnique,
  genererIdentifiant,
  ipClient,
  motDePasseAleatoire,
} from '../_shared/portail-v1.ts';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

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
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'non_authentifie' }, 401);
  const { data: u, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !u?.user) return json({ error: 'non_authentifie' }, 401);
  const praticien = u.user;
  if ((praticien.app_metadata as Record<string, unknown> | undefined)?.role === 'patient') {
    return json({ error: 'interdit' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'requete_invalide' }, 400);
  }
  const action = body.action;
  const patientId = body.patient_id;
  if (typeof patientId !== 'string' || !UUID.test(patientId))
    return json({ error: 'patient_invalide' }, 400);

  // La fiche doit appartenir à CE praticien (la clé service_role ignore la RLS : contrôle explicite).
  const { data: pat } = await supaAdmin
    .from('patients')
    .select('id, user_id, ddn')
    .eq('id', patientId)
    .eq('user_id', praticien.id)
    .maybeSingle();
  if (!pat) {
    return json(
      {
        error: 'patient_introuvable',
        message:
          'Fiche non trouvée dans le cloud : enregistrez la fiche, attendez quelques secondes puis réessayez.',
      },
      404
    );
  }

  const ip = ipClient(req.headers);
  const { data: existant } = await supaAdmin
    .from('patient_comptes')
    .select('id, praticien_id, auth_user_id, identifiant, statut, premier_acces_at')
    .eq('patient_id', patientId)
    .maybeSingle();

  async function journal(type: string, compteId: string) {
    await supaAdmin.from('patient_connexions').insert({
      compte_id: compteId,
      praticien_id: praticien.id,
      type,
      ip,
    });
  }

  if (action === 'creer') {
    if (existant) {
      const cabinet = typeof body.cabinet === 'string' ? body.cabinet.trim().slice(0, 120) : '';
      if (cabinet)
        await supaAdmin.from('patient_comptes').update({ cabinet }).eq('id', existant.id);
      return json({
        ok: true,
        identifiant: existant.identifiant,
        statut: existant.statut,
        existe: true,
      });
    }
    if (!ddnVersSecret(pat.ddn)) {
      return json(
        {
          error: 'ddn_manquante',
          message: 'La date de naissance de la fiche est nécessaire pour créer l’accès.',
        },
        400
      );
    }
    const cabinet = typeof body.cabinet === 'string' ? body.cabinet.trim().slice(0, 120) : null;
    for (let essai = 0; essai < 5; essai++) {
      const identifiant = genererIdentifiant();
      const { data: cree, error: cErr } = await supaAdmin.auth.admin.createUser({
        email: emailTechnique(identifiant),
        password: motDePasseAleatoire(),
        email_confirm: true,
        app_metadata: { role: 'patient' },
      });
      if (cErr || !cree?.user) {
        if (/already|exists|registered/i.test(cErr?.message || '')) continue; // collision d'identifiant
        return json(
          { error: 'creation_impossible', message: 'Création impossible, réessayez.' },
          500
        );
      }
      const { data: ligne, error: iErr } = await supaAdmin
        .from('patient_comptes')
        .insert({
          praticien_id: praticien.id,
          patient_id: patientId,
          auth_user_id: cree.user.id,
          identifiant,
          cabinet: cabinet || null,
        })
        .select('id, statut')
        .single();
      if (iErr || !ligne) {
        await supaAdmin.auth.admin.deleteUser(cree.user.id); // pas de compte orphelin
        if (iErr?.code === '23505') {
          // course : un autre appel vient de créer le compte de cette fiche
          const { data: dej } = await supaAdmin
            .from('patient_comptes')
            .select('identifiant, statut')
            .eq('patient_id', patientId)
            .maybeSingle();
          if (dej)
            return json({
              ok: true,
              identifiant: dej.identifiant,
              statut: dej.statut,
              existe: true,
            });
          continue;
        }
        return json(
          { error: 'creation_impossible', message: 'Création impossible, réessayez.' },
          500
        );
      }
      await journal('compte_cree', ligne.id);
      return json({ ok: true, identifiant, statut: ligne.statut, existe: false });
    }
    return json({ error: 'creation_impossible', message: 'Création impossible, réessayez.' }, 500);
  }

  if (!existant)
    return json({ error: 'compte_inexistant', message: 'Aucun accès créé pour ce patient.' }, 404);

  if (action === 'reinitialiser') {
    if (!ddnVersSecret(pat.ddn)) {
      return json(
        { error: 'ddn_manquante', message: 'La date de naissance de la fiche est nécessaire.' },
        400
      );
    }
    // Nouveau mot de passe Supabase aléatoire : l'ancien mot de passe choisi ne marche plus.
    const { error: mErr } = await supaAdmin.auth.admin.updateUserById(existant.auth_user_id, {
      password: motDePasseAleatoire(),
    });
    if (mErr) return json({ error: 'maj_impossible' }, 500);
    await supaAdmin
      .from('patient_comptes')
      .update({
        statut: 'initial',
        essais_echoues: 0,
        bloque_jusqu: null,
        ticket_nonce: null,
        premier_acces_at: null,
      })
      .eq('id', existant.id);
    await journal('reinitialise', existant.id);
    return json({ ok: true, identifiant: existant.identifiant, statut: 'initial' });
  }

  if (action === 'suspendre') {
    await supaAdmin
      .from('patient_comptes')
      .update({ statut: 'suspendu', ticket_nonce: null })
      .eq('id', existant.id);
    await journal('suspendu', existant.id);
    return json({ ok: true, identifiant: existant.identifiant, statut: 'suspendu' });
  }

  if (action === 'reactiver') {
    const statut = existant.premier_acces_at ? 'actif' : 'initial';
    await supaAdmin.from('patient_comptes').update({ statut }).eq('id', existant.id);
    await journal('reactive', existant.id);
    return json({ ok: true, identifiant: existant.identifiant, statut });
  }

  return json({ error: 'action_inconnue' }, 400);
});
