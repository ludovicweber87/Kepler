import { describe, it, expect, beforeEach } from 'vitest';
import { isOsNotificationsEnabled, setOsNotificationsEnabled } from './notificationPrefs';

describe('os notifications preference persistence', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('defaults to disabled when nothing stored', () => {
		expect(isOsNotificationsEnabled()).toBe(false);
	});

	it('persists and reads the enabled state', () => {
		setOsNotificationsEnabled(true);
		expect(isOsNotificationsEnabled()).toBe(true);
	});

	it('disabling flips the state back', () => {
		setOsNotificationsEnabled(true);
		setOsNotificationsEnabled(false);
		expect(isOsNotificationsEnabled()).toBe(false);
	});

	it('treats an unrelated stored value as disabled', () => {
		window.localStorage.setItem('kepler.notif.os', 'yes');
		expect(isOsNotificationsEnabled()).toBe(false);
	});
});
