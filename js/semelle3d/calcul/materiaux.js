// Tableau de matériaux fourni par le praticien (PODAXIA) : lecture et contrôles. DONNÉES, aucun coefficient inventé.
// Les textes restent tels que dans le tableau ; seuls deux champs sont dérivés : l'épaisseur numérique (premier nombre du
// texte), le Shore (1er nombre de la colonne dureté) et la résistance en kg/m3 (2e nombre) — extraits à la conversion.
import { SHORE_PLAGE } from '../constantes.js';

export function nombreDuTexte(t) {
  const m = /(\d+(?:[.,]\d+)?)/.exec(String(t ?? ''));
  return m ? Number(m[1].replace(',', '.')) : null;
}

// Couleur écrite dans le titre du matériau (recouvrements : Noir, Bleu, Rose, Gris, Marron, Beige) -> teinte d'affichage de l'élément sur la semelle.
// Le titre du tableau n'est jamais modifié ; la teinte n'est qu'un aide visuelle (pas de couleur dans le titre = null, l'élément garde sa teinte de palette).
export const COULEURS_TITRE = Object.freeze([
  Object.freeze({ mot: 'noir', nom: 'Noir', hex: '#1b1b1b' }), Object.freeze({ mot: 'bleu', nom: 'Bleu', hex: '#1237d6' }), Object.freeze({ mot: 'rose', nom: 'Rose', hex: '#ff69b4' }),
  Object.freeze({ mot: 'gris', nom: 'Gris', hex: '#9a9fa6' }), Object.freeze({ mot: 'marron', nom: 'Marron', hex: '#8b5a2b' }), Object.freeze({ mot: 'beige', nom: 'Beige', hex: '#e6d3a3' }),
]);
// Le NOIR MARBRÉ a l'aspect de la photo fournie par Joël (02/11) : gris foncé veiné de noir (gris moyen #5f5f5e) + texture assets/marbre-noir.jpg.
// Les 4 marbrés (noir, gris, bleu, rose) ont leur photo : couleur unie du titre. Le noir uni (micro-fibre, PE micro-perforé) reste noir.
export const MARBRE_NOIR = Object.freeze({ nom: 'Noir marbré', hex: '#5f5f5e', texture: 'marbre-noir' });
// Le GRIS MARBRÉ (photo de Joël, 02/11) : blanc moucheté de 2 gris (gris moyen #bfbfbe) + texture assets/marbre-gris.jpg.
export const MARBRE_GRIS = Object.freeze({ nom: 'Gris marbré', hex: '#bfbfbe', texture: 'marbre-gris' });
// Le BLEU MARBRÉ (photo de Joël, 02/11) : bleu franc veiné de crème (bleu moyen #5280c5) + texture assets/marbre-bleu.jpg.
export const MARBRE_BLEU = Object.freeze({ nom: 'Bleu marbré', hex: '#5280c5', texture: 'marbre-bleu' });
// Le ROSE MARBRÉ (photo de Joël, 02/11) : rose vif nuancé (rose moyen #e85681) + texture assets/marbre-rose.jpg.
export const MARBRE_ROSE = Object.freeze({ nom: 'Rose marbré', hex: '#e85681', texture: 'marbre-rose' });
const MARBRES = Object.freeze({ noir: MARBRE_NOIR, gris: MARBRE_GRIS, bleu: MARBRE_BLEU, rose: MARBRE_ROSE });
export function couleurDuTitre(titre) {
  const t = ' ' + String(titre ?? '').toLowerCase().replace(/[^a-zà-ÿ]+/g, ' ') + ' ';
  for (const c of COULEURS_TITRE) if (t.includes(' ' + c.mot + ' ')) return MARBRES[c.mot] && /\bmarbr/.test(t) ? MARBRES[c.mot] : c;
  return null;
}

export function chargerMateriaux(json) {
  if (!json || !Array.isArray(json.materiaux) || json.materiaux.length === 0) throw new TypeError('matériaux : tableau absent ou vide');
  const parId = new Map();
  const liste = json.materiaux.map((m) => {
    if (typeof m.item_id !== 'string' || !m.item_id) throw new TypeError('matériaux : item_id manquant (ligne ' + m.ligne_excel + ')');
    if (parId.has(m.item_id)) throw new RangeError('matériaux : identifiant en double « ' + m.item_id + ' »');
    const r = {
      id: m.item_id, libelle: m.reference_interne, specification: m.specification_materiau,
      epaisseur_texte: m.epaisseur, epaisseur_mm: nombreDuTexte(m.epaisseur),
      durete_texte: m.durete, shore: Number.isFinite(m.durete_shore) ? m.durete_shore : null,
      resistance_kgm3: Number.isFinite(m.durete_kgm3) ? m.durete_kgm3 : null, // 2e nombre de la colonne dureté (kg/m3), sens donné par Joël le 31/10/2026
      finition: m.finition_support, ligne_excel: m.ligne_excel,
    };
    const coul = couleurDuTitre(m.reference_interne); r.couleur_nom = coul ? coul.nom : null; r.couleur_hex = coul ? coul.hex : null; r.texture = coul && coul.texture ? coul.texture : null;
    parId.set(r.id, r);
    return r;
  });
  const shores = [...new Set(liste.map((m) => m.shore).filter((s) => s !== null))].sort((a, b) => a - b);
  return { liste, parId, shores };
}

export function trouverMateriau(cat, id) {
  const m = cat && cat.parId ? cat.parId.get(id) : undefined;
  if (!m) throw new RangeError('matériau inconnu dans le tableau : « ' + id + ' »');
  return m;
}

// Choix de matériau et de Shore d'un élément : erreurs (bloquantes) et avertissements (non bloquants).
export function controlerChoixMateriau({ materiau_id, shore_a }, hauteur_max_mm, cat) {
  const avert = [];
  let mat = null;
  if (materiau_id !== null && materiau_id !== undefined) {
    if (!cat) throw new Error('matériaux : tableau non chargé (impossible de vérifier « ' + materiau_id + ' »)');
    mat = trouverMateriau(cat, materiau_id);
  }
  if (shore_a !== null && shore_a !== undefined) {
    if (typeof shore_a !== 'number' || !Number.isFinite(shore_a) || shore_a < SHORE_PLAGE.min || shore_a > SHORE_PLAGE.max) {
      throw new RangeError('Shore ' + shore_a + ' hors de ' + SHORE_PLAGE.min + ' à ' + SHORE_PLAGE.max);
    }
  }
  if (mat === null) avert.push('matériau non choisi');
  if (mat && shore_a !== null && shore_a !== undefined) {
    if (mat.shore === null) avert.push('le tableau ne donne pas de Shore pour « ' + mat.libelle + ' » (valeur saisie non vérifiable)');
    else if (mat.shore !== shore_a) avert.push('Shore saisi ' + shore_a + ' ≠ Shore du tableau pour « ' + mat.libelle + ' » (' + mat.shore + ')');
  }
  if (cat && shore_a !== null && shore_a !== undefined && cat.shores.length && !cat.shores.includes(shore_a)) avert.push('Shore ' + shore_a + ' absent du tableau (valeurs : ' + cat.shores.join(', ') + ')');
  if (mat && mat.epaisseur_mm !== null && hauteur_max_mm > mat.epaisseur_mm + 1e-6) {
    avert.push('élément de ' + hauteur_max_mm.toFixed(1) + ' mm plus haut que le matériau choisi (' + mat.epaisseur_mm + ' mm) : plusieurs épaisseurs à empiler');
  }
  return { materiau: mat, avertissements: avert };
}
