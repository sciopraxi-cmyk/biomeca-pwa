-- #229-D étape 2 — compteur journalier du chatbot d'aide.
-- Une ligne par (utilisateur, jour) ; l'Edge Function help-chat incrémente
-- via service_role et refuse au-delà du plafond. Aucune policy : le rôle
-- authenticated ne lit ni n'écrit cette table (RLS activée sans policy).
-- Idempotent : rejouable sans risque.

CREATE TABLE IF NOT EXISTS help_chat_usage (
  user_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

ALTER TABLE help_chat_usage ENABLE ROW LEVEL SECURITY;
