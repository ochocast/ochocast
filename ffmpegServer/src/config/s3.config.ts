import { S3Client } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

// An S3 request still waiting for its response this long after the socket
// went idle (an upload or a request left unanswered) fails, and the SDK
// retries it, instead of hanging until the job deadline. A download whose body
// stalls after its headers is not covered: that is before encoding, where the
// job deadline is retried. requestTimeout would only log in this SDK version.
const S3_IDLE_TIMEOUT_MS = 120000;

export function createS3Client(idleTimeoutMs = S3_IDLE_TIMEOUT_MS): S3Client {
  return new S3Client({
    requestHandler: { connectionTimeout: 10000, socketTimeout: idleTimeoutMs },
    endpoint:
      process.env.STOCK_SERVER_URL ||
      `${process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http'}://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}`,
    region: process.env.STOCK_REGION || 'us-east-1',
    credentials: {
      accessKeyId:
        process.env.STOCK_CLIENT_ID ||
        process.env.MINIO_ACCESS_KEY ||
        'minioadmin',
      secretAccessKey:
        process.env.STOCK_SECRET ||
        process.env.MINIO_SECRET_KEY ||
        'minioadmin',
    },
    forcePathStyle: true,
  });
}

export const S3_CONFIG = {
  mediaBucket: process.env.STOCK_MEDIA_BUCKET || 'media',
  miniatureBucket: process.env.STOCK_MINIATURE_BUCKET || 'miniature',
};
