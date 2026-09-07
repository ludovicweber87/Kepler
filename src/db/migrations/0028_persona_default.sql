-- Persona présélectionnée à la création d'un worktree. Une seule persona peut
-- être marquée par défaut : l'invariant est tenu côté API (les autres sont
-- remises à 0 avant de poser le nouveau flag), pas par un index partiel, pour
-- rester compatible avec le filet `ensureSchema`.
ALTER TABLE `personas` ADD `is_default` integer DEFAULT false;
