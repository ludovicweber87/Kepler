import Box from '@mui/material/Box';
import IssuesList from '@/components/issues/IssuesList';

export default function IssuesPage() {
	return (
		<Box sx={{ height: '100%' }}>
			<IssuesList />
		</Box>
	);
}
