'use client';

import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert, { type AlertColor } from '@mui/material/Alert';

interface SnackbarState {
	open: boolean;
	message: string;
	severity: AlertColor;
}

interface SnackbarContextValue {
	showSnackbar: (message: string, severity?: AlertColor) => void;
}

const SnackbarContext = createContext<SnackbarContextValue>({ showSnackbar: () => {} });

export function useSnackbar() {
	return useContext(SnackbarContext);
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
	const [state, setState] = useState<SnackbarState>({ open: false, message: '', severity: 'success' });

	const showSnackbar = useCallback((message: string, severity: AlertColor = 'success') => {
		setState({ open: true, message, severity });
	}, []);

	const handleClose = useCallback(() => {
		setState((s) => ({ ...s, open: false }));
	}, []);

	const ctx = useMemo(() => ({ showSnackbar }), [showSnackbar]);

	return (
		<SnackbarContext.Provider value={ctx}>
			{children}
			<Snackbar
				open={state.open}
				autoHideDuration={4000}
				onClose={handleClose}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
			>
				<Alert
					onClose={handleClose}
					severity={state.severity}
					variant="filled"
					sx={{ fontWeight: 600, fontSize: '0.8rem' }}
				>
					{state.message}
				</Alert>
			</Snackbar>
		</SnackbarContext.Provider>
	);
}
