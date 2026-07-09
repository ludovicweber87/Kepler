import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermissionController, type PendingPermission } from './permissions.js';

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
  assert.deepEqual(await p, { behavior: 'allow' });
  assert.equal(ctrl.snapshot().length, 0);
});

test('allow-always renvoie les suggestions comme updatedPermissions', async () => {
  const sent: PendingPermission[] = [];
  const ctrl = createPermissionController((r) => sent.push(r));
  const suggestions = [{ toolName: 'Write' }];
  const p = ctrl.canUseTool('Write', {}, { suggestions });
  ctrl.resolve(sent[0].id, 'allow-always');
  assert.deepEqual(await p, { behavior: 'allow', updatedPermissions: suggestions });
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
