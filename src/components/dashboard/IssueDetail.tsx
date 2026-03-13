'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
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
import Skeleton from '@mui/material/Skeleton';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import CircleRoundedIcon from '@mui/icons-material/CircleRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import CheckBoxRoundedIcon from '@mui/icons-material/CheckBoxRounded';
import CheckBoxOutlineBlankRoundedIcon from '@mui/icons-material/CheckBoxOutlineBlankRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useIssue, useDashboard } from '@/hooks/useGitHub';
import { useTodos, useIssueTodos } from '@/hooks/useTodos';
import { supabase } from '@/lib/supabase';
import { GitHubComment } from '@/types';
import AgentTerminalModal from '@/components/agents/AgentTerminalModal';
import IssueTimelineModal from '@/components/dashboard/IssueTimelineModal';

const markdownSx = {
	'& h1': { fontSize: '1.4rem', fontWeight: 700, mt: 3, mb: 1.5, color: 'text.primary' },
	'& h2': { fontSize: '1.2rem', fontWeight: 600, mt: 2.5, mb: 1, color: 'text.primary' },
	'& h3': { fontSize: '1.05rem', fontWeight: 600, mt: 2, mb: 1, color: 'text.primary' },
	'& p': { mb: 1.5, lineHeight: 1.7, color: 'text.secondary' },
	'& ul, & ol': { pl: 3, mb: 1.5, color: 'text.secondary' },
	'& li': { mb: 0.5 },
	'& code': {
		fontFamily: '"JetBrains Mono", "Fira Code", monospace',
		fontSize: '0.85em',
		bgcolor: (t: { palette: { divider: string } }) => alpha(t.palette.divider, 0.3),
		px: 0.75,
		py: 0.25,
		borderRadius: 1,
	},
	'& pre': {
		bgcolor: 'background.default',
		borderRadius: 1,
		p: 2,
		overflow: 'auto',
		mb: 2,
		'& code': { bgcolor: 'transparent', p: 0 },
	},
	'& blockquote': {
		borderLeft: '3px solid',
		borderColor: 'primary.main',
		pl: 2,
		ml: 0,
		my: 1.5,
		'& p': { color: 'text.secondary' },
	},
	'& a': {
		color: 'primary.light',
		textDecoration: 'none',
		'&:hover': { textDecoration: 'underline' },
	},
	'& img': { maxWidth: '100%', borderRadius: 1, my: 1 },
	'& table': {
		width: '100%',
		borderCollapse: 'collapse',
		mb: 2,
		'& th, & td': {
			border: (t: { palette: { divider: string } }) => `1px solid ${t.palette.divider}`,
			px: 1.5,
			py: 1,
			textAlign: 'left',
		},
		'& th': {
			bgcolor: (t: { palette: { divider: string } }) => alpha(t.palette.divider, 0.2),
			fontWeight: 600,
		},
	},
	'& hr': {
		border: 'none',
		borderTop: (t: { palette: { divider: string } }) => `1px solid ${t.palette.divider}`,
		my: 2,
	},
	"& input[type='checkbox']": { display: 'none' },
	'& .task-checkbox': {
		width: 18,
		height: 18,
		borderRadius: '4px',
		border: '2px solid',
		borderColor: 'text.disabled',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		mr: 1,
		cursor: 'pointer',
		transition: 'all 0.15s ease',
		flexShrink: 0,
		verticalAlign: 'middle',
		position: 'relative',
		top: '-1px',
		'&:hover': {
			borderColor: 'primary.main',
			bgcolor: (t: { palette: { divider: string } }) => alpha(t.palette.divider, 0.2),
		},
		'&.checked': {
			borderColor: 'success.main',
			bgcolor: (t: { palette: { success: { main: string } } }) => alpha(t.palette.success.main, 0.15),
			'& svg': { color: 'success.main' },
		},
		'&.unchecked': {
			borderColor: 'text.disabled',
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
						{isChecked && <CheckRoundedIcon sx={{ fontSize: 14 }} />}
					</Box>
					{filteredChildren}
				</li>
			);
		},
	};
}

