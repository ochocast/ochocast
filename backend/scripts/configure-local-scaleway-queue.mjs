import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const backendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function validateConfiguration(config) {
  if (
    !config ||
    config.schema_version !== 1 ||
    config.purpose !== 'ochocast-local-ffmpeg'
  ) {
    throw new Error(
      'Expected the dedicated ffmpeg-local-queue Terraform output.',
    );
  }
  if (
    typeof config.queue_name !== 'string' ||
    !/^ochocast-local-ffmpeg(-[a-z0-9]+)*$/.test(config.queue_name) ||
    config.queue_name.length > 80 ||
    /(^|-)(staging|prod|production)(-|$)/.test(config.queue_name)
  ) {
    throw new Error('Only a dedicated ochocast-local-ffmpeg queue is allowed.');
  }
  if (!['fr-par', 'nl-ams', 'pl-waw'].includes(config.region)) {
    throw new Error('Unsupported Scaleway Queues region.');
  }
  if (config.endpoint !== `https://sqs.mnq.${config.region}.scaleway.com`) {
    throw new Error('Expected the HTTPS Scaleway Queues regional endpoint.');
  }
  const queue = new URL(config.queue_url);
  if (
    queue.origin !== config.endpoint ||
    queue.username ||
    queue.password ||
    queue.search ||
    queue.hash ||
    decodeURIComponent(
      queue.pathname.split('/').filter(Boolean).pop() || '',
    ) !== config.queue_name
  ) {
    throw new Error(
      'Queue URL does not match the development queue and endpoint.',
    );
  }
  for (const field of [
    'publisher_access_key',
    'publisher_secret_key',
    'consumer_access_key',
    'consumer_secret_key',
  ]) {
    if (
      typeof config[field] !== 'string' ||
      !config[field] ||
      /[\r\n\0"'\\]/.test(config[field])
    ) {
      // Never include the value in an error: this is sensitive Terraform output.
      throw new Error(`Missing or invalid ${field}.`);
    }
  }
  if (
    config.lease_seconds !== 3600 ||
    config.visibility_timeout_seconds !== 3900
  ) {
    throw new Error(
      'Expected the local lease/visibility configuration (3600/3900 seconds).',
    );
  }
}

// Keep comments and unrelated settings; remove duplicate assignments of keys
// we control so an earlier value cannot silently override the imported setting.
export function updateEnv(content, updates) {
  const existing = parseEnv(content);
  for (const [key, value] of Object.entries(updates)) {
    if (/[\r\n\0'\\]/.test(value) || /[\r\n]/.test(existing[key] || '')) {
      throw new Error(`Cannot safely update the single-line ${key} setting.`);
    }
  }
  const newline = content.includes('\r\n') ? '\r\n' : '\n';
  const pending = new Map(Object.entries(updates));
  const lines = content.split(/\r?\n/).flatMap((line) => {
    const key = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/,
    )?.[1];
    if (!key || !Object.hasOwn(updates, key)) return [line];
    if (!pending.has(key)) return [];
    const value = pending.get(key);
    pending.delete(key);
    // Single quotes preserve '#' and prevent Docker Compose's $ interpolation.
    return [`${key}='${value}'`];
  });
  while (lines.at(-1) === '') lines.pop();
  for (const [key, value] of pending) lines.push(`${key}='${value}'`);
  return lines.join(newline) + newline;
}

export function prepareLocalEnvironment(config, backendContent, workerContent) {
  validateConfiguration(config);
  const backend = parseEnv(backendContent);
  const worker = parseEnv(workerContent);
  for (const env of [backend, worker]) {
    if (env.NODE_ENV && env.NODE_ENV !== 'development') {
      throw new Error(
        'Refusing to change an environment outside local development.',
      );
    }
  }
  const secrets = {};
  for (const key of [
    'TRANSCODING_DISPATCH_SECRET',
    'TRANSCODING_CALLBACK_SECRET',
  ]) {
    if (backend[key] && worker[key] && backend[key] !== worker[key]) {
      throw new Error(
        `${key} differs between backend and FFmpeg. Align it before importing; existing jobs may still use it.`,
      );
    }
    const value =
      backend[key] || worker[key] || randomBytes(32).toString('hex');
    if (value.length < 32 || /[\r\n\0"'\\]/.test(value)) {
      throw new Error(
        `${key} must be a single-line secret of at least 32 characters.`,
      );
    }
    secrets[key] = value;
  }
  if (
    secrets.TRANSCODING_DISPATCH_SECRET === secrets.TRANSCODING_CALLBACK_SECRET
  ) {
    throw new Error('Dispatch and callback must use different secrets.');
  }
  return {
    backend: updateEnv(backendContent, {
      NODE_ENV: 'development',
      TRANSCODING_QUEUE_PROVIDER: 'scaleway',
      TRANSCODING_QUEUE_ENDPOINT: config.endpoint,
      TRANSCODING_QUEUE_REGION: config.region,
      TRANSCODING_QUEUE_URL: config.queue_url,
      TRANSCODING_QUEUE_ACCESS_KEY: config.publisher_access_key,
      TRANSCODING_QUEUE_SECRET_KEY: config.publisher_secret_key,
      TRANSCODING_LEASE_SECONDS: String(config.lease_seconds),
      LOCAL_QUEUE_BRIDGE_QUEUE_URL: config.queue_url,
      LOCAL_QUEUE_BRIDGE_ACCESS_KEY: config.consumer_access_key,
      LOCAL_QUEUE_BRIDGE_SECRET_KEY: config.consumer_secret_key,
      LOCAL_QUEUE_BRIDGE_WORKER_URL: 'http://127.0.0.1:8081/',
      ...secrets,
    }),
    worker: updateEnv(workerContent, secrets),
  };
}

export function configureLocalFiles(config, appDirectory) {
  const paths = [
    resolve(appDirectory, 'backend/.env'),
    resolve(appDirectory, 'ffmpegServer/.env'),
  ];
  // Refuse to invent a backend's database/auth/storage settings.
  if (!existsSync(paths[0])) {
    throw new Error('Prepare backend/.env from .env.example before importing.');
  }
  const originals = paths.map((path) =>
    existsSync(path) ? readFileSync(path, 'utf8') : '',
  );
  // Complete all validation before writing either file.
  const prepared = prepareLocalEnvironment(config, ...originals);
  for (let index = 0; index < paths.length; index++) {
    const path = paths[index];
    const backup = path + '.local-queue.backup';
    if (!existsSync(backup)) {
      writeFileSync(backup, originals[index], { mode: 0o600, flag: 'wx' });
    }
  }
  [prepared.backend, prepared.worker].forEach((content, index) => {
    writeFileSync(paths[index], content, { mode: 0o600 });
    chmodSync(paths[index], 0o600);
  });
}

function main() {
  if (process.argv.length > 3) {
    throw new Error(
      'Usage: npm run local:queue-config -- [terraform-directory]',
    );
  }
  const terraformDirectory = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(
        backendDirectory,
        '../../ops-architecture-lab/terraform/ffmpeg-local-queue',
      );
  // Read the local state only. Never init/plan/apply or call the queue here.
  const result = spawnSync(
    'terraform',
    [
      `-chdir=${terraformDirectory}`,
      'output',
      '-json',
      'local_queue_configuration',
    ],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 },
  );
  if (result.error || result.status !== 0) {
    // Suppress stdout/stderr, which could contain credentials.
    throw new Error(
      'Cannot read the Terraform output. Apply the dedicated local queue module first, using its default workspace.',
    );
  }
  let config;
  try {
    config = JSON.parse(result.stdout);
  } catch {
    throw new Error('Invalid Terraform configuration output.');
  }
  configureLocalFiles(config, resolve(backendDirectory, '..'));
  console.log(
    'Local backend configured for Scaleway Queues; FFmpeg secrets synchronized.',
  );
  console.log(
    'Original .env files saved as .env.local-queue.backup (first import only).',
  );
  console.log(
    'Restart the backend and recreate the FFmpeg Docker container, then upload a video.',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'Local queue configuration failed.',
    );
    process.exitCode = 1;
  }
}
