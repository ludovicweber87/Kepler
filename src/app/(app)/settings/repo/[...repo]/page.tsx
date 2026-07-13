import RepoSettingsPanel from '@/components/settings/RepoSettingsPanel';

export default async function RepoSettingsPage({
	params,
}: {
	params: Promise<{ repo: string[] }>;
}) {
	const { repo } = await params;
	const repoFullName = repo.join('/');
	return <RepoSettingsPanel repoFullName={repoFullName} />;
}
