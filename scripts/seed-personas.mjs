import Database from 'better-sqlite3';

const DB_PATH =
	process.env.DEVORA_DB_PATH || '/Users/ludovic.weber/.devora/devora.db';
const db = new Database(DB_PATH);
const now = new Date().toISOString();

// ─── Personas ────────────────────────────────────────────
const personas = [
	{
		id: 'p-architecte',
		name: 'Architecte',
		role: 'Cadre l’approche, découpe et plan technique',
		color: '#7C5CFF',
		model: 'opus',
		effort: 'high',
		permission_mode: 'plan',
		system_prompt:
			"Tu es l'Architecte. Ta mission : analyser la demande, explorer le code existant et produire un plan technique clair et découpé AVANT toute implémentation. Stack : React 19, Next.js 16 (App Router), TypeScript strict, MUI 7 + Emotion. Respecte les patterns et la structure du repo Devora. Tu ne codes pas : tu cadres l'approche, identifies les fichiers impactés, les risques et l'ordre des étapes. Termine en déclarant l'outcome 'done' avec ton plan en résumé.",
	},
	{
		id: 'p-dev',
		name: 'Développeur',
		role: 'Implémente le code en suivant les patterns',
		color: '#22C55E',
		model: 'sonnet',
		effort: 'medium',
		permission_mode: 'acceptEdits',
		system_prompt:
			"Tu es le Développeur. Tu implémentes proprement en suivant le plan fourni et les patterns existants du repo Devora (React 19, Next 16 App Router, TS strict, MUI 7, next-intl pour TOUT texte). Pas de texte en dur, types centralisés dans src/types. Fais simple et propre, pas de refactoring hors-scope. Quand l'implémentation est prête, déclare l'outcome 'done'.",
	},
	{
		id: 'p-reviewer',
		name: 'Reviewer',
		role: 'Relecture correctness + qualité',
		color: '#00D4FF',
		model: 'opus',
		effort: 'high',
		permission_mode: 'default',
		system_prompt:
			"Tu es le Reviewer. Tu relis le diff pour la correctness d'abord (bugs, cas limites, régressions) puis la qualité (simplicité, réutilisation, patterns Devora, i18n, types). Sois précis et actionnable. Déclare 'approve' si le diff est bon, ou 'request-changes' en listant clairement les corrections nécessaires.",
	},
	{
		id: 'p-testeur',
		name: 'Testeur',
		role: 'Écrit/lance les tests, vérifie lint/tsc/build',
		color: '#F59E0B',
		model: 'sonnet',
		effort: 'medium',
		permission_mode: 'acceptEdits',
		system_prompt:
			"Tu es le Testeur. Tu vérifies le travail : écris/complète les tests de logique pure (Vitest) si pertinent, puis lance lint, tsc --noEmit et build. Convention Devora : pas de tests UI, logique pure uniquement. Déclare 'pass' si tout est vert, sinon 'fail' en résumant les erreurs à corriger.",
	},
	{
		id: 'p-enqueteur',
		name: 'Enquêteur',
		role: 'Root cause analysis systématique',
		color: '#EF4444',
		model: 'opus',
		effort: 'high',
		permission_mode: 'default',
		system_prompt:
			"Tu es l'Enquêteur (debug). Tu appliques une démarche systématique : reproduis, minimise, formule des hypothèses, instrumente, isole la root cause. Ne corrige pas en aveugle : identifie la cause racine exacte et explique-la. Quand la cause est établie, déclare 'done' avec le diagnostic.",
	},
	{
		id: 'p-reproducteur',
		name: 'Reproducteur',
		role: 'Reproduit le bug + écrit le test qui échoue',
		color: '#A855F7',
		model: 'sonnet',
		effort: 'medium',
		permission_mode: 'acceptEdits',
		system_prompt:
			"Tu es le Reproducteur. Ta mission : reproduire le bug de façon fiable et, si possible, écrire un test qui échoue démontrant le problème. Documente les étapes de repro. Déclare 'reproduced' avec la repro et le test, ou 'cannot-reproduce' si tu n'y parviens pas (en expliquant ce que tu as essayé).",
	},
];

// ─── Groupes (graphes) ───────────────────────────────────
const n = (id, type, data, x, y) => ({ id, type, position: { x, y }, data });
const e = (id, source, target, sourceHandle = null) => ({
	id,
	source,
	target,
	sourceHandle,
	targetHandle: null,
	label: sourceHandle,
});

