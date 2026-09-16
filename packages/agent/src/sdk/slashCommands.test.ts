import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCommands, extractCommandsChanged } from './slashCommands.js';

test('normalizeCommands trie par nom et complète les champs manquants', () => {
  assert.deepEqual(
    normalizeCommands([{ name: 'pr' }, { name: 'commit', description: 'Commit', argumentHint: '<msg>' }]),
    [
      { name: 'commit', description: 'Commit', argumentHint: '<msg>' },
      { name: 'pr', description: '', argumentHint: '' },
    ],
  );
});

test('normalizeCommands écarte les entrées sans nom, les doublons et le non-tableau', () => {
  assert.deepEqual(normalizeCommands([{ name: '  ' }, null, 'pr', { name: 'a' }, { name: 'a', description: 'dup' }]), [
    { name: 'a', description: '', argumentHint: '' },
  ]);
  assert.deepEqual(normalizeCommands(undefined), []);
  assert.deepEqual(normalizeCommands({ name: 'pr' }), []);
});

test('normalizeCommands ne garde `aliases` que s\'il reste des chaînes utiles', () => {
  assert.deepEqual(normalizeCommands([{ name: 'usage', aliases: ['cost', '', 3] }]), [
    { name: 'usage', description: '', argumentHint: '', aliases: ['cost'] },
  ]);
  assert.deepEqual(normalizeCommands([{ name: 'usage', aliases: [] }]), [
    { name: 'usage', description: '', argumentHint: '' },
  ]);
});

test('extractCommandsChanged ne reconnaît que system/commands_changed', () => {
  assert.deepEqual(extractCommandsChanged({ type: 'system', subtype: 'commands_changed', commands: [{ name: 'pr' }] }), [
    { name: 'pr', description: '', argumentHint: '' },
  ]);
  // Liste vidée : REPLACE par un tableau vide, pas `null` (qui voudrait dire « pas concerné »).
  assert.deepEqual(extractCommandsChanged({ type: 'system', subtype: 'commands_changed', commands: [] }), []);
  assert.equal(extractCommandsChanged({ type: 'system', subtype: 'init' }), null);
  assert.equal(extractCommandsChanged({ type: 'assistant' }), null);
  assert.equal(extractCommandsChanged(null), null);
});
