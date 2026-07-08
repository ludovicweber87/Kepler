'use client';

import { useMemo, useRef, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import CircularProgress from '@mui/material/CircularProgress';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import { alpha, useTheme } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import NotesRoundedIcon from '@mui/icons-material/NotesRounded';
import { useTodos, type Todo } from '@/hooks/useTodos';
import { useRepoPaths } from '@/hooks/useRepoPaths';
import { useDashboard } from '@/hooks/useGitHub';
import type { GitHubIssue } from '@/types';
import { useTranslations } from 'next-intl';

function TodoRow({
	todo,
	onToggle,
	onUpdateTitle,
	onUpdateDescription,
	onDelete,
}: {
	todo: Todo;
	onToggle: () => void;
	onUpdateTitle: (title: string) => void;
	onUpdateDescription: (desc: string) => void;
	onDelete: () => void;
}) {
	const theme = useTheme();
	const t = useTranslations('todos');
	const [editing, setEditing] = useState(false);
	const [expanded, setExpanded] = useState(false);
	const [titleDraft, setTitleDraft] = useState(todo.title);
	const [descDraft, setDescDraft] = useState(todo.description);

	const done = todo.done;
	const repoLabel = todo.repo_full_name ? todo.repo_full_name.split('/')[1] : null;

	const commitTitle = () => {
		const next = titleDraft.trim();
		if (next && next !== todo.title) onUpdateTitle(next);
		else setTitleDraft(todo.title);
		setEditing(false);
	};

	const commitDesc = () => {
		if (descDraft !== todo.description) onUpdateDescription(descDraft);
	};

	return (
		<Box
			sx={{
				border: 1,
				borderColor: 'divider',
				borderRadius: 1,
				bgcolor: done ? 'transparent' : 'background.paper',
				opacity: done ? 0.55 : 1,
				transition: 'opacity 0.15s, border-color 0.15s',
				'&:hover': { '& .todo-actions': { opacity: 1 } },
			}}
		>
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5 }}>
				<Checkbox
					checked={done}
					onChange={onToggle}
					size="small"
					sx={{
						color: alpha(theme.palette.warning.main, 0.4),
						'&.Mui-checked': { color: theme.palette.warning.main },
					}}
				/>

				{editing && !done ? (
					<TextField
						autoFocus
						fullWidth
						size="small"
						value={titleDraft}
						onChange={(e) => setTitleDraft(e.target.value)}
						onBlur={commitTitle}
						onKeyDown={(e) => {
							if (e.key === 'Enter') commitTitle();
							if (e.key === 'Escape') {
								setTitleDraft(todo.title);
								setEditing(false);
							}
						}}
						variant="standard"
						slotProps={{ input: { disableUnderline: true } }}
					/>
				) : (
					<Typography
						variant="body2"
						onClick={() => !done && setEditing(true)}
						sx={{
							flex: 1,
							py: 0.5,
							cursor: done ? 'default' : 'text',
							textDecoration: done ? 'line-through' : 'none',
							color: done ? 'text.disabled' : 'text.primary',
						}}
					>
						{todo.title}
					</Typography>
				)}

				{repoLabel && (
					<Chip
						label={repoLabel}
						size="small"
						sx={{
							height: 18,
							fontSize: '0.65rem',
							bgcolor: alpha(theme.palette.primary.main, 0.1),
							color: 'primary.light',
						}}
					/>
				)}

				<Box
					className="todo-actions"
					sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.15s' }}
				>
					{!done && (
						<IconButton
							size="small"
							onClick={() => setExpanded((v) => !v)}
							sx={{
								color: todo.description
									? theme.palette.warning.main
									: 'text.disabled',
								opacity: todo.description ? 1 : undefined,
							}}
						>
							<NotesRoundedIcon fontSize="small" />
						</IconButton>
					)}
					<IconButton
						size="small"
						onClick={onDelete}
						sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
					>
						<DeleteRoundedIcon fontSize="small" />
					</IconButton>
				</Box>
			</Box>

			<Collapse in={expanded && !done} unmountOnExit>
				<Box sx={{ px: 1.5, pb: 1.5 }}>
					<TextField
						fullWidth
						multiline
						minRows={2}
						maxRows={8}
						size="small"
						placeholder={t('taskDescription')}
						value={descDraft}
						onChange={(e) => setDescDraft(e.target.value)}
						onBlur={commitDesc}
						sx={{
							'& .MuiOutlinedInput-root': {
								bgcolor: alpha(theme.palette.warning.main, 0.04),
								fontSize: '0.85rem',
							},
						}}
					/>
				</Box>
			</Collapse>
		</Box>
	);
}

