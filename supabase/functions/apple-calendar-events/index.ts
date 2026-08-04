// Edge Function apple-calendar-events — lecture seule des événements du
// flux ICS public iCloud connecté (Task #178).
//
// GET ?timeMin=&timeMax= (ISO) : télécharge le flux ICS stocké (URL
// déchiffrée côté serveur, jamais renvoyée au client), parse les VEVENT et
// renvoie les occurrences qui tombent dans la plage demandée — même forme
// que google-calendar-events (id/summary/description/start/end), avec en
// plus source:'apple' pour que le client sache qu'il s'agit d'événements
// en lecture seule (endpoint GET uniquement, pas de PATCH/DELETE ici).
//
// Limitations connues (documentées pour Scio, pas silencieuses) :
// - RRULE : FREQ=DAILY/WEEKLY/MONTHLY/YEARLY avec INTERVAL/COUNT/UNTIL et
//   BYDAY (semaine) sont gérés ; BYMONTHDAY/BYSETPOS/RRULE composées non
//   gérés — l'occurrence de départ seule est alors renvoyée plutôt que de
//   faire disparaître l'événement.
// - RECURRENCE-ID (override d'une occurrence isolée d'une série récurrente)
//   n'est pas fusionné avec la série — l'override peut apparaître en double
//   de l'occurrence générée par la RRULE.
// - Fuseau horaire : DTSTART/DTEND avec 'Z' (UTC) ou TZID reconnu par Intl
//   sont convertis correctement ; une date/heure "flottante" (ni Z ni
//   TZID) est supposée Europe/Paris.
// - Événements sur toute la journée multi-jours : rattachés uniquement à
//   leur jour de départ dans la grille (même limitation que Google, #182).
//
// Déploiement : supabase functions deploy apple-calendar-events --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supaAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const ENCRYPTION_KEY_B64 = Deno.env.get('ENCRYPTION_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Déchiffre base64(iv || ciphertext) produit par encrypt() dans apple-calendar-connect.
async function decrypt(payload: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(ENCRYPTION_KEY_B64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const combined = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(plainBuf);
}

// ─── Parsing ICS ────────────────────────────────────────────────────────

function unfoldICS(text: string): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length) {
      lines.push(line);
    }
  }
  return lines;
}

function unescapeICSText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

type IcsField = { value: string; params: Record<string, string> };
type RawEvent = {
  uid?: string;
  summary?: string;
  description?: string;
  dtstart?: IcsField;
  dtend?: IcsField;
  duration?: string;
  rrule?: string;
  exdate?: IcsField[];
};

function parseICS(text: string): { events: RawEvent[] } {
  const lines = unfoldICS(text);
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [key, ...paramParts] = left.split(';');
    const params: Record<string, string> = {};
    for (const p of paramParts) {
      const eq = p.indexOf('=');
      if (eq === -1) continue;
      params[p.slice(0, eq)] = p.slice(eq + 1);
    }

    switch (key) {
      case 'UID':
        cur.uid = value;
        break;
      case 'SUMMARY':
        cur.summary = unescapeICSText(value);
        break;
      case 'DESCRIPTION':
        cur.description = unescapeICSText(value);
        break;
      case 'DTSTART':
        cur.dtstart = { value, params };
        break;
      case 'DTEND':
        cur.dtend = { value, params };
        break;
      case 'DURATION':
        cur.duration = value;
        break;
      case 'RRULE':
        cur.rrule = value;
        break;
      case 'EXDATE':
        cur.exdate = (cur.exdate || []).concat(value.split(',').map((v) => ({ value: v, params })));
        break;
      default:
        break;
    }
  }
  return { events };
}

// Convertit une heure locale "murale" (Y,M,D,H,Mi,S) dans le fuseau tz en
// timestamp UTC ms. Technique standard : on formate un timestamp candidat
// dans tz via Intl, on mesure l'écart avec l'heure murale voulue, on corrige.
function zonedWallTimeToUtcMs(
  Y: number,
  Mo: number,
  D: number,
  H: number,
  Mi: number,
  S: number,
  tz: string
): number {
  const guessMs = Date.UTC(Y, Mo, D, H, Mi, S);
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(guessMs));
  } catch {
    return guessMs; // TZID inconnu d'Intl : on retombe sur l'hypothèse UTC plutôt que de planter.
  }
  const get = (t: string) => {
    const p = parts.find((x) => x.type === t);
    const n = p ? parseInt(p.value, 10) : 0;
    return t === 'hour' && n === 24 ? 0 : n;
  };
  const asIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  const offset = asIfUtc - guessMs;
  return guessMs - offset;
}

