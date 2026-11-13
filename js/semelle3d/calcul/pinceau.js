// Lot 4d : pinceau. Fonctions pures.
// Un geste du pinceau = une suite de « coups » (disques) ; chaque coup rapproche la surface de sa MOYENNE LOCALE (lisser) ou ne fait que la relever vers elle (remplir),
// avec un bord doux (cosinus). Le résultat est une couche SIGNÉE (surface après - surface avant), posée dans l'ordre des éléments, avant le recouvrement.
// Les coups sont en repère médial du pied (x = repère talon + med × dx), comme les autres éléments : le miroir D/G les copie tels quels.
import { PINCEAU, EPAISSEUR_BASE_MIN_MM } from '../constantes.js';

const fini = (v) => typeof v === 'number' && Number.isFinite(v);
const arrondi = (v) => Math.round(v * 10) / 10 + 0; // + 0 : jamais « -0 »

export function validerCoups(coups) {
  if (!Array.isArray(coups) || coups.length === 0) throw new RangeError('pinceau : au moins un passage');
  if (coups.length > PINCEAU.max_coups) throw new RangeError('pinceau : ' + coups.length + ' passages (maximum ' + PINCEAU.max_coups + ')');
  return coups.map((c, n) => {
    if (!c || !fini(c.dx_mm) || !fini(c.dy_mm)) throw new TypeError('pinceau : passage ' + (n + 1) + ' sans position');
    const r = c.rayon_mm === undefined ? PINCEAU.rayon_defaut_mm : c.rayon_mm;
    if (!fini(r) || r < PINCEAU.rayon_mm.min || r > PINCEAU.rayon_mm.max) throw new RangeError('pinceau : rayon ' + r + ' hors de ' + PINCEAU.rayon_mm.min + ' à ' + PINCEAU.rayon_mm.max + ' mm');
    const mode = c.mode === undefined ? 'lisser' : c.mode;
    if (!PINCEAU.modes.includes(mode)) throw new RangeError('pinceau : mode « ' + mode + ' » inconnu (lisser ou remplir)');
    const force = c.force === undefined ? PINCEAU.force_defaut : c.force;
    if (!fini(force) || !(force > 0) || force > 1) throw new RangeError('pinceau : force hors de 0 à 1');
    return { dx_mm: arrondi(c.dx_mm), dy_mm: arrondi(c.dy_mm), rayon_mm: arrondi(r), mode, force };
  });
}

