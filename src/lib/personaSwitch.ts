import type { Persona } from '@/types';

/**
 * Construit le message injecté dans la conversation quand l'utilisateur change de
 * persona en cours de session. Le system prompt du SDK ne pouvant pas être changé à
 * chaud, on informe l'agent en bande : il lit ce message et adapte son comportement.
 */
export function buildPersonaSwitchMessage(
	persona: Pick<Persona, 'name' | 'system_prompt'>,
): string {
	const prompt = (persona.system_prompt ?? '').trim();
	const header = `🔄 Changement de rôle : tu es désormais « ${persona.name} ».`;
	const instructions = prompt
		? `\n\nNouvelles instructions à appliquer à partir de maintenant :\n\n${prompt}`
		: '';
	const footer = `\n\nAdapte ton comportement à ce rôle dès ta prochaine réponse.`;
	return `${header}${instructions}${footer}`;
}
