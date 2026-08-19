'use client';
import { useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import { alpha } from '@mui/material/styles';
import { useTranslations } from 'next-intl';
import type { PendingQuestion, QuestionAnswers } from '@/types';

const OTHER = '__other__';

export default function ChatQuestionCard({
	question,
	onSubmit,
}: {
	question: PendingQuestion;
	onSubmit: (id: string, answers: QuestionAnswers) => void;
}) {
	const t = useTranslations('agentChat');
	const questions = question.questions ?? [];
	const [idx, setIdx] = useState(0);
	// Sélection par index de question : ensemble de labels (+ éventuellement OTHER).
	const [selected, setSelected] = useState<Record<number, string[]>>({});
	const [custom, setCustom] = useState<Record<number, string>>({});

	if (questions.length === 0) return null;
	const q = questions[idx];
	const multi = Boolean(q.multiSelect);
	const sel = selected[idx] ?? [];
	const isLast = idx === questions.length - 1;

	const toggle = (label: string) => {
		setSelected((prev) => {
			const cur = prev[idx] ?? [];
			if (multi) {
				return {
					...prev,
					[idx]: cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label],
				};
			}
			return { ...prev, [idx]: cur.includes(label) ? [] : [label] };
		});
	};

	// Construit la valeur `answers[question]` pour un index donné, ou null si vide.
	const valueFor = (i: number): string | null => {
		const labels = (selected[i] ?? []).filter((l) => l !== OTHER);
		const otherText = (selected[i] ?? []).includes(OTHER) ? (custom[i] ?? '').trim() : '';
		const all = otherText ? [...labels, otherText] : labels;
		return all.length ? all.join(', ') : null;
	};

	const submitAll = () => {
		const answers: QuestionAnswers = {};
		questions.forEach((qn, i) => {
			const v = valueFor(i);
			if (v) answers[qn.question] = v;
		});
		onSubmit(question.id, answers);
	};

	const otherSelected = sel.includes(OTHER);

	return (
		<Box
			sx={{
				mx: 2,
				my: 1,
				border: 1,
				borderColor: (th) => alpha(th.palette.primary.main, 0.5),
				borderRadius: 2,
				overflow: 'hidden',
				bgcolor: (th) => alpha(th.palette.primary.main, 0.06),
				maxWidth: '92%',
			}}
		>
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					gap: 0.75,
					px: 1.5,
					py: 1,
					borderBottom: 1,
					borderColor: (th) => alpha(th.palette.primary.main, 0.25),
				}}
			>
				<HelpOutlineRoundedIcon sx={{ fontSize: 16, color: 'primary.main' }} />
				{q.header && (
					<Chip
						label={q.header}
						size="small"
						sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
						color="primary"
						variant="outlined"
					/>
				)}
				{questions.length > 1 && (
					<Typography variant="caption" sx={{ color: 'text.secondary', ml: 'auto' }}>
						{t('questionProgress', { current: idx + 1, total: questions.length })}
					</Typography>
				)}
			</Box>

			<Box sx={{ px: 1.5, py: 1.25 }}>
				<Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
					{q.question}
				</Typography>
				{multi && (
					<Typography variant="caption" sx={{ color: 'text.secondary' }}>
						{t('questionMultiHint')}
					</Typography>
				)}

				<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 1 }}>
					{q.options.map((opt) => {
						const active = sel.includes(opt.label);
						return (
							<Box
								key={opt.label}
								onClick={() => toggle(opt.label)}
								sx={{
									display: 'flex',
									alignItems: 'flex-start',
									gap: 1,
									p: 1,
									borderRadius: 1.5,
									cursor: 'pointer',
									border: 1,
									borderColor: active ? 'primary.main' : 'divider',
									bgcolor: (th) =>
										active
											? alpha(th.palette.primary.main, 0.12)
											: 'transparent',
									transition: 'all 0.12s',
									'&:hover': {
										borderColor: 'primary.main',
									},
								}}
							>
								<Box
									sx={{
										mt: 0.25,
										width: 16,
										height: 16,
										flexShrink: 0,
										borderRadius: multi ? 0.5 : '50%',
										border: 2,
										borderColor: active ? 'primary.main' : 'text.disabled',
										bgcolor: active ? 'primary.main' : 'transparent',
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
									}}
								>
									{active && (
										<CheckRoundedIcon
											sx={{ fontSize: 12, color: 'primary.contrastText' }}
										/>
									)}
								</Box>
								<Box sx={{ minWidth: 0 }}>
									<Typography
										variant="body2"
										sx={{ fontWeight: 500, lineHeight: 1.3 }}
									>
										{opt.label}
									</Typography>
									{opt.description && (
										<Typography
											variant="caption"
											sx={{ color: 'text.secondary', display: 'block' }}
										>
											{opt.description}
										</Typography>
									)}
								</Box>
							</Box>
						);
					})}

					{/* Option "Autre" — réponse libre */}
					<Box
						onClick={() => toggle(OTHER)}
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							p: 1,
							borderRadius: 1.5,
							cursor: 'pointer',
							border: 1,
							borderColor: otherSelected ? 'primary.main' : 'divider',
							bgcolor: (th) =>
								otherSelected
									? alpha(th.palette.primary.main, 0.12)
									: 'transparent',
							'&:hover': { borderColor: 'primary.main' },
						}}
					>
						<Box
							sx={{
								width: 16,
								height: 16,
								flexShrink: 0,
								borderRadius: multi ? 0.5 : '50%',
								border: 2,
								borderColor: otherSelected ? 'primary.main' : 'text.disabled',
								bgcolor: otherSelected ? 'primary.main' : 'transparent',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
							}}
						>
							{otherSelected && (
								<CheckRoundedIcon
									sx={{ fontSize: 12, color: 'primary.contrastText' }}
								/>
							)}
						</Box>
						<Typography variant="body2" sx={{ color: 'text.secondary' }}>
							{t('questionOther')}
						</Typography>
					</Box>
					{otherSelected && (
						<TextField
							autoFocus
							size="small"
							fullWidth
							multiline
							maxRows={4}
							placeholder={t('questionOtherPlaceholder')}
							value={custom[idx] ?? ''}
							onChange={(e) => setCustom((p) => ({ ...p, [idx]: e.target.value }))}
							onClick={(e) => e.stopPropagation()}
							sx={{ mt: -0.25 }}
						/>
					)}
				</Box>
			</Box>

			<Box
				sx={{
					display: 'flex',
					gap: 1,
					px: 1.5,
					py: 1,
					borderTop: 1,
					borderColor: (th) => alpha(th.palette.primary.main, 0.15),
				}}
			>
				{idx > 0 && (
					<Button
						size="small"
						variant="text"
						onClick={() => setIdx((i) => i - 1)}
						sx={{ textTransform: 'none' }}
					>
						{t('questionBack')}
					</Button>
				)}
				<Box sx={{ flex: 1 }} />
				<Button
					size="small"
					variant="text"
					color="inherit"
					onClick={() => (isLast ? submitAll() : setIdx((i) => i + 1))}
					sx={{ textTransform: 'none', color: 'text.secondary' }}
				>
					{t('questionSkip')}
				</Button>
				<Button
					size="small"
					variant="contained"
					disabled={valueFor(idx) === null}
					onClick={() => (isLast ? submitAll() : setIdx((i) => i + 1))}
					sx={{ textTransform: 'none' }}
				>
					{isLast ? t('questionSubmit') : t('questionNext')}
				</Button>
			</Box>
		</Box>
	);
}
