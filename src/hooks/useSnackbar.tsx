'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { type AlertColor } from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Typography from '@mui/material/Typography';

interface SnackbarState {
	open: boolean;
	title: string;
	message?: string;
	severity: AlertColor;
}

interface SnackbarContextValue {
	showSnackbar: (titleOrMessage: string, severity?: AlertColor) => void;
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
	const [state, setState] = useState<SnackbarState>({ open: false, title: '', severity: 'success' });

	const showSnackbar = useCallback((titleOrMessage: string, severity: AlertColor = 'success') => {
		setState({ open: true, title: titleOrMessage, severity });
	}, []);

	const showSnackbarWithTitle = useCallback(
		(title: string, message: string, severity: AlertColor = 'success') => {
			setState({ open: true, title, message, severity });
		},
		[],
	);

	const handleClose = useCallback(() => {
		setState((s) => ({ ...s, open: false }));
	}, []);

	const ctx = useMemo(
		() => ({ showSnackbar, showSnackbarWithTitle }),
		[showSnackbar, showSnackbarWithTitle],
	);

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
					onClose={handleClose}
					severity={state.severity}
					variant="filled"
					sx={{ fontWeight: 600, fontSize: '0.8rem', maxWidth: 380 }}
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
