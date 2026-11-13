// V1 : résumé TEXTE du plan de semelle pour le rapport du bilan (type de base, éléments choisis, recouvrement).
// Fonction pure : lit le rapport du dernier calcul (R) et ne touche ni au DOM ni au worker. Rien n'est inventé :
// une valeur absente (matériau non choisi, Shore inconnu) est écrite « non choisi » / « non indiqué ».
const NOMS_TYPES = Object.freeze({ plate: 'Plate', thermoformee: 'Thermoformée', pleine_dessous: 'Intermédiaire' });
const NOMS_BORDS = Object.freeze({ medial: 'médial', lateral: 'latéral', posterieur: 'postérieur (talon)' });

const fr = (v, n = 1) => Number(v).toFixed(n).replace('.', ',');
const ok = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

function descriptionMateriau(m) {
  if (!m) return 'matériau non choisi';
  const libelle = m.libelle || m.nom || 'matériau';
  if (ok(m.shore)) return libelle + ' · Shore ' + m.shore;
  if (ok(m.resistance_kgm3)) return libelle + ' · résistance ' + m.resistance_kgm3 + ' kg/m³';
  return libelle + ' · dureté non indiquée';
}

function reglage(e) {
  if (ok(e.biseau_deg) && ok(e.hauteur_reglee_mm)) {
    const bords = Array.isArray(e.bords) ? e.bords.map((b) => NOMS_BORDS[b] || b).join(' + ') : '';
    return 'hauteur ' + fr(e.hauteur_reglee_mm, 2) + ' mm' + (bords ? ' au bord ' + bords : '') + ', biseau ' + fr(e.biseau_deg, 0) + '°';
  }
  if (ok(e.angle_regle_deg) && !e.torsion && !e.skive) return 'angle ' + fr(e.angle_regle_deg, 2) + '°' + (ok(e.hauteur_regle_mm) ? ' (hauteur ' + fr(e.hauteur_regle_mm, 2) + ' mm)' : '');
  if (ok(e.angle_deg) && ok(e.hauteur_reglee_mm)) return 'angle ' + fr(e.angle_deg, 2) + '° (hauteur ' + fr(e.hauteur_reglee_mm, 2) + ' mm)';
  if (ok(e.hauteur_regle_mm)) return 'hauteur ' + fr(e.hauteur_regle_mm, 2) + ' mm';
  if (e.raison) return String(e.raison);
  return '';
}

// R : rapport du calcul de la base (+ éléments). Renvoie { base, elements, recouvrement, lignes }.
export function resumerPlan(R) {
  if (!R || !NOMS_TYPES[R.type]) throw new Error('resumerPlan : rapport de base absent');
  const zone0 = (R.zones || [])[0] || null;
  const base = {
    type: R.type,
    type_nom: NOMS_TYPES[R.type],
    moulage_pct: R.type === 'plate' || !ok(R.taux_effectif) ? 0 : Math.round(R.taux_effectif * 100),
    epaisseur_mm: ok(R.epaisseur_mm) ? Number(R.epaisseur_mm) : null,
    materiau: zone0 && zone0.materiau ? descriptionMateriau(zone0.materiau) : 'matériau non choisi',
    etendue: R.etendue && R.etendue.mode === 'demi' ? 'demi' : 'complete',
  };
  if (base.etendue === 'demi') {
    base.limite_pct = R.etendue.limite_pct;
    base.devant = R.etendue.devant;
    const zoneDevant = (R.zones || []).find((z) => z.zone === 'devant');
    base.materiau_devant = zoneDevant && zoneDevant.materiau ? descriptionMateriau(zoneDevant.materiau) : null;
  }
  const elements = [];
  let recouvrement = null;
  for (const e of R.elements || []) {
    if (e.visible === false) continue; // un élément masqué n'est pas dans la semelle montrée
    const mat = e.materiau ? { libelle: e.materiau, shore: e.shore_a, resistance_kgm3: e.resistance_kgm3 } : null;
    if (e.type === 'recouvrement') {
      recouvrement = { materiau: descriptionMateriau(mat), epaisseur_mm: ok(e.hauteur_reglee_mm) ? Number(e.hauteur_reglee_mm) : null };
      continue;
    }
    elements.push({ type: e.type, nom: e.libelle, reglage: reglage(e), materiau: descriptionMateriau(mat) });
  }
  const lignes = [];
  lignes.push('Base ' + base.type_nom.toLowerCase() + (base.type === 'plate' ? ', sans moulage' : ', moulage ' + base.moulage_pct + ' %') + (base.epaisseur_mm !== null ? ', épaisseur ' + fr(base.epaisseur_mm, 2) + ' mm' : '') + ' — ' + base.materiau);
  if (base.etendue === 'demi') lignes.push('Demi-semelle : du talon à ' + fr(base.limite_pct, 0) + ' %' + (base.devant === 'rien' ? ', rien devant' : base.materiau_devant ? ', devant : ' + base.materiau_devant : ''));
  for (const e of elements) lignes.push(e.nom + (e.reglage ? ' : ' + e.reglage : '') + ' — ' + e.materiau);
  lignes.push(recouvrement ? 'Recouvrement : ' + recouvrement.materiau + (recouvrement.epaisseur_mm !== null ? ', ' + fr(recouvrement.epaisseur_mm, 1) + ' mm' : '') : 'Recouvrement : aucun');
  return { base, elements, recouvrement, lignes };
}
