// ═══════════════════════════════════════════════════════════════════
// Test-mirror module — duplique computeAccessLevel de js/biomeca.js
// pour permettre les tests unitaires Vitest. Toute modification de
// computeAccessLevel dans biomeca.js DOIT être répercutée ici (pattern
// identique à js/calc.mjs).
//
// Si possible, refactor futur en ES module unique partagé (hors scope
// task #57).
//
// Divergence connue : la version prod référence `pwaUser.email` global
// pour enrichir le console.error de l'état illégitime. Le mirror ne
// l'a pas (pwaUser n'existe pas en module-scope ES). Comportement de
// retour strictement identique ; payload du log moins riche.
// ═══════════════════════════════════════════════════════════════════

export function computeAccessLevel({ isAdmin, meta, userData }, now) {
  if (isAdmin) return 'full';
  if (userData === undefined) return 'loading';
  if (userData === null) return 'blocked';

  const licence = userData.licence_payee === true;
  const formule = userData.formule;
  const trialStart = meta && meta.trial_start;
  const nowMs = typeof now === 'number' ? now : Date.now();

  if (!licence && formule) {
    console.error('[access] Illegitimate state detected: formule set without licence', {
      formule,
    });
    return 'blocked';
  }

  let trialActive = false;
  if (trialStart) {
    const elapsedDays = (nowMs - new Date(trialStart).getTime()) / 86400000;
    trialActive = elapsedDays >= 0 && elapsedDays <= 14;
  }

  if (licence && formule) return 'full';
  if (trialActive) return 'full';
  if (licence && !formule) return 'readonly';
  return 'blocked';
}
