'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Avatar from '@mui/material/Avatar';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import { alpha } from '@mui/material/styles';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import { useQueryClient } from '@tanstack/react-query';
import { useIssue } from '@/hooks/useGitHub';

const markdownSx = {
	'& h1': { fontSize: '1.2rem', fontWeight: 700, mt: 2, mb: 1, color: 'text.primary' },
	'& h2': { fontSize: '1.05rem', fontWeight: 600, mt: 2, mb: 1, color: 'text.primary' },
	'& h3': { fontSize: '0.95rem', fontWeight: 600, mt: 1.5, mb: 0.75, color: 'text.primary' },
	'& p': { mb: 1, lineHeight: 1.6, color: 'text.secondary', fontSize: '0.85rem' },
	'& ul, & ol': { pl: 2.5, mb: 1, color: 'text.secondary', fontSize: '0.85rem' },
	'& li': { mb: 0.25 },
	'& code': {
		fontFamily: '"JetBrains Mono", monospace',
		fontSize: '0.8em',
		bgcolor: 'rgba(255,255,255,0.06)',
		px: 0.5,
		py: 0.15,
		borderRadius: 0.5,
	},
	'& pre': {
		bgcolor: 'background.default',
		borderRadius: 1,
		p: 1.5,
		overflow: 'auto',
		mb: 1.5,
		'& code': { bgcolor: 'transparent', p: 0 },
	},
	'& blockquote': {
		borderLeft: '3px solid',
		borderColor: 'primary.main',
		pl: 1.5,
		ml: 0,
		my: 1,
	},
	'& a': {
		color: 'primary.light',
		textDecoration: 'none',
		'&:hover': { textDecoration: 'underline' },
	},
	'& img': { maxWidth: '100%', borderRadius: 1, my: 1 },
	"& input[type='checkbox']": { display: 'none' },
	'& .task-checkbox': {
		width: 16,
		height: 16,
		borderRadius: '3px',
		border: '2px solid',
		borderColor: 'text.disabled',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		mr: 0.75,
		cursor: 'pointer',
		transition: 'all 0.15s ease',
		flexShrink: 0,
		verticalAlign: 'middle',
		position: 'relative',
		top: '-1px',
		'&:hover': {
			borderColor: '#7C5CFF',
			bgcolor: 'rgba(255,255,255,0.06)',
		},
		'&.checked': {
			borderColor: '#22C55E',
			bgcolor: alpha('#22C55E', 0.15),
			'& svg': { color: '#22C55E' },
		},
		'&.unchecked': {
			borderColor: '#666',
		},
	},
	'& li:has(.task-checkbox)': {
		listStyle: 'none',
		ml: -2.5,
		display: 'flex',
		alignItems: 'flex-start',
		gap: 0,
	},
};

function proxyGitHubImage(src: string | undefined): string | undefined {
	if (!src) return src;
	if (src.includes('github.com') || src.includes('githubusercontent.com')) {
		return `/api/github/image-proxy?url=${encodeURIComponent(src)}`;
	}
	return src;
}

function toggleCheckboxInMarkdown(markdown: string, checkboxIndex: number): string {
	const checkboxPattern = /- \[([ xX])\]/g;
	let currentIndex = 0;
	return markdown.replace(checkboxPattern, (match, state) => {
		if (currentIndex === checkboxIndex) {
			currentIndex++;
			return state === ' ' ? '- [x]' : '- [ ]';
		}
		currentIndex++;
		return match;
	});
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMarkdownComponents(onCheckboxToggle?: (index: number) => void, counterRef?: React.RefObject<number>): Record<string, any> {
	return {
		img: ({ src, alt, ...props }: { src?: string; alt?: string }) => (
			// eslint-disable-next-line @next/next/no-img-element
			<img {...props} src={proxyGitHubImage(src)} alt={alt ?? ''} />
		),
		li: ({ children, node, ...props }: { children?: React.ReactNode; node?: { children?: Array<{ type: string; tagName?: string; properties?: { type?: string; checked?: boolean } }>; }; className?: string; ordered?: boolean }) => {
			const isTaskItem = node?.children?.some(
				(child) => child.type === 'element' && child.tagName === 'input' && child.properties?.type === 'checkbox',
			);
			if (!isTaskItem) return <li {...props}>{children}</li>;

			const inputChild = node?.children?.find(
				(child) => child.type === 'element' && child.tagName === 'input' && child.properties?.type === 'checkbox',
			);
			const isChecked = inputChild?.properties?.checked ?? false;
			const currentIdx = counterRef ? counterRef.current++ : 0;

			const filteredChildren = Array.isArray(children)
				? children.filter(
						(child) => !(child && typeof child === 'object' && 'props' in child && child.props?.type === 'checkbox'),
					)
				: children;

			return (
				<li {...props}>
					<Box
						component="span"
						className={`task-checkbox ${isChecked ? 'checked' : 'unchecked'}`}
						onClick={
							onCheckboxToggle
								? (e: React.MouseEvent) => {
										e.stopPropagation();
										e.preventDefault();
										onCheckboxToggle(currentIdx);
									}
								: undefined
						}
						sx={{ cursor: onCheckboxToggle ? 'pointer' : 'default' }}
					>
						{isChecked && <CheckRoundedIcon sx={{ fontSize: 12 }} />}
					</Box>
					{filteredChildren}
				</li>
			);
		},
	};
}

const mdComponents = createMarkdownComponents();

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	});
}

