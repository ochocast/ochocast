import getEnv from './env';

export interface UploadProgressCallback {
  onProgress: (progress: number) => void;
  onComplete: (response: { id: string }) => void;
  onError: (error: string) => void;
  onPause?: () => void;
  onSession?: (id: string) => void;
}
export interface UploadControl { pause: () => void; resume: () => void; cancel: () => Promise<void> }
export const uploadControls = new Map<string, UploadControl>();
export async function cancelStoredUpload(id: string) {
  await uploadRequest(`/${id}`, 'DELETE');
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('ochocast.multipart.v1:') && localStorage.getItem(key) === id) localStorage.removeItem(key);
  }
}
interface Session {
  id: string; state: string; partSize: number; size: number;
  parts: { number: number; size: number; checksum: string }[];
}
export function uploadApiBase() {
  const url = new URL(getEnv('REACT_APP_API_URL') || window.location.origin);
  const port = getEnv('REACT_APP_API_PORT');
  if (port) url.port = port;
  return `${url.toString().replace(/\/$/, '')}/api`;
}
export async function uploadRequest(path: string, method = 'GET', body?: BodyInit, signal?: AbortSignal) {
  const user = JSON.parse(localStorage.getItem('backendUser') || 'null');
  if (!user?.token) throw new Error('Session expirée. Veuillez vous reconnecter.');
  const response = await fetch(`${uploadApiBase()}/video-uploads${path}`, { method, body, signal,
    headers: { Authorization: `Bearer ${user.token}`, ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}) } });
  if (!response.ok) {
    const error = new Error((await response.json().catch(() => null))?.message || `Erreur HTTP ${response.status}`);
    Object.assign(error, { status: response.status }); throw error;
  }
  return response.status === 204 ? undefined : response.json().catch(() => undefined);
}
export async function partChecksum(blob: Blob): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return btoa(String.fromCharCode(...Array.from(hash)));
}
function sendPart(url: string, headers: Record<string, string>, blob: Blob, signal: AbortSignal, progress: (bytes: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const finish = (error?: Error) => {
      signal.removeEventListener('abort', abort);
      error ? reject(error) : resolve();
    };
    xhr.open('PUT', url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.timeout = 180000;
    xhr.upload.onprogress = e => progress(e.loaded);
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error(`Envoi de partie : HTTP ${xhr.status}`));
    xhr.onerror = () => finish(new Error('Erreur réseau'));
    xhr.ontimeout = () => finish(new Error('Délai dépassé'));
    xhr.onabort = () => finish(new DOMException('Upload interrompu', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { finish(new DOMException('Upload interrompu', 'AbortError')); return; }
    xhr.send(blob); // Blob slice only; no credentials or bearer token sent to storage.
  });
}

/** Resume survives reload: reselect the same file. Only a session ID is persisted, never signed URLs. */
export function uploadVideoWithProgress(formData: FormData, callbacks: UploadProgressCallback, controlId = ''): () => void {
  const file = formData.get('file');
  if (!(file instanceof File)) { callbacks.onError('Veuillez sélectionner une vidéo.'); return () => {}; }
  const user = JSON.parse(localStorage.getItem('backendUser') || 'null');
  const key = `ochocast.multipart.v1:${user?.id}:${file.name}:${file.size}:${file.lastModified}`;
  let sessionId = localStorage.getItem(key) || '';
  let controller = new AbortController();
  let paused = false;
  let cancelled = false;
  let done = false;
  let running: Promise<void> | undefined;
  const progress = new Map<number, number>();
  const notify = () => {
    if (!paused && !cancelled) callbacks.onProgress(Math.min(99, Math.floor(Array.from(progress.values()).reduce((a, b) => a + b, 0) / file.size * 100)));
  };

  const run = async () => {
    const signal = controller.signal;
    try {
      let session: Session;
      if (sessionId) {
        try { session = await uploadRequest(`/${sessionId}`, 'GET', undefined, signal); }
        catch (e) {
          if (![404, 410].includes((e as { status: number }).status)) throw e;
          sessionId = ''; localStorage.removeItem(key);
        }
      }
      if (!sessionId) {
        // Keep initialization alive during pause/cancel so its resulting session can be aborted.
        session = await uploadRequest('', 'POST', JSON.stringify({ filename: file.name, size: file.size }));
        sessionId = session.id; localStorage.setItem(key, sessionId);
      }
      if (cancelled) { await uploadRequest(`/${sessionId}`, 'DELETE'); localStorage.removeItem(key); return; }
      callbacks.onSession?.(sessionId);
      if (signal.aborted) return;
      if (session!.state === 'aborted') { localStorage.removeItem(key); throw new Error('Upload annulé. Relancez le téléversement.'); }
      if (['uploaded', 'queued', 'ready', 'failed'].includes(session!.state)) {
        done = true; localStorage.removeItem(key); callbacks.onComplete({ id: sessionId }); return;
      }
      const count = Math.ceil(file.size / session!.partSize);
      const existing = new Map(session!.parts.map(p => [p.number, p]));
      let next = 1;
      const worker = async () => {
        while (next <= count) {
          if (signal.aborted) throw new DOMException('Interrupted', 'AbortError');
          const number = next++;
          const part = file.slice((number - 1) * session!.partSize, Math.min(number * session!.partSize, file.size));
          const checksum = await partChecksum(part);
          const stored = existing.get(number);
          if (stored) {
            if (stored.checksum !== checksum || stored.size !== part.size) throw new Error('Le fichier diffère de celui de la session. Annulez cette session pour recommencer.');
          } else {
            if (session!.state === 'uploaded') throw new Error('Manifeste de reprise incomplet');
            for (let attempt = 0; ; attempt++) {
              try {
                const { url, headers } = await uploadRequest(`/${sessionId}/parts/${number}`, 'POST', JSON.stringify({ checksum }), signal);
                await sendPart(url, headers, part, signal, bytes => { progress.set(number, bytes); notify(); });
                break;
              } catch (e) {
                if (signal.aborted || attempt >= 3 || [401, 403, 409, 410].includes((e as { status: number }).status)) throw e;
                progress.delete(number); notify();
                await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
              }
            }
          }
          progress.set(number, part.size); notify();
        }
      };
      let failure: unknown;
      const workers = Array.from({ length: 3 }, () => worker().catch(e => {
        if (!failure) failure = e;
        controller.abort(); throw e;
      }));
      await Promise.allSettled(workers);
      if (failure) throw failure;
      if (signal.aborted) return;
      const metadata = new FormData();
      formData.forEach((value, name) => { if (name !== 'file') metadata.append(name, value); });
      const result = await uploadRequest(`/${sessionId}/complete`, 'POST', metadata, signal);
      done = true; localStorage.removeItem(key); callbacks.onProgress(100); callbacks.onComplete(result);
    } catch (e) {
      if (!paused && !cancelled) callbacks.onError(`${e instanceof Error ? e.message : String(e)}. Reprenez l’envoi ou resélectionnez le même fichier après rechargement.`);
    } finally { if (done || cancelled) uploadControls.delete(controlId); }
  };
  const start = () => {
    if (running || done || cancelled) return;
    paused = false; controller = new AbortController();
    running = run().finally(() => { running = undefined; });
  };
  const control: UploadControl = {
    pause: () => { paused = true; controller.abort(); callbacks.onPause?.(); },
    resume: () => { void (running || Promise.resolve()).then(start); },
    cancel: async () => {
      cancelled = true; controller.abort(); await running;
      try {
        if (sessionId) await uploadRequest(`/${sessionId}`, 'DELETE');
        localStorage.removeItem(key); uploadControls.delete(controlId);
      } catch (e) { cancelled = false; uploadControls.set(controlId, control); throw e; }
    },
  };
  uploadControls.set(controlId, control);
  start();
  return () => { void control.cancel().catch(e => callbacks.onError(e.message)); };
}
