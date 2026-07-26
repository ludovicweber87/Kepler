import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDocEdit } from './docTools.js';

test('applyDocEdit remplace une occurrence unique', () => {
  const res = applyDocEdit('# Titre\n\nUn paragraphe.', 'Un paragraphe.', 'Deux paragraphes.');
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.content, '# Titre\n\nDeux paragraphes.');
});

test('applyDocEdit échoue si old_string est introuvable', () => {
  const res = applyDocEdit('# Titre', 'absent', 'x');
  assert.equal(res.ok, false);
  assert.match(res.ok === false ? res.error : '', /introuvable/);
});

test('applyDocEdit échoue sur plusieurs occurrences sans replace_all', () => {
  const res = applyDocEdit('a\nb\na', 'a', 'z');
  assert.equal(res.ok, false);
  assert.match(res.ok === false ? res.error : '', /2 fois/);
});

test('applyDocEdit remplace toutes les occurrences avec replace_all', () => {
  const res = applyDocEdit('a\nb\na', 'a', 'z', true);
  assert.equal(res.ok, true);
  assert.equal(res.ok && res.content, 'z\nb\nz');
});

test('applyDocEdit refuse un old_string vide', () => {
  const res = applyDocEdit('a', '', 'z');
  assert.equal(res.ok, false);
});

test('applyDocEdit ne touche pas au reste du document', () => {
  const doc = '# T\n\n## A\ntexte A\n\n## B\ntexte B\n';
  const res = applyDocEdit(doc, 'texte A', 'texte A modifié');
  assert.equal(res.ok && res.content, '# T\n\n## A\ntexte A modifié\n\n## B\ntexte B\n');
});
