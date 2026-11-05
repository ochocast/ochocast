import { Logger } from '@nestjs/common';
import { RecordingVMGateway } from 'src/recording/infra/gateways/recording-vm.gateway';

describe('recording worker discovery logging', () => {
  it('does not log the stream key returned by the control plane', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => {});
    const originalFetch = global.fetch;
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sfu_url: 'http://worker:8090',
          room_key: 'secret-room-key',
        }),
      })
      .mockResolvedValueOnce({ ok: true }) as unknown as typeof fetch;
    try {
      await new RecordingVMGateway().startRecording({
        roomId: 'room-1',
        trackId: 'room-1',
      });
      expect(JSON.stringify(log.mock.calls)).not.toContain('secret-room-key');
    } finally {
      global.fetch = originalFetch;
      log.mockRestore();
    }
  });
});
