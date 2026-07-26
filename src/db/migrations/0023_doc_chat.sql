-- Le chat sur une doc remplace l'affinage. Deux nettoyages indissociables :

-- 1. Les messages de l'ancien panneau d'affinage. `transcript.loadTranscript` ne
--    filtre pas sur event_type : ces lignes seraient parsées comme des StreamEvent
--    et rejouées en vrac dans le nouveau chat.
DELETE FROM agent_chat_messages WHERE event_type = 'doc_refine';

-- 2. `startOrAttach` reprend inconditionnellement claude_session_id depuis la DB.
--    Sans ce reset, le premier chat d'une doc DÉJÀ générée reprendrait la session
--    du rédacteur muet, dont le prompt système interdit toute réponse conversationnelle.
UPDATE agent_sessions SET claude_session_id = NULL WHERE origin = 'doc';