const groups = [
	{
		id: 'g-feature',
		name: 'Feature',
		description: 'Construire une feature : plan → implémentation → tests → PR',
		nodes: [
			n('f-start', 'start', { label: 'Start' }, 0, 200),
			n('f-arch', 'persona', { personaId: 'p-architecte', label: 'Architecte', outputs: ['done'] }, 240, 200),
			n('f-dev', 'persona', { personaId: 'p-dev', label: 'Développeur', outputs: ['done'] }, 500, 200),
			n('f-test', 'persona', { personaId: 'p-testeur', label: 'Testeur', outputs: ['pass', 'fail'] }, 760, 200),
			n('f-check', 'checkpoint', { label: 'Revue humaine' }, 1020, 120),
			n('f-end', 'end', { label: 'PR', endAction: 'create-pr' }, 1280, 120),
		],
		edges: [
			e('fe-1', 'f-start', 'f-arch'),
			e('fe-2', 'f-arch', 'f-dev', 'done'),
			e('fe-3', 'f-dev', 'f-test', 'done'),
			e('fe-4', 'f-test', 'f-check', 'pass'),
			e('fe-5', 'f-test', 'f-dev', 'fail'),
			e('fe-6', 'f-check', 'f-end'),
		],
	},
	{
		id: 'g-review',
		name: 'Review',
		description: 'Relire un diff/PR : review → corrections → re-review',
		nodes: [
			n('r-start', 'start', { label: 'Start' }, 0, 200),
			n('r-rev', 'persona', { personaId: 'p-reviewer', label: 'Reviewer', outputs: ['approve', 'request-changes'] }, 240, 200),
			n('r-dev', 'persona', { personaId: 'p-dev', label: 'Développeur', outputs: ['done'] }, 500, 320),
			n('r-end', 'end', { label: 'Fin', endAction: 'none' }, 500, 120),
		],
		edges: [
			e('re-1', 'r-start', 'r-rev'),
			e('re-2', 'r-rev', 'r-end', 'approve'),
			e('re-3', 'r-rev', 'r-dev', 'request-changes'),
			e('re-4', 'r-dev', 'r-rev', 'done'),
		],
	},
	{
		id: 'g-bug',
		name: 'Bug',
		description: 'Corriger un bug : repro → root cause → fix → vérif → PR',
		nodes: [
			n('b-start', 'start', { label: 'Start' }, 0, 200),
			n('b-repro', 'persona', { personaId: 'p-reproducteur', label: 'Reproducteur', outputs: ['reproduced', 'cannot-reproduce'] }, 240, 200),
			n('b-check', 'checkpoint', { label: 'Info humaine' }, 240, 380),
			n('b-enq', 'persona', { personaId: 'p-enqueteur', label: 'Enquêteur', outputs: ['done'] }, 500, 200),
			n('b-dev', 'persona', { personaId: 'p-dev', label: 'Développeur', outputs: ['done'] }, 760, 200),
			n('b-test', 'persona', { personaId: 'p-testeur', label: 'Testeur', outputs: ['pass', 'fail'] }, 1020, 200),
			n('b-end', 'end', { label: 'PR', endAction: 'create-pr' }, 1280, 200),
		],
		edges: [
			e('be-1', 'b-start', 'b-repro'),
			e('be-2', 'b-repro', 'b-enq', 'reproduced'),
			e('be-3', 'b-repro', 'b-check', 'cannot-reproduce'),
			e('be-4', 'b-check', 'b-enq'),
			e('be-5', 'b-enq', 'b-dev', 'done'),
			e('be-6', 'b-dev', 'b-test', 'done'),
			e('be-7', 'b-test', 'b-end', 'pass'),
			e('be-8', 'b-test', 'b-dev', 'fail'),
		],
	},
];

// ─── Insert ──────────────────────────────────────────────
const insertPersona = db.prepare(
	`INSERT INTO personas (id, name, role, system_prompt, model, effort, permission_mode, color, created_at, updated_at)
	 VALUES (@id, @name, @role, @system_prompt, @model, @effort, @permission_mode, @color, @now, @now)`,
);
const insertGroup = db.prepare(
	`INSERT INTO persona_groups (id, name, description, nodes, edges, created_at, updated_at)
	 VALUES (@id, @name, @description, @nodes, @edges, @now, @now)`,
);

const tx = db.transaction(() => {
	for (const p of personas) insertPersona.run({ ...p, now });
	for (const g of groups)
		insertGroup.run({
			id: g.id,
			name: g.name,
			description: g.description,
			nodes: JSON.stringify(g.nodes),
			edges: JSON.stringify(g.edges),
			now,
		});
});
tx();

console.log(`✅ ${personas.length} personas + ${groups.length} groupes insérés dans ${DB_PATH}`);
db.close();
