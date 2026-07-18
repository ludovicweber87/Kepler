'use client';

import { useCallback, useMemo, useState } from 'react';
import {
	ReactFlow,
	ReactFlowProvider,
	Background,
	Controls,
	MiniMap,
	addEdge,
	useNodesState,
	useEdgesState,
	useReactFlow,
	type Node,
	type Edge,
	type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Avatar from '@mui/material/Avatar';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded';
import FlagRoundedIcon from '@mui/icons-material/FlagRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { useTranslations } from 'next-intl';
import { usePersonaGroups } from '@/hooks/usePersonaGroups';
import { usePersonas } from '@/hooks/usePersonas';
import { useSnackbar } from '@/hooks/useSnackbar';
import { PersonaFlowContext } from './flow/PersonaFlowContext';
import { nodeTypes } from './flow/nodes';
import NodeConfigPanel from './flow/NodeConfigPanel';
import type { Persona, PersonaGroup, PersonaFlowNode, PersonaFlowNodeData } from '@/types';

const DND_MIME = 'application/devora-persona';

interface Props {
	group: PersonaGroup;
	onClose: () => void;
}

function seedNodes(group: PersonaGroup): Node[] {
	if (group.nodes && group.nodes.length > 0) {
		return group.nodes.map((n) => ({
			id: n.id,
			type: n.type,
			position: n.position,
			data: n.data ?? {},
		}));
	}
	return [{ id: 'start', type: 'start', position: { x: 80, y: 160 }, data: {} }];
}

function FlowCanvas({ group, onClose }: Props) {
	const t = useTranslations('personas');
	const { update } = usePersonaGroups();
	const { personas } = usePersonas();
	const { showSnackbar } = useSnackbar();
	const { screenToFlowPosition } = useReactFlow();

	const [name, setName] = useState(group.name);
	const [nodes, setNodes, onNodesChange] = useNodesState<Node>(seedNodes(group));
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>((group.edges ?? []) as Edge[]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const personasById = useMemo(() => {
		const m = new Map<string, Persona>();
		for (const p of personas) m.set(p.id, p);
		return m;
	}, [personas]);

	const onConnect = useCallback(
		(c: Connection) => setEdges((eds) => addEdge(c, eds)),
		[setEdges],
	);

	const addNodeAt = useCallback(
		(type: 'checkpoint' | 'end', data: PersonaFlowNodeData = {}) => {
			const id = crypto.randomUUID();
			setNodes((nds) => [
				...nds,
				{ id, type, position: { x: 320, y: 120 + nds.length * 40 }, data },
			]);
		},
		[setNodes],
	);

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault();
			const personaId = event.dataTransfer.getData(DND_MIME);
			if (!personaId) return;
			const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
			const id = crypto.randomUUID();
			setNodes((nds) => [
				...nds,
				{ id, type: 'persona', position, data: { personaId, outputs: ['done'] } },
			]);
		},
		[screenToFlowPosition, setNodes],
	);

	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault();
		event.dataTransfer.dropEffect = 'move';
	}, []);

	const updateNodeData = useCallback(
		(nodeId: string, data: PersonaFlowNodeData) => {
			setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
		},
		[setNodes],
	);

	const deleteNode = useCallback(
		(nodeId: string) => {
			setNodes((nds) => nds.filter((n) => n.id !== nodeId));
			setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
			setSelectedId(null);
		},
		[setNodes, setEdges],
	);

	const handleSave = async () => {
		setSaving(true);
		const serializedNodes: PersonaFlowNode[] = nodes.map((n) => ({
			id: n.id,
			type: n.type as PersonaFlowNode['type'],
			position: n.position,
			data: (n.data ?? {}) as PersonaFlowNodeData,
		}));
		const serializedEdges = edges.map((e) => ({
			id: e.id,
			source: e.source,
			target: e.target,
			sourceHandle: e.sourceHandle ?? null,
			targetHandle: e.targetHandle ?? null,
			label: typeof e.label === 'string' ? e.label : null,
		}));
		try {
			await update.mutateAsync({
				id: group.id,
				name: name.trim() || group.name,
				nodes: serializedNodes,
				edges: serializedEdges,
			});
			showSnackbar(t('editorSaved'), 'success');
		} catch {
			showSnackbar(t('saveError'), 'error');
		} finally {
			setSaving(false);
		}
	};

	const selectedNode = useMemo<PersonaFlowNode | null>(() => {
		const n = nodes.find((x) => x.id === selectedId);
		if (!n) return null;
		return {
			id: n.id,
			type: n.type as PersonaFlowNode['type'],
			position: n.position,
			data: (n.data ?? {}) as PersonaFlowNodeData,
		};
	}, [nodes, selectedId]);

	return (
		<Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
			<Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
				<Tooltip title={t('tabGroups')}>
					<IconButton onClick={onClose} size="small">
						<ArrowBackRoundedIcon />
					</IconButton>
				</Tooltip>
				<TextField
					value={name}
					onChange={(e) => setName(e.target.value)}
					variant="standard"
					size="small"
					sx={{ '& input': { fontSize: '1.1rem', fontWeight: 600 } }}
				/>
				<Box sx={{ flex: 1 }} />
				<Button
					variant="contained"
					startIcon={<SaveRoundedIcon />}
					onClick={handleSave}
					disabled={saving}
					sx={{ textTransform: 'none' }}
				>
					{t('editorSave')}
				</Button>
			</Stack>

			<Box sx={{ flex: 1, display: 'flex', gap: 2, minHeight: 0 }}>
				{/* Palette */}
				<Box
					sx={{
						width: 200,
						flexShrink: 0,
						borderRadius: 2.5,
						border: '1px solid',
						borderColor: 'divider',
						p: 1.5,
						overflowY: 'auto',
					}}
				>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ display: 'block', mb: 1 }}
					>
						{t('paletteHint')}
					</Typography>
					<Stack spacing={1}>
						{personas.map((p) => (
							<Stack
								key={p.id}
								draggable
								onDragStart={(e) => {
									e.dataTransfer.setData(DND_MIME, p.id);
									e.dataTransfer.effectAllowed = 'move';
								}}
								direction="row"
								spacing={1}
								alignItems="center"
								sx={{
									p: 0.75,
									borderRadius: 1.5,
									border: '1px solid',
									borderColor: 'divider',
									cursor: 'grab',
									'&:hover': { borderColor: 'primary.main' },
								}}
							>
								<Avatar
									sx={{
										width: 22,
										height: 22,
										fontSize: 10,
										bgcolor: p.color ?? 'grey.500',
									}}
								>
									{p.name.slice(0, 2).toUpperCase()}
								</Avatar>
								<Typography variant="body2" noWrap>
									{p.name}
								</Typography>
							</Stack>
						))}
					</Stack>
					<Stack spacing={1} sx={{ mt: 2 }}>
						<Button
							size="small"
							startIcon={<PauseCircleOutlineRoundedIcon />}
							onClick={() => addNodeAt('checkpoint')}
							sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
						>
							{t('addCheckpoint')}
						</Button>
						<Button
							size="small"
							startIcon={<FlagRoundedIcon />}
							onClick={() => addNodeAt('end', { endAction: 'none' })}
							sx={{ textTransform: 'none', justifyContent: 'flex-start' }}
						>
							{t('addEnd')}
						</Button>
					</Stack>
				</Box>

				{/* Canvas */}
				<Box
					sx={{
						flex: 1,
						minWidth: 0,
						borderRadius: 2.5,
						border: '1px solid',
						borderColor: 'divider',
						overflow: 'hidden',
					}}
					onDrop={onDrop}
					onDragOver={onDragOver}
				>
					<PersonaFlowContext.Provider value={personasById}>
						<ReactFlow
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							onConnect={onConnect}
							onSelectionChange={({ nodes: sel }) =>
								setSelectedId(sel[0]?.id ?? null)
							}
							nodeTypes={nodeTypes}
							fitView
							proOptions={{ hideAttribution: true }}
						>
							<Background />
							<Controls />
							<MiniMap pannable zoomable />
						</ReactFlow>
					</PersonaFlowContext.Provider>
				</Box>

				{/* Config panel */}
				<Box
					sx={{
						width: 260,
						flexShrink: 0,
						borderRadius: 2.5,
						border: '1px solid',
						borderColor: 'divider',
						overflowY: 'auto',
					}}
				>
					<NodeConfigPanel
						node={selectedNode}
						personas={personas}
						onChange={updateNodeData}
						onDelete={deleteNode}
					/>
				</Box>
			</Box>
		</Box>
	);
}

export default function PersonaGroupEditor(props: Props) {
	return (
		<ReactFlowProvider>
			<FlowCanvas {...props} />
		</ReactFlowProvider>
	);
}
