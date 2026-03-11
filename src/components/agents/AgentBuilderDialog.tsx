'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import CircularProgress from '@mui/material/CircularProgress';
import { alpha } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface AgentBuilderDialogProps {
	open: boolean;
	onClose: () => void;
	onSave: (filename: string, content: string) => void;
}

interface BuilderState {
	// Step 0 — Task types (multi-select)
	taskTypes: string[];
	customTaskType: string;
	// Step 1 — Context (multi-select + free text)
	techStacks: string[];
	customTechStack: string;
	projectContext: string;
	// Step 2 — Behavior (multi-select + free text)
	conventions: string[];
	customRules: string;
	outputFormats: string[];
	tone: string[];
	// Step 3 — Name
	agentName: string;
}

const INITIAL_STATE: BuilderState = {
	taskTypes: [],
	customTaskType: '',
	techStacks: [],
	customTechStack: '',
	projectContext: '',
	conventions: [],
	customRules: '',
	outputFormats: [],
	tone: [],
	agentName: '',
};

/* ------------------------------------------------------------------ */
/*  Steps config                                                       */
/* ------------------------------------------------------------------ */

const STEPS = [
	{ label: 'Type de tâche', description: "Quel type de tâche l'agent doit-il accomplir ?" },
	{ label: 'Contexte', description: 'Dans quel environnement technique travaille-t-il ?' },
	{ label: 'Comportement', description: 'Comment doit-il travailler ?' },
	{ label: 'Génération', description: 'Prévisualisation et ajustements' },
];

const TASK_TYPES = [
	{ value: 'code-review', label: 'Revue de code', emoji: '🔍' },
	{ value: 'testing', label: 'Tests unitaires / E2E', emoji: '🧪' },
	{ value: 'refactoring', label: 'Refactoring', emoji: '♻️' },
	{ value: 'documentation', label: 'Documentation', emoji: '📝' },
	{ value: 'security', label: 'Audit sécurité', emoji: '🔒' },
	{ value: 'performance', label: 'Optimisation perf', emoji: '⚡' },
	{ value: 'migration', label: 'Migration / upgrade', emoji: '🔄' },
	{ value: 'debugging', label: 'Debugging', emoji: '🐛' },
	{ value: 'ci-cd', label: 'CI/CD', emoji: '🚀' },
	{ value: 'code-generation', label: 'Génération de code', emoji: '🏗️' },
	{ value: 'api-design', label: 'Design d\'API', emoji: '🌐' },
	{ value: 'database', label: 'Base de données', emoji: '🗄️' },
	{ value: 'accessibility', label: 'Accessibilité', emoji: '♿' },
	{ value: 'i18n', label: 'Internationalisation', emoji: '🌍' },
	{ value: 'devops', label: 'DevOps / infra', emoji: '🛠️' },
	{ value: 'git', label: 'Git workflow', emoji: '📦' },
	{ value: 'architecture', label: 'Architecture', emoji: '🏛️' },
	{ value: 'typing', label: 'Typage / types', emoji: '🏷️' },
	{ value: 'custom', label: 'Autre...', emoji: '✨' },
];

