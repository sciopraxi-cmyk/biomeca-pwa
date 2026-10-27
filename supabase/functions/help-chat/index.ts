// Edge Function help-chat — assistant IA d'aide à l'utilisation (#229-D étape 2).
//
// Proxy vers l'API Anthropic (Claude Haiku) STRICTEMENT limité à la
// documentation du logiciel Verticy. Aucune donnée patient ne doit transiter
// ici : le système l'interdit au modèle, et le client affiche l'avertissement.
//
// Maîtrise du coût :
// - plafond DAILY_LIMIT messages / utilisateur / jour (table help_chat_usage,
//   incrément via service_role — migration help-chat-usage.sql)
// - historique borné (MAX_MSGS messages, MAX_MSG_CHARS chars chacun)
// - réponses courtes (max_tokens serré)
//
// Sans clé : si le secret ANTHROPIC_API_KEY n'est pas posé, la fonction
// répond 503 { error:'chat_unavailable' } et le client replie sur la FAQ.
// Mise en service : supabase secrets set ANTHROPIC_API_KEY=... (aucun
// redéploiement de code nécessaire, le secret est lu à l'invocation).
//
// Auth : tout user authentifié (même vérif JWT que start-trial).
// Déploiement : supabase functions deploy help-chat --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const DAILY_LIMIT = 20; // messages / utilisateur / jour
const MAX_MSGS = 8; // messages d'historique transmis au modèle
const MAX_MSG_CHARS = 1500; // longueur max d'un message
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 500;

// Documentation condensée du logiciel — seule source du modèle. Résumé de la
// FAQ (#229-D étape 1, _FAQ_DATA dans js/biomeca.js) ; à tenir en phase.
const VERTICY_DOC = `Verticy est une application web (PWA) de bilans pour kinésiologues, ostéopathes et podologues.
PATIENTS : liste patients, création via "+ Nouveau patient" (nom, prénom et date de naissance obligatoires — la ddn évite les doublons à l'import). Import CSV (bouton "📥 Import CSV") depuis Doctolib (base patients ou rendez-vous) et DrSanté : idempotent, jamais de doublon, ne remplit que les champs vides, le numéro de sécurité sociale n'est jamais importé ni stocké. Export CSV du répertoire (bouton "📤 Export CSV", lisible Excel, sert de sauvegarde et d'export RGPD). Les champs Antécédents et Examens de la fiche se pré-remplissent dans l'anamnèse de chaque nouveau bilan ; complétés pendant un bilan en cours, ils remontent vers la fiche ; les archives restent figées. Modifier une fiche : ✏️ ; supprimer : ✕ (définitif, exporter avant).
BILANS : quatre types — Sportif, Posturologie, Podopédiatrie, Pédicurie (pédicurie incluse dans toutes les formules), chacun en version Initial puis Contrôle. Sauvegarde automatique de chaque champ + synchronisation cloud. Archivage : finaliser le bilan en cours le fige en archive consultable depuis la carte patient. Comparaison de deux bilans côte à côte avec différences surlignées ("Comparer les bilans" sur la carte patient). Date de consultation auto-remplie à la création, modifiable.
RAPPORTS : onglet Rapport du bilan, aperçu fidèle, impression via Imprimer → "Enregistrer au format PDF". Envoi par mail : bouton "✉️ Envoyer par mail" (messagerie pré-remplie, joindre le PDF). Logo du praticien : onglet Praticiens → ✏️ → "🖼️ Choisir une image" (PNG/JPEG), affiché au centre de l'en-tête des quatre rapports. Un schéma jamais dessiné n'apparaît pas dans le rapport ; une image non chargée est signalée par une mention rouge (vérifier la connexion puis régénérer).
PHOTOS & DESSINS : galeries par section (podoscope, vue plantaire, dermato, ongles, chaussage…), photos stockées de façon sécurisée dans le cloud. Dessin sur silhouettes et pieds : crayon, gomme, annuler ; sauvegarde automatique.
DICTÉE VOCALE : micro 🎤 sous les champs de texte libre (podopédiatrie et pédicurie), Chrome ou Edge requis.
AGENDA : onglet Agenda — comptes Google Calendar multiples (lecture/écriture, une couleur par compte) et calendrier Apple via lien ICS (lecture seule). Vues semaine et mois. Import CSV Doctolib (bouton "📥 Importer l'export Doctolib") : les RDV s'affichent en lecture seule.
DEVIS ET FACTURES : 🧾 Devis et factures (patient sélectionné dans la liste). Actes personnalisés (titre, montant sans TVA, cotation, remboursement), émis et numérotés automatiquement, brouillon modifiable. Lignes, patient et émetteur sont des instantanés figés à l'émission. Le devis peut être signé par le patient (pas de signature dans l'aperçu praticien).
SIGNATURE DU DEVIS : le patient voit le devis dans son portail, coche "J'ai lu et j'accepte", signe au doigt. Mineur : code à 6 chiffres envoyé au parent. Le praticien voit "✍️ signé le …" dans la liste et un bloc de preuve (date, IP, empreinte).
ORDONNANCES : 📝 Ordonnances (patient sélectionné). Modèle par défaut ou personnalisé, impression avec signature et tampon du praticien. Stockées dans le dossier patient.
STÉRILISATION : 🧼 Traçabilité de stérilisation — registre des cycles, appareils, sets, soins. Mentions réglementaires (cahier de stérilisation, 5 ans). Accessible depuis les onglets du logiciel.
PORTAIL PATIENT : le patient se connecte avec son identifiant et son mot de passe (AAAA MM JJ). Documents partagés, signature du devis, messagerie, exercices vidéo avec chronomètre, validation quotidienne. Le praticien gère l'accès depuis la clé 🔑 de la fiche patient.
MODE DOMICILE : Verticy fonctionne hors connexion (consultation et saisie). La synchronisation cloud reprend automatiquement au retour du réseau. Éviter de générer des rapports avec photos hors ligne. Session et abonnement gardés 7 jours hors ligne.
EXERCICES : 🏋️ Bibliothèque d'exercices — base SCIOPRAXI et exercices personnels, fiches PDF, liens YouTube. Les exercices sont ajoutés aux programmes des patients.
COMPTE : "👤 Mon compte" → gérer l'abonnement (portail sécurisé), changer de formule, changer le mot de passe, contacter le support (contact@verticy.fr). Verrouillage automatique de session après inactivité (sécurité des données de santé) — reconnexion sans perte.
DONNÉES : stockées sur l'appareil + cloud sécurisé européen, chaque praticien ne voit que ses patients. Fonctionne hors ligne (éviter de générer des rapports avec photos hors ligne). Aide : bouton "❓ Aide" (FAQ avec recherche + cet assistant).`;

