// Source unique des models & efforts Claude, partagée par le chat et l'éditeur de persona.
// Aliases : résolus par l'Agent SDK vers le dernier modèle de chaque famille.
export const MODEL_ALIASES = [
	{ value: 'opus', key: 'modelOpus' },
	{ value: 'sonnet', key: 'modelSonnet' },
	{ value: 'haiku', key: 'modelHaiku' },
] as const;

// Versions pinnées (IDs exacts). À tenir à jour lors des sorties de modèles.
export const MODEL_VERSIONS = [
	{ value: 'claude-fable-5', key: 'modelFable5' },
	{ value: 'claude-opus-5', key: 'modelOpus5' },
	{ value: 'claude-opus-4-8', key: 'modelOpus48' },
	{ value: 'claude-opus-4-7', key: 'modelOpus47' },
	{ value: 'claude-opus-4-6', key: 'modelOpus46' },
	{ value: 'claude-opus-4-5', key: 'modelOpus45' },
	{ value: 'claude-opus-4-1', key: 'modelOpus41' },
	{ value: 'claude-sonnet-5', key: 'modelSonnet5' },
	{ value: 'claude-sonnet-4-6', key: 'modelSonnet46' },
	{ value: 'claude-sonnet-4-5', key: 'modelSonnet45' },
	{ value: 'claude-haiku-4-5', key: 'modelHaiku45' },
] as const;

export const MODELS = [...MODEL_ALIASES, ...MODEL_VERSIONS] as const;

export const EFFORTS = [
	{ value: 'low', key: 'effortLow' },
	{ value: 'medium', key: 'effortMedium' },
	{ value: 'high', key: 'effortHigh' },
	{ value: 'ultracode', key: 'effortUltracode' },
] as const;

// Regroupement famille → versions, pour le sélecteur en cards de la modale de lancement.
// `alias` = valeur à envoyer pour « dernier modèle de la famille » (null si pas d'alias).
// `labelKey`/`descKey` sont résolus dans le namespace i18n `launchModal`.
export const MODEL_FAMILIES = [
	{
		id: 'opus',
		labelKey: 'familyOpus',
		descKey: 'familyOpusDesc',
		alias: 'opus',
		versions: [
			'claude-opus-5',
			'claude-opus-4-8',
			'claude-opus-4-7',
			'claude-opus-4-6',
			'claude-opus-4-5',
			'claude-opus-4-1',
		],
	},
	{
		id: 'sonnet',
		labelKey: 'familySonnet',
		descKey: 'familySonnetDesc',
		alias: 'sonnet',
		versions: ['claude-sonnet-5', 'claude-sonnet-4-6', 'claude-sonnet-4-5'],
	},
	{
		id: 'haiku',
		labelKey: 'familyHaiku',
		descKey: 'familyHaikuDesc',
		alias: 'haiku',
		versions: ['claude-haiku-4-5'],
	},
	{
		id: 'fable',
		labelKey: 'familyFable',
		descKey: 'familyFableDesc',
		alias: null,
		versions: ['claude-fable-5'],
	},
] as const;

export type ModelFamilyId = (typeof MODEL_FAMILIES)[number]['id'];

/** Famille d'un model (alias ou version épinglée). Retourne 'opus' par défaut. */
export function modelFamily(model: string): ModelFamilyId {
	const found = MODEL_FAMILIES.find(
		(f) => f.alias === model || (f.versions as readonly string[]).includes(model),
	);
	return found?.id ?? 'opus';
}

/** Clé i18n (namespace `common`) du label court d'une valeur de model. */
export function modelLabelKey(model: string): string | undefined {
	return MODELS.find((m) => m.value === model)?.key;
}

/**
 * Normalise une valeur d'effort persistée. Le niveau max historique `'max'` a été
 * renommé `'ultracode'` ; les anciennes sessions/personas stockées en `'max'` sont
 * remappées à la lecture pour l'affichage. Toute autre valeur est renvoyée telle quelle.
 */
export function normalizeEffort(effort: string): string {
	return effort === 'max' ? 'ultracode' : effort;
}
