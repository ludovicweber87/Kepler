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
	{ value: 'max', key: 'effortMax' },
] as const;