const TECH_STACKS = [
	{ value: 'react', label: 'React' },
	{ value: 'nextjs', label: 'Next.js' },
	{ value: 'vue', label: 'Vue.js' },
	{ value: 'nuxt', label: 'Nuxt' },
	{ value: 'svelte', label: 'Svelte' },
	{ value: 'angular', label: 'Angular' },
	{ value: 'typescript', label: 'TypeScript' },
	{ value: 'javascript', label: 'JavaScript' },
	{ value: 'python', label: 'Python' },
	{ value: 'rust', label: 'Rust' },
	{ value: 'go', label: 'Go' },
	{ value: 'java', label: 'Java' },
	{ value: 'csharp', label: 'C#' },
	{ value: 'php', label: 'PHP' },
	{ value: 'ruby', label: 'Ruby' },
	{ value: 'swift', label: 'Swift' },
	{ value: 'kotlin', label: 'Kotlin' },
	{ value: 'node', label: 'Node.js' },
	{ value: 'deno', label: 'Deno' },
	{ value: 'tailwind', label: 'Tailwind CSS' },
	{ value: 'mui', label: 'MUI' },
	{ value: 'prisma', label: 'Prisma' },
	{ value: 'drizzle', label: 'Drizzle' },
	{ value: 'supabase', label: 'Supabase' },
	{ value: 'firebase', label: 'Firebase' },
	{ value: 'postgres', label: 'PostgreSQL' },
	{ value: 'mongodb', label: 'MongoDB' },
	{ value: 'redis', label: 'Redis' },
	{ value: 'docker', label: 'Docker' },
	{ value: 'graphql', label: 'GraphQL' },
	{ value: 'trpc', label: 'tRPC' },
	{ value: 'tanstack-query', label: 'TanStack Query' },
	{ value: 'zustand', label: 'Zustand' },
	{ value: 'jest', label: 'Jest' },
	{ value: 'vitest', label: 'Vitest' },
	{ value: 'playwright', label: 'Playwright' },
	{ value: 'cypress', label: 'Cypress' },
];

const CONVENTIONS = [
	{ value: 'no-any', label: 'Pas de any' },
	{ value: 'no-classes', label: 'Pas de classes' },
	{ value: 'functional', label: 'Style fonctionnel' },
	{ value: 'custom-hooks', label: 'Hooks customs' },
	{ value: 'solid', label: 'Principes SOLID' },
	{ value: 'dry', label: 'DRY' },
	{ value: 'kiss', label: 'KISS' },
	{ value: 'english-naming', label: 'Noms en anglais' },
	{ value: 'french-naming', label: 'Noms en français' },
	{ value: 'jsdoc', label: 'JSDoc / commentaires' },
	{ value: 'no-comments', label: 'Pas de commentaires inutiles' },
	{ value: 'error-handling', label: 'Gestion d\'erreurs stricte' },
	{ value: 'immutable', label: 'Données immutables' },
	{ value: 'small-functions', label: 'Petites fonctions' },
	{ value: 'barrel-exports', label: 'Barrel exports (index.ts)' },
	{ value: 'colocation', label: 'Colocation fichiers' },
	{ value: 'strict-types', label: 'Typage strict' },
	{ value: 'testing-required', label: 'Tests obligatoires' },
	{ value: 'accessibility', label: 'Accessibilité (ARIA)' },
	{ value: 'responsive', label: 'Responsive design' },
];

const OUTPUT_FORMATS = [
	{ value: 'code', label: 'Code modifié directement' },
	{ value: 'report', label: 'Rapport / analyse' },
	{ value: 'suggestions', label: 'Suggestions avec explications' },
	{ value: 'both', label: 'Code + commentaires' },
	{ value: 'diff', label: 'Diff / patch' },
	{ value: 'checklist', label: 'Checklist' },
	{ value: 'markdown', label: 'Document Markdown' },
];

