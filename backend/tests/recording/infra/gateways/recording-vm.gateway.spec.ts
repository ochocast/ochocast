import {
  RecordingVMGateway,
  signRecorderRequest,
} from 'src/recording/infra/gateways/recording-vm.gateway';

type Call = { url: string; init?: RequestInit };

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('RecordingVMGateway', () => {
  const env = process.env;
  let calls: Call[];
  let routes: (url: string) => Response;

  beforeEach(() => {
    process.env = {
      ...env,
      RECORDING_VM_URL: 'http://fallback-recorder:8080',
      CONTROL_PLANE_URL: 'http://cp:8090',
      RECORDING_SHARED_SECRET: 'secret',
    };
    calls = [];
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return routes(url);
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = env;
  });

  it('signs like the recorder does (shared vector with liveRecoder/auth_test.go)', () => {
    expect(
      signRecorderRequest(
        'secret',
        '1700000000',
        'POST',
        '/recording/start',
        '{"room_id":"r1"}',
      ),
    ).toBe('2883f07f678b24eeb1b5d6ce478df81f2f3f9f57af031717348e1dd6bb2b5b24');
  });

  it('starts the recorder of the worker carrying the live, with a signed request', async () => {
    routes = (url) =>
      url.startsWith('http://cp:8090/recorder')
        ? json(200, {
            sfu_url: 'http://51.15.1.2:8090',
            room_key: 'k',
            recorder_service_url: 'http://51.15.1.2:8083',
          })
        : json(200, { status: 'recording' });
    const gateway = new RecordingVMGateway();

    await gateway.startRecording({ roomId: 'r1', trackId: 'r1' });

    const start = calls[1];
    expect(start.url).toBe('http://51.15.1.2:8083/recording/start');
    const headers = start.init?.headers as Record<string, string>;
    expect(headers['X-Recording-Secret']).toBeUndefined();
    expect(headers['X-Recording-Signature']).toBe(
      signRecorderRequest(
        'secret',
        headers['X-Recording-Timestamp'],
        'POST',
        '/recording/start',
        start.init?.body as string,
      ),
    );

    // Stop goes to the same recorder without asking the control plane again.
    await gateway.stopRecording('r1');
    expect(calls[2].url).toBe('http://51.15.1.2:8083/recording/stop');
  });

  it('falls back to RECORDING_VM_URL when workers carry no recorder', async () => {
    routes = (url) =>
      url.startsWith('http://cp:8090/recorder')
        ? json(200, { sfu_url: 'http://localhost:8091', room_key: 'k' })
        : json(200, { status: 'recording' });

    await new RecordingVMGateway().startRecording({
      roomId: 'r1',
      trackId: 'r1',
    });

    expect(calls[1].url).toBe('http://fallback-recorder:8080/recording/start');
  });

  it.each([404, 409, 503])(
    'reports idle without calling any recorder when no live runs (control plane %i)',
    async (status) => {
      routes = () => json(status);

      await expect(new RecordingVMGateway().getStatus('r1')).resolves.toEqual({
        status: 'idle',
        roomId: 'r1',
      });
      expect(calls).toHaveLength(1);
    },
  );

  it('treats a stop without live as already done', async () => {
    routes = () => json(404);
    await expect(
      new RecordingVMGateway().stopRecording('r1'),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('forgets a remembered recorder that went away with its worker', async () => {
    // Live 1 on worker A: its recorder is remembered when started.
    routes = (url) =>
      url.startsWith('http://cp:8090/recorder')
        ? json(200, { room_key: 'k', recorder_service_url: 'http://a:8083' })
        : json(200, { status: 'recording' });
    const gateway = new RecordingVMGateway();
    await gateway.startRecording({ roomId: 'r1', trackId: 'r1' });

    // Worker A is deleted; live 2 runs on worker B.
    routes = (url) => {
      if (url.startsWith('http://a:8083')) throw new TypeError('fetch failed');
      return url.startsWith('http://cp:8090/recorder')
        ? json(200, { room_key: 'k', recorder_service_url: 'http://b:8083' })
        : json(200, { status: 'idle' });
    };
    calls = [];

    await expect(gateway.getStatus('r1')).resolves.toMatchObject({
      status: 'idle',
    });
    expect(calls.map((c) => c.url)).toEqual([
      'http://a:8083/recording/status?room_id=r1',
      'http://cp:8090/recorder?room_id=r1',
      'http://b:8083/recording/status?room_id=r1',
    ]);

    // Worker A is not called again.
    calls = [];
    await gateway.getStatus('r1');
    expect(calls.some((c) => c.url.startsWith('http://a:8083'))).toBe(false);
  });

  it('treats a 409 to a stop as already stopped', async () => {
    routes = (url) =>
      url.startsWith('http://cp:8090/recorder')
        ? json(200, { room_key: 'k', recorder_service_url: 'http://a:8083' })
        : json(409);
    await expect(
      new RecordingVMGateway().stopRecording('r1'),
    ).resolves.toBeUndefined();
  });

  it('bounds every recorder call with a timeout', async () => {
    routes = (url) =>
      url.startsWith('http://cp:8090/recorder')
        ? json(200, { room_key: 'k', recorder_service_url: 'http://a:8083' })
        : json(200, { status: 'recording' });
    await new RecordingVMGateway().getStatus('r1');
    expect(calls.every((c) => c.init?.signal instanceof AbortSignal)).toBe(
      true,
    );
  });

  it('refuses to start when no live runs', async () => {
    routes = () => json(503);
    await expect(
      new RecordingVMGateway().startRecording({ roomId: 'r1', trackId: 'r1' }),
    ).rejects.toThrow('No live is running');
  });
});
