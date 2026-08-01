-- ═══════════════════════════════════════════════════════════════════
-- Task #102 Phase 2b — étape 1 : compteur léger nb_tests sur bilans
-- ═══════════════════════════════════════════════════════════════════
-- Prépare le futur chargement léger de la liste patients (Phase 2b, pas
-- encore fait) : public.bilans porte déjà, hors colonne payload (jsonb
-- lourd), tout ce qu'il faut pour reconstruire l'affichage actuel de
-- renderPatientList() (js/biomeca.js) SANS charger le contenu complet
-- d'un bilan :
--   - l'EXISTENCE d'une ligne (module, status='in_progress') suffit à
--     déterminer hasBilanDataContent() pour posturo/podopédiatrie/
--     pédicurie, car _syncPatientToNormalizedTables() (js/biomeca.js)
--     n'écrit cette ligne QUE si hasBilanDataContent() est vrai — la
--     condition d'écriture EST la condition d'affichage.
--   - label/bilan_date/sous_type couvrent l'affichage des archives.
--
-- Il manque une seule donnée : le sous-libellé sport "N test(s)
-- saisi(s)" (nbTestsEnCours = Object.keys(p.mesures).length côté
-- client) est un COMPTE, pas juste une présence. Cette colonne le
-- rend disponible via une lecture légère (SELECT ... nb_tests, sans
-- payload) plutôt que de dépendre du jsonb complet.
--
-- Cette migration N'EST PAS ENCORE LUE par le code client (aucun
-- SELECT sur public.bilans à ce jour — voir cartographie #102 Phase 2b
-- du 01/08/2026). Elle prépare uniquement le terrain, comme Phase 2a/3
-- en leur temps : écriture seule, zéro changement de comportement.
--
-- Idempotent : ADD COLUMN IF NOT EXISTS.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.bilans
  ADD COLUMN IF NOT EXISTS nb_tests integer;

COMMENT ON COLUMN public.bilans.nb_tests IS
  'Compte léger (Object.keys(mesures).length côté client) pour le module sport uniquement — permet le sous-libellé "N test(s) saisi(s)" sans charger payload. NULL pour les autres modules.';
