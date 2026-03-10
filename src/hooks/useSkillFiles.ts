import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface SkillFile {
	name: string;
	filename: string;
	content: string;
	isFolder: boolean;
}

function queryKey(projectPath: string) {
	return ['skill-files', projectPath];
}

async function fetchSkillFiles(projectPath: string): Promise<SkillFile[]> {
	const res = await fetch(`/api/filesystem/skills?path=${encodeURIComponent(projectPath)}`);
	if (!res.ok) throw new Error('Failed to fetch skills');
	const { skills } = await res.json();
	return skills;
}

export function useSkillFiles(projectPath: string | null) {
	const queryClient = useQueryClient();

	const { data: skills = [], isLoading } = useQuery({
		queryKey: queryKey(projectPath ?? ''),
		queryFn: () => fetchSkillFiles(projectPath!),
		enabled: !!projectPath,
	});

	const saveMutation = useMutation({
		mutationFn: async ({ filename, content }: { filename: string; content: string }) => {
			const res = await fetch('/api/filesystem/skills', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: projectPath, filename, content }),
			});
			if (!res.ok) throw new Error('Failed to save skill');
			return res.json();
		},
		onSettled: () => {
			if (projectPath) {
				queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
			}
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async ({ filename, isFolder }: { filename: string; isFolder: boolean }) => {
			const res = await fetch('/api/filesystem/skills', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: projectPath, filename, isFolder }),
			});
			if (!res.ok) throw new Error('Failed to delete skill');
		},
		onMutate: async ({ filename }) => {
			if (!projectPath) return;
			await queryClient.cancelQueries({ queryKey: queryKey(projectPath) });
			const previous = queryClient.getQueryData<SkillFile[]>(queryKey(projectPath));
			queryClient.setQueryData<SkillFile[]>(queryKey(projectPath), (old = []) =>
				old.filter((s) => s.filename !== filename),
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous && projectPath) {
				queryClient.setQueryData(queryKey(projectPath), context.previous);
			}
		},
		onSettled: () => {
			if (projectPath) {
				queryClient.invalidateQueries({ queryKey: queryKey(projectPath) });
			}
		},
	});

	const saveSkill = useCallback(
		(filename: string, content: string) => saveMutation.mutate({ filename, content }),
		[saveMutation],
	);

	const deleteSkill = useCallback(
		(filename: string, isFolder: boolean) => deleteMutation.mutate({ filename, isFolder }),
		[deleteMutation],
	);

	return { skills, isLoading, saveSkill, deleteSkill };
}
