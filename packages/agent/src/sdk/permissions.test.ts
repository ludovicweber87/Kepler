import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPermissionController,
  type PendingPermission,
  type PendingQuestion,
} from './permissions.js';

test('canUseTool broadcast une requête et attend la résolution', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Write', { path: 'a.txt' }, { title: 'Claude wants to write a.txt', displayName: 'Write file' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].toolName, 'Write');
  assert.equal(sent[0].title, 'Claude wants to write a.txt');
  assert.deepEqual(ctrl.snapshot().map((s) => s.id), [sent[0].id]);
  const ok = ctrl.resolve(sent[0].id, 'allow-once');
  assert.equal(ok, true);
  assert.deepEqual(await p, { behavior: 'allow', updatedInput: { path: 'a.txt' } });
  assert.equal(ctrl.snapshot().length, 0);
});

test('allow-always renvoie les suggestions comme updatedPermissions', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const suggestions = [{ toolName: 'Write' }];
  const p = ctrl.canUseTool('Write', { path: 'b.txt' }, { suggestions });
  ctrl.resolve(sent[0].id, 'allow-always');
  assert.deepEqual(await p, { behavior: 'allow', updatedInput: { path: 'b.txt' }, updatedPermissions: suggestions });
});

test('mode bypassPermissions → auto-allow sans broadcast', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r), () => 'bypassPermissions');
  const res = await ctrl.canUseTool('Bash', { cmd: 'ls' }, {});
  assert.deepEqual(res, { behavior: 'allow', updatedInput: { cmd: 'ls' } });
  assert.equal(sent.length, 0);
});

test('mode acceptEdits → auto-allow les éditions, prompt pour Bash', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r), () => 'acceptEdits');
  const edit = await ctrl.canUseTool('Write', { path: 'a.txt' }, {});
  assert.deepEqual(edit, { behavior: 'allow', updatedInput: { path: 'a.txt' } });
  assert.equal(sent.length, 0);
  void ctrl.canUseTool('Bash', { cmd: 'ls' }, {});
  assert.equal(sent.length, 1);
});

test('reject renvoie un deny', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Bash', { cmd: 'rm -rf /' }, {});
  ctrl.resolve(sent[0].id, 'reject');
  const res = await p;
  assert.equal(res.behavior, 'deny');
});

test('resolve sur un id inconnu → false (idempotence)', () => {
  const ctrl = createPermissionController(() => {});
  assert.equal(ctrl.resolve('perm-999', 'allow-once'), false);
});

test('abortAll deny toutes les requêtes en attente', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const p = ctrl.canUseTool('Write', {}, {});
  ctrl.abortAll();
  const res = await p;
  assert.equal(res.behavior, 'deny');
  assert.equal(ctrl.snapshot().length, 0);
});

test('AbortSignal déjà avorté → deny immédiat sans broadcast', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const ac = new AbortController();
  ac.abort();
  const res = await ctrl.canUseTool('Write', {}, { signal: ac.signal });
  assert.equal(res.behavior, 'deny');
  assert.equal(sent.length, 0);
});

test('AskUserQuestion parque même en bypassPermissions et injecte les réponses', async () => {
  const perms: PendingPermission[] = [];
  const asked: PendingQuestion[] = [];
  const ctrl = createPermissionController(
    (r) => perms.push(r),
    () => 'bypassPermissions',
    (r) => asked.push(r),
  );
  const input = { questions: [{ question: 'Couleur ?', options: [{ label: 'Rouge' }, { label: 'Bleu' }] }] };
  const p = ctrl.canUseTool('AskUserQuestion', input, {});
  // Ne suit pas le mode : broadcast question, pas de permission, snapshot dédié.
  assert.equal(perms.length, 0);
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0].questions[0].options.map((o) => o.label), ['Rouge', 'Bleu']);
  assert.deepEqual(ctrl.snapshotQuestions().map((q) => q.id), [asked[0].id]);
  const ok = ctrl.resolveQuestion(asked[0].id, { 'Couleur ?': 'Rouge' });
  assert.equal(ok, true);
  assert.deepEqual(await p, {
    behavior: 'allow',
    updatedInput: { ...input, answers: { 'Couleur ?': 'Rouge' } },
  });
  assert.equal(ctrl.snapshotQuestions().length, 0);
});

test('resolveQuestion sur un id inconnu → false', () => {
  const ctrl = createPermissionController(() => {});
  assert.equal(ctrl.resolveQuestion('ask-999', {}), false);
});

test('abortAll deny aussi les questions en attente', async () => {
  const asked: PendingQuestion[] = [];
  const ctrl = createPermissionController(
    () => {},
    () => '',
    (r) => asked.push(r),
  );
  const p = ctrl.canUseTool('AskUserQuestion', { questions: [] }, {});
  ctrl.abortAll();
  assert.equal((await p).behavior, 'deny');
  assert.equal(ctrl.snapshotQuestions().length, 0);
});

test('toolGate refuse un outil avant tout court-circuit de mode', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController(
    (r) => sent.push(r),
    () => 'bypassPermissions',
    () => {},
    (name) => name === 'WebSearch',
  );
  const res = await ctrl.canUseTool('Bash', { cmd: 'rm -rf /' }, {});
  assert.equal(res.behavior, 'deny');
  assert.equal(sent.length, 0);
});

test('toolGate laisse passer un outil autorisé vers le court-circuit bypass', async () => {
  const ctrl = createPermissionController(
    () => {},
    () => 'bypassPermissions',
    () => {},
    (name) => name === 'WebSearch',
  );
  const res = await ctrl.canUseTool('WebSearch', { query: 'x' }, {});
  assert.deepEqual(res, { behavior: 'allow', updatedInput: { query: 'x' } });
});

// Sans ce timeout, une régression dans l'ordre du gate entraînerait un hang du test au lieu d'une failure.
test('toolGate court-circuite AskUserQuestion au lieu de le parquer', { timeout: 5000 }, async () => {
  const asked: PendingQuestion[] = [];
  const ctrl = createPermissionController(
    () => {},
    () => 'bypassPermissions',
    (q) => asked.push(q),
    () => false,
  );
  const res = await ctrl.canUseTool('AskUserQuestion', { questions: [] }, {});
  assert.equal(res.behavior, 'deny');
  assert.equal(asked.length, 0);
  assert.equal(ctrl.snapshotQuestions().length, 0);
});

test('sans toolGate, le comportement est inchangé', async () => {
  const asked: PendingQuestion[] = [];
  const ctrl = createPermissionController(
    () => {},
    () => 'bypassPermissions',
    (q) => asked.push(q),
  );
  const res = await ctrl.canUseTool('Bash', { cmd: 'ls' }, {});
  assert.deepEqual(res, { behavior: 'allow', updatedInput: { cmd: 'ls' } });
  void ctrl.canUseTool('AskUserQuestion', { questions: [] }, {});
  assert.equal(asked.length, 1);
  ctrl.abortAll();
});
