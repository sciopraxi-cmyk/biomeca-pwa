// Étape B : redressement de l'empreinte par 3 points (talon, tête de M1, tête de M5), pur et sans dépendance.
// Les 3 points sont posés par le praticien sur l'empreinte déjà recalée (repère mm : X transversal, Y du talon vers l'avant-pied, Z vers le pied).
// Ils définissent le plan d'appui ; on fait tourner l'empreinte autour du talon pour que ce plan devienne horizontal (Z = 0).
// Aucune valeur n'est inventée : points refusés s'ils sont mal placés, jamais corrigés en silence.

export const REDRESSEMENT = Object.freeze({
  cote_min_mm: 30, // distance minimale entre deux points
  aire_min_mm2: 800, // triangle trop plat (points presque alignés) : plan instable
  talon_avance_min_mm: 40, // les têtes de M1 et M5 doivent être au moins à 40 mm devant le talon (en Y)
  inclinaison_max_deg: 25, // au-delà : le scan n'est pas « presque à plat », le praticien doit revoir ses points ou le sens de la face
  cles: Object.freeze(['talon', 'm1', 'm5']),
});

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const croix = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const moins = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norme = (a) => Math.hypot(a[0], a[1], a[2]);

// pts : { talon:{x,y,z}, m1:{x,y,z}, m5:{x,y,z} } -> tableau [talon, m1, m5] de [x,y,z], ou TypeError.
export function normaliserPoints(pts) {
  if (!pts || typeof pts !== 'object') throw new TypeError('redressement : trois points attendus (talon, M1, M5)');
  return REDRESSEMENT.cles.map((k) => {
    const p = pts[k];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) throw new TypeError('redressement : point « ' + k + ' » manquant ou non numérique');
    return [p.x, p.y, p.z];
  });
}

// Vérifie les 3 points ; rend { ok, erreurs[] } (messages lisibles pour le praticien).
export function verifierPoints(pts) {
  const erreurs = [];
  let P;
  try { P = normaliserPoints(pts); } catch (e) { return { ok: false, erreurs: [e.message] }; }
  const [t, a, b] = P, C = REDRESSEMENT;
  if (norme(moins(a, t)) < C.cote_min_mm || norme(moins(b, t)) < C.cote_min_mm || norme(moins(a, b)) < C.cote_min_mm) erreurs.push('deux points sont trop proches (moins de ' + C.cote_min_mm + ' mm)');
  const aire = norme(croix(moins(a, t), moins(b, t))) / 2;
  if (aire < C.aire_min_mm2) erreurs.push('les trois points sont presque alignés : le plan serait instable');
  if (a[1] - t[1] < C.talon_avance_min_mm || b[1] - t[1] < C.talon_avance_min_mm) erreurs.push('les têtes de M1 et de M5 doivent être nettement devant le talon (au moins ' + C.talon_avance_min_mm + ' mm)');
  return { ok: erreurs.length === 0, erreurs, aire_mm2: aire };
}

// Plan par les 3 points : normale unitaire n (n_z > 0), d = n·talon, inclinaison en degrés par rapport à l'horizontale.
export function planDes3Points(pts) {
  const v = verifierPoints(pts);
  if (!v.ok) throw new RangeError('redressement : ' + v.erreurs.join(' ; '));
  const [t, a, b] = normaliserPoints(pts);
  let n = croix(moins(a, t), moins(b, t));
  const l = norme(n); n = [n[0] / l, n[1] / l, n[2] / l];
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  const inclinaison_deg = (Math.acos(Math.min(1, n[2])) * 180) / Math.PI;
  if (inclinaison_deg > REDRESSEMENT.inclinaison_max_deg) throw new RangeError('redressement : plan incliné de ' + inclinaison_deg.toFixed(1) + '° (maximum ' + REDRESSEMENT.inclinaison_max_deg + '°) : revoyez les points ou la face plantaire');
  return { n, d: dot(n, t), talon: t, inclinaison_deg, aire_mm2: v.aire_mm2 };
}

// Matrice de rotation 3x3 (lignes) qui amène la normale n sur +Z (Rodrigues).
export function rotationVersZ(n) {
  const k = croix(n, [0, 0, 1]), s = norme(k), c = n[2];
  if (s < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const u = [k[0] / s, k[1] / s, k[2] / s], C = 1 - c;
  return [
    [c + u[0] * u[0] * C, u[0] * u[1] * C - u[2] * s, u[0] * u[2] * C + u[1] * s],
    [u[1] * u[0] * C + u[2] * s, c + u[1] * u[1] * C, u[1] * u[2] * C - u[0] * s],
    [u[2] * u[0] * C - u[1] * s, u[2] * u[1] * C + u[0] * s, c + u[2] * u[2] * C],
  ];
}

// Fait tourner `positions` (Float32Array x,y,z en mm) EN PLACE autour du talon : le plan des 3 points devient Z = 0.
// Rend { angle_deg, normale, talon }. Le talon reste en place (x, y) ; z du plan = 0.
export function redresserPositions(positions, pts) {
  const plan = planDes3Points(pts);
  const R = rotationVersZ(plan.n), t = plan.talon;
  for (let i = 0; i < positions.length; i += 3) {
    const p = [positions[i] - t[0], positions[i + 1] - t[1], positions[i + 2] - t[2]];
    positions[i] = R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + t[0];
    positions[i + 1] = R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + t[1];
    positions[i + 2] = R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]; // le talon est à z = 0 : le plan passe par lui
  }
  return { angle_deg: plan.inclinaison_deg, normale: plan.n, talon: t };
}

// Où vont les 3 points après le redressement (contrôle : leurs z doivent être ~ 0).
export function pointsRedresses(pts) {
  const plan = planDes3Points(pts), R = rotationVersZ(plan.n), t = plan.talon;
  return Object.fromEntries(REDRESSEMENT.cles.map((k) => {
    const p = [pts[k].x - t[0], pts[k].y - t[1], pts[k].z - t[2]];
    return [k, { x: R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2] + t[0], y: R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2] + t[1], z: R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2] }];
  }));
}

// Pose des points un par un, dans l'ordre talon -> M1 -> M5 ; un 4e clic est ignoré (le praticien efface d'abord).
export function clicRedressement(etat, p) {
  const k = Object.keys(etat.points || {}).length;
  if (k >= 3) return etat;
  return { points: { ...(etat.points || {}), [REDRESSEMENT.cles[k]]: { x: p.x, y: p.y, z: p.z } } };
}
export const NOMS_POINTS = Object.freeze({ talon: 'le talon (point le plus en arrière)', m1: 'la tête du 1er métatarsien (M1, côté du gros orteil)', m5: 'la tête du 5e métatarsien (M5, côté du petit orteil)' });
