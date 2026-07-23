import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonaNote, applyPersonaNote } from './personaSwitch.js';

test('buildPersonaNote mentionne l’ancien et le nouveau rôle quand les deux sont connus', () => {
  const note = buildPersonaNote('Architecte Front-end', 'Architecte Back-end');
  assert.ok(note.includes('Architecte Front-end'));
  assert.ok(note.includes('Architecte Back-end'));
  assert.match(note, /^<system-reminder>/);
  assert.match(note, /<\/system-reminder>$/);
});

test('buildPersonaNote tombe sur « désormais » quand l’ancien rôle est inconnu', () => {
  const note = buildPersonaNote(undefined, 'Data Analyst');
  assert.ok(note.includes('désormais'));
  assert.ok(note.includes('Data Analyst'));
});

test('buildPersonaNote tombe sur « désormais » si from === to', () => {
  assert.ok(buildPersonaNote('Architecte Back-end', 'Architecte Back-end').includes('désormais'));
});

test('applyPersonaNote préfixe la note au texte, séparée par une ligne vide', () => {
  assert.equal(applyPersonaNote('NOTE', 'ma question'), 'NOTE\n\nma question');
});

test('applyPersonaNote renvoie le texte inchangé sans note', () => {
  assert.equal(applyPersonaNote(undefined, 'ma question'), 'ma question');
});
