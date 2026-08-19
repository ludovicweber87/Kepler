import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonaNote, buildEffortNote, buildModeNote, applyPersonaNote, combineNotes } from './personaSwitch.js';

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

test('buildEffortNote mentionne l’ancien et le nouveau niveau quand les deux sont connus', () => {
  const note = buildEffortNote('low', 'max');
  assert.ok(note.includes('low'));
  assert.ok(note.includes('max'));
  assert.match(note, /^<system-reminder>/);
  assert.match(note, /<\/system-reminder>$/);
});

test('buildEffortNote tombe sur « désormais » quand l’ancien niveau est inconnu', () => {
  assert.ok(buildEffortNote(undefined, 'high').includes('désormais'));
});

test('buildEffortNote tombe sur « désormais » si from === to', () => {
  assert.ok(buildEffortNote('high', 'high').includes('désormais'));
});

test('buildModeNote mentionne l’ancien et le nouveau mode quand les deux sont connus', () => {
  const note = buildModeNote('default', 'acceptEdits');
  assert.ok(note.includes('default'));
  assert.ok(note.includes('acceptEdits'));
  assert.match(note, /^<system-reminder>/);
  assert.match(note, /<\/system-reminder>$/);
});

test('buildModeNote tombe sur « désormais » quand l’ancien mode est inconnu', () => {
  assert.ok(buildModeNote(undefined, 'plan').includes('désormais'));
});

test('combineNotes assemble les notes non vides séparées par un retour ligne', () => {
  assert.equal(combineNotes('A', undefined, 'B'), 'A\nB');
});

test('combineNotes renvoie undefined si toutes les notes sont vides', () => {
  assert.equal(combineNotes(undefined, undefined), undefined);
});

test('combineNotes préserve une note unique', () => {
  assert.equal(combineNotes(undefined, 'SEULE', undefined), 'SEULE');
});
