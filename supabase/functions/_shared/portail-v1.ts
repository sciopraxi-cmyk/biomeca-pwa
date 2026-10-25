// Portail patient (lot b) — fonctions pures partagées par les Edge Functions
// `patient-compte` et `patient-connexion`. Aucune API propre à Deno : le module est
// testé sous Vitest (tests/portail-patient-base.test.mjs).

// 32 caractères sans I, O, 0, 1 (lisibles au téléphone) ; 256 / 32 = pas de biais de tirage.
export const ALPHABET_IDENTIFIANT = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const DOMAINE_TECHNIQUE = 'patients.verticy.invalid';
export const ESSAIS_MAX = 5;
export const BLOCAGE_MINUTES = 15;
export const VALIDITE_BILLET_SECONDES = 600;
export const MOT_DE_PASSE_MIN = 10;
export const MOT_DE_PASSE_MAX = 72;
// Limite par adresse IP (en plus de la limite par compte) : échecs sur 15 minutes.
export const ECHECS_IP_MAX = 30;

/** Identifiant aléatoire « XXXX-XXXX » (≈ 10^12 possibilités). */
export function genererIdentifiant(): string {
  const o = new Uint8Array(8);
  crypto.getRandomValues(o);
  const c = Array.from(o, (b) => ALPHABET_IDENTIFIANT[b % ALPHABET_IDENTIFIANT.length]).join('');
  return c.slice(0, 4) + '-' + c.slice(4);
}

/** Code provisoire (fiche sans date de naissance) : même forme lisible que l'identifiant, « XXXX-XXXX ». */
export function genererCodeProvisoire(): string {
  return genererIdentifiant();
}

/** Saisie du patient (« k7m2 9qxp ») → « K7M2-9QXP », ou null si ce n'est pas un code. */
export function normaliserCodeProvisoire(saisie: unknown): string | null {
  return normaliserIdentifiant(saisie);
}

/** Forme canonique d'une saisie (« k7m2 9qxp » → « K7M2-9QXP ») ou null si invalide. */
export function normaliserIdentifiant(saisie: unknown): string | null {
  if (typeof saisie !== 'string' || saisie.length > 40) return null;
  const s = saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8) return null;
  for (const ch of s) if (!ALPHABET_IDENTIFIANT.includes(ch)) return null;
  return s.slice(0, 4) + '-' + s.slice(4);
}

/** Adresse technique interne (jamais affichée, jamais utilisée pour écrire). */
export function emailTechnique(identifiant: string): string {
  return identifiant.replace('-', '').toLowerCase() + '@' + DOMAINE_TECHNIQUE;
}

function dateValide(a: number, m: number, j: number): boolean {
  if (a < 1900 || m < 1 || m > 12 || j < 1 || j > 31) return false;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
}

/** « 2010-05-17 » (colonne date) → « 20100517 » ; null si absente ou invalide. */
export function ddnVersSecret(ddnIso: unknown): string | null {
  if (typeof ddnIso !== 'string') return null;
  const m = ddnIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m || !dateValide(+m[1], +m[2], +m[3])) return null;
  return m[1] + m[2] + m[3];
}

/** Saisie du patient (« 2010 05 17 », « 20100517 »…) → 8 chiffres, ou null. */
export function normaliserSecretDdn(saisie: unknown): string | null {
  if (typeof saisie !== 'string' || saisie.length > 20) return null;
  const s = saisie.replace(/[\s./-]/g, '');
  if (!/^\d{8}$/.test(s)) return null;
  return dateValide(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8)) ? s : null;
}

/** Comparaison en temps constant (longueurs publiques). */
export function egalConstant(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Règles du mot de passe choisi (messages affichables tels quels au patient). */
export function validerMotDePasse(
  mdp: unknown,
  ctx: { identifiant?: string; ddnSecret?: string | null } = {}
): string | null {
  if (typeof mdp !== 'string') return 'Mot de passe manquant.';
  if (mdp.length < MOT_DE_PASSE_MIN) return `Au moins ${MOT_DE_PASSE_MIN} caractères.`;
  if (mdp.length > MOT_DE_PASSE_MAX) return `Au plus ${MOT_DE_PASSE_MAX} caractères.`;
  if (/^(.)\1+$/.test(mdp)) return 'Mot de passe trop simple.';
  if (!/[a-z]/.test(mdp) || !/[A-Z]/.test(mdp) || !/[0-9]/.test(mdp) || !/[^A-Za-z0-9]/.test(mdp))
    return 'Il faut une minuscule, une majuscule, un chiffre et un symbole (par exemple - ou !).';
  if (ctx.ddnSecret && mdp.replace(/[\s./-]/g, '').includes(ctx.ddnSecret))
    return 'Ne reprenez pas votre date de naissance.';
  if (
    ctx.identifiant &&
    mdp
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .includes(ctx.identifiant.replace('-', ''))
  )
    return 'Ne reprenez pas votre identifiant.';
  return null;
}

/** Mot de passe Supabase aléatoire (jamais communiqué : seul le choix du patient sert). */
export function motDePasseAleatoire(): string {
  const o = new Uint8Array(32);
  crypto.getRandomValues(o);
  // Suffixe fixe : la politique de mot de passe du projet exige les quatre classes de caractères.
  return Array.from(o, (b) => b.toString(16).padStart(2, '0')).join('') + 'Aa1!';
}

export function nonceAleatoire(): string {
  return motDePasseAleatoire().slice(0, 32);
}

// ─── Billet entre « date de naissance » et « choix du mot de passe » ───
// payload {c: compte, n: nonce, e: expiration (s)} signé HMAC-SHA256 ; la clé est
// dérivée d'un secret serveur. Le nonce, rangé en base, est consommé UNE fois.
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const o = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of o) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function cleHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('portail-billet:' + secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
}
async function signer(secret: string, donnees: string): Promise<string> {
  return b64url(
    await crypto.subtle.sign('HMAC', await cleHmac(secret), new TextEncoder().encode(donnees))
  );
}

export async function signerBillet(
  secret: string,
  p: { c: string; n: string },
  maintenantS: number
): Promise<string> {
  const corps = b64url(
    new TextEncoder().encode(
      JSON.stringify({ c: p.c, n: p.n, e: maintenantS + VALIDITE_BILLET_SECONDES })
    )
  );
  return corps + '.' + (await signer(secret, corps));
}

export async function verifierBillet(
  secret: string,
  billet: unknown,
  maintenantS: number
): Promise<{ c: string; n: string } | null> {
  if (typeof billet !== 'string' || billet.length > 600) return null;
  const parts = billet.split('.');
  if (parts.length !== 2) return null;
  const attendu = await signer(secret, parts[0]);
  if (!egalConstant(attendu, parts[1])) return null;
  try {
    const b64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
    const p = JSON.parse(json);
    if (typeof p.c !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') return null;
    if (p.e < maintenantS) return null;
    return { c: p.c, n: p.n };
  } catch {
    return null;
  }
}

/** Adresse IP du client derrière le proxy Supabase (première de x-forwarded-for). */
export function ipClient(h: { get(n: string): string | null }): string {
  const xff = h.get('x-forwarded-for') || h.get('cf-connecting-ip') || '';
  const ip = xff.split(',')[0].trim();
  return ip.slice(0, 64) || 'inconnue';
}

/** Minutes restantes d'un blocage (arrondi au-dessus), au moins 1. */
export function minutesRestantes(bloqueJusqu: string | null, maintenantMs: number): number {
  if (!bloqueJusqu) return 0;
  return Math.max(1, Math.ceil((Date.parse(bloqueJusqu) - maintenantMs) / 60000));
}
