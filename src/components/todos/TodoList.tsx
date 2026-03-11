'use client';

import { useState, useRef, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Button from '@mui/material/Button';
import Accordion from '@mui/material/Accordion';
import AccordionSummary from '@mui/material/AccordionSummary';
import AccordionDetails from '@mui/material/AccordionDetails';
import { alpha } from '@mui/material/styles';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import DraggableTabs from '@/components/shared/DraggableTabs';
import { useAgentViews } from '@/hooks/useAgentViews';
import { useTodos, type Todo } from '@/hooks/useTodos';
import { useDashboard } from '@/hooks/useGitHub';

function TodoAccordion({
	todo,
	done,
	onToggle,
	onUpdateTitle,
	onUpdateDescription,
	onDelete,
}: {
	todo: Todo;
	done?: boolean;
	onToggle: () => void;
	onUpdateTitle: (title: string) => void;
	onUpdateDescription: (desc: string) => void;
	onDelete: () => void;
}) {
	const [editingTitle, setEditingTitle] = useState(false);
	const [titleDraft, setTitleDraft] = useState(todo.title);
	const [descDraft, setDescDraft] = useState(todo.description);
	const [descFocused, setDescFocused] = useState(false);

	const commitTitle = () => {
		if (titleDraft.trim() && titleDraft.trim() !== todo.title) {
			onUpdateTitle(titleDraft.trim());
		}
		setEditingTitle(false);
	};

	const commitDesc = () => {
		setDescFocused(false);
		if (descDraft !== todo.description) {
			onUpdateDescription(descDraft);
		}
	};

	const dateStr = new Date(todo.created_at).toLocaleDateString('fr-FR', {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
	});

	return (
		<Accordion
			disableGutters
			elevation={0}
			sx={{
				bgcolor: done ? 'transparent' : 'background.paper',
				border: done ? 'none' : 1,
				borderColor: 'divider',
				borderRadius: '4px !important',
				opacity: done ? 0.5 : 1,
				transition: 'opacity 0.15s',
				'&:before': { display: 'none' },
				'&:hover': {
					opacity: done ? 0.8 : 1,
					'& .delete-btn': { opacity: 1 },
				},
				overflow: 'hidden',
			}}
		>
			<AccordionSummary
				expandIcon={
					!done ? (
						<ExpandMoreRoundedIcon
							sx={{ color: 'text.disabled', fontSize: '1.1rem' }}
						/>
					) : undefined
				}
				sx={{
					minHeight: 48,
					px: 1,
					'& .MuiAccordionSummary-content': {
						alignItems: 'center',
						gap: 0.5,
						my: 0,
					},
				}}
			>
				<Checkbox
					checked={!!done}
					onChange={(e) => {
						e.stopPropagation();
						onToggle();
					}}
					onClick={(e) => e.stopPropagation()}
					size="small"
					sx={{
						color: alpha('#FF9800', 0.4),
						'&.Mui-checked': { color: '#FF9800' },
					}}
				/>
				{editingTitle && !done ? (
					<TextField
						autoFocus
						fullWidth
						size="small"
						value={titleDraft}
						onChange={(e) => setTitleDraft(e.target.value)}
						onBlur={commitTitle}
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === 'Enter') commitTitle();
							if (e.key === 'Escape') {
								setTitleDraft(todo.title);
								setEditingTitle(false);
							}
						}}
						sx={{
							'& .MuiOutlinedInput-root': {
								bgcolor: 'transparent',
								'& fieldset': { border: 'none' },
							},
						}}
					/>
				) : (
					<Typography
						variant="body2"
						sx={{
							flex: 1,
							cursor: done ? 'default' : 'pointer',
							py: 0.5,
							textDecoration: done ? 'line-through' : 'none',
							color: done ? 'text.disabled' : 'text.primary',
						}}
						onDoubleClick={(e) => {
							if (done) return;
							e.stopPropagation();
							setEditingTitle(true);
						}}
					>
						{todo.title}
					</Typography>
				)}
				<Typography
					variant="caption"
					sx={{
						color: 'text.disabled',
						whiteSpace: 'nowrap',
						fontSize: '0.7rem',
						mr: 0.5,
					}}
				>
					{dateStr}
				</Typography>
				<IconButton
					className="delete-btn"
					size="small"
					onClick={(e) => {
						e.stopPropagation();
						onDelete();
					}}
					sx={{
						opacity: 0,
						transition: 'opacity 0.15s',
						color: 'text.disabled',
						'&:hover': { color: '#F44336' },
					}}
				>
					<DeleteRoundedIcon fontSize="small" />
				</IconButton>
			</AccordionSummary>
			{!done && (
				<AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
					<TextField
						fullWidth
						multiline
						minRows={2}
						maxRows={8}
						size="small"
						placeholder="What needs to be done for this task?"
						value={descFocused ? descDraft : todo.description}
						onChange={(e) => setDescDraft(e.target.value)}
						onFocus={() => {
							setDescDraft(todo.description);
							setDescFocused(true);
						}}
						onBlur={commitDesc}
						sx={{
							'& .MuiOutlinedInput-root': {
								bgcolor: alpha('#FF9800', 0.04),
								fontSize: '0.85rem',
								borderRadius: 1,
								'& fieldset': { borderColor: alpha('#FF9800', 0.15) },
								'&:hover fieldset': { borderColor: alpha('#FF9800', 0.3) },
								'&.Mui-focused fieldset': { borderColor: '#FF9800' },
							},
						}}
					/>
				</AccordionDetails>
			)}
		</Accordion>
	);
}

