-- Facturation, étape 2a — champs chiffrés de remboursement du catalogue d'actes.
-- base_remboursable_cents : base sur laquelle la Sécurité sociale rembourse (null = acte
-- non remboursé). Pour les semelles : base LPP de la PAIRE, pas le prix de vente.
-- franchise : la franchise médicale de 1 € s'applique-t-elle (non pour les semelles LPP).
-- Le taux (60 % / 100 % ALD / 90 % Alsace-Moselle) est choisi à la facture, pas ici.
-- Idempotent : ADD COLUMN IF NOT EXISTS ; les policies de la table ne changent pas.

ALTER TABLE public.actes_catalogue
  ADD COLUMN IF NOT EXISTS base_remboursable_cents integer
    CHECK (base_remboursable_cents IS NULL OR base_remboursable_cents BETWEEN 0 AND 10000000),
  ADD COLUMN IF NOT EXISTS franchise boolean NOT NULL DEFAULT true;
