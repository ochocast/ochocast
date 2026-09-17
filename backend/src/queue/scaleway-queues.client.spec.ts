import { ScalewayQueuesClient } from './scaleway-queues.client';

describe('ScalewayQueuesClient', () => {
  it('sends a signed native HTTP request to the Scaleway queue endpoint', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn(),
    });
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation,
    });

    await client.sendMessage(
      'https://sqs.mnq.fr-par.scaleway.com/project/queue',
      JSON.stringify({ jobId: 'job-1' }),
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImplementation.mock.calls[0];
    expect(String(url)).toBe(
      'https://sqs.mnq.fr-par.scaleway.com/project/queue',
    );
    expect(request.method).toBe('POST');
    expect(request.headers.authorization).toMatch(
      /^AWS4-HMAC-SHA256 Credential=SCWTESTACCESS\//,
    );
    expect(request.headers['x-amz-content-sha256']).toHaveLength(64);
    expect(request.body).toContain('Action=SendMessage');
    expect(request.body).toContain('Version=2012-11-05');
  });

  it('rejects a queue URL from another origin', async () => {
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation: jest.fn(),
    });

    await expect(
      client.sendMessage('https://example.com/queue', 'message'),
    ).rejects.toThrow('configured endpoint');
  });
});