const SYSTEM_PROMPT = `Tu es l'assistant d'aide de Verticy. Tu réponds UNIQUEMENT aux questions sur l'utilisation du logiciel Verticy, en français, en 2 à 5 phrases maximum, sur la seule base de la documentation fournie.
Règles impératives :
- Si la question sort de l'utilisation du logiciel (question clinique, diagnostic, cas patient, sujet général), refuse poliment et renvoie vers la FAQ ou le support (contact@verticy.fr).
- Ne demande JAMAIS de donnée patient. Si l'utilisateur en fournit (nom, date de naissance, éléments médicaux…), demande-lui de ne pas en communiquer ici et réponds sans les répéter.
- Si la documentation ne couvre pas la question, dis-le et propose d'écrire à contact@verticy.fr — n'invente rien.

Documentation :
${VERTICY_DOC}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ─── Clé API : sans elle, service explicitement indisponible ────────
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'chat_unavailable' }, 503);

  // ─── Auth : JWT user authentifié (pattern start-trial) ─────────────
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);
  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  // Portail patient (lot b) : un compte patient n'a rien à faire ici.
  if ((userData.user.app_metadata as Record<string, unknown> | undefined)?.role === 'patient') {
    return json({ error: 'forbidden' }, 403);
  }
  const userId = userData.user.id;

  // ─── Validation du payload ─────────────────────────────────────────
  let messages: { role: string; content: string }[];
  try {
    const body = await req.json();
    messages = body?.messages;
  } catch (_e) {
    return json({ error: 'Invalid JSON' }, 400);
  }
  if (!Array.isArray(messages) || !messages.length)
    return json({ error: 'messages required' }, 400);
  messages = messages.slice(-MAX_MSGS).map((m) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_MSG_CHARS),
  }));
  if (
    messages[messages.length - 1].role !== 'user' ||
    !messages[messages.length - 1].content.trim()
  ) {
    return json({ error: 'last message must be a non-empty user message' }, 400);
  }

  // ─── Plafond journalier (avant tout appel payant) ──────────────────
  // Incrément ATOMIQUE en base (migration help-chat-usage-atomique.sql) :
  // NULL = limite atteinte. Plus de lecture→écriture contournable en parallèle.
  const day = new Date().toISOString().slice(0, 10);
  const { data: newCount, error: usageErr } = await supaAdmin.rpc('help_chat_incrementer', {
    p_user: userId,
    p_day: day,
    p_limit: DAILY_LIMIT,
  });
  if (usageErr) return json({ error: 'usage: ' + usageErr.message }, 500);
  if (newCount === null) return json({ error: 'daily_limit', limit: DAILY_LIMIT }, 429);
  const count = (newCount as number) - 1;

  // ─── Appel Anthropic ───────────────────────────────────────────────
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages,
    }),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('anthropic error', resp.status, detail.slice(0, 300));
    // Crédit épuisé, clé invalide, surcharge… → même repli client que sans clé.
    return json({ error: 'chat_unavailable' }, 503);
  }
  const data = await resp.json();
  const reply = (data?.content ?? [])
    .filter((b: { type?: string }) => b?.type === 'text')
    .map((b: { text?: string }) => b.text ?? '')
    .join('')
    .trim();
  if (!reply) return json({ error: 'chat_unavailable' }, 503);

  return json({ ok: true, reply, remaining: DAILY_LIMIT - count - 1 });
});
