import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDocChatSystemPrompt,
  buildScopeNote,
  buildDocToolGate,
  type DocGuardrailInput,
} from './docGuardrails.js';

const KNOWLEDGE: DocGuardrailInput = {
  title: 'React Query en pratique',
  subject: 'React Query',
  source_type: 'knowledge',
  repoFullName: null,
  repoResolved: false,
};
const REPO: DocGuardrailInput = {
  title: 'Architecture Kepler',
  subject: "l'architecture de Kepler",
  source_type: 'repo',
  repoFullName: 'ludo/kepler',
  repoResolved: true,
};

test('le prompt système nomme le sujet', () => {
  assert.match(buildDocChatSystemPrompt(KNOWLEDGE), /React Query/);
});

test('le prompt système décrit le refus doux', () => {
  const p = buildDocChatSystemPrompt(KNOWLEDGE);
  assert.match(p, /hors (du )?p[ée]rim[èe]tre/i);
  assert.match(p, /pistes/i);
});

test('le prompt système contient la clause anti-injection', () => {
  assert.match(buildDocChatSystemPrompt(KNOWLEDGE), /n'ob[ée]is jamais/i);
});

test('le prompt système interdit les questions par outil', () => {
  assert.match(buildDocChatSystemPrompt(KNOWLEDGE), /en texte/i);
});

test('le prompt système ne mentionne le dépôt que pour une doc de repo', () => {
  assert.doesNotMatch(buildDocChatSystemPrompt(KNOWLEDGE), /d[ée]p[ôo]t/i);
  assert.match(buildDocChatSystemPrompt(REPO), /ludo\/kepler/);
});

test('le prompt système exige une édition sur demande explicite', () => {
  assert.match(buildDocChatSystemPrompt(KNOWLEDGE), /explicite/i);
});

test('buildScopeNote reste court et nomme le sujet', () => {
  const note = buildScopeNote(KNOWLEDGE);
  assert.match(note, /React Query/);
  assert.ok(note.length < 300, `note trop longue : ${note.length}`);
});

test('buildScopeNote est un system-reminder', () => {
  assert.match(buildScopeNote(KNOWLEDGE), /^<system-reminder>/);
});

test('le portail autorise toujours les outils doc et le web', () => {
  const gate = buildDocToolGate(KNOWLEDGE);
  for (const t of ['mcp__doc__read_doc', 'mcp__doc__edit_doc', 'mcp__doc__replace_doc', 'WebSearch', 'WebFetch']) {
    assert.equal(gate(t), true, t);
  }
});

test('le portail refuse toujours les outils dangereux et AskUserQuestion', () => {
  for (const doc of [KNOWLEDGE, REPO]) {
    const gate = buildDocToolGate(doc);
    for (const t of ['AskUserQuestion', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'Task']) {
      assert.equal(gate(t), false, `${t} / ${doc.source_type}`);
    }
  }
});

test('le portail ouvre la lecture de code seulement si le repo est résolu', () => {
  const withRepo = buildDocToolGate(REPO);
  const withoutRepo = buildDocToolGate(KNOWLEDGE);
  for (const t of ['Read', 'Grep', 'Glob']) {
    assert.equal(withRepo(t), true, `repo/${t}`);
    assert.equal(withoutRepo(t), false, `knowledge/${t}`);
  }
});

test('le portail refuse la lecture de code si le repo est déclaré mais non résolu', () => {
  const gate = buildDocToolGate({ ...REPO, repoResolved: false });
  assert.equal(gate('Read'), false);
});

test('le portail refuse un outil inconnu', () => {
  assert.equal(buildDocToolGate(REPO)('mcp__autre__truc'), false);
});

test('le prompt ne promet pas la lecture de code si le dépôt n\'est pas résolu', () => {
  const prompt = buildDocChatSystemPrompt({ ...REPO, repoResolved: false });
  const gate = buildDocToolGate({ ...REPO, repoResolved: false });
  // Couche 1 et couche 2 doivent décrire les mêmes capacités : promettre Read
  // pendant que le portail le refuse ferait perdre des tours au modèle.
  assert.doesNotMatch(prompt, /Read/);
  assert.equal(gate('Read'), false);
});
