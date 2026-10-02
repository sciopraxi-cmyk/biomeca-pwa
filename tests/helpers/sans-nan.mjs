// ═══════════════════════════════════════════════════════════════════
// #279 étape 1b — surveillance « jamais de NaN » dans ce que voit le praticien
// ═══════════════════════════════════════════════════════════════════
//
// Enveloppe `charger` : chaque rendu (côtés et section du rapport, alertes,
// vignettes) est NOTÉ ; le panneau l'est par `noter(res.innerHTML)`. Après
// chaque test, `verifier()` exige qu'aucune sortie notée ne contienne « NaN ».
// Le compte total prouve que la surveillance a bien porté sur des rendus.

const RENDUS = [
  'buildPrintSide',
  'buildPrintSection',
  '_collectTestAlerts',
  'vidPhotoSlotHTML',
  'photoSlotHTML',
];

export function surveillerNaN(chargerBase) {
  const sorties = [];
  let vus = 0;
  const noter = (x) => {
    sorties.push(typeof x === 'string' ? x : JSON.stringify(x));
    return x;
  };
  const charger = (o) => {
    const env = chargerBase(o);
    for (const f of RENDUS) {
      const g = env[f];
      if (typeof g === 'function') env[f] = (...a) => noter(g(...a));
    }
    return env;
  };
  // Sorties fautives depuis le dernier appel ; remet la liste à zéro.
  const verifier = () => {
    vus += sorties.length;
    const fautives = sorties.filter((x) => x.includes('NaN')).map((x) => x.slice(0, 160));
    sorties.length = 0;
    return fautives;
  };
  return { charger, noter, verifier, vus: () => vus };
}
