import { S3Client } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

export function createS3Client(): S3Client {
  return new S3Client({
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
