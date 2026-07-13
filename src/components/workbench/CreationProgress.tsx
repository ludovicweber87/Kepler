'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import RadioButtonUncheckedRoundedIcon from '@mui/icons-material/RadioButtonUncheckedRounded';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { localFetch } from '@/lib/local-fetch';
import type { AgentSession } from '@/hooks/useAgentSession';
import type { RepoSettings } from '@/types';

type StepStatus = 'pending' | 'running' | 'done' | 'error';

export default function CreationProgress({
	session,
	repoSettings,
}: {
	session: AgentSession;
	repoSettings: RepoSettings;
}) {
	const t = useTranslations('creationProgress');
	const qc = useQueryClient();
	const started = useRef(false);
	const abortRef = useRef<AbortController | null>(null);
	const [steps, setSteps] = useState<Record<string, StepStatus>>({});
	const [error, setError] = useState<{ step: string; message?: string } | null>(null);

	const hasIssue = !!(session.issue_owner && session.issue_repo && session.issue_number);
	const mode = 'worktree' as const; // provisioning ne concerne que la création worktree ; current-branch est géré à part
	// Étapes affichées (ordre)
	const stepKeys = [
		...(hasIssue ? ['read-issue'] : []),
		'worktree',
		'copy-files',
		...(repoSettings.setup_script.trim() ? ['setup'] : []),
	];
	const label: Record<string, string> = {
		'read-issue': t('readIssue'),
		worktree: t('worktree'),
		'copy-files': t('copyFiles'),
		setup: t('setup'),
	};

	const run = useCallback(async () => {
		setError(null);
		setSteps({});
		abortRef.current?.abort();
		const controller = new AbortController();
		abortRef.current = controller;
		try {
			const res = await localFetch('/git/provision', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cwd: session.project_path,
					branch: session.branch,
					sessionId: session.session_id,
					mode,
					issue: hasIssue
						? {
								owner: session.issue_owner,
								repo: session.issue_repo,
								number: session.issue_number,
							}
						: undefined,
					filesToCopy: repoSettings.files_to_copy,
					setupScript: repoSettings.setup_script,
				}),
				signal: controller.signal,
			});
			if (!res.ok || !res.body) {
				setError({ step: 'worktree', message: `HTTP ${res.status}` });
				return;
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buf = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const frames = buf.split('\n\n');
				buf = frames.pop() ?? '';
				for (const frame of frames) {
					const evt = /^event: (.+)$/m.exec(frame)?.[1];
					const dataRaw = /^data: (.+)$/m.exec(frame)?.[1];
					if (!dataRaw) continue;
					const data = JSON.parse(dataRaw);
					if (evt === 'done') {
						qc.invalidateQueries({ queryKey: ['agent-session', session.session_id] });
						return;
					}
					if (data.status === 'error') {
						setError({ step: data.step, message: data.message });
						setSteps((s) => ({ ...s, [data.step]: 'error' }));
					} else {
						setSteps((s) => ({ ...s, [data.step]: data.status }));
					}
				}
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			setError({ step: 'worktree', message: e instanceof Error ? e.message : 'error' });
		}
	}, [session, repoSettings, hasIssue, mode, qc]);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		run();
		return () => abortRef.current?.abort();
	}, [run]);

	const iconFor = (st: StepStatus | undefined) => {
		if (st === 'done') return <CheckCircleRoundedIcon color="success" fontSize="small" />;
		if (st === 'error') return <ErrorRoundedIcon color="error" fontSize="small" />;
		if (st === 'running') return <CircularProgress size={18} />;
		return <RadioButtonUncheckedRoundedIcon sx={{ color: 'text.disabled' }} fontSize="small" />;
	};

	return (
		<Box
			sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
		>
			<Box
				component={motion.div}
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				sx={{ minWidth: 320 }}
			>
				<Typography variant="h6" sx={{ fontWeight: 700, mb: 3, textAlign: 'center' }}>
					{t('title')}
				</Typography>
				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
					{stepKeys.map((k) => (
						<Box key={k} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
							{iconFor(steps[k])}
							<Typography
								variant="body2"
								sx={{
									color: steps[k] === 'done' ? 'text.primary' : 'text.secondary',
								}}
							>
								{label[k]}
							</Typography>
						</Box>
					))}
				</Box>
				{error && (
					<Box sx={{ mt: 3, textAlign: 'center' }}>
						<Typography variant="body2" color="error" sx={{ mb: 1 }}>
							{t('failed', { step: label[error.step] ?? error.step })}
							{error.message ? ` — ${error.message}` : ''}
						</Typography>
						<Button
							variant="outlined"
							size="small"
							onClick={() => {
								started.current = true;
								run();
							}}
						>
							{t('retry')}
						</Button>
					</Box>
				)}
			</Box>
		</Box>
	);
}
