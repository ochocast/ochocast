import { S3Client } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

export function createS3Client(): S3Client {
  return new S3Client({
    endpoint: `http://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`,
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    },
    forcePathStyle: true,
  });
}

export const S3_CONFIG = {
  mediaBucket: process.env.STOCK_MEDIA_BUCKET || 'videos',
  miniatureBucket: process.env.STOCK_MINIATURE_BUCKET || 'miniatures',
};
