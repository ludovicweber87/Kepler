import { describe, it, expect, beforeEach } from 'vitest';
import { isNotificationSoundMuted, setNotificationSoundMuted } from './notificationSound';

describe('notification sound mute persistence', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	it('defaults to not muted when nothing stored', () => {
		expect(isNotificationSoundMuted()).toBe(false);
	});

	it('persists and reads the muted state', () => {
		setNotificationSoundMuted(true);
		expect(isNotificationSoundMuted()).toBe(true);
	});

	it('unmuting flips the state back', () => {
		setNotificationSoundMuted(true);
		setNotificationSoundMuted(false);
		expect(isNotificationSoundMuted()).toBe(false);
	});
});
