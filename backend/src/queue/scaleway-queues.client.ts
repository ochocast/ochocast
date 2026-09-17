import { createHash, createHmac } from 'node:crypto';

type FetchImplementation = typeof fetch;

export interface ScalewayQueuesClientOptions {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  fetchImplementation?: FetchImplementation;
}

/**
 * Minimal native client for Scaleway Queues.
 *
 * Scaleway exposes the queue data plane through the SQS wire protocol. We
 * sign the HTTP request here so the application does not depend on an AWS
 * SDK or on AWS infrastructure.
 */
export class ScalewayQueuesClient {
  private readonly endpoint: URL;
  private readonly region: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly fetchImplementation: FetchImplementation;

  constructor(options: ScalewayQueuesClientOptions) {
    this.endpoint = new URL(options.endpoint);
    this.region = options.region;
    this.accessKey = options.accessKey;
    this.secretKey = options.secretKey;
    this.fetchImplementation = options.fetchImplementation || fetch;

    if (this.endpoint.protocol !== 'https:') {
      throw new Error('Scaleway Queues endpoint must use HTTPS');
    }
  }

  async sendMessage(queueUrl: string, message: string): Promise<void> {
    const target = new URL(queueUrl);
    if (
      target.protocol !== 'https:' ||
      target.origin !== this.endpoint.origin
    ) {
      throw new Error('Scaleway queue URL must use the configured endpoint');
    }

    const body = new URLSearchParams({
      Action: 'SendMessage',
      MessageBody: message,
      Version: '2012-11-05',
    }).toString();
    const payloadHash = sha256(body);
    const amzDate = formatAmzDate(new Date());
    const date = amzDate.slice(0, 8);
    const headers = {
      'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
      host: target.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
    };
    const signedHeaders = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map(
        (name) => `${name}:${headers[name as keyof typeof headers].trim()}\n`,
      )
      .join('');
    const canonicalRequest = [
      'POST',
      canonicalUri(target.pathname),
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');
    const scope = `${date}/${this.region}/sqs/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = hmac(
      signingKey(this.secretKey, date, this.region),
      stringToSign,
    ).toString('hex');
    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await this.fetchImplementation(target, {
      method: 'POST',
      headers: { ...headers, authorization },
      body,
    });
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Scaleway Queues rejected SendMessage (${response.status}): ${responseBody.slice(0, 500)}`,
      );
    }
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 'sqs');
  return hmac(serviceKey, 'aws4_request');
}

function formatAmzDate(value: Date): string {
  return value
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, '')
    .replace('Z', 'Z');
}

function canonicalUri(pathname: string): string {
  return (
    pathname
      .split('/')
      .map((part) =>
        encodeURIComponent(part).replace(
          /[!'()*]/g,
          (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
        ),
      )
      .join('/') || '/'
  );
}
