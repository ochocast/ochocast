import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { startLocal, stopLocal, appDirectory } from './start-local.mjs';
import { checkPlan, validateTarget } from './plan.mjs';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const positional = args.filter(arg => arg !== '--check');
const moduleDirectory = path.resolve(positional[0] || path.join(appDirectory, '../ops-architecture-lab/terraform/ffmpeg-local-queue'));
const opsDirectory = path.resolve(moduleDirectory, '../..');
const env = { ...process.env, TF_WORKSPACE: 'default' };
const mirrorConfig = path.join(opsDirectory, '.git/terraform-cli.tfrc');
if (!env.TF_CLI_CONFIG_FILE && fs.existsSync(mirrorConfig)) env.TF_CLI_CONFIG_FILE = mirrorConfig;

function run(command, args, cwd = appDirectory, capture = false, input) {
  const result = spawnSync(command, args, {
    cwd, env, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    stdio: capture ? 'pipe' : 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error(`${command} a échoué. Les sorties privées ne sont pas affichées.`);
  return result.stdout;
}

function checkFiles() {
  if (positional.length > 1 || path.basename(moduleDirectory) !== 'ffmpeg-local-queue') {
    throw new Error('Usage : node dev-tools/localFfmpeg/apply-local-ffmpeg.mjs [--check] [chemin/terraform/ffmpeg-local-queue]');
  }
  for (const repo of [appDirectory, opsDirectory]) {
    if (run('git', ['branch', '--show-current'], repo, true).trim() !== 'feat/queue-ffmpeg') {
      throw new Error(`La branche feat/queue-ffmpeg doit être active dans ${repo}.`);
    }
  }
  for (const file of ['backend/.env', 'ffmpegServer/.env', 'frontend/.env', 'ffmpegServer/dist/http-worker.js']) {
    if (!fs.existsSync(path.join(appDirectory, file))) throw new Error(`Fichier préparé manquant : ${file}`);
  }
  if (!fs.existsSync(path.join(moduleDirectory, 'local.tfvars'))) throw new Error('Configuration Terraform locale manquante.');
  run('docker', ['info', '--format', '{{.ServerVersion}}'], appDirectory, true);
}

try {
  checkFiles();
  if (checkOnly) {
    console.log('Fichiers privés et Docker prêts. Aucun appel Scaleway ni apply effectué.');
  } else {
    process.umask(0o077);
    run('terraform', ['init', '-input=false', '-lockfile=readonly'], moduleDirectory);
    const expression = 'jsonencode({project_id=var.project_id, region=var.region, queue_name=var.queue_name})\n';
    const target = validateTarget(JSON.parse(JSON.parse(run('terraform', ['console', '-var-file=local.tfvars'], moduleDirectory, true, expression).trim())));
    console.log(`Projet ${target.project_id}, région ${target.region}, queue de test ${target.queue_name}.`);
    const info = JSON.parse(run('scw', ['mnq', 'sqs', 'get-info', `project-id=${target.project_id}`, `region=${target.region}`, '-o', 'json'], appDirectory, true));
    if (info.status !== 'enabled') {
      console.log('Activation de Queues dans le projet configuré.');
      run('scw', ['mnq', 'sqs', 'activate', `project-id=${target.project_id}`, `region=${target.region}`, '-o', 'json'], appDirectory, true);
    }
    run('terraform', ['plan', '-input=false', '-var-file=local.tfvars', '-out=local.tfplan'], moduleDirectory);
    fs.chmodSync(path.join(moduleDirectory, 'local.tfplan'), 0o600);
    const count = checkPlan(JSON.parse(run('terraform', ['show', '-json', 'local.tfplan'], moduleDirectory, true)), target);
    console.log(`Plan vérifié : ${count} créations, aucune modification ou suppression.`);
    run('terraform', ['apply', '-input=false', 'local.tfplan'], moduleDirectory);
    run('npm', ['run', 'local:queue-config', '--', moduleDirectory], path.join(appDirectory, 'backend'));
    await stopLocal(['backend']);
    await startLocal();
    console.log('Prêt : publie une courte vidéo sur http://localhost:3000 pour tester la queue Scaleway.');
    if (process.platform === 'darwin') spawnSync('/usr/bin/open', ['http://localhost:3000'], { stdio: 'ignore' });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
