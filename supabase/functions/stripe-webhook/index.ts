// Webhook Stripe → activation licence_payee + métadonnées d'abonnement.
//
// Reçoit les événements signés de Stripe et met à jour user_data via le rôle
// service_role (bypass RLS + trigger protect_user_data_admin_fields).
//
// Suite à PR #3 (fermeture de la voie de fraude par auto-activation côté
// client), c'est ici que se fait désormais l'activation de licence_payee —
// au retour signé de Stripe, pas à la confirmation du navigateur.
//
// Refs : task #30A, audit RLS task #21, PR #3.

import Stripe from 'https://esm.sh/stripe@14?target=deno&deno-std=0.168.0&no-check';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Price IDs Stripe — dupliqués depuis js/biomeca.js. La source de vérité reste
// le Stripe Dashboard ; ces IDs sont les mêmes que ceux utilisés côté client
// pour rediriger vers Checkout.
const PRICE_MAP = {
  mensuel: [
    'price_1TNy2bIW0WGPcWsGcNjbZ1GS',
    'price_1TNy52IW0WGPcWsGRNeaxypm',
    'price_1TNyFDIW0WGPcWsGC9k5YBUM',
    'price_1TNyHiIW0WGPcWsGtHHZg2mL',
    'price_1TNyMLIW0WGPcWsGw82sj05L',
  ],
  annuel: [
    'price_1TO0q6IW0WGPcWsG05kRrDHq',
    'price_1TO0tYIW0WGPcWsGkkPtZUn4',
    'price_1TO0wcIW0WGPcWsGu8KWNyng',
    'price_1TO0zbIW0WGPcWsGLEXi1KRL',
    'price_1TO12oIW0WGPcWsGxY6tSZ92',
  ],
  licence: 'price_1TNyQeIW0WGPcWsGQNMYXnb3',
} as const;

// ─── PLAN_MODULES (test-mirror) ──────────────────────────────────────────────
// IMPORTANT — test-mirror : 4 endroits à garder sync
//   - js/subscription.mjs (source de vérité Vitest)
//   - js/biomeca.js MS_PLAN_MODULES (UI wizard)
//   - supabase/functions/prepare-module-change/index.ts (validation server in-app)
//   - supabase/functions/stripe-webhook/index.ts (apply post-paiement) ← ICI
//
// Ajout #63 : utilisé par handleCheckoutCompleted pour set un fallback cohérent
// de user_metadata.modules au paiement landing public (cas C "pending absent" =
// flow public où le user n'a pas explicité son choix via le wizard in-app).
const PLAN_MODULES = [
  { required: [], choose: { from: ['postural', 'podopedia'], count: 1 } },
  { required: ['podo_sport'], choose: null },
  { required: ['postural', 'podopedia'], choose: null },
  { required: ['podo_sport'], choose: { from: ['postural', 'podopedia'], count: 1 } },
  { required: ['postural', 'podopedia', 'podo_sport'], choose: null },
] as const;

// Retourne les modules par défaut d'un plan (required + premiers `count` de choose.from).
// Test-mirror de defaultModulesForPlan dans js/subscription.mjs.
function defaultModulesForPlan(planIdx: number): string[] {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return [];
  const fromChoose = plan.choose ? plan.choose.from.slice(0, plan.choose.count) : [];
  return [...plan.required, ...fromChoose];
}

// Valide qu'un set de modules est cohérent avec un plan donné.
// Test-mirror de isValidModulesForPlan dans js/subscription.mjs.
function isValidModulesForPlan(planIdx: number, modules: string[]): boolean {
  const plan = PLAN_MODULES[planIdx];
  if (!plan) return false;
  if (!plan.required.every((m) => modules.includes(m))) return false;
  if (plan.choose) {
    const chosen = modules.filter((m) => plan.choose!.from.includes(m)).length;
    if (chosen !== plan.choose.count) return false;
  }
  return true;
}

// ─── resolveUserIdByEmail — résolution email → user_id (task #63) ────────────
//
// V1 — Resolution email → user_id via listUsers paginée.
// Limites :
//   - O(N) au pire (user en page profonde)
//   - À monitorer si la base dépasse ~5 000 users
//   - Refactor cible si nécessaire :
//     a) Supabase ajoute auth.admin.getUserByEmail() → migration triviale
//     b) Fonction RPC SQL custom resolve_user_id_by_email() → O(1) avec index
//   - Voir task #63 PR pour contexte du choix V1
//
// Normalisation : email.toLowerCase() côté input ET comparaison (Supabase stocke
// lowercase, Stripe peut envoyer la casse formulaire originale).
async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const normalizedEmail = email.toLowerCase();
  let page = 1;
  const perPage = 200;
  const maxPages = 50; // cap absolu = 10 000 users (V1, documentaire)
  while (page <= maxPages) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('resolveUserIdByEmail: listUsers failed', { email, page, error });
      return null;
    }
    if (!data?.users || data.users.length === 0) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === normalizedEmail);
    if (match) return match.id;
    if (data.users.length < perPage) return null; // dernière page atteinte
    page++;
  }
  console.warn('resolveUserIdByEmail: max pages reached without match', { email, maxPages });
  return null;
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