export default function TodoList() {
	const { views, activeIndex, activeView, setActiveIndex, addView, reorderViews } =
		useAgentViews();

	const { todos, isLoading, addTodo, toggleTodo, updateTodo, updateDescription, deleteTodo } =
		useTodos(activeView?.repoFullName ?? null);

	const { data: dashboardData } = useDashboard();

	const suggestions = useMemo(() => {
		if (!dashboardData || !activeView) return [];
		const repoName = activeView.repoFullName;
		const todoTitles = new Set(todos.map((t) => t.title.toLowerCase()));

		return dashboardData.issues.filter((issue) => {
			if (issue.repo_full_name !== repoName) return false;
			if (issue.state !== 'open') return false;
			const col = issue.project_columns?.[0]?.column;
			if (!col || !col.toLowerCase().includes('progress')) return false;
			const issueLabel = `#${issue.number} ${issue.title}`;
			if (todoTitles.has(issueLabel.toLowerCase())) return false;
			if (todoTitles.has(issue.title.toLowerCase())) return false;
			return true;
		});
	}, [dashboardData, activeView, todos]);

	const [newTitle, setNewTitle] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const handleAdd = () => {
		if (!newTitle.trim()) return;
		addTodo(newTitle.trim());
		setNewTitle('');
		inputRef.current?.focus();
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleAdd();
		}
	};

	const pending = todos.filter((t) => !t.done);
	const done = todos.filter((t) => t.done);

	if (views.length === 0) {
		return (
			<Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
				<Typography
					variant="h4"
					sx={{
						fontWeight: 700,
						mb: 4,
						background: 'linear-gradient(135deg, #FF9800 0%, #7C5CFF 100%)',
						WebkitBackgroundClip: 'text',
						WebkitTextFillColor: 'transparent',
					}}
				>
					Tâches
				</Typography>
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						justifyContent: 'center',
						py: 12,
						gap: 2,
					}}
				>
					<FolderOpenRoundedIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
					<Typography variant="h6" color="text.secondary">
						Aucun projet sélectionné
					</Typography>
					<Typography variant="body2" color="text.disabled" sx={{ mb: 2 }}>
						Ajoutez d&apos;abord un dépôt dans les paramètres.
					</Typography>
					<Button
						variant="outlined"
						startIcon={<AddRoundedIcon />}
						onClick={() => addView()}
						sx={{
							borderColor: '#FF9800',
							color: '#FF9800',
							textTransform: 'none',
							'&:hover': {
								borderColor: '#FF9800',
								bgcolor: alpha('#FF9800', 0.08),
							},
						}}
					>
						Ajouter un projet
					</Button>
				</Box>
			</Box>
		);
	}

	return (
		<Box sx={{ p: 4, maxWidth: 800, mx: 'auto' }}>
			{/* Header */}
			<Typography
				variant="h4"
				sx={{
					fontWeight: 700,
					mb: 3,
					background: 'linear-gradient(135deg, #FF9800 0%, #7C5CFF 100%)',
					WebkitBackgroundClip: 'text',
					WebkitTextFillColor: 'transparent',
				}}
			>
				Tâches
			</Typography>

			{/* Tabs */}
			<DraggableTabs
				tabs={views.map((v) => v.label)}
				activeTab={activeIndex}
				onTabChange={setActiveIndex}
				onReorder={reorderViews}
				color="#FF9800"
				trailing={
					<Tooltip title="Ajouter un projet">
						<IconButton
							size="small"
							onClick={() => addView()}
							sx={{ color: 'text.disabled', '&:hover': { color: '#FF9800' } }}
						>
							<AddRoundedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				}
			/>

			{/* Add input */}
			<Box
				sx={{
					display: 'flex',
					gap: 1,
					mb: 3,
					bgcolor: 'background.paper',
					borderRadius: 1,
					border: 1,
					borderColor: 'divider',
					p: 1.5,
				}}
			>
				<TextField
					inputRef={inputRef}
					fullWidth
					size="small"
					placeholder="Que faut-il faire ?"
					value={newTitle}
					onChange={(e) => setNewTitle(e.target.value)}
					onKeyDown={handleKeyDown}
					sx={{
						'& .MuiOutlinedInput-root': {
							bgcolor: 'transparent',
							'& fieldset': { border: 'none' },
						},
					}}
				/>
				<IconButton
					onClick={handleAdd}
					disabled={!newTitle.trim()}
					sx={{
						color: newTitle.trim() ? '#FF9800' : 'text.disabled',
						bgcolor: newTitle.trim() ? alpha('#FF9800', 0.1) : 'transparent',
						'&:hover': { bgcolor: alpha('#FF9800', 0.2) },
					}}
				>
					<AddRoundedIcon />
				</IconButton>
			</Box>

			{/* Suggestions */}
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
							display: 'flex',
							alignItems: 'center',
							gap: 0.75,
						}}
					>
						<BugReportRoundedIcon sx={{ fontSize: 14 }} />
						En cours — {suggestions.length}
					</Typography>
					<Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
						{suggestions.map((issue) => (
							<Chip
								key={issue.id}
								label={`#${issue.number} ${issue.title}`}
								size="small"
								onClick={() => addTodo(`#${issue.number} ${issue.title}`)}
								icon={<AddRoundedIcon sx={{ fontSize: '14px !important' }} />}
								sx={{
									bgcolor: alpha('#FF9800', 0.08),
									color: 'text.secondary',
									border: 1,
									borderColor: alpha('#FF9800', 0.2),
									cursor: 'pointer',
									maxWidth: 350,
									transition: 'all 0.15s',
									'&:hover': {
										bgcolor: alpha('#FF9800', 0.15),
										color: '#FF9800',
										borderColor: alpha('#FF9800', 0.4),
									},
									'& .MuiChip-label': {
										overflow: 'hidden',
										textOverflow: 'ellipsis',
									},
								}}
							/>
						))}
					</Box>
				</Box>
			)}

			{/* Loading */}
			{isLoading && (
				<Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
					<CircularProgress size={28} sx={{ color: '#FF9800' }} />
				</Box>
			)}

			{/* Empty state */}
			{!isLoading && todos.length === 0 && (
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
						Aucune tâche
					</Typography>
				</Box>
			)}

			{/* Pending */}
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
						<TodoAccordion
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

			{/* Done */}
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
						Terminé — {done.length}
					</Typography>
					<Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
						{done.map((todo) => (
							<TodoAccordion
								key={todo.id}
								todo={todo}
								done
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