function parseICSDate(field: IcsField): { iso: string; allDay: boolean; ms: number } | null {
  const { value, params } = field;
  const isDateOnly = params.VALUE === 'DATE' || /^\d{8}$/.test(value);
  if (isDateOnly) {
    const y = value.slice(0, 4),
      mo = value.slice(4, 6),
      d = value.slice(6, 8);
    const ms = Date.UTC(+y, +mo - 1, +d);
    return { iso: `${y}-${mo}-${d}`, allDay: true, ms };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return null;
  const [, Y, Mo, D, H, Mi, S, Z] = m;
  if (Z) {
    const ms = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
    return { iso: new Date(ms).toISOString(), allDay: false, ms };
  }
  // Date/heure "flottante" ou avec TZID : Europe/Paris par défaut si TZID
  // absent (limitation connue documentée en tête de fichier).
  const tz = params.TZID || 'Europe/Paris';
  const ms = zonedWallTimeToUtcMs(+Y, +Mo - 1, +D, +H, +Mi, +S, tz);
  return { iso: new Date(ms).toISOString(), allDay: false, ms };
}

function parseICSDuration(dur: string): number | null {
  const m = dur.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const days = m[1] ? parseInt(m[1], 10) : 0;
  const hours = m[2] ? parseInt(m[2], 10) : 0;
  const mins = m[3] ? parseInt(m[3], 10) : 0;
  const secs = m[4] ? parseInt(m[4], 10) : 0;
  return ((days * 24 + hours) * 60 + mins) * 60000 + secs * 1000;
}

function addDaysUTC(ms: number, n: number): number {
  return ms + n * 86400000;
}
function startOfWeekUTC(ms: number): number {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // 0=lundi
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

// Expansion RRULE bornée à [rangeStartMs, rangeEndMs]. FREQ non gérée ou
// options avancées (BYMONTHDAY, BYSETPOS, RRULE composées) → tableau vide,
// l'appelant retombe alors sur la seule occurrence de départ.
function expandRRule(
  startMs: number,
  durMs: number,
  rruleStr: string,
  exdateIso: Set<string>,
  rangeStartMs: number,
  rangeEndMs: number
): number[] {
  const p: Record<string, string> = {};
  rruleStr.split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > -1) p[kv.slice(0, i)] = kv.slice(i + 1);
  });
  const freq = p.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return [];

  const interval = p.INTERVAL ? parseInt(p.INTERVAL, 10) : 1;
  const count = p.COUNT ? parseInt(p.COUNT, 10) : null;
  let untilMs: number | null = null;
  if (p.UNTIL) {
    const parsed = parseICSDate({ value: p.UNTIL, params: {} });
    if (parsed) untilMs = parsed.ms;
  }
  const DOWMAP: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  const byday =
    freq === 'WEEKLY' && p.BYDAY
      ? p.BYDAY.split(',')
          .map((c) => DOWMAP[c.replace(/^[+-]?\d+/, '')])
          .filter((x) => x !== undefined)
      : null;

  // Décalage jour-de-semaine + heure-du-jour du DTSTART, en ms UTC depuis le
  // lundi 00:00 de sa semaine — sert à reproduire la même heure "murale" sur
  // chaque jour candidat de BYDAY.
  const startDow = (new Date(startMs).getUTCDay() + 6) % 7;
  const timeOfDayMs = startMs - startOfWeekUTC(startMs) - startDow * 86400000;

  const MAX_OCC = 500;
  const MAX_ITER = MAX_OCC * 8;
  const results: number[] = [];
  let occCount = 0;
  let blockStart = startMs;
  let iterations = 0;
  let stop = false;

  while (!stop && iterations < MAX_ITER && occCount < MAX_OCC) {
    iterations++;
    let candidates: number[];
    if (byday && byday.length) {
      const blockWeekStart = startOfWeekUTC(blockStart);
      candidates = byday
        .map((dow) => blockWeekStart + ((dow + 6) % 7) * 86400000 + timeOfDayMs)
        .sort((a, b) => a - b);
    } else {
      candidates = [blockStart];
    }

    for (const ms of candidates) {
      if (ms < startMs) continue; // avant le DTSTART original : jamais une occurrence valide
      if (untilMs !== null && ms > untilMs) {
        stop = true;
        break;
      }
      occCount++;
      if (count !== null && occCount > count) {
        stop = true;
        break;
      }
      if (ms > rangeEndMs) {
        stop = true;
        break;
      }
      const iso = new Date(ms).toISOString();
      if (!exdateIso.has(iso) && ms + durMs >= rangeStartMs) {
        results.push(ms);
      }
    }

    if (freq === 'DAILY') blockStart = addDaysUTC(blockStart, interval);
    else if (freq === 'WEEKLY') blockStart = addDaysUTC(blockStart, interval * 7);
    else if (freq === 'MONTHLY') {
      const d = new Date(blockStart);
      blockStart = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth() + interval,
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );
    } else if (freq === 'YEARLY') {
      const d = new Date(blockStart);
      blockStart = Date.UTC(
        d.getUTCFullYear() + interval,
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );
    }
  }

  return results;
}