// Provider crypto WebCrypto — nécessaire en Deno car node:crypto n'est pas
// dispo. Permet à constructEventAsync de vérifier la signature HMAC.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function identifyFormule(
  priceIds: string[]
): { formule: string; engagement: 'sans' | '1_an' } | null {
  for (let i = 0; i < PRICE_MAP.mensuel.length; i++) {
    if (priceIds.includes(PRICE_MAP.mensuel[i])) {
      return { formule: 'formule_' + (i + 1), engagement: 'sans' };
    }
  }
  for (let i = 0; i < PRICE_MAP.annuel.length; i++) {
    if (priceIds.includes(PRICE_MAP.annuel[i])) {
      return { formule: 'formule_' + (i + 1), engagement: '1_an' };
    }
  }
  return null;
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = session.customer_email || session.customer_details?.email;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  if (!email) {
    console.error('checkout.session.completed: no email on session', session.id);
    return;
  }
  if (!customerId) {
    console.error('checkout.session.completed: no customer on session', session.id);
    return;
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
  const priceIds = lineItems.data
    .map((li) => li.price?.id)
    .filter((id): id is string => typeof id === 'string');

  const identified = identifyFormule(priceIds);
  if (!identified) {
    console.error('checkout.session.completed: no known price ID in session', {
      sessionId: session.id,
      priceIds,
    });
    return;
  }

  // Déduction planIdx depuis identified.formule (format 'formule_N', N = planIdx+1).
  // Utilisé pour les apply-modules cas C (defaultModulesForPlan) + logs structurés.
  const planIdx = parseInt(identified.formule.replace('formule_', ''), 10) - 1;

  // Task [#66] — garde défensive contre format non-numérique futur
  // (ex: formule_essai, formule_pro) qui produirait NaN et defaultModulesForPlan([]) silencieux.
  // Aujourd'hui identifyFormule retourne toujours formule_1..5 mais on protège contre régression future.
  if (Number.isNaN(planIdx) || planIdx < 0 || planIdx > 4) {
    console.error('[stripe-webhook] planIdx invalide après extraction', {
      event: 'checkout_invalid_planIdx',
      email,
      formule: identified.formule,
      planIdx,
      session_id: session.id,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // ─── Résolution email → user_id (task #63) ─────────────────────────────────
  // Source de vérité unique pour user_id dans tout handleCheckoutCompleted.
  // Si null = cas S3 (paiement Stripe sans signup app) : skip propre + log
  // structuré pour investigation manuelle. Pas d'UPSERT possible sans user_id
  // (FK user_data.user_id NOT NULL).
  const userId = await resolveUserIdByEmail(email);
  if (!userId) {
    console.warn('[stripe-webhook] Paiement reçu sans auth.users associé', {
      event: 'checkout_completed_no_user',
      email,
      planIdx,
      session_id: session.id,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const includesLicence = priceIds.includes(PRICE_MAP.licence);

  // licence_payee n'est inclus dans l'update QUE si la session contient le
  // price licence — un client existant qui change de formule sans racheter
  // la licence ne doit pas voir son licence_payee remis à false.
  const update: Record<string, unknown> = {
    stripe_customer_id: customerId,
    formule: identified.formule,
    engagement: identified.engagement,
    date_debut_abonnement: new Date().toISOString(),
  };
  if (includesLicence) {
    update.licence_payee = true;
  }

  // ─── Application des pending_modules (task #58) ────────────────────────────
  //
  // À ce stade, le user a payé via prepare-module-change Edge Function qui a
  // enregistré dans user_data : pending_modules, pending_plan_idx,
  // pending_created_at (TTL 1h). On lit cet état pour décider quoi faire.
  //
  // 4 cas possibles (arbitrages task #58) :
  //
  //  A) Pending présent + TTL ≤ 1h + auth admin OK
  //     → Apply pending_modules à user_metadata.modules via auth.admin.
  //     → Reset des champs pending dans le UPDATE.
  //     → Si les modules ont changé vs metadata actuel, on met aussi à jour
  //       last_module_change (now) et module_changes_count (+1) pour
  //       l'anti-abus (lock 30j calculé depuis last_module_change).
  //
  //  B) Pending présent + TTL > 1h
  //     → Stale : on log warning, on reset les champs pending, on n'applique
  //       PAS les modules (le user a peut-être abandonné puis re-souscrit
  //       avec une autre intention plus tard). Arbitrage Q3.
  //
  //  C) Pending absent
  //     → Flow landing public (paiement avant signup) : il n'y a pas de
  //       user_metadata.modules à mettre à jour ici car le user n'existe
  //       pas encore en auth. Skip — la mise en place initiale sera faite
  //       par le flow signup (cf. task #63). Arbitrage Q4.
  //
  //  D) auth.admin.getUserById/updateUserById échoue
  //     → Cas anormal (user supprimé entre prepare et webhook ?). On log
  //       l'erreur avec email + user_id pour investigation manuelle, on
  //       continue le UPDATE base (formule/engagement/date_debut/licence),
  //       on NE reset PAS les champs pending (un admin pourra rejouer
  //       l'apply via task de réconciliation). Arbitrage Q2.
  //
  // Lecture unique de user_data ici, puis tous les champs additionnels
  // sont accumulés dans `update` pour un seul UPDATE final (arbitrage Q1).

  const { data: rows, error: selErr } = await supabaseAdmin
    .from('user_data')
    .select('pending_modules, pending_plan_idx, pending_created_at, module_changes_count')
    .eq('user_id', userId)
    .limit(1);

  if (selErr) {
    console.error('checkout.session.completed: user_data select failed', {
      email,
      userId,
      error: selErr,
    });
    // On continue quand même le UPSERT base (le SELECT échoue rarement et
    // l'activation licence/formule reste prioritaire).
  }

  const row = rows?.[0];
  const pendingModules = row?.pending_modules as string[] | null | undefined;
  const pendingCreatedAt = row?.pending_created_at as string | null | undefined;

  if (pendingModules && pendingCreatedAt && userId) {
    const ageMs = Date.now() - new Date(pendingCreatedAt).getTime();
    const oneHourMs = 60 * 60 * 1000;

    if (ageMs > oneHourMs) {
      // Cas B : pending stale → reset + apply default (task #63 — sécurité user).
      // TTL >1h signale que le pending n'est plus une expression fiable de
      // l'intent user (peut avoir changé d'avis entre prepare et paiement).
      // Apply default = comportement sûr + élimine le trou modules=[] post-paiement.
      console.warn(
        'checkout.session.completed: pending stale (>1h), resetting and applying default',
        {
          email,
          userId,
          ageMs,
          pendingModules,
        }
      );
      update.pending_modules = null;
      update.pending_plan_idx = null;
      update.pending_created_at = null;

      // (duplication assumée vs cas C ligne ~325 — factoriser si un 3ème call site apparaît)
      const { data: userResp, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (getErr || !userResp?.user) {
        console.error(
          'checkout.session.completed: auth.getUserById failed (apply default after stale)',
          {
            email,
            userId,
            error: getErr,
          }
        );
        // continue UPSERT base avec modules non-appliqués (cohérence cas A — state partiel ≫ no state)
      } else {
        const currentMeta = userResp.user.user_metadata ?? {};
        const finalModules = defaultModulesForPlan(planIdx);
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { ...currentMeta, modules: finalModules },
        });
        if (updErr) {
          console.error(
            'checkout.session.completed: auth.updateUserById failed (apply default after stale)',
            {
              email,
              userId,
              error: updErr,
            }
          );
          // continue UPSERT base avec modules non-appliqués
        } else {
          update.last_module_change = new Date().toISOString();
          update.module_changes_count = (row?.module_changes_count ?? 0) + 1;
          console.log('[stripe-webhook] modules applied (default)', {
            event: 'default_applied_after_stale',
            email,
            userId,
            planIdx,
            modules: finalModules,
            formule: identified.formule,
            timestamp: new Date().toISOString(),
          });
        }
      }
    } else {
      // Cas A (tentative) : on lit le user auth pour appliquer les modules.
      const { data: userResp, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (getErr || !userResp?.user) {
        // Cas D : log error, NE PAS reset pending, continue UPDATE base.
        console.error('checkout.session.completed: auth.getUserById failed', {
          email,
          userId,
          error: getErr,
        });
      } else {
        const currentMeta = userResp.user.user_metadata ?? {};
        const currentModules: string[] = Array.isArray(currentMeta.modules)
          ? currentMeta.modules
          : [];
        const sortedCurrent = [...currentModules].sort();
        const sortedNew = [...pendingModules].sort();
        const modulesChanged =
          sortedCurrent.length !== sortedNew.length ||
          sortedCurrent.some((m, i) => m !== sortedNew[i]);

        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { ...currentMeta, modules: pendingModules },
        });

        if (updErr) {
          // Cas D bis : updateUserById échoue → même politique que getUserById.
          console.error('checkout.session.completed: auth.updateUserById failed', {
            email,
            userId,
            error: updErr,
          });
        } else {
          // Cas A : apply OK → reset pending + (si modules changed) MAJ lock.
          update.pending_modules = null;
          update.pending_plan_idx = null;
          update.pending_created_at = null;

          if (modulesChanged) {
            update.last_module_change = new Date().toISOString();
            update.module_changes_count = (row?.module_changes_count ?? 0) + 1;
          }
          console.log('checkout.session.completed: modules applied', {
            email,
            userId,
            modules: pendingModules,
            modulesChanged,
          });
        }
      }
    }
  }
  // Cas C — pending absent OU corruption partielle (pending sans createdAt) :
  // apply default modules cohérent avec le plan payé (task #63).
  // User signup via pwaRegister sans wizard in-app → pas de pending,
  // on set defaultModulesForPlan(planIdx).
  // Le || !pendingCreatedAt couvre le cas pathologique de data corruption
  // (pending stocké sans timestamp), garantissant que TOUT user post-paiement
  // reçoit des modules — défense en profondeur.
  // (duplication assumée vs cas B ligne ~268 — factoriser si un 3ème call site apparaît)
  if (!pendingModules || !pendingCreatedAt) {
    const { data: userResp, error: getErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (getErr || !userResp?.user) {
      console.error(
        'checkout.session.completed: auth.getUserById failed (apply default no pending)',
        {
          email,
          userId,
          error: getErr,
        }
      );
      // continue UPSERT base avec modules non-appliqués (cohérence cas A — state partiel ≫ no state)
    } else {
      const currentMeta = userResp.user.user_metadata ?? {};
      const finalModules = defaultModulesForPlan(planIdx);
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { ...currentMeta, modules: finalModules },
      });
      if (updErr) {
        console.error(
          'checkout.session.completed: auth.updateUserById failed (apply default no pending)',
          {
            email,
            userId,
            error: updErr,
          }
        );
        // continue UPSERT base avec modules non-appliqués
      } else {
        update.last_module_change = new Date().toISOString();
        update.module_changes_count = (row?.module_changes_count ?? 0) + 1;
        console.log('[stripe-webhook] modules applied (default)', {
          event: 'default_applied_no_pending',
          email,
          userId,
          planIdx,
          modules: finalModules,
          formule: identified.formule,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  // UPSERT par user_id (task #63) — crée la row user_data si absente. Cas
  // typique : user signup via landing public (pwaRegister) sans utiliser le
  // wizard in-app (prepare-module-change pas appelée), donc row user_data
  // jamais initialisée. onConflict: 'user_id' utilise la contrainte UNIQUE
  // (FK auth.users.id) pour distinguer INSERT vs UPDATE atomiquement.
  const { error } = await supabaseAdmin
    .from('user_data')
    .upsert({ user_id: userId, email, ...update }, { onConflict: 'user_id' });

  if (error) {
    console.error('checkout.session.completed: upsert failed', { email, userId, error });
    return;
  }
  console.log('checkout.session.completed: upserted', { email, userId, ...update });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;

  // Reset complet de l'état d'abonnement : la DB doit refléter qu'il n'y a
  // plus de formule active. stripe_customer_id est conservé pour traçabilité
  // (re-souscription future, support, audit).
  // licence_payee reste true : achat unique à vie, ne pas reset à la résiliation
  // Stripe. Bug fix task #57 — le reset à false coupait l'accès à des users qui
  // avaient acheté l'outil et seulement résilié leur abonnement. Reprise possible
  // via un Payment Link "sansLicence" (moins cher). Seul un admin peut désactiver
  // licence_payee, et uniquement pour un remboursement (action explicite, audit).
  const update = {
    formule: null,
    engagement: null,
    date_debut_abonnement: null,
  };

  const { error } = await supabaseAdmin
    .from('user_data')
    .update(update)
    .eq('stripe_customer_id', customerId);

  if (error) {
    console.error('customer.subscription.deleted: update failed', { customerId, error });
    return;
  }
  console.log('customer.subscription.deleted: subscription reset', { customerId });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    console.error('Missing stripe-signature header');
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (err) {
    console.error('Signature verification failed', err instanceof Error ? err.message : err);
    return new Response('Invalid signature', { status: 400 });
  }

  console.log('Event received', { id: event.id, type: event.type });

  // 200 systématique passé la vérif de signature : retourner 5xx déclenche
  // chez Stripe une cascade de retries (toutes les 5 min pendant 3 jours).
  // Mieux vaut logger les erreurs internes et investiguer hors-ligne.
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed':
        console.log('invoice.payment_failed (no-op v1)', {
          invoiceId: (event.data.object as Stripe.Invoice).id,
        });
        break;
      default:
        console.log('Unhandled event type, ack', event.type);
    }
  } catch (err) {
    console.error('Handler threw, returning 200 to avoid Stripe retry storm', {
      type: event.type,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
