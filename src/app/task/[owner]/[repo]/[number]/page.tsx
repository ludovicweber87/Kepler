import IssueDetail from "@/components/dashboard/IssueDetail";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ owner: string; repo: string; number: string }>;
}) {
  const { owner, repo, number } = await params;

  return <IssueDetail owner={owner} repo={repo} number={number} />;
}
