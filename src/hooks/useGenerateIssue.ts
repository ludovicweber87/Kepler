import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-fetch';

export interface GenerateIssueParams {
	description: string;
	repo?: string;
}

export interface GeneratedIssue {
	title: string;
	body: string;
}

export function useGenerateIssue() {
	return useMutation({
		mutationFn: async (params: GenerateIssueParams): Promise<GeneratedIssue> => {
			const res = await apiFetch('/api/github/issue/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(params),
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to generate issue');
			return data as GeneratedIssue;
		},
	});
}
