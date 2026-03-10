import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AgentPreset } from '@/types';

const QUERY_KEY = ['agent-presets'];

async function fetchAgentPresets(): Promise<AgentPreset[]> {
	const { data, error } = await supabase.from('agent_presets').select('*').order('created_at');

	if (error) throw error;
	return data as AgentPreset[];
}

export function useAgentPresets() {
	const queryClient = useQueryClient();

	const { data: presets = [], isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: fetchAgentPresets,
	});

	const saveMutation = useMutation({
		mutationFn: async (preset: Omit<AgentPreset, 'id' | 'created_at'> & { id?: string }) => {
			if (preset.id) {
				const { error } = await supabase
					.from('agent_presets')
					.update({
						name: preset.name,
						description: preset.description,
						prompt_template: preset.prompt_template,
						icon: preset.icon,
						color: preset.color,
					})
					.eq('id', preset.id);
				if (error) throw error;
			} else {
				const { error } = await supabase.from('agent_presets').insert({
					name: preset.name,
					description: preset.description,
					prompt_template: preset.prompt_template,
					icon: preset.icon,
					color: preset.color,
				});
				if (error) throw error;
			}
		},
		onMutate: async (preset) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<AgentPreset[]>(QUERY_KEY);

			queryClient.setQueryData<AgentPreset[]>(QUERY_KEY, (old = []) => {
				if (preset.id) {
					return old.map((p) => (p.id === preset.id ? { ...p, ...preset } : p));
				}
				return [
					...old,
					{
						...preset,
						id: crypto.randomUUID(),
						created_at: new Date().toISOString(),
					} as AgentPreset,
				];
			});

			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(QUERY_KEY, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			const { error } = await supabase.from('agent_presets').delete().eq('id', id);
			if (error) throw error;
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: QUERY_KEY });
			const previous = queryClient.getQueryData<AgentPreset[]>(QUERY_KEY);

			queryClient.setQueryData<AgentPreset[]>(QUERY_KEY, (old = []) =>
				old.filter((p) => p.id !== id),
			);

			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				queryClient.setQueryData(QUERY_KEY, context.previous);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
	});

	const savePreset = useCallback(
		(preset: Omit<AgentPreset, 'id' | 'created_at'> & { id?: string }) =>
			saveMutation.mutate(preset),
		[saveMutation],
	);

	const deletePreset = useCallback((id: string) => deleteMutation.mutate(id), [deleteMutation]);

	return { presets, isLoading, savePreset, deletePreset };
}