type ClientEvent = {
  id: string;
  summary: string;
  description: string;
  start: string;
  end: string;
  source: 'apple';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const { data: userData, error: authError } = await supaAdmin.auth.getUser(token);
  if (authError || !userData?.user) return json({ error: 'Invalid token' }, 401);
  const userId = userData.user.id;

  const { data: row, error: selectErr } = await supaAdmin
    .from('agenda_connections')
    .select('ics_url_encrypted')
    .eq('user_id', userId)
    .eq('provider', 'apple')
    .maybeSingle();
  if (selectErr) return json({ error: 'select: ' + selectErr.message }, 500);
  if (!row) return json({ error: 'Apple Calendar non connecté' }, 409);

  const reqUrl = new URL(req.url);
  const now = new Date();
  const defaultMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const timeMinIso = reqUrl.searchParams.get('timeMin') || now.toISOString();
  const timeMaxIso = reqUrl.searchParams.get('timeMax') || defaultMax.toISOString();
  const rangeStartMs = new Date(timeMinIso).getTime();
  const rangeEndMs = new Date(timeMaxIso).getTime();

  let icsText: string;
  try {
    const icsUrl = await decrypt(row.ics_url_encrypted as string);
    const res = await fetch(icsUrl, { headers: { 'User-Agent': 'Verticy/1.0' } });
    if (!res.ok) throw new Error('fetch ' + res.status);
    icsText = await res.text();
  } catch (e) {
    console.error('[apple-calendar-events] fetch failed', e);
    return json({ error: 'Impossible de récupérer le flux ICS. Reconnecte Apple Calendar.' }, 502);
  }

  const { events } = parseICS(icsText);
  const out: ClientEvent[] = [];

  for (const ev of events) {
    if (!ev.dtstart) continue;
    const start = parseICSDate(ev.dtstart);
    if (!start) continue;

    let durMs: number;
    if (ev.dtend) {
      const end = parseICSDate(ev.dtend);
      durMs = end ? Math.max(0, end.ms - start.ms) : 30 * 60000;
    } else if (ev.duration) {
      durMs = parseICSDuration(ev.duration) ?? 30 * 60000;
    } else {
      durMs = start.allDay ? 86400000 : 30 * 60000;
    }

    const exdateIso = new Set(
      (ev.exdate || []).map((f) => parseICSDate(f)?.iso).filter((x): x is string => !!x)
    );

    let occurrenceMsList: number[];
    if (ev.rrule) {
      occurrenceMsList = expandRRule(
        start.ms,
        durMs,
        ev.rrule,
        exdateIso,
        rangeStartMs,
        rangeEndMs
      );
      // FREQ non géré par expandRRule (retourne []) : on retombe sur
      // l'occurrence de départ seule plutôt que de faire disparaître
      // silencieusement l'événement.
      if (
        occurrenceMsList.length === 0 &&
        start.ms + durMs >= rangeStartMs &&
        start.ms <= rangeEndMs
      ) {
        occurrenceMsList = [start.ms];
      }
    } else {
      occurrenceMsList =
        start.ms + durMs >= rangeStartMs && start.ms <= rangeEndMs ? [start.ms] : [];
    }

    for (const occMs of occurrenceMsList) {
      const startIso = start.allDay
        ? new Date(occMs).toISOString().slice(0, 10)
        : new Date(occMs).toISOString();
      const endIso = start.allDay
        ? new Date(occMs + durMs).toISOString().slice(0, 10)
        : new Date(occMs + durMs).toISOString();
      out.push({
        id: (ev.uid || 'apple-' + occMs) + '@' + occMs,
        summary: ev.summary || '(sans titre)',
        description: ev.description || '',
        start: startIso,
        end: endIso,
        source: 'apple',
      });
    }
  }

  return json({ events: out });
});
