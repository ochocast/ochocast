import { createHash, createHmac } from 'node:crypto';

type FetchImplementation = typeof fetch;

export interface ScalewayQueuesClientOptions {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  fetchImplementation?: FetchImplementation;
  /** Only for the development-only SQS emulator on this machine. */
  allowLocalHttp?: boolean;
}

export interface ScalewayQueueMessage {
  messageId: string;
  receiptHandle: string;
  body: string;
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

    const validProtocol =
      options.allowLocalHttp === true
        ? this.endpoint.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(this.endpoint.hostname)
        : this.endpoint.protocol === 'https:';
    if (
      !validProtocol ||
      this.endpoint.username ||
      this.endpoint.password ||
      this.endpoint.search ||
      this.endpoint.hash
    ) {
      throw new Error(
        'Queue endpoint must be HTTPS, or HTTP loopback in local mode',
      );
    }
  }

  async sendMessage(queueUrl: string, message: string): Promise<void> {
    const responseBody = await this.request(queueUrl, 'SendMessage', {
      MessageBody: message,
    });
    if (
      !/<(?:[\w.-]+:)?MessageId>[^<]+<\/(?:[\w.-]+:)?MessageId>/.test(
        responseBody,
      )
    ) {
      throw new Error('Scaleway Queues returned no SendMessage MessageId');
    }
  }

  /** One long-poll only: used by the manually launched local bridge. */
  async receiveMessage(
    queueUrl: string,
  ): Promise<ScalewayQueueMessage | undefined> {
    const responseBody = await this.request(
      queueUrl,
      'ReceiveMessage',
      { MaxNumberOfMessages: '1', WaitTimeSeconds: '10' },
      25000,
    );
    if (
      !/<(?:[\w.-]+:)?ReceiveMessageResponse(?:\s[^>]*)?\/?>/.test(responseBody)
    ) {
      throw new Error('Invalid Scaleway Queues ReceiveMessage response');
    }
    const message = responseBody.match(
      /<(?:[\w.-]+:)?Message>([\s\S]*?)<\/(?:[\w.-]+:)?Message>/,
    );
    if (!message) return undefined;
    return {
      messageId: xmlField(message[1], 'MessageId'),
      receiptHandle: xmlField(message[1], 'ReceiptHandle'),
      body: xmlField(message[1], 'Body'),
    };
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    const responseBody = await this.request(queueUrl, 'DeleteMessage', {
      ReceiptHandle: receiptHandle,
    });
    // ElasticMQ's SQS Query implementation uses a named wrapper for this
    // otherwise empty success response. Never accept it for real Scaleway.
    if (
      this.endpoint.protocol === 'http:' &&
      /<wrapper\b[^>]*\bname="DeleteMessageResponse"[^>]*>[\s\S]*<\/wrapper>/.test(
        responseBody,
      )
    ) {
      return;
    }
    if (
      !/<(?:[\w.-]+:)?DeleteMessageResponse(?:\s[^>]*)?\/?>/.test(responseBody)
    ) {
      throw new Error('Invalid Scaleway Queues DeleteMessage response');
    }
  }

  private async request(
    queueUrl: string,
    action: string,
    parameters: Record<string, string>,
    timeoutMs = 10000,
  ): Promise<string> {
    const target = new URL(queueUrl);
    if (
      target.protocol !== this.endpoint.protocol ||
      target.origin !== this.endpoint.origin ||
      target.username ||
      target.password ||
      target.search ||
      target.hash
    ) {
      throw new Error('Scaleway queue URL must use the configured endpoint');
    }

    const body = new URLSearchParams({
      Action: action,
      QueueUrl: target.toString(),
      ...parameters,
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
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `Scaleway Queues rejected ${action} (${response.status}): ${responseBody.slice(0, 500)}`,
      );
    }
    return response.text();
  }
}

function xmlField(
  xml: string,
  name: 'MessageId' | 'ReceiptHandle' | 'Body',
): string {
  const field = xml.match(
    new RegExp(`<(?:[\\w.-]+:)?${name}>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`),
  );
  if (!field) throw new Error(`Missing ${name} in Scaleway Queues response`);
  return field[1].replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|(amp|lt|gt|quot|apos));/g,
    (_match, hex: string, decimal: string, entity: string) => {
      if (hex || decimal) {
        const point = parseInt(hex || decimal, hex ? 16 : 10);
        if (point > 0x10ffff) throw new Error('Invalid XML character');
        return String.fromCodePoint(point);
      }
      switch (entity) {
        case 'amp':
          return '&';
        case 'lt':
          return '<';
        case 'gt':
          return '>';
        case 'quot':
          return '"';
        case 'apos':
          return "'";
        default:
          throw new Error('Invalid XML entity');
      }
    },
  );
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
