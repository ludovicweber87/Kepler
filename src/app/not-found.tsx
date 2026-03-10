import Link from 'next/link';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';

export default function NotFound() {
	return (
		<Box
			sx={{
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				minHeight: '60vh',
				textAlign: 'center',
			}}
		>
			<Typography
				variant="h1"
				sx={{ fontSize: '6rem', fontWeight: 700, color: 'primary.main', mb: 1 }}
			>
				404
			</Typography>
			<Typography variant="h5" sx={{ mb: 1 }}>
				Page not found
			</Typography>
			<Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
				The task you&apos;re looking for doesn&apos;t exist or has been removed.
			</Typography>
			<Link href="/" style={{ textDecoration: 'none' }}>
				<Button variant="outlined" startIcon={<ArrowBackRoundedIcon />}>
					Back to dashboard
				</Button>
			</Link>
		</Box>
	);
}