const markdownComponents = createMarkdownComponents();

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

function formatDate(dateStr: string): string {
	return new Date(dateStr).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function Comment({
	comment,
	index,
	isOwner,
	onEdit,
	onDelete,
}: {
	comment: GitHubComment;
	index: number;
	isOwner: boolean;
	onEdit: (comment: GitHubComment) => void;
	onDelete: (comment: GitHubComment) => void;
}) {
	const tc = useTranslations('common');
	const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

	return (
		<Box
			sx={{
				display: 'flex',
				gap: 2,
				animation: `fadeInUp 0.35s ease-out ${index * 0.05}s both`,
			}}
		>
			<Avatar
				src={comment.user.avatar_url}
				alt={comment.user.login}
				sx={{ width: 32, height: 32, mt: 0.5 }}
			/>
			<Card sx={{ flex: 1 }}>
				<CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
							{comment.user.login}
						</Typography>
						<Typography variant="body2" sx={{ fontSize: '0.75rem', flex: 1 }}>
							{formatDate(comment.created_at)}
						</Typography>
						{isOwner && (
							<>
								<IconButton
									size="small"
									onClick={(e) => setMenuAnchor(e.currentTarget)}
									sx={{ p: 0.25, color: 'text.disabled', '&:hover': { color: 'text.secondary' } }}
								>
									<MoreVertRoundedIcon sx={{ fontSize: 16 }} />
								</IconButton>
								<Menu
									anchorEl={menuAnchor}
									open={!!menuAnchor}
									onClose={() => setMenuAnchor(null)}
									slotProps={{ paper: { sx: { minWidth: 140 } } }}
								>
									<MenuItem
										onClick={() => {
											setMenuAnchor(null);
											onEdit(comment);
										}}
										sx={{ fontSize: '0.8rem', gap: 1 }}
									>
										<ListItemIcon sx={{ minWidth: '28px !important' }}>
											<EditRoundedIcon sx={{ fontSize: 16 }} />
										</ListItemIcon>
										<ListItemText primaryTypographyProps={{ fontSize: '0.8rem' }}>
											{tc('edit')}
										</ListItemText>
									</MenuItem>
									<MenuItem
										onClick={() => {
											setMenuAnchor(null);
											onDelete(comment);
										}}
										sx={{ fontSize: '0.8rem', gap: 1 }}
									>
										<ListItemIcon sx={{ minWidth: '28px !important' }}>
											<DeleteOutlineRoundedIcon sx={{ fontSize: 16, color: 'error.main' }} />
										</ListItemIcon>
										<ListItemText primaryTypographyProps={{ fontSize: '0.8rem', color: 'error.main' }}>
											{tc('delete')}
										</ListItemText>
									</MenuItem>
								</Menu>
							</>
						)}
					</Box>
					<Box sx={markdownSx}>
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							rehypePlugins={[rehypeRaw]}
							components={markdownComponents}
						>
							{comment.body}
						</ReactMarkdown>
					</Box>
				</CardContent>
			</Card>
		</Box>
	);
}

export default function IssueDetail({
	owner,
	repo,
	number,
}: {
	owner: string;
	repo: string;
	number: string;
}) {
	const theme = useTheme();
	const t = useTranslations('issueDetail');
	const tc = useTranslations('common');
	const ti = useTranslations('agentIssue');
	const { data, error, isLoading } = useIssue(owner, repo, number);
	const repoFullName = `${owner}/${repo}`;
	const issueNum = parseInt(number, 10);
	const qc = useQueryClient();
	const { todos, addTodo } = useTodos(repoFullName);
	const { data: issueTodos = [] } = useIssueTodos(repoFullName, issueNum);
	const [terminalOpen, setTerminalOpen] = useState(false);
	const [timelineOpen, setTimelineOpen] = useState(false);
	const [taskAnchor, setTaskAnchor] = useState<HTMLElement | null>(null);

	// Edit state
	const [editingTitle, setEditingTitle] = useState(false);
	const [editTitle, setEditTitle] = useState('');
	const [editingBody, setEditingBody] = useState(false);
	const [editBody, setEditBody] = useState('');
	const [saving, setSaving] = useState(false);

	// Comment state
	const [newComment, setNewComment] = useState('');
	const [sendingComment, setSendingComment] = useState(false);

	// Edit/delete comment state
	const [editingComment, setEditingComment] = useState<GitHubComment | null>(null);
	const [editCommentBody, setEditCommentBody] = useState('');
	const [savingComment, setSavingComment] = useState(false);
	const [deleteComment, setDeleteComment] = useState<GitHubComment | null>(null);
	const [deletingComment, setDeletingComment] = useState(false);

	const { data: dashboardData } = useDashboard();
	const currentUser = dashboardData?.user;

	const issueQueryKey = useMemo(() => ['github', 'issue', owner, repo, number], [owner, repo, number]);
	const bodyRef = useRef('');
	const checkboxCounterRef = useRef(0);

	const handleToggleCheckbox = useCallback(
		async (checkboxIndex: number, currentBody: string) => {
			const newBody = toggleCheckboxInMarkdown(currentBody, checkboxIndex);
			if (newBody === currentBody) return;
			// Optimistic update
			qc.setQueryData(issueQueryKey, (old: { issue: { body: string }; comments: GitHubComment[] } | undefined) => {
				if (!old) return old;
				return { ...old, issue: { ...old.issue, body: newBody } };
			});
			try {
				await fetch('/api/github/issue/update', {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ owner, repo, number: issueNum, body: newBody }),
				});
				qc.invalidateQueries({ queryKey: issueQueryKey });
			} catch {
				// Rollback
				qc.setQueryData(issueQueryKey, (old: { issue: { body: string }; comments: GitHubComment[] } | undefined) => {
					if (!old) return old;
					return { ...old, issue: { ...old.issue, body: currentBody } };
				});
			}
		},
		[owner, repo, issueNum, qc, issueQueryKey],
	);

	// Interactive markdown components for the issue body (checkboxes toggle via GitHub API)
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
				body: JSON.stringify({ owner, repo, number: issueNum, title: editTitle.trim() }),
			});
			qc.invalidateQueries({ queryKey: issueQueryKey });
			setEditingTitle(false);
		} finally {
			setSaving(false);
		}
	}, [editTitle, saving, owner, repo, issueNum, qc, issueQueryKey]);

	const handleSaveBody = useCallback(async () => {
		if (saving) return;
		setSaving(true);
		try {
			await fetch('/api/github/issue/update', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, number: issueNum, body: editBody }),
			});
			qc.invalidateQueries({ queryKey: issueQueryKey });
			setEditingBody(false);
		} finally {
			setSaving(false);
		}
	}, [editBody, saving, owner, repo, issueNum, qc, issueQueryKey]);

	const handleSendComment = useCallback(async () => {
		if (!newComment.trim() || sendingComment) return;
		setSendingComment(true);
		try {
			await fetch('/api/github/issue/comment', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					owner,
					repo,
					issueNumber: issueNum,
					body: newComment.trim(),
				}),
			});
			setNewComment('');
			qc.invalidateQueries({ queryKey: issueQueryKey });
		} finally {
			setSendingComment(false);
		}
	}, [newComment, sendingComment, owner, repo, issueNum, qc, issueQueryKey]);

	const handleEditComment = useCallback(async () => {
		if (!editingComment || !editCommentBody.trim() || savingComment) return;
		setSavingComment(true);
		try {
			await fetch('/api/github/issue/comment', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, commentId: editingComment.id, body: editCommentBody.trim() }),
			});
			setEditingComment(null);
			qc.invalidateQueries({ queryKey: issueQueryKey });
		} finally {
			setSavingComment(false);
		}
	}, [editingComment, editCommentBody, savingComment, owner, repo, qc, issueQueryKey]);

	const handleDeleteComment = useCallback(async () => {
		if (!deleteComment || deletingComment) return;
		setDeletingComment(true);
		try {
			await fetch('/api/github/issue/comment', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ owner, repo, commentId: deleteComment.id }),
			});
			setDeleteComment(null);
			qc.invalidateQueries({ queryKey: issueQueryKey });
		} finally {
			setDeletingComment(false);
		}
	}, [deleteComment, deletingComment, owner, repo, qc, issueQueryKey]);

	const invalidateTodos = () => {
		qc.invalidateQueries({ queryKey: ['todos'] });
	};

	// All todos for this repo that are NOT linked to this issue (for association)
	const unlinkedTodos = todos.filter((t) => !t.issue_number && !t.done);

	const handleCreateTask = async () => {
		setTaskAnchor(null);
		const title = `#${number} ${data?.issue.title ?? ''}`;
		addTodo(title, issueNum, repoFullName);
		setTimeout(invalidateTodos, 500);
	};

	const handleUnlinkTodo = async (todoId: string) => {
		await supabase
			.from('todos')
			.update({ issue_number: null, issue_repo: null })
			.eq('id', todoId);
		invalidateTodos();
	};

	const handleLinkTodo = async (todoId: string) => {
		setTaskAnchor(null);
		await supabase
			.from('todos')
			.update({ issue_number: issueNum, issue_repo: repoFullName })
			.eq('id', todoId);
		invalidateTodos();
	};

	if (isLoading) {
		return (
			<Box sx={{ maxWidth: 860, mx: 'auto' }}>
				<Skeleton
					variant="rounded"
					width={180}
					height={36}
					sx={{ mb: 3, borderRadius: 1 }}
				/>
				<Skeleton variant="rounded" height={400} sx={{ borderRadius: 1 }} />
			</Box>
		);
	}

	if (error) {
		return (
			<Box sx={{ maxWidth: 860, mx: 'auto' }}>
				<Link href="/issues" style={{ textDecoration: 'none' }}>
					<Button
						startIcon={<ArrowBackRoundedIcon />}
						sx={{ mb: 3, color: 'text.secondary' }}
					>
						{t('backToIssues')}
					</Button>
				</Link>
				<Alert severity="error" sx={{ borderRadius: 1 }}>
					{t('loadError', { message: error.message })}
				</Alert>
			</Box>
		);
	}

	if (!data) return null;

	const { issue, comments } = data;
	const isOpen = issue.state === 'open';
	const stateColor = isOpen ? theme.palette.success.main : theme.palette.text.disabled;
	const stateLabel = isOpen ? 'Open' : 'Closed';
	return (
		<Box sx={{ maxWidth: 860, mx: 'auto' }}>
			<Link href="/issues" style={{ textDecoration: 'none' }}>
				<Button
					startIcon={<ArrowBackRoundedIcon />}
					sx={{ mb: 3, color: 'text.secondary' }}
				>
					{t('backToIssues')}
				</Button>
			</Link>

			<Card sx={{ mb: 3, animation: 'fadeInUp 0.4s ease-out both' }}>
				<CardContent sx={{ p: 4, '&:last-child': { pb: 4 } }}>
					<Box sx={{ mb: 3 }}>
						{editingTitle ? (
							<Box
								sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}
							>
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
											fontSize: '1.8rem',
											fontWeight: 700,
											py: 0.5,
										},
									}}
								/>
								<IconButton
									size="small"
									onClick={handleSaveTitle}
									disabled={saving}
									sx={{ color: 'success.main' }}
								>
									{saving ? (
										<CircularProgress size={18} />
									) : (
										<SaveRoundedIcon />
									)}
								</IconButton>
								<IconButton
									size="small"
									onClick={() => setEditingTitle(false)}
									sx={{ color: 'text.disabled' }}
								>
									<CloseRoundedIcon />
								</IconButton>
							</Box>
						) : (
							<Box
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1,
									mb: 1.5,
									cursor: 'pointer',
									'&:hover .edit-icon': { opacity: 1 },
								}}
								onClick={() => {
									setEditTitle(issue.title);
									setEditingTitle(true);
								}}
							>
								<Typography variant="h4" sx={{ lineHeight: 1.3 }}>
									{issue.title}
								</Typography>
								<EditRoundedIcon
									className="edit-icon"
									sx={{
										fontSize: 18,
										color: 'text.disabled',
										opacity: 0,
										transition: 'opacity 0.15s',
									}}
								/>
							</Box>
						)}
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
										<CircleRoundedIcon
											sx={{ fontSize: '14px !important' }}
										/>
									) : (
										<CheckCircleRoundedIcon
											sx={{ fontSize: '14px !important' }}
										/>
									)
								}
								label={stateLabel}
								sx={{
									bgcolor: alpha(stateColor, 0.12),
									color: stateColor,
									fontWeight: 600,
									'& .MuiChip-icon': { color: stateColor },
								}}
							/>
							{issue.labels.map((label) => (
								<Chip
									key={label.name}
									label={label.name}
									sx={{
										bgcolor: alpha(`#${label.color}`, 0.15),
										color: `#${label.color}`,
									}}
								/>
							))}
						</Box>
						<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
							<Button
								variant="contained"
								size="small"
								startIcon={<SmartToyRoundedIcon />}
								onClick={() => setTerminalOpen(true)}
							>
								{t('launchAgent')}
							</Button>
							<Button
								variant="outlined"
								size="small"
								startIcon={<AssignmentTurnedInRoundedIcon />}
								onClick={(e) => setTaskAnchor(e.currentTarget)}
							>
								{issueTodos.length > 0
									? t('tasksCount', { count: issueTodos.length })
									: t('associateTask')}
							</Button>
							<Menu
								anchorEl={taskAnchor}
								open={Boolean(taskAnchor)}
								onClose={() => setTaskAnchor(null)}
								slotProps={{
									paper: {
										sx: {
											bgcolor: 'background.paper',
											border: 1,
											borderColor: 'divider',
											minWidth: 240,
											maxHeight: 320,
										},
									},
								}}
							>
								{/* Linked todos */}
								{issueTodos.map((todo) => (
									<MenuItem
										key={todo.id}
										onClick={() => handleUnlinkTodo(todo.id)}
										sx={{ fontSize: '0.8rem', gap: 1 }}
									>
										<ListItemIcon sx={{ minWidth: '28px !important' }}>
											{todo.done ? (
												<CheckBoxRoundedIcon
													sx={{ fontSize: 18, color: 'success.main' }}
												/>
											) : (
												<CheckBoxOutlineBlankRoundedIcon
													sx={{ fontSize: 18, color: 'text.disabled' }}
												/>
											)}
										</ListItemIcon>
										<ListItemText
											primaryTypographyProps={{ fontSize: '0.8rem' }}
										>
											{todo.title}
										</ListItemText>
									</MenuItem>
								))}

								{/* Unlinked todos to associate */}
								{unlinkedTodos.length > 0 && issueTodos.length > 0 && (
									<Divider sx={{ my: 0.5 }} />
								)}
								{unlinkedTodos.map((todo) => (
									<MenuItem
										key={todo.id}
										onClick={() => handleLinkTodo(todo.id)}
										sx={{ fontSize: '0.8rem', gap: 1 }}
									>
										<ListItemIcon sx={{ minWidth: '28px !important' }}>
											<AddTaskRoundedIcon
												sx={{ fontSize: 18, color: 'text.disabled' }}
											/>
										</ListItemIcon>
										<ListItemText
											primaryTypographyProps={{ fontSize: '0.8rem' }}
										>
											{todo.title}
										</ListItemText>
									</MenuItem>
								))}

								{/* Create new task */}
								<Divider sx={{ my: 0.5 }} />
								<MenuItem
									onClick={handleCreateTask}
									sx={{ fontSize: '0.8rem', gap: 1 }}
								>
									<ListItemIcon sx={{ minWidth: '28px !important' }}>
										<AddTaskRoundedIcon
											sx={{ fontSize: 18, color: 'primary.main' }}
										/>
									</ListItemIcon>
									<ListItemText
										primaryTypographyProps={{
											fontSize: '0.8rem',
											color: 'primary.main',
											fontWeight: 600,
										}}
									>
										{t('createTask')}
									</ListItemText>
								</MenuItem>
							</Menu>
							<Button
								variant="outlined"
								size="small"
								startIcon={<HistoryRoundedIcon />}
								onClick={() => setTimelineOpen(true)}
							>
								{t('history')}
							</Button>
							<Button
								variant="outlined"
								size="small"
								endIcon={<OpenInNewRoundedIcon />}
								href={issue.html_url}
								target="_blank"
								rel="noopener noreferrer"
							>
								GitHub
							</Button>
						</Box>
					</Box>

					<Divider sx={{ my: 3 }} />

					<Box sx={{ display: 'flex', gap: 4, mb: 3, flexWrap: 'wrap' }}>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<FolderOpenRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
							<Typography variant="body2">
								{owner}/{repo}{' '}
								<Typography component="span" sx={{ color: 'text.secondary' }}>
									#{number}
								</Typography>
							</Typography>
						</Box>
						{issue.assignee && (
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
								<PersonRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
								<Avatar
									src={issue.assignee.avatar_url}
									alt={issue.assignee.login}
									sx={{ width: 22, height: 22 }}
								/>
								<Typography variant="body2">{issue.assignee.login}</Typography>
							</Box>
						)}
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<AccessTimeRoundedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
							<Typography variant="body2">{formatDate(issue.updated_at)}</Typography>
						</Box>
						<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
							<ChatBubbleOutlineRoundedIcon
								sx={{ fontSize: 18, color: 'text.secondary' }}
							/>
							<Typography variant="body2">
								{ti('comments', { count: comments.length })}
							</Typography>
						</Box>
					</Box>

					{editingBody ? (
						<Box>
							<TextField
								value={editBody}
								onChange={(e) => setEditBody(e.target.value)}
								multiline
								minRows={6}
								maxRows={20}
								fullWidth
								autoFocus
								placeholder={ti('descriptionPlaceholder')}
								sx={{
									mb: 1.5,
									'& .MuiInputBase-root': {
										fontFamily: '"JetBrains Mono", monospace',
										fontSize: '0.85rem',
									},
								}}
							/>
							<Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
								<Button
									size="small"
									onClick={() => setEditingBody(false)}
									sx={{ textTransform: 'none', color: 'text.secondary' }}
								>
									{tc('cancel')}
								</Button>
								<Button
									variant="contained"
									size="small"
									onClick={handleSaveBody}
									disabled={saving}
									startIcon={
										saving ? (
											<CircularProgress size={14} />
										) : (
											<SaveRoundedIcon />
										)
									}
									sx={{
										textTransform: 'none',
										bgcolor: 'primary.main',
										'&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.85) },
									}}
								>
									{tc('save')}
								</Button>
							</Box>
						</Box>
					) : (
						<Box
							sx={{
								cursor: 'pointer',
								'&:hover .edit-body-icon': { opacity: 1 },
								position: 'relative',
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
									fontSize: 16,
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
									sx={{ fontStyle: 'italic', color: 'text.secondary' }}
								>
									{t('noDescription')}
								</Typography>
							)}
						</Box>
					)}
				</CardContent>
			</Card>

			{comments.length > 0 && (
				<Box>
					<Typography variant="h6" sx={{ mb: 2 }}>
						{t('commentsTitle', { count: comments.length })}
					</Typography>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
						{comments.map((comment, index) => (
							<Comment
								key={comment.id}
								comment={comment}
								index={index}
								isOwner={comment.user.login === currentUser}
								onEdit={(c) => {
									setEditingComment(c);
									setEditCommentBody(c.body);
								}}
								onDelete={setDeleteComment}
							/>
						))}
					</Box>
				</Box>
			)}

			{/* Add comment */}
			<Card sx={{ mt: 3, mb: 3 }}>
				<CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
					<Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
						{t('addComment')}
					</Typography>
					<TextField
						value={newComment}
						onChange={(e) => setNewComment(e.target.value)}
						multiline
						minRows={3}
						maxRows={10}
						fullWidth
						placeholder={t('commentPlaceholder')}
						sx={{
							mb: 1.5,
							'& .MuiInputBase-root': { fontSize: '0.85rem' },
						}}
					/>
					<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
						<Button
							variant="contained"
							size="small"
							onClick={handleSendComment}
							disabled={!newComment.trim() || sendingComment}
							startIcon={
								sendingComment ? (
									<CircularProgress size={14} />
								) : (
									<SendRoundedIcon />
								)
							}
							sx={{
								textTransform: 'none',
								fontWeight: 600,
								bgcolor: 'primary.main',
								'&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.85) },
							}}
						>
							{t('send')}
						</Button>
					</Box>
				</CardContent>
			</Card>

			{/* Edit comment dialog */}
			<Dialog
				open={!!editingComment}
				onClose={() => setEditingComment(null)}
				maxWidth="sm"
				fullWidth
				slotProps={{ paper: { sx: { borderRadius: 2 } } }}
			>
				<DialogTitle sx={{ fontWeight: 600 }}>{t('editComment')}</DialogTitle>
				<DialogContent>
					<TextField
						value={editCommentBody}
						onChange={(e) => setEditCommentBody(e.target.value)}
						multiline
						minRows={4}
						maxRows={12}
						fullWidth
						sx={{ mt: 1, '& .MuiInputBase-root': { fontSize: '0.85rem' } }}
					/>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2.5 }}>
					<Button onClick={() => setEditingComment(null)}>{tc('cancel')}</Button>
					<Button
						variant="contained"
						onClick={handleEditComment}
						disabled={!editCommentBody.trim() || savingComment}
						startIcon={savingComment ? <CircularProgress size={14} /> : <SaveRoundedIcon />}
						sx={{
							textTransform: 'none',
							fontWeight: 600,
							bgcolor: 'primary.main',
							'&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.85) },
						}}
					>
						{tc('save')}
					</Button>
				</DialogActions>
			</Dialog>

			{/* Delete comment confirmation dialog */}
			<Dialog
				open={!!deleteComment}
				onClose={() => setDeleteComment(null)}
				maxWidth="xs"
				fullWidth
				slotProps={{ paper: { sx: { borderRadius: 2 } } }}
			>
				<DialogTitle sx={{ fontWeight: 600 }}>{t('deleteComment')}</DialogTitle>
				<DialogContent>
					<Typography variant="body2" color="text.secondary">
						{t('deleteCommentConfirm')}
					</Typography>
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2.5 }}>
					<Button onClick={() => setDeleteComment(null)}>{tc('cancel')}</Button>
					<Button
						variant="contained"
						onClick={handleDeleteComment}
						disabled={deletingComment}
						startIcon={deletingComment ? <CircularProgress size={14} /> : undefined}
						sx={{
							textTransform: 'none',
							fontWeight: 600,
							bgcolor: 'error.main',
							'&:hover': { bgcolor: alpha(theme.palette.error.main, 0.85) },
						}}
					>
						{tc('delete')}
					</Button>
				</DialogActions>
			</Dialog>

			<AgentTerminalModal
				open={terminalOpen}
				onClose={() => setTerminalOpen(false)}
				issueContext={{
					owner,
					repo,
					issueNumber: parseInt(number, 10),
					issueTitle: issue.title,
					labels: issue.labels.map((l) => l.name),
				}}
			/>

			<IssueTimelineModal
				open={timelineOpen}
				onClose={() => setTimelineOpen(false)}
				owner={owner}
				repo={repo}
				number={number}
				issueTitle={issue.title}
			/>
		</Box>
	);
}
