-- Suppression d'un acte PERSONNALISÉ du catalogue (bouton « Supprimer »).
-- Jusqu'ici aucune règle DELETE (volontaire). Désormais : seulement ses propres actes personnalisés
-- (perso = true) ; les actes du référentiel POD / AMP ne se suppriment pas (on les désactive).
-- Les devis et factures gardent une COPIE des lignes : supprimer un acte ne modifie aucun document.
-- Idempotent.
DROP POLICY IF EXISTS delete_own_perso ON public.actes_catalogue;
CREATE POLICY delete_own_perso ON public.actes_catalogue
  FOR DELETE TO authenticated USING (auth.uid() = user_id AND perso = true);
GRANT DELETE ON public.actes_catalogue TO authenticated;
