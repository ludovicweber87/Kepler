import { spawn } from 'child_process';

const CLAUDE_BIN = '/opt/homebrew/bin/claude';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const SYSTEM_PROMPT = `Tu es un expert en création d'agents Claude Code. L'utilisateur va te décrire ce qu'il veut que son agent fasse. Tu dois générer un fichier Markdown (.md) qui servira de prompt système pour un agent Claude.

RÈGLES :
- Réponds UNIQUEMENT avec le contenu du fichier Markdown, rien d'autre
- Pas de bloc code \`\`\`markdown autour — le texte brut EST le fichier
- Le prompt doit être précis, actionnable, et bien structuré
- Utilise des sections ## pour organiser (Rôle, Règles, Workflow, etc.)
- Inclus des exemples concrets quand c'est pertinent
- Le prompt doit guider Claude pour qu'il soit autonome et efficace
- Adapte le ton et le niveau de détail au besoin décrit
- Si l'utilisateur mentionne une stack technique, intègre-la dans le prompt
- Ne dépasse pas ~80 lignes — un bon prompt est concis et ciblé

EXEMPLE de structure :
# Nom de l'agent

## Rôle
Tu es un agent spécialisé dans [...]

## Règles
- Règle 1
- Règle 2

## Workflow
1. Étape 1
2. Étape 2

## Conventions
- Convention spécifique au projet`;

export async function POST(request: Request) {
	try {
		const { description, currentPrompt, feedback } = await request.json();

		if (!description) {
			return new Response(JSON.stringify({ error: 'description is required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		let userPrompt: string;
		if (currentPrompt && feedback) {
			// Iteration mode — refine existing prompt
			userPrompt = `Voici le prompt actuel d'un agent :\n\n${currentPrompt}\n\nL'utilisateur veut le modifier : "${feedback}"\n\nGénère le prompt mis à jour (le fichier .md complet).`;
		} else {
			userPrompt = `L'utilisateur veut créer un agent avec cette description :\n\n"${description}"\n\nGénère le fichier .md complet pour cet agent.`;
		}

		const args = ['-p', userPrompt, '--system-prompt', SYSTEM_PROMPT, '--output-format', 'stream-json', '--dangerously-skip-permissions'];

		const encoder = new TextEncoder();

		const stream = new ReadableStream({
			start(controller) {
				const send = (event: string, data: unknown) => {
					controller.enqueue(
						encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
					);
				};

				const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ...cleanEnv } = process.env;
				const proc = spawn(CLAUDE_BIN, args, {
					cwd: process.env.HOME || '/tmp',
					env: {
						...cleanEnv,
						PATH: process.env.PATH || '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
					},
				});

				let buffer = '';

				proc.stdout.on('data', (chunk: Buffer) => {
					buffer += chunk.toString();
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (!line.trim()) continue;
						try {
							const msg = JSON.parse(line);

							if (msg.type === 'assistant' && msg.message?.content) {
								for (const block of msg.message.content) {
									if (block.type === 'text') {
										send('text', { text: block.text });
									}
								}
							}

							if (msg.type === 'result') {
								send('result', { text: msg.result || '' });
							}
						} catch {
							// Skip malformed lines
						}
					}
				});

				proc.stderr.on('data', (chunk: Buffer) => {
					const text = chunk.toString().trim();
					if (text) send('error', { text });
				});

				proc.on('close', () => {
					controller.close();
				});

				proc.on('error', (err) => {
					send('error', { text: err.message });
					controller.close();
				});
			},
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive',
			},
		});
	} catch (err) {
		return new Response(
			JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to generate agent' }),
			{ status: 500, headers: { 'Content-Type': 'application/json' } },
		);
	}
}