interface AgentIssueTabProps {
	owner: string;
	repo: string;
	issueNumber: number;
}

export default function AgentIssueTab({ owner, repo, issueNumber }: AgentIssueTabProps) {
	const { data, isLoading } = useIssue(owner, repo, String(issueNumber));
	const qc = useQueryClient();
	const issueQueryKey = useMemo(() => ['github', 'issue', owner, repo, String(issueNumber)], [owner, repo, issueNumber]);

	// Edit title
	const [editingTitle, setEditingTitle] = useState(false);
	const [editTitle, setEditTitle] = useState('');
	const [saving, setSaving] = useState(false);

	// Edit body
	const [editingBody, setEditingBody] = useState(false);
	const [editBody, setEditBody] = useState('');

	// Comment
	const [newComment, setNewComment] = useState('');
	const [sendingComment, setSendingComment] = useState(false);

	// Checkbox toggle
	const bodyRef = useRef('');
	const checkboxCounterRef = useRef(0);

	const handleToggleCheckbox = useCallback(
		async (checkboxIndex: number, currentBody: string) => {
			const newBody = toggleCheckboxInMarkdown(currentBody, checkboxIndex);
			if (newBody === currentBody) return;
			qc.setQueryData(issueQueryKey, (old: { issue: { body: string }; comments: unknown[] } | undefined) => {
				if (!old) return old;
				return { ...old, issue: { ...old.issue, body: newBody } };
			});
			try {
				await fetch('/api/github/issue/update', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ owner, repo, number: issueNumber, body: newBody }),
				});
				qc.invalidateQueries({ queryKey: issueQueryKey });
			} catch {
				qc.setQueryData(issueQueryKey, (old: { issue: { body: string }; comments: unknown[] } | undefined) => {
					if (!old) return old;
					return { ...old, issue: { ...old.issue, body: currentBody } };
				});
			}
		},
		[owner, repo, issueNumber, qc, issueQueryKey],
	);

	const bodyMarkdownComponents = useMemo(
		() =>
			createMarkdownComponents((idx: number) => {
				if (bodyRef.current) {
					handleToggleCheckbox(idx, bodyRef.current);
				}
			}, checkboxCounterRef),
		[handleToggleCheckbox],
	);

	const handleSaveTitle = useCallback(async () => {
		if (!editTitle.trim() || saving) return;
		setSaving(true);
		try {
			await fetch('/api/github/issue/update', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, number: issueNumber, title: editTitle.trim() }),
			});
			qc.invalidateQueries({ queryKey: issueQueryKey });
			setEditingTitle(false);
		} finally {
			setSaving(false);
		}
	}, [editTitle, saving, owner, repo, issueNumber, qc, issueQueryKey]);

	const handleSaveBody = useCallback(async () => {
		if (saving) return;
		setSaving(true);
		try {
			await fetch('/api/github/issue/update', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, number: issueNumber, body: editBody }),
			});
			qc.invalidateQueries({ queryKey: issueQueryKey });
			setEditingBody(false);
		} finally {
			setSaving(false);
		}
	}, [editBody, saving, owner, repo, issueNumber, qc, issueQueryKey]);

	const handleSendComment = useCallback(async () => {
		if (!newComment.trim() || sendingComment) return;
		setSendingComment(true);
		try {
			await fetch('/api/github/issue/comment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, issueNumber, body: newComment.trim() }),
			});
			setNewComment('');
			qc.invalidateQueries({ queryKey: issueQueryKey });
		} finally {
			setSendingComment(false);
		}
	}, [newComment, sendingComment, owner, repo, issueNumber, qc, issueQueryKey]);

	if (isLoading) {
		return (
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					height: '100%',
				}}
			>
				<CircularProgress size={24} sx={{ color: '#7C5CFF' }} />
			</Box>
		);
	}

	if (!data) return null;

	const { issue, comments } = data;
	const isOpen = issue.state === 'open';
	const stateColor = isOpen ? '#22C55E' : '#808080';

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', bgcolor: 'background.default' }}>
			<Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>
				{/* Title */}
				{editingTitle ? (
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<TextField
							value={editTitle}
							onChange={(e) => setEditTitle(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleSaveTitle();
								if (e.key === 'Escape') setEditingTitle(false);
							}}
							autoFocus
							fullWidth
							size="small"
							sx={{
								'& .MuiInputBase-input': {
									fontSize: '1.1rem',
									fontWeight: 700,
									py: 0.5,
								},
							}}
						/>
						<IconButton
							size="small"
							onClick={handleSaveTitle}
							disabled={saving}
							sx={{ color: '#22C55E' }}
						>
							{saving ? (
								<CircularProgress size={16} />
							) : (
								<SaveRoundedIcon sx={{ fontSize: 18 }} />
							)}
						</IconButton>
						<IconButton
							size="small"
							onClick={() => setEditingTitle(false)}
							sx={{ color: 'text.disabled' }}
						>
							<CloseRoundedIcon sx={{ fontSize: 18 }} />
						</IconButton>
					</Box>
				) : (
					<Box
						sx={{
							display: 'flex',
							alignItems: 'center',
							gap: 1,
							mb: 1,
							cursor: 'pointer',
							'&:hover .edit-icon': { opacity: 1 },
						}}
						onClick={() => {
							setEditTitle(issue.title);
							setEditingTitle(true);
						}}
					>
						<Typography
							variant="h6"
							sx={{ fontWeight: 700, fontSize: '1.1rem', lineHeight: 1.3 }}
						>
							{issue.title}
						</Typography>
						<EditRoundedIcon
							className="edit-icon"
							sx={{
								fontSize: 15,
								color: 'text.disabled',
								opacity: 0,
								transition: 'opacity 0.15s',
							}}
						/>
					</Box>
				)}

				{/* Meta */}
				<Box
					sx={{
						display: 'flex',
						alignItems: 'center',
						gap: 1.5,
						mb: 2,
						flexWrap: 'wrap',
					}}
				>
					<Chip
						icon={
							isOpen ? (
								<CircleRoundedIcon sx={{ fontSize: '11px !important' }} />
							) : (
								<CheckCircleRoundedIcon sx={{ fontSize: '11px !important' }} />
							)
						}
						label={isOpen ? 'Open' : 'Closed'}
						size="small"
						sx={{
							height: 22,
							fontSize: '0.7rem',
							fontWeight: 600,
							bgcolor: alpha(stateColor, 0.12),
							color: stateColor,
							'& .MuiChip-icon': { color: stateColor },
						}}
					/>
					{issue.labels.map((label) => (
						<Chip
							key={label.name}
							label={label.name}
							size="small"
							sx={{
								height: 20,
								fontSize: '0.65rem',
								bgcolor: alpha(`#${label.color}`, 0.15),
								color: `#${label.color}`,
							}}
						/>
					))}
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<FolderOpenRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
						<Typography
							variant="caption"
							sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
						>
							{owner}/{repo}#{issueNumber}
						</Typography>
					</Box>
					{issue.assignee && (
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
							<Avatar
								src={issue.assignee.avatar_url}
								sx={{ width: 18, height: 18 }}
							/>
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
							>
								{issue.assignee.login}
							</Typography>
						</Box>
					)}
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
						<AccessTimeRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />
						<Typography
							variant="caption"
							sx={{ color: 'text.disabled', fontSize: '0.7rem' }}
						>
							{formatDate(issue.updated_at)}
						</Typography>
					</Box>
					<Button
						size="small"
						endIcon={<OpenInNewRoundedIcon sx={{ fontSize: '13px !important' }} />}
						href={issue.html_url}
						target="_blank"
						rel="noopener noreferrer"
						sx={{
							ml: 'auto',
							textTransform: 'none',
							fontSize: '0.7rem',
							color: 'text.disabled',
							minWidth: 0,
							p: 0.5,
						}}
					>
						GitHub
					</Button>
				</Box>

				<Divider sx={{ mb: 2 }} />

				{/* Body */}
				{editingBody ? (
					<Box sx={{ mb: 2 }}>
						<TextField
							value={editBody}
							onChange={(e) => setEditBody(e.target.value)}
							multiline
							minRows={5}
							maxRows={15}
							fullWidth
							autoFocus
							placeholder="Description (Markdown)"
							sx={{
								mb: 1,
								'& .MuiInputBase-root': {
									fontFamily: '"JetBrains Mono", monospace',
									fontSize: '0.8rem',
								},
							}}
						/>
						<Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
							<Button
								size="small"
								onClick={() => setEditingBody(false)}
								sx={{
									textTransform: 'none',
									color: 'text.secondary',
									fontSize: '0.75rem',
								}}
							>
								Annuler
							</Button>
							<Button
								variant="contained"
								size="small"
								onClick={handleSaveBody}
								disabled={saving}
								startIcon={
									saving ? (
										<CircularProgress size={12} />
									) : (
										<SaveRoundedIcon sx={{ fontSize: 14 }} />
									)
								}
								sx={{
									textTransform: 'none',
									fontSize: '0.75rem',
									bgcolor: '#7C5CFF',
									'&:hover': { bgcolor: alpha('#7C5CFF', 0.85) },
								}}
							>
								Enregistrer
							</Button>
						</Box>
					</Box>
				) : (
					<Box
						sx={{
							cursor: 'pointer',
							'&:hover .edit-body-icon': { opacity: 1 },
							position: 'relative',
							mb: 2,
						}}
						onClick={(e) => {
							if ((e.target as HTMLElement).closest('.task-checkbox')) return;
							setEditBody(issue.body ?? '');
							setEditingBody(true);
						}}
					>
						<EditRoundedIcon
							className="edit-body-icon"
							sx={{
								position: 'absolute',
								top: 0,
								right: 0,
								fontSize: 14,
								color: 'text.disabled',
								opacity: 0,
								transition: 'opacity 0.15s',
							}}
						/>
						{(() => { bodyRef.current = issue.body ?? ''; checkboxCounterRef.current = 0; return null; })()}
						{issue.body ? (
							<Box sx={markdownSx}>
								<ReactMarkdown
									remarkPlugins={[remarkGfm]}
									rehypePlugins={[rehypeRaw]}
									components={bodyMarkdownComponents}
								>
									{issue.body}
								</ReactMarkdown>
							</Box>
						) : (
							<Typography
								variant="body2"
								sx={{
									fontStyle: 'italic',
									color: 'text.disabled',
									fontSize: '0.8rem',
								}}
							>
								Pas de description.
							</Typography>
						)}
					</Box>
				)}

				{/* Comments */}
				{comments.length > 0 && (
					<>
						<Divider sx={{ mb: 2 }} />
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
							<ChatBubbleOutlineRoundedIcon
								sx={{ fontSize: 15, color: 'text.disabled' }}
							/>
							<Typography
								variant="caption"
								sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.7rem' }}
							>
								{comments.length} commentaire{comments.length > 1 ? 's' : ''}
							</Typography>
						</Box>
						<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
							{comments.map((comment) => (
								<Box key={comment.id} sx={{ display: 'flex', gap: 1.5 }}>
									<Avatar
										src={comment.user.avatar_url}
										sx={{ width: 24, height: 24, mt: 0.25 }}
									/>
									<Card sx={{ flex: 1 }}>
										<CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
											<Box
												sx={{
													display: 'flex',
													alignItems: 'center',
													gap: 1,
													mb: 0.75,
												}}
											>
												<Typography
													variant="caption"
													sx={{ fontWeight: 600, fontSize: '0.75rem' }}
												>
													{comment.user.login}
												</Typography>
												<Typography
													variant="caption"
													sx={{
														color: 'text.disabled',
														fontSize: '0.65rem',
													}}
												>
													{formatDate(comment.created_at)}
												</Typography>
											</Box>
											<Box sx={markdownSx}>
												<ReactMarkdown
													remarkPlugins={[remarkGfm]}
													rehypePlugins={[rehypeRaw]}
													components={mdComponents}
												>
													{comment.body}
												</ReactMarkdown>
											</Box>
										</CardContent>
									</Card>
								</Box>
							))}
						</Box>
					</>
				)}
			</Box>

			{/* Add comment */}
			<Box
				sx={{
					px: 2.5,
					py: 1.5,
					borderTop: 1,
					borderColor: 'divider',
					flexShrink: 0,
				}}
			>
				<Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
					<TextField
						value={newComment}
						onChange={(e) => setNewComment(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSendComment();
						}}
						multiline
						minRows={1}
						maxRows={4}
						fullWidth
						placeholder="Commenter... (Cmd+Enter pour envoyer)"
						size="small"
						sx={{ '& .MuiInputBase-root': { fontSize: '0.8rem' } }}
					/>
					<IconButton
						onClick={handleSendComment}
						disabled={!newComment.trim() || sendingComment}
						sx={{ color: '#7C5CFF', '&.Mui-disabled': { color: 'text.disabled' } }}
					>
						{sendingComment ? (
							<CircularProgress size={18} />
						) : (
							<SendRoundedIcon sx={{ fontSize: 20 }} />
						)}
					</IconButton>
				</Box>
			</Box>
		</Box>
	);
}
