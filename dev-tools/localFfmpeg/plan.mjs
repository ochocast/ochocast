export function validateTarget(target) {
  if (!/^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/.test(target.project_id)) {
    throw new Error('Le projet doit être un UUID Scaleway.');
  }
  if (!['fr-par', 'nl-ams', 'pl-waw'].includes(target.region)) {
    throw new Error('Région Queues non prise en charge.');
  }
  if (!/^ochocast-local-ffmpeg(-[a-z0-9]+)*$/.test(target.queue_name)
      || target.queue_name.length > 80
      || /(^|-)(staging|prod|production)(-|$)/.test(target.queue_name)) {
    throw new Error('Utiliser une queue dédiée ochocast-local-ffmpeg, éventuellement avec un suffixe personnel.');
  }
  return target;
}

export function checkPlan(plan, target) {
  validateTarget(target);
  for (const key of ['project_id', 'region', 'queue_name']) {
    if (plan.variables?.[key]?.value !== target[key]) throw new Error('Les variables du plan ne correspondent pas à la cible locale.');
  }
  const expected = new Set([
    'terraform_data.local_guard',
    'scaleway_mnq_sqs_credentials.manager',
    'scaleway_mnq_sqs_credentials.publisher',
    'scaleway_mnq_sqs_credentials.consumer',
    'scaleway_mnq_sqs_queue.transcoding',
  ]);
  for (const item of plan.resource_changes || []) {
    if (item.mode === 'data') continue;
    if (!expected.has(item.address)) throw new Error(`Ressource inattendue : ${item.address}`);
    if (!item.change.actions.every(action => ['create', 'no-op'].includes(action))) {
      throw new Error(`Modification ou suppression refusée : ${item.address}`);
    }
    if (item.type.startsWith('scaleway_') && item.change.after.project_id !== target.project_id) {
      throw new Error('Le plan cible un autre projet.');
    }
    if (item.type.startsWith('scaleway_mnq_sqs_credentials') && item.change.after.region !== target.region) {
      throw new Error('Le plan cible une autre région.');
    }
    if (item.type === 'scaleway_mnq_sqs_queue' && item.change.after.name !== target.queue_name) {
      throw new Error('Le plan cible une autre queue.');
    }
  }
  return (plan.resource_changes || []).filter(item => item.mode !== 'data' && item.change.actions.includes('create')).length;
}
