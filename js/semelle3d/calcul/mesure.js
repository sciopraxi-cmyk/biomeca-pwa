// Lot 4d : outil Mesure (pur). Distance entre 2 points de la semelle et composantes x / y / z, en millimètres.
// Les points sont donnés tels qu'affichés ; `relief` = facteur d'exagération des hauteurs (Relief ×3) : il est retiré avant de mesurer.
const nombre = (v) => Number.isFinite(v);
export function mesurer(a, b, relief = 1) {
  if (!a || !b || ![a.x, a.y, a.z, b.x, b.y, b.z].every(nombre)) throw new TypeError('mesure : 2 points (x, y, z) finis attendus');
  const r = nombre(relief) && relief > 0 ? relief : 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z - a.z) / r;
  return { distance_mm: Math.hypot(dx, dy, dz), dx_mm: dx, dy_mm: dy, dz_mm: dz, plan_mm: Math.hypot(dx, dy) };
}
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',').replace(/^-0,0$/, '0,0');
export function texteMesure(m) {
  return f1(m.distance_mm) + ' mm  (x ' + f1(Math.abs(m.dx_mm)) + ' · y ' + f1(Math.abs(m.dy_mm)) + ' · z ' + f1(Math.abs(m.dz_mm)) + ')';
}
// Machine à états des clics : 0 point -> 1 -> 2 (mesure faite) ; un 3e clic recommence avec ce point ; Échap efface.
export function clicMesure(etat, p) {
  if (!etat || etat.points.length >= 2) return { points: [p] };
  return { points: [...etat.points, p] };
}
