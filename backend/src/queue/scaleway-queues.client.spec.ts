import { ScalewayQueuesClient } from './scaleway-queues.client';

describe('ScalewayQueuesClient', () => {
  it('sends a signed native HTTP request to the Scaleway queue endpoint', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest
        .fn()
        .mockResolvedValue(
          '<SendMessageResponse><SendMessageResult><MessageId>message-1</MessageId></SendMessageResult></SendMessageResponse>',
        ),
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
    expect(new URLSearchParams(request.body).get('QueueUrl')).toBe(
      'https://sqs.mnq.fr-par.scaleway.com/project/queue',
    );
    expect(new URLSearchParams(request.body).get('MessageBody')).toBe(
      JSON.stringify({ jobId: 'job-1' }),
    );
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

  it('allows HTTP only for an explicitly enabled loopback emulator', async () => {
    const fetchImplementation = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: jest
        .fn()
        .mockResolvedValue(
          '<SendMessageResponse><MessageId>local-message</MessageId></SendMessageResponse>',
        ),
    });
    const options = {
      endpoint: 'http://127.0.0.1:9324',
      region: 'fr-par',
      accessKey: 'local',
      secretKey: 'local',
      fetchImplementation,
    };
    expect(() => new ScalewayQueuesClient(options)).toThrow('HTTPS');
    expect(
      () =>
        new ScalewayQueuesClient({
          ...options,
          endpoint: 'http://queue.example:9324',
          allowLocalHttp: true,
        }),
    ).toThrow('HTTPS');
    expect(
      () =>
        new ScalewayQueuesClient({
          ...options,
          endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
          allowLocalHttp: true,
        }),
    ).toThrow('HTTP loopback');
    const client = new ScalewayQueuesClient({
      ...options,
      allowLocalHttp: true,
    });
    await client.sendMessage(
      'http://127.0.0.1:9324/000000000000/ochocast-local-ffmpeg',
      'local job',
    );
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
    expect(String(fetchImplementation.mock.calls[0][0])).toContain(
      '127.0.0.1:9324',
    );
  });

  it('accepts ElasticMQ named DeleteMessage acknowledgment only in local mode', async () => {
    const response =
      '<wrapper name="DeleteMessageResponse"><ResponseMetadata/></wrapper>';
    const options = {
      endpoint: 'http://127.0.0.1:9324',
      region: 'fr-par',
      accessKey: 'local',
      secretKey: 'local',
      allowLocalHttp: true,
      fetchImplementation: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(response),
      }),
    };
    await expect(
      new ScalewayQueuesClient(options).deleteMessage(
        'http://127.0.0.1:9324/000000000000/ochocast-local-ffmpeg',
        'receipt',
      ),
    ).resolves.toBeUndefined();
    await expect(
      new ScalewayQueuesClient({
        ...options,
        endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
        allowLocalHttp: false,
      }).deleteMessage(
        'https://sqs.mnq.fr-par.scaleway.com/project/queue',
        'receipt',
      ),
    ).rejects.toThrow('DeleteMessage response');
  });

  it('rejects an unconfirmed publication even when Scaleway returns HTTP 200', async () => {
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('<Error>unexpected</Error>'),
      }),
    });
    await expect(
      client.sendMessage(
        'https://sqs.mnq.fr-par.scaleway.com/project/queue',
        'job',
      ),
    ).rejects.toThrow('MessageId');
  });

  it('rejects a queue URL with unsigned query parameters', async () => {
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation: jest.fn(),
    });
    await expect(
      client.sendMessage(
        'https://sqs.mnq.fr-par.scaleway.com/project/queue?bad=1',
        'job',
      ),
    ).rejects.toThrow('configured endpoint');
  });

  it('receives one Scaleway message and acknowledges it with its receipt handle', async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue(
            '<ReceiveMessageResponse><ReceiveMessageResult><Message><MessageId>message-1</MessageId><ReceiptHandle>receipt&amp;1</ReceiptHandle><Body>{&quot;job&quot;:&quot;x&amp;y&quot;}</Body></Message></ReceiveMessageResult></ReceiveMessageResponse>',
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('<DeleteMessageResponse/>'),
      });
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation,
    });
    const queueUrl =
      'https://sqs.mnq.fr-par.scaleway.com/project/ochocast-local-ffmpeg';

    const message = await client.receiveMessage(queueUrl);
    expect(message).toEqual({
      messageId: 'message-1',
      receiptHandle: 'receipt&1',
      body: '{"job":"x&y"}',
    });
    expect(
      new URLSearchParams(fetchImplementation.mock.calls[0][1].body).get(
        'Action',
      ),
    ).toBe('ReceiveMessage');
    expect(
      new URLSearchParams(fetchImplementation.mock.calls[0][1].body).get(
        'WaitTimeSeconds',
      ),
    ).toBe('10');
    await client.deleteMessage(queueUrl, message.receiptHandle);
    const deleteRequest = new URLSearchParams(
      fetchImplementation.mock.calls[1][1].body,
    );
    expect(deleteRequest.get('Action')).toBe('DeleteMessage');
    expect(deleteRequest.get('ReceiptHandle')).toBe('receipt&1');
  });

  it('returns no job when the queue is empty and rejects malformed responses', async () => {
    const fetchImplementation = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest
          .fn()
          .mockResolvedValue(
            '<ReceiveMessageResponse><ReceiveMessageResult/></ReceiveMessageResponse>',
          ),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue('<Error>unexpected</Error>'),
      });
    const client = new ScalewayQueuesClient({
      endpoint: 'https://sqs.mnq.fr-par.scaleway.com',
      region: 'fr-par',
      accessKey: 'SCWTESTACCESS',
      secretKey: 'test-secret',
      fetchImplementation,
    });
    const queueUrl =
      'https://sqs.mnq.fr-par.scaleway.com/project/ochocast-local-ffmpeg';
    await expect(client.receiveMessage(queueUrl)).resolves.toBeUndefined();
    await expect(client.receiveMessage(queueUrl)).rejects.toThrow(
      'ReceiveMessage response',
    );
  });
});