export default function TodoList() {
	const theme = useTheme();
	const t = useTranslations('todos');
	const { todos, isLoading, addTodo, toggleTodo, updateTodo, updateDescription, deleteTodo } =
		useTodos();
	const { repoPaths } = useRepoPaths();
	const { data: dashboardData } = useDashboard();

	const [repoFilter, setRepoFilter] = useState('');
	const [newTitle, setNewTitle] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const repoOptions = useMemo(() => {
		const set = new Set<string>();
		for (const r of repoPaths) set.add(r.repo_full_name);
		for (const td of todos) if (td.repo_full_name) set.add(td.repo_full_name);
		return Array.from(set).sort();
	}, [repoPaths, todos]);

	const visible = repoFilter ? todos.filter((td) => td.repo_full_name === repoFilter) : todos;
	const pending = visible.filter((td) => !td.done);
	const done = visible.filter((td) => td.done);

	// Suggestions: open issues assigned to me sitting in a Backlog/Todo column, not yet a task
	const suggestions = useMemo(() => {
		if (!dashboardData) return [];
		const linked = new Set(
			todos
				.filter((td) => td.issue_number && td.issue_repo)
				.map((td) => `${td.issue_repo!.toLowerCase()}#${td.issue_number}`),
		);
		const titles = new Set(todos.map((td) => td.title.toLowerCase()));
		const out: { issue: GitHubIssue; column: string }[] = [];
		for (const issue of dashboardData.issues) {
			if (issue.state !== 'open' || !issue.repo_full_name) continue;
			if (repoFilter && issue.repo_full_name !== repoFilter) continue;
			// An issue can belong to several projects — match if ANY of its columns is Backlog/Todo
			const match = (issue.project_columns ?? []).find((pc) => {
				const c = pc.column.toLowerCase();
				return c.includes('backlog') || c.includes('todo') || c.includes('to do');
			});
			if (!match) continue;
			if (linked.has(`${issue.repo_full_name.toLowerCase()}#${issue.number}`)) continue;
			if (titles.has(`#${issue.number} ${issue.title}`.toLowerCase())) continue;
			out.push({ issue, column: match.column });
		}
		return out;
	}, [dashboardData, todos, repoFilter]);

	const handleAdd = () => {
		const title = newTitle.trim();
		if (!title) return;
		addTodo(title, { repo: repoFilter });
		setNewTitle('');
		inputRef.current?.focus();
	};

	return (
		<Box sx={{ p: 4, maxWidth: 720, mx: 'auto' }}>
			{/* Header + repo filter */}
			<Box
				sx={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					mb: 3,
					gap: 2,
				}}
			>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						background: `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.primary.main} 100%)`,
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					{t('title')}
				</Typography>

				{repoOptions.length > 0 && (
					<Select
						size="small"
						value={repoFilter}
						onChange={(e: SelectChangeEvent) => setRepoFilter(e.target.value)}
						displayEmpty
						sx={{ minWidth: 160, fontSize: '0.82rem', borderRadius: 1 }}
					>
						<MenuItem value="">{t('allRepos')}</MenuItem>
						{repoOptions.map((repo) => (
							<MenuItem key={repo} value={repo} sx={{ fontSize: '0.82rem' }}>
								{repo}
							</MenuItem>
						))}
					</Select>
				)}
			</Box>

			{/* Add bar */}
			<Box
				sx={{
					display: 'flex',
					gap: 1,
					mb: 3,
					bgcolor: 'background.paper',
					borderRadius: 1,
					border: 1,
					borderColor: 'divider',
					p: 1,
				}}
			>
				<TextField
					inputRef={inputRef}
					fullWidth
					size="small"
					placeholder={t('whatToDo')}
					value={newTitle}
					onChange={(e) => setNewTitle(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') {
							e.preventDefault();
							handleAdd();
						}
					}}
					variant="standard"
					slotProps={{ input: { disableUnderline: true } }}
					sx={{ px: 1 }}
				/>
				<IconButton
					onClick={handleAdd}
					disabled={!newTitle.trim()}
					sx={{
						color: newTitle.trim() ? theme.palette.warning.main : 'text.disabled',
						bgcolor: newTitle.trim()
							? alpha(theme.palette.warning.main, 0.1)
							: 'transparent',
						'&:hover': { bgcolor: alpha(theme.palette.warning.main, 0.2) },
					}}
				>
					<AddRoundedIcon />
				</IconButton>
			</Box>

			{suggestions.length > 0 && (
				<Box sx={{ mb: 3 }}>
					<Typography
						variant="caption"
						sx={{
							color: 'text.disabled',
							fontWeight: 600,
							textTransform: 'uppercase',
							letterSpacing: 1,
							mb: 1,
							display: 'block',
						}}
					>
						{t('suggestions')} — {suggestions.length}
					</Typography>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
						{suggestions.map(({ issue, column }) => (
							<Box
								key={issue.id}
								onClick={() =>
									addTodo(`#${issue.number} ${issue.title}`, {
										repo: issue.repo_full_name,
										issueNumber: issue.number,
										issueRepo: issue.repo_full_name,
									})
								}
								sx={{
									display: 'flex',
									alignItems: 'center',
									gap: 1,
									p: 1.25,
									borderRadius: 1,
									border: 1,
									borderColor: alpha(theme.palette.warning.main, 0.25),
									bgcolor: alpha(theme.palette.warning.main, 0.05),
									cursor: 'pointer',
									transition: 'all 0.15s',
									'&:hover': {
										borderColor: theme.palette.warning.main,
										bgcolor: alpha(theme.palette.warning.main, 0.12),
									},
								}}
							>
								<Box sx={{ flex: 1, minWidth: 0 }}>
									<Typography
										variant="body2"
										sx={{
											fontWeight: 500,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										}}
									>
										{issue.title}
									</Typography>
									<Box
										sx={{
											display: 'flex',
											alignItems: 'center',
											gap: 0.75,
											mt: 0.25,
										}}
									>
										<Typography
											variant="caption"
											sx={{ color: 'text.disabled' }}
										>
											{issue.repo_full_name?.split('/')[1]} #{issue.number}
										</Typography>
										<Chip
											label={column}
											size="small"
											sx={{
												height: 18,
												fontSize: '0.65rem',
												bgcolor: alpha(theme.palette.warning.main, 0.15),
												color: theme.palette.warning.main,
											}}
										/>
									</Box>
								</Box>
								<AddRoundedIcon
									sx={{
										fontSize: 20,
										color: theme.palette.warning.main,
										flexShrink: 0,
									}}
								/>
							</Box>
						))}
					</Box>
				</Box>
			)}

			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
					<CircularProgress size={28} sx={{ color: theme.palette.warning.main }} />
				</Box>
			)}

			{!isLoading && visible.length === 0 && (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						py: 8,
						gap: 1.5,
					}}
				>
					<ChecklistRoundedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
					<Typography variant="body1" color="text.secondary">
						{t('noTasks')}
					</Typography>
				</Box>
			)}

			{!isLoading && pending.length > 0 && (
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						gap: 1,
						mb: done.length > 0 ? 3 : 0,
					}}
				>
					{pending.map((todo) => (
						<TodoRow
							key={todo.id}
							todo={todo}
							onToggle={() => toggleTodo(todo.id, true)}
							onUpdateTitle={(title) => updateTodo(todo.id, title)}
							onUpdateDescription={(desc) => updateDescription(todo.id, desc)}
							onDelete={() => deleteTodo(todo.id)}
						/>
					))}
				</Box>
			)}

			{!isLoading && done.length > 0 && (
				<Box>
					<Typography
						variant="caption"
						sx={{
							color: 'text.disabled',
							fontWeight: 600,
							textTransform: 'uppercase',
							letterSpacing: 1,
							mb: 1,
							display: 'block',
						}}
					>
						{t('done')} — {done.length}
					</Typography>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
						{done.map((todo) => (
							<TodoRow
								key={todo.id}
								todo={todo}
								onToggle={() => toggleTodo(todo.id, false)}
								onUpdateTitle={(title) => updateTodo(todo.id, title)}
								onUpdateDescription={(desc) => updateDescription(todo.id, desc)}
								onDelete={() => deleteTodo(todo.id)}
							/>
						))}
					</Box>
				</Box>
			)}
		</Box>
	);
}
