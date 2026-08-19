import { test } from 'node:test';
import assert from 'node:assert';
import { isShellTerminalSession, isAgentSession, stripSessionPrefix } from './sessionFilter.js';

test('isShellTerminalSession detects the legacy single-shell name', () => {
	assert.equal(isShellTerminalSession('kepler--Users-x-session-mruclnue-shell'), true);
});

test('isShellTerminalSession detects indexed shell tabs (the regression)', () => {
	assert.equal(isShellTerminalSession('kepler--Users-x-session-mruclnue-shell-1'), true);
	assert.equal(isShellTerminalSession('kepler--Users-x-session-mruclnue-shell-12'), true);
});

test('isShellTerminalSession leaves a bare agent session alone', () => {
	assert.equal(isShellTerminalSession('kepler--Users-x-session-mruclnue'), false);
});

test('isAgentSession keeps bare kepler agent sessions', () => {
	assert.equal(isAgentSession('kepler--Users-x-session-mruclnue'), true);
	assert.equal(isAgentSession('kepler-acme-web-app-2270-mrojzuq2'), true);
});

test('isAgentSession excludes shell terminals, indexed or not', () => {
	assert.equal(isAgentSession('kepler--Users-x-session-mruclnue-shell'), false);
	assert.equal(isAgentSession('kepler--Users-x-session-mruclnue-shell-1'), false);
});

test('isAgentSession excludes sessions from other tools', () => {
	assert.equal(isAgentSession('some-other-tmux-session'), false);
	assert.equal(isAgentSession('6e5873a3-da88-4a1b-892a-b3cd6baa8046-shell-1'), false);
});

test('stripSessionPrefix removes the app prefix', () => {
	assert.equal(stripSessionPrefix('kepler-acme-web-app-2270'), 'acme-web-app-2270');
});

test('stripSessionPrefix leaves an unprefixed id untouched', () => {
	assert.equal(stripSessionPrefix('6e5873a3-da88-4a1b'), '6e5873a3-da88-4a1b');
});
