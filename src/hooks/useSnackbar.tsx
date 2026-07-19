'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { type AlertColor } from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Typography from '@mui/material/Typography';

interface SnackbarAction {
	onClick: () => void;
}

interface SnackbarState {
	open: boolean;
	title: string;
	message?: string;
	severity: AlertColor;
	action?: SnackbarAction;
}

interface SnackbarContextValue {
	showSnackbar: (titleOrMessage: string, severity?: AlertColor, action?: SnackbarAction) => void;
	showSnackbarWithTitle: (title: string, message: string, severity?: AlertColor) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({
	showSnackbar: () => {},
	showSnackbarWithTitle: () => {},
});

export function useSnackbar() {
	return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<SnackbarState>({
		open: false,
		title: '',
		severity: 'success',
	});

	const showSnackbar = useCallback(
		(titleOrMessage: string, severity: AlertColor = 'success', action?: SnackbarAction) => {
			setState({ open: true, title: titleOrMessage, severity, action });
		},
		[],
	);

	const showSnackbarWithTitle = useCallback(
		(title: string, message: string, severity: AlertColor = 'success') => {
			setState({ open: true, title, message, severity, action: undefined });
		},
		[],
	);

	const handleClose = useCallback(() => {
		setState((s) => ({ ...s, open: false }));
	}, []);

	const handleActionClick = useCallback(() => {
		setState((s) => {
			if (s.action) {
				// Défère le side-effect hors de l'updater (qui doit rester pur).
				queueMicrotask(s.action.onClick);
			}
			return { ...s, open: false };
		});
	}, []);

	const ctx = useMemo(
		() => ({ showSnackbar, showSnackbarWithTitle }),
		[showSnackbar, showSnackbarWithTitle],
	);

	const clickable = Boolean(state.action);

	return (
		<SnackbarContext.Provider value={ctx}>
			{children}
			<Snackbar
				open={state.open}
				autoHideDuration={5000}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
				sx={{ mt: '64px' }}
			>
				<Alert
					onClose={(e) => {
						e.stopPropagation();
						handleClose();
					}}
					onClick={clickable ? handleActionClick : undefined}
					severity={state.severity}
					variant="filled"
					sx={{
						fontWeight: 600,
						fontSize: '0.8rem',
						maxWidth: 380,
						...(clickable && { cursor: 'pointer' }),
					}}
				>
					<AlertTitle sx={{ fontWeight: 700, fontSize: '0.82rem', mb: 0.25 }}>
						{state.title}
					</AlertTitle>
					{state.message && (
						<Typography
							sx={{
								fontSize: '0.75rem',
								fontWeight: 400,
								opacity: 0.9,
								display: '-webkit-box',
								WebkitLineClamp: 3,
								WebkitBoxOrient: 'vertical',
								overflow: 'hidden',
							}}
						>
							{state.message}
						</Typography>
					)}
				</Alert>
			</Snackbar>
		</SnackbarContext.Provider>
	);
}
