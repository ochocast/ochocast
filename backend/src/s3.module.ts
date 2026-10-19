import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

// Configuration du client S3 pour Scaleway
const createS3Client = () =>
  new S3Client({
    requestHandler: { connectionTimeout: 10000, socketTimeout: 120000 },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    region: process.env.STOCK_REGION, // Utilise la région Scaleway
    endpoint: process.env.STOCK_SERVER_URL, // Endpoint Scaleway
    credentials: process.env.STOCK_CLIENT_ID
      ? {
          accessKeyId: process.env.STOCK_CLIENT_ID, // Clé d'accès depuis les variables d'environnement
          secretAccessKey: process.env.STOCK_SECRET, // Secret d'accès depuis les variables d'environnement
        }
      : undefined,
    forcePathStyle: process.env.STOCK_FORCE_PATH_STYLE !== 'false',
  });

@Module({
  providers: [
    {
      provide: 's3Client',
      useFactory: createS3Client,
    },
  ],
  exports: ['s3Client'],
})
export class S3Module {}
