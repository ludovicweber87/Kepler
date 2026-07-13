import { test } from 'node:test';
import assert from 'node:assert';
import { parseFilesToCopy } from './filesToCopy.js';

test('parse lignes non vides, trim', () => {
	assert.deepEqual(parseFilesToCopy('.env\n  .env.local \n\n'), ['.env', '.env.local']);
});
test('texte vide → []', () => {
	assert.deepEqual(parseFilesToCopy('   \n  '), []);
});