const TONES = [
	{ value: 'strict', label: 'Strict et exigeant' },
	{ value: 'pedagogical', label: 'Pédagogique' },
	{ value: 'concise', label: 'Concis et direct' },
	{ value: 'detailed', label: 'Détaillé et exhaustif' },
	{ value: 'collaborative', label: 'Collaboratif' },
	{ value: 'senior', label: 'Senior / mentor' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AgentBuilderDialog({ open, onClose, onSave }: AgentBuilderDialogProps) {
	const [activeStep, setActiveStep] = useState(0);
	const [state, setState] = useState<BuilderState>(INITIAL_STATE);
	const [generatedPrompt, setGeneratedPrompt] = useState('');
	const [isGenerating, setIsGenerating] = useState(false);
	const [feedback, setFeedback] = useState('');
	const [copied, setCopied] = useState(false);
	const previewRef = useRef<HTMLDivElement>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Reset on open
	useEffect(() => {
		if (open) {
			setActiveStep(0);
			setState(INITIAL_STATE);
			setGeneratedPrompt('');
			setIsGenerating(false);
			setFeedback('');
			setCopied(false);
		} else {
			abortRef.current?.abort();
		}
	}, [open]);

	const update = useCallback(
		<K extends keyof BuilderState>(key: K, value: BuilderState[K]) => {
			setState((s) => ({ ...s, [key]: value }));
		},
		[],
	);

	/** Toggle a value in a string[] field */
	const toggle = useCallback(
		(key: 'taskTypes' | 'techStacks' | 'conventions' | 'outputFormats' | 'tone', value: string) => {
			setState((s) => {
				const arr = s[key];
				return {
					...s,
					[key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
				};
			});
		},
		[],
	);

	/* ---- Build the description from collected answers ---- */
	const buildDescription = useCallback(() => {
		const taskLabels = state.taskTypes
			.map((v) => (v === 'custom' ? state.customTaskType : TASK_TYPES.find((t) => t.value === v)?.label || v))
			.filter(Boolean);

		const techLabels = [
			...state.techStacks.map((v) => TECH_STACKS.find((t) => t.value === v)?.label || v),
			...(state.customTechStack.trim() ? [state.customTechStack.trim()] : []),
		];

		const convLabels = [
			...state.conventions.map((v) => CONVENTIONS.find((c) => c.value === v)?.label || v),
			...(state.customRules.trim() ? [state.customRules.trim()] : []),
		];

		const outputLabels = state.outputFormats.map(
			(v) => OUTPUT_FORMATS.find((f) => f.value === v)?.label || v,
		);

		const toneLabels = state.tone.map(
			(v) => TONES.find((t) => t.value === v)?.label || v,
		);

		const parts: string[] = [];

		if (taskLabels.length) parts.push(`Types de tâche : ${taskLabels.join(', ')}`);
		if (techLabels.length) parts.push(`Stack technique : ${techLabels.join(', ')}`);
		if (state.projectContext.trim()) parts.push(`Contexte du projet : ${state.projectContext}`);
		if (convLabels.length) parts.push(`Conventions et règles : ${convLabels.join(', ')}`);
		if (outputLabels.length) parts.push(`Format de sortie attendu : ${outputLabels.join(', ')}`);
		if (toneLabels.length) parts.push(`Ton et style : ${toneLabels.join(', ')}`);

		return parts.join('\n');
	}, [state]);

	/* ---- Call the API to generate the prompt ---- */
	const generate = useCallback(
		async (iterationFeedback?: string) => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			setIsGenerating(true);
			if (!iterationFeedback) setGeneratedPrompt('');

			try {
				const body: Record<string, string> = { description: buildDescription() };
				if (iterationFeedback && generatedPrompt) {
					body.currentPrompt = generatedPrompt;
					body.feedback = iterationFeedback;
				}

				const res = await fetch('/api/agent-builder', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
					signal: controller.signal,
				});

				if (!res.ok || !res.body) throw new Error('Generation failed');

				const reader = res.body.getReader();
				const decoder = new TextDecoder();
				let buffer = '';
				let fullText = iterationFeedback ? '' : '';

				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					buffer += decoder.decode(value, { stream: true });
					const events = buffer.split('\n\n');
					buffer = events.pop() || '';

					for (const event of events) {
						const dataLine = event
							.split('\n')
							.find((l) => l.startsWith('data: '));
						if (!dataLine) continue;
						try {
							const parsed = JSON.parse(dataLine.slice(6));
							if (parsed.text) {
								fullText += parsed.text;
								setGeneratedPrompt(fullText);
							}
						} catch {
							// skip
						}
					}
				}

				// Try to parse the final "result" event from the last chunk
				if (buffer.trim()) {
					const dataLine = buffer
						.split('\n')
						.find((l) => l.startsWith('data: '));
					if (dataLine) {
						try {
							const parsed = JSON.parse(dataLine.slice(6));
							if (parsed.text && !fullText) {
								setGeneratedPrompt(parsed.text);
							}
						} catch {
							// skip
						}
					}
				}
			} catch (err) {
				if ((err as Error).name !== 'AbortError') {
					console.error('Generation error:', err);
				}
			} finally {
				setIsGenerating(false);
			}
		},
		[buildDescription, generatedPrompt],
	);

	/* ---- Step validation ---- */
	const canNext = () => {
		switch (activeStep) {
			case 0: {
				const hasTask = state.taskTypes.length > 0;
				const customOk = !state.taskTypes.includes('custom') || state.customTaskType.trim() !== '';
				return hasTask && customOk;
			}
			case 1:
				return true; // optional context
			case 2:
				return true; // optional rules
			default:
				return false;
		}
	};

	const handleNext = () => {
		if (activeStep === 2) {
			// Derive agent name from task types
			if (!state.agentName) {
				const first = state.taskTypes[0];
				const label =
					first === 'custom'
						? state.customTaskType
						: TASK_TYPES.find((t) => t.value === first)?.label || '';
				update('agentName', label.toLowerCase().replace(/\s+/g, '-'));
			}
			setActiveStep(3);
			generate();
		} else {
			setActiveStep((s) => s + 1);
		}
	};

	const handleBack = () => setActiveStep((s) => s - 1);

	const handleIterate = () => {
		if (!feedback.trim()) return;
		generate(feedback.trim());
		setFeedback('');
	};

	const handleSave = () => {
		const safeName = state.agentName.trim().replace(/\s+/g, '-').toLowerCase() || 'agent';
		onSave(safeName, generatedPrompt);
	};

	const handleCopy = async () => {
		await navigator.clipboard.writeText(generatedPrompt);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	/* ---- Render step content ---- */
	const renderStep = () => {
		switch (activeStep) {
			case 0:
				return (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
						<Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
							Quels types de tâches l&apos;agent doit-il accomplir ? Sélectionnez un ou plusieurs domaines.
						</Typography>
						<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
							{TASK_TYPES.map((t) => {
								const selected = state.taskTypes.includes(t.value);
								return (
									<Chip
										key={t.value}
										label={`${t.emoji} ${t.label}`}
										variant={selected ? 'filled' : 'outlined'}
										onClick={() => toggle('taskTypes', t.value)}
										sx={{
											fontWeight: 600,
											fontSize: '0.82rem',
											py: 2.5,
											px: 0.5,
											borderRadius: 1,
											cursor: 'pointer',
											borderColor: selected ? '#7C5CFF' : 'divider',
											bgcolor: selected ? alpha('#7C5CFF', 0.15) : 'transparent',
											color: selected ? '#7C5CFF' : 'text.primary',
											'&:hover': {
												bgcolor: alpha('#7C5CFF', 0.1),
												borderColor: '#7C5CFF',
											},
										}}
									/>
								);
							})}
						</Box>
						{state.taskTypes.includes('custom') && (
							<TextField
								label="Décrivez la tâche"
								value={state.customTaskType}
								onChange={(e) => update('customTaskType', e.target.value)}
								placeholder="Ex : Générer des composants React à partir de specs Figma..."
								fullWidth
								multiline
								rows={2}
								autoFocus
							/>
						)}
					</Box>
				);

			case 1:
				return (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
						<Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
							Donnez du contexte à l&apos;agent pour qu&apos;il soit pertinent dans votre projet.
						</Typography>
						<Box>
							<Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}>
								Stack technique
							</Typography>
							<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
								{TECH_STACKS.map((t) => {
									const selected = state.techStacks.includes(t.value);
									return (
										<Chip
											key={t.value}
											label={t.label}
											size="small"
											variant={selected ? 'filled' : 'outlined'}
											onClick={() => toggle('techStacks', t.value)}
											sx={{
												fontWeight: 600,
												fontSize: '0.78rem',
												borderRadius: 1,
												cursor: 'pointer',
												borderColor: selected ? '#7C5CFF' : 'divider',
												bgcolor: selected ? alpha('#7C5CFF', 0.15) : 'transparent',
												color: selected ? '#7C5CFF' : 'text.primary',
												'&:hover': {
													bgcolor: alpha('#7C5CFF', 0.1),
													borderColor: '#7C5CFF',
												},
											}}
										/>
									);
								})}
							</Box>
							<TextField
								value={state.customTechStack}
								onChange={(e) => update('customTechStack', e.target.value)}
								placeholder="Autre techno non listée..."
								fullWidth
								size="small"
								helperText="Ajoutez des technologies spécifiques non listées ci-dessus"
							/>
						</Box>
						<TextField
							label="Contexte du projet"
							value={state.projectContext}
							onChange={(e) => update('projectContext', e.target.value)}
							placeholder="Ex : Dashboard de gestion d'équipe avec API REST, architecture en modules..."
							fullWidth
							multiline
							rows={3}
							helperText="Type de projet, architecture, contraintes particulières"
						/>
					</Box>
				);

			case 2:
				return (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, overflow: 'auto' }}>
						<Typography variant="body1" sx={{ color: 'text.secondary', lineHeight: 1.7 }}>
							Définissez les règles et le comportement attendu de l&apos;agent.
						</Typography>

						{/* Conventions */}
						<Box>
							<Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}>
								Conventions et règles
							</Typography>
							<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
								{CONVENTIONS.map((c) => {
									const selected = state.conventions.includes(c.value);
									return (
										<Chip
											key={c.value}
											label={c.label}
											size="small"
											variant={selected ? 'filled' : 'outlined'}
											onClick={() => toggle('conventions', c.value)}
											sx={{
												fontWeight: 600,
												fontSize: '0.78rem',
												borderRadius: 1,
												cursor: 'pointer',
												borderColor: selected ? '#7C5CFF' : 'divider',
												bgcolor: selected ? alpha('#7C5CFF', 0.15) : 'transparent',
												color: selected ? '#7C5CFF' : 'text.primary',
												'&:hover': {
													bgcolor: alpha('#7C5CFF', 0.1),
													borderColor: '#7C5CFF',
												},
											}}
										/>
									);
								})}
							</Box>
							<TextField
								value={state.customRules}
								onChange={(e) => update('customRules', e.target.value)}
								placeholder="Autres règles spécifiques..."
								fullWidth
								size="small"
								multiline
								rows={2}
							/>
						</Box>

						{/* Output format */}
						<Box>
							<Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}>
								Format de sortie attendu
							</Typography>
							<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
								{OUTPUT_FORMATS.map((f) => {
									const selected = state.outputFormats.includes(f.value);
									return (
										<Chip
											key={f.value}
											label={f.label}
											size="small"
											variant={selected ? 'filled' : 'outlined'}
											onClick={() => toggle('outputFormats', f.value)}
											sx={{
												fontWeight: 600,
												fontSize: '0.78rem',
												borderRadius: 1,
												cursor: 'pointer',
												borderColor: selected ? '#7C5CFF' : 'divider',
												bgcolor: selected ? alpha('#7C5CFF', 0.15) : 'transparent',
												color: selected ? '#7C5CFF' : 'text.primary',
												'&:hover': {
													bgcolor: alpha('#7C5CFF', 0.1),
													borderColor: '#7C5CFF',
												},
											}}
										/>
									);
								})}
							</Box>
						</Box>

						{/* Tone */}
						<Box>
							<Typography variant="body2" sx={{ fontWeight: 600, mb: 1.5, color: 'text.primary' }}>
								Ton de l&apos;agent
							</Typography>
							<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
								{TONES.map((t) => {
									const selected = state.tone.includes(t.value);
									return (
										<Chip
											key={t.value}
											label={t.label}
											size="small"
											variant={selected ? 'filled' : 'outlined'}
											onClick={() => toggle('tone', t.value)}
											sx={{
												fontWeight: 600,
												fontSize: '0.78rem',
												borderRadius: 1,
												cursor: 'pointer',
												borderColor: selected ? '#7C5CFF' : 'divider',
												bgcolor: selected ? alpha('#7C5CFF', 0.15) : 'transparent',
												color: selected ? '#7C5CFF' : 'text.primary',
												'&:hover': {
													bgcolor: alpha('#7C5CFF', 0.1),
													borderColor: '#7C5CFF',
												},
											}}
										/>
									);
								})}
							</Box>
						</Box>
					</Box>
				);

			case 3:
				return (
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minHeight: 0 }}>
						{/* Agent name */}
						<TextField
							label="Nom de l'agent"
							value={state.agentName}
							onChange={(e) => update('agentName', e.target.value)}
							placeholder="ex. code-reviewer"
							size="small"
							fullWidth
							helperText={`Sera enregistré dans .claude/agents/${state.agentName || 'nom'}.md`}
							sx={{ flexShrink: 0 }}
						/>

						{/* Preview */}
						<Box
							ref={previewRef}
							sx={{
								flex: 1,
								minHeight: 0,
								overflow: 'auto',
								borderRadius: 1,
								border: 1,
								borderColor: 'divider',
								bgcolor: 'background.default',
								p: 2.5,
								fontFamily: '"JetBrains Mono", monospace',
								fontSize: '0.82rem',
								lineHeight: 1.7,
								'& h1, & h2, & h3': {
									fontFamily: 'Poppins, sans-serif',
									fontWeight: 700,
									mt: 2,
									mb: 1,
									color: 'text.primary',
								},
								'& h1': { fontSize: '1.2rem' },
								'& h2': { fontSize: '1rem' },
								'& h3': { fontSize: '0.9rem' },
								'& p': { my: 0.5 },
								'& ul, & ol': { pl: 2.5, my: 0.5 },
								'& li': { my: 0.25 },
								'& code': {
									bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
									px: 0.5,
									borderRadius: 0.5,
									fontSize: '0.78rem',
								},
								'& pre': {
									bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
									p: 1.5,
									borderRadius: 1,
									overflow: 'auto',
								},
							}}
						>
							{isGenerating && !generatedPrompt && (
								<Box
									sx={{
										display: 'flex',
										flexDirection: 'column',
										alignItems: 'center',
										justifyContent: 'center',
										py: 6,
										gap: 2,
									}}
								>
									<CircularProgress size={32} sx={{ color: '#7C5CFF' }} />
									<Typography
										variant="body2"
										sx={{ color: 'text.secondary', fontFamily: 'Poppins' }}
									>
										Génération du prompt en cours...
									</Typography>
								</Box>
							)}
							{generatedPrompt && (
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{generatedPrompt}
								</ReactMarkdown>
							)}
							{isGenerating && generatedPrompt && (
								<Box
									component="span"
									sx={{
										display: 'inline-block',
										width: 8,
										height: 16,
										bgcolor: '#7C5CFF',
										animation: 'blink 1s step-end infinite',
										ml: 0.5,
										verticalAlign: 'text-bottom',
										'@keyframes blink': {
											'50%': { opacity: 0 },
										},
									}}
								/>
							)}
						</Box>

						{/* Actions row */}
						{generatedPrompt && !isGenerating && (
							<Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
								<IconButton
									size="small"
									onClick={handleCopy}
									sx={{ color: copied ? '#4CAF50' : 'text.secondary' }}
								>
									<ContentCopyRoundedIcon fontSize="small" />
								</IconButton>
								<IconButton
									size="small"
									onClick={() => generate()}
									sx={{ color: 'text.secondary', '&:hover': { color: '#7C5CFF' } }}
								>
									<RefreshRoundedIcon fontSize="small" />
								</IconButton>
							</Box>
						)}

						{/* Iteration input */}
						{generatedPrompt && !isGenerating && (
							<Box sx={{ display: 'flex', gap: 1, flexShrink: 0 }}>
								<TextField
									value={feedback}
									onChange={(e) => setFeedback(e.target.value)}
									placeholder="Demandez un ajustement... ex. « Ajoute une règle sur les tests »"
									fullWidth
									size="small"
									onKeyDown={(e) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											handleIterate();
										}
									}}
									sx={{
										'& .MuiOutlinedInput-root': {
											borderRadius: 1,
										},
									}}
								/>
								<Button
									variant="contained"
									size="small"
									onClick={handleIterate}
									disabled={!feedback.trim()}
									startIcon={<EditRoundedIcon />}
									sx={{
										bgcolor: '#7C5CFF',
										'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
										textTransform: 'none',
										fontWeight: 600,
										whiteSpace: 'nowrap',
										borderRadius: 1,
									}}
								>
									Affiner
								</Button>
							</Box>
						)}
					</Box>
				);

			default:
				return null;
		}
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: {
					borderRadius: 1,
					bgcolor: 'background.paper',
					height: '80vh',
					display: 'flex',
					flexDirection: 'column',
				},
			}}
		>
			<DialogTitle
				sx={{
					fontWeight: 700,
					display: 'flex',
					alignItems: 'center',
					gap: 1.5,
					pb: 1,
				}}
			>
				<AutoFixHighRoundedIcon sx={{ color: '#7C5CFF' }} />
				Agent Builder
			</DialogTitle>

			{/* Stepper */}
			<Box sx={{ px: 3, pb: 2 }}>
				<Stepper activeStep={activeStep} alternativeLabel>
					{STEPS.map((step) => (
						<Step key={step.label}>
							<StepLabel
								sx={{
									'& .MuiStepLabel-label': {
										fontSize: '0.75rem',
										fontWeight: 600,
									},
									'& .MuiStepIcon-root.Mui-active': { color: '#7C5CFF' },
									'& .MuiStepIcon-root.Mui-completed': { color: '#7C5CFF' },
								}}
							>
								{step.label}
							</StepLabel>
						</Step>
					))}
				</Stepper>
			</Box>

			<DialogContent
				sx={{
					display: 'flex',
					flexDirection: 'column',
					flex: 1,
					minHeight: 0,
					pt: '8px !important',
				}}
			>
				{renderStep()}
			</DialogContent>

			<DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
				<Button onClick={onClose} sx={{ color: 'text.secondary', textTransform: 'none' }}>
					Annuler
				</Button>

				<Box sx={{ flex: 1 }} />

				{activeStep > 0 && activeStep < 3 && (
					<Button
						onClick={handleBack}
						startIcon={<ArrowBackRoundedIcon />}
						sx={{ color: 'text.secondary', textTransform: 'none' }}
					>
						Retour
					</Button>
				)}

				{activeStep < 3 && (
					<Button
						onClick={handleNext}
						variant="contained"
						disabled={!canNext()}
						endIcon={<ArrowForwardRoundedIcon />}
						sx={{
							bgcolor: '#7C5CFF',
							'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
							textTransform: 'none',
							fontWeight: 600,
							borderRadius: 1,
						}}
					>
						{activeStep === 2 ? 'Générer' : 'Suivant'}
					</Button>
				)}

				{activeStep === 3 && (
					<>
						<Button
							onClick={handleBack}
							startIcon={<ArrowBackRoundedIcon />}
							sx={{ color: 'text.secondary', textTransform: 'none' }}
						>
							Retour
						</Button>
						<Button
							onClick={handleSave}
							variant="contained"
							disabled={!generatedPrompt || isGenerating || !state.agentName.trim()}
							startIcon={<SaveRoundedIcon />}
							sx={{
								bgcolor: '#7C5CFF',
								'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
								textTransform: 'none',
								fontWeight: 600,
								borderRadius: 1,
							}}
						>
							Enregistrer
						</Button>
					</>
				)}
			</DialogActions>
		</Dialog>
	);
}
