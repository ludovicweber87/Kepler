import { test } from 'node:test';
import assert from 'node:assert';
import { isShellTerminalSession, isAgentSession } from './sessionFilter.js';

test('isShellTerminalSession detects the legacy single-shell name', () => {
	assert.equal(isShellTerminalSession('devora--Users-x-session-mruclnue-shell'), true);
});

test('isShellTerminalSession detects indexed shell tabs (the regression)', () => {
	assert.equal(isShellTerminalSession('devora--Users-x-session-mruclnue-shell-1'), true);
	assert.equal(isShellTerminalSession('devora--Users-x-session-mruclnue-shell-12'), true);
});

test('isShellTerminalSession leaves a bare agent session alone', () => {
	assert.equal(isShellTerminalSession('devora--Users-x-session-mruclnue'), false);
});

test('isAgentSession keeps bare devora agent sessions', () => {
	assert.equal(isAgentSession('devora--Users-x-session-mruclnue'), true);
	assert.equal(isAgentSession('devora-ODYS-TRAVEL-odys-front-2270-mrojzuq2'), true);
});

test('isAgentSession excludes shell terminals, indexed or not', () => {
	assert.equal(isAgentSession('devora--Users-x-session-mruclnue-shell'), false);
	assert.equal(isAgentSession('devora--Users-x-session-mruclnue-shell-1'), false);
});

test('isAgentSession excludes non-devora sessions', () => {
	assert.equal(isAgentSession('some-other-tmux-session'), false);
	assert.equal(isAgentSession('6e5873a3-da88-4a1b-892a-b3cd6baa8046-shell-1'), false);
});
