import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded';
import BuildRoundedIcon from '@mui/icons-material/BuildRounded';
import GitHubIcon from '@mui/icons-material/GitHub';
import MergeRoundedIcon from '@mui/icons-material/MergeRounded';
import type { NotificationSource } from '@/types';

export function SourceIcon({
	source,
	fontSize = 'small',
}: {
	source: NotificationSource;
	fontSize?: 'small' | 'inherit' | 'medium';
}) {
	switch (source) {
		case 'agent':
			return <SmartToyRoundedIcon fontSize={fontSize} />;
		case 'ci':
			return <BuildRoundedIcon fontSize={fontSize} />;
		case 'github':
			return <GitHubIcon fontSize={fontSize} />;
		case 'pr':
			return <MergeRoundedIcon fontSize={fontSize} />;
	}
}
