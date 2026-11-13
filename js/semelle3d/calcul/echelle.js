// Échelle du scan = longueur réelle du pied (saisie, podomètre) / longueur de la boîte englobante
// du scan sur l'axe longitudinal. Aucune hypothèse d'unité : seule la longueur saisie fait foi.
import { ECART_ECHELLE_CONFIRMATION, LONGUEUR_PIED_PLAUSIBLE_MM, UNITES_CONNUES, TOLERANCE_UNITE } from '../constantes.js';

export function validerLongueurPied(mm) {
  if (typeof mm !== 'number' || !Number.isFinite(mm)) throw new RangeError('longueur du pied : nombre attendu (mm)');
  const { min, max } = LONGUEUR_PIED_PLAUSIBLE_MM;
  if (mm < min || mm > max) throw new RangeError('longueur du pied hors plage plausible (' + min + ' à ' + max + ' mm) : ' + mm);
  return mm;
}

export function calculerEchelle(longueurBoite, longueurSaisie) {
  validerLongueurPied(longueurSaisie);
  if (!(Number.isFinite(longueurBoite) && longueurBoite > 0)) throw new RangeError('échelle : longueur de la boîte englobante invalide');
  const facteur = longueurSaisie / longueurBoite;
  const ecart_pct = (facteur - 1) * 100;
  const confirmation_requise = Math.abs(facteur - 1) > ECART_ECHELLE_CONFIRMATION;
  // Aide au diagnostic (information seulement) : unité probable du fichier.
  let unite_probable = null;
  for (const u of UNITES_CONNUES) if (Math.abs(facteur / u.facteur - 1) <= TOLERANCE_UNITE) unite_probable = u.nom;
  return { longueur_pied_mm: longueurSaisie, longueur_boite_brute: longueurBoite, facteur_echelle: facteur, ecart_echelle_pct: ecart_pct, confirmation_requise, unite_probable };
}