// Couche du pinceau sur la surface `{ nx, ny, pas, ox, oy, haut, bas }` (haut = surface au moment où le pinceau s'applique).
// rep = repère talon { x_mm, y_mm } ; med = -1 (pied D) ou +1 (pied G). Sortie : { z, cellules, hauteur_max_mm, hauteur_min_mm, centre }.
export function couchePinceau(surface, el, rep, med) {
  const { nx, ny, pas, ox, oy, haut, bas } = surface;
  const coups = validerCoups(el.coups);
  const S = Float32Array.from(haut), plancher = new Float32Array(haut.length), touche = new Uint8Array(haut.length);
  for (let k = 0; k < haut.length; k++) plancher[k] = Number.isFinite(haut[k]) ? Math.min(haut[k], bas[k] + EPAISSEUR_BASE_MIN_MM) : NaN; // jamais plus fin que la base ne l'était, ni sous l'épaisseur minimale
  for (const c of coups) {
    const cx = rep.x_mm + med * c.dx_mm, cy = rep.y_mm + c.dy_mm, r = c.rayon_mm;
    const s = Math.max(1, Math.round((0.5 * r) / pas)), marge = Math.ceil(r / pas) + s + 1;
    const ci = Math.round((cx - ox) / pas), cj = Math.round((cy - oy) / pas);
    const i0 = Math.max(0, ci - marge), i1 = Math.min(nx - 1, ci + marge), j0 = Math.max(0, cj - marge), j1 = Math.min(ny - 1, cj + marge);
    if (i0 > i1 || j0 > j1) continue;
    const W = i1 - i0 + 2, H = j1 - j0 + 2, somme = new Float64Array(W * H), compte = new Int32Array(W * H); // images intégrales (valeurs, nombre de cellules valides)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const v = S[j * nx + i], ok = Number.isFinite(v), a = (j - j0 + 1) * W + (i - i0 + 1);
      somme[a] = (ok ? v : 0) + somme[a - 1] + somme[a - W] - somme[a - W - 1]; compte[a] = (ok ? 1 : 0) + compte[a - 1] + compte[a - W] - compte[a - W - 1];
    }
    const boite = (tab, ia, ib, ja, jb) => tab[(jb - j0 + 1) * W + (ib - i0 + 1)] - tab[(ja - j0) * W + (ib - i0 + 1)] - tab[(jb - j0 + 1) * W + (ia - i0)] + tab[(ja - j0) * W + (ia - i0)];
    const nouveaux = [];
    for (let j = Math.max(j0, cj - Math.ceil(r / pas)); j <= Math.min(j1, cj + Math.ceil(r / pas)); j++) for (let i = Math.max(i0, ci - Math.ceil(r / pas)); i <= Math.min(i1, ci + Math.ceil(r / pas)); i++) {
      const k = j * nx + i, v = S[k]; if (!Number.isFinite(v)) continue;
      const d = Math.hypot(ox + i * pas - cx, oy + j * pas - cy); if (!(d < r)) continue;
      touche[k] = 1;
      const ia = Math.max(i0, i - s), ib = Math.min(i1, i + s), ja = Math.max(j0, j - s), jb = Math.min(j1, j + s);
      const n = boite(compte, ia, ib, ja, jb); if (n === 0) continue;
      const moyenne = boite(somme, ia, ib, ja, jb) / n, w = c.force * (0.5 + 0.5 * Math.cos((Math.PI * d) / r));
      let delta = w * (moyenne - v); if (c.mode === 'remplir' && delta < 0) delta = 0;
      nouveaux.push(k, Math.max(v + delta, plancher[k]));
    }
    for (let q = 0; q < nouveaux.length; q += 2) S[nouveaux[q]] = nouveaux[q + 1]; // appliqué APRÈS le calcul de tout le disque : le résultat ne dépend pas de l'ordre de balayage
  }
  const z = new Float32Array(haut.length); let hmax = 0, hmin = 0, cellules = 0;
  for (let k = 0; k < z.length; k++) {
    if (touche[k]) cellules++;
    if (!Number.isFinite(haut[k])) continue;
    const d = S[k] - haut[k]; if (Math.abs(d) < 1e-6) continue;
    z[k] = d; if (d > hmax) hmax = d; if (d < hmin) hmin = d;
  }
  const p = coups[0];
  return { z, cellules, hauteur_max_mm: hmax, hauteur_min_mm: hmin, centre: { x_mm: rep.x_mm + med * p.dx_mm, y_mm: rep.y_mm + p.dy_mm } };
}

// Coups d'un geste : un coup tous les `espacement_rayon × rayon` mm le long du trajet (points x, y en repère de la scène), repère médial en sortie.
export function coupsDuTrajet(trace, rep, med, { rayon_mm = PINCEAU.rayon_defaut_mm, mode = 'lisser', force = PINCEAU.force_defaut } = {}) {
  const pasMm = Math.max(0.5, PINCEAU.espacement_rayon * rayon_mm), coups = [];
  let dernier = null;
  for (const p of trace) {
    if (!fini(p.x) || !fini(p.y)) continue;
    if (dernier && Math.hypot(p.x - dernier.x, p.y - dernier.y) < pasMm) continue;
    dernier = p; coups.push({ dx_mm: arrondi(med * (p.x - rep.x_mm)), dy_mm: arrondi(p.y - rep.y_mm), rayon_mm, mode, force });
    if (coups.length >= PINCEAU.max_coups) break;
  }
  return coups;
}
