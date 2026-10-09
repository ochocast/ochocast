import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPlan, validateTarget } from './plan.mjs';

const target = { project_id: '00000000-0000-0000-0000-000000000001', region: 'fr-par', queue_name: 'ochocast-local-ffmpeg-test' };
const resource = {
  address: 'scaleway_mnq_sqs_queue.transcoding', mode: 'managed', type: 'scaleway_mnq_sqs_queue',
  change: { actions: ['create'], after: { project_id: target.project_id, name: target.queue_name } },
};
function plan() {
  return {
    variables: Object.fromEntries(Object.entries(target).map(([key, value]) => [key, { value }])),
    resource_changes: [structuredClone(resource)],
  };
}

test('accepts creation and an unchanged dedicated local queue', () => {
  const value = plan();
  assert.equal(checkPlan(value, target), 1);
  value.resource_changes[0].change.actions = ['no-op'];
  assert.equal(checkPlan(value, target), 0);
});
test('rejects updates, deletion and replacement', () => {
  for (const actions of [['update'], ['delete'], ['delete', 'create']]) {
    const value = plan();
    value.resource_changes[0].change.actions = actions;
    assert.throws(() => checkPlan(value, target), /Modification ou suppression/);
  }
});
test('rejects resources outside the dedicated module', () => {
  const value = plan();
  value.resource_changes[0].address = 'scaleway_container.worker';
  assert.throws(() => checkPlan(value, target), /Ressource inattendue/);
});
test('rejects a different project, region or queue', () => {
  for (const key of Object.keys(target)) {
    const value = plan();
    value.variables[key].value = 'unexpected';
    assert.throws(() => checkPlan(value, target), /variables du plan/);
  }
  const value = plan();
  value.resource_changes[0].change.after.project_id = '00000000-0000-0000-0000-000000000002';
  assert.throws(() => checkPlan(value, target), /autre projet/);
  value.resource_changes[0].change.after.project_id = target.project_id;
  value.resource_changes[0].change.after.name = 'different-queue';
  assert.throws(() => checkPlan(value, target), /autre queue/);
});
test('rejects production or staging targets before activation', () => {
  for (const queue_name of ['production', 'ochocast-local-ffmpeg-prod', 'ochocast-local-ffmpeg-staging']) {
    assert.throws(() => validateTarget({ ...target, queue_name }));
  }
});
