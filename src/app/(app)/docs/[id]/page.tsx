import DocDetail from '@/components/docs/DocDetail';

export default async function DocDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	return <DocDetail docId={id} />;
}
