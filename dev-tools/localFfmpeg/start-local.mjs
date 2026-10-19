import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
export const appDirectory = path.resolve(directory, '../..');
const runtimeDirectory = path.join(appDirectory, '.local-test', 'runner');
fs.mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
const recordsFile = path.join(runtimeDirectory, 'processes.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const services = {
  backend: { cwd: path.join(appDirectory, 'backend'), entry: path.join(directory, 'run-backend.cjs'), url: 'http://127.0.0.1:3001/docs' },
  ffmpeg: { cwd: path.join(appDirectory, 'ffmpegServer'), entry: path.join(appDirectory, 'ffmpegServer/dist/http-worker.js'), url: 'http://127.0.0.1:8081/health' },
  frontend: { cwd: path.join(appDirectory, 'frontend'), entry: path.join(directory, 'run-frontend.cjs'), url: 'http://127.0.0.1:3000/' },
};

function records() {
  return fs.existsSync(recordsFile) ? JSON.parse(fs.readFileSync(recordsFile, 'utf8')) : {};
}

function isOwned(name, pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return result.status === 0 && result.stdout.includes(services[name].entry);
}

async function available(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function stopLocal(names = Object.keys(services)) {
  const saved = records();
  for (const name of names) {
    if (saved[name] && isOwned(name, saved[name])) {
      try { process.kill(-saved[name], 'SIGTERM'); } catch {}
      for (let attempt = 0; attempt < 40 && isOwned(name, saved[name]); attempt++) await sleep(250);
      if (isOwned(name, saved[name])) throw new Error(`Le processus ${name} ne s'est pas arrêté. Aucun autre processus n'a été arrêté.`);
    }
    delete saved[name];
  }
  fs.writeFileSync(recordsFile, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
}

export async function startLocal() {
  const saved = records();
  for (const [name, service] of Object.entries(services)) {
    if (saved[name] && isOwned(name, saved[name]) && await available(service.url)) continue;
    if (await available(service.url)) throw new Error(`Le port de ${name} est déjà utilisé par une autre application. Aucun processus existant n'a été arrêté.`);
    const logPath = path.join(runtimeDirectory, `${name}.log`);
    const log = fs.openSync(logPath, 'a', 0o600);
    const child = spawn(process.execPath, [service.entry], {
      cwd: service.cwd,
      env: { ...process.env, TRANSCODING_WORK_DIR: path.join(runtimeDirectory, 'transcoding') },
      detached: true,
      stdio: ['ignore', log, log],
    });
    child.unref();
    fs.closeSync(log);
    saved[name] = child.pid;
    fs.writeFileSync(recordsFile, JSON.stringify(saved, null, 2) + '\n', { mode: 0o600 });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await available(service.url)) { ready = true; break; }
      if (!isOwned(name, child.pid)) throw new Error(`${name} s'est arrêté. Consulter ${logPath}.`);
      await sleep(500);
    }
    if (!ready) throw new Error(`${name} n'est pas prêt. Consulter ${logPath}.`);
    console.log(`${name} : prêt`);
  }
  console.log('Application locale : http://localhost:3000');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === 'stop') await stopLocal();
    else if (process.argv[2] === 'restart-backend') { await stopLocal(['backend']); await startLocal(); }
    else await startLocal();
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
