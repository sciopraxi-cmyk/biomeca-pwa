// Flou gaussien séparable sur une grille (fonction pure).
// mode 'masque' : les NaN sont hors contour ; le noyau s'arrête au premier NaN (rien ne traverse un trou),
//   les poids sont renormalisés sur la part utilisée -> une valeur constante reste exactement constante.
// mode 'zero' : tout ce qui est hors grille compte pour 0 (sert à flouter un masque 0/1).
export function noyauGauss(sigma_mm, pas) {
  if (!(sigma_mm > 0) || !(pas > 0)) throw new RangeError('flou : sigma et pas doivent être > 0');
  const r = Math.max(1, Math.ceil((3 * sigma_mm) / pas));
  const w = new Float64Array(2 * r + 1);
  for (let k = -r; k <= r; k++) w[k + r] = Math.exp(-0.5 * ((k * pas) / sigma_mm) ** 2);
  return { r, w };
}

export function flouGauss(src, nx, ny, pas, sigma_mm, mode = 'masque') {
  const { r, w } = noyauGauss(sigma_mm, pas);
  let somme = 0;
  for (const v of w) somme += v;
  const passe = (entree, dx, dy) => {
    const sortie = new Float64Array(entree.length);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const c = j * nx + i;
        const v0 = entree[c];
        if (mode === 'masque' && !Number.isFinite(v0)) { sortie[c] = NaN; continue; }
        let s = w[r] * v0;
        let sw = w[r];
        for (const sens of [-1, 1]) {
          for (let k = 1; k <= r; k++) {
            const ii = i + sens * k * dx, jj = j + sens * k * dy;
            if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) break;
            const v = entree[jj * nx + ii];
            if (mode === 'masque' && !Number.isFinite(v)) break;
            s += w[r + k] * v;
            sw += w[r + k];
          }
        }
        sortie[c] = mode === 'zero' ? s / somme : s / sw;
      }
    }
    return sortie;
  };
  return passe(passe(src, 1, 0), 0, 1);
}
