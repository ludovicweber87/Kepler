import { describe, it, expect } from 'vitest';
import { shouldShowOsNotification } from './osNotification';

describe('shouldShowOsNotification', () => {
	it('shows when enabled, granted, and the tab is not focused', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'granted', hasFocus: false }),
		).toBe(true);
	});

	it('stays silent when the preference is off', () => {
		expect(
			shouldShowOsNotification({ enabled: false, permission: 'granted', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the permission was never asked', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'default', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the permission was denied', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'denied', hasFocus: false }),
		).toBe(false);
	});

	it('stays silent when the tab already has focus (the snackbar is enough)', () => {
		expect(
			shouldShowOsNotification({ enabled: true, permission: 'granted', hasFocus: true }),
		).toBe(false);
	});
});
