import { Injectable, Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';

// Configuration du client S3 pour Scaleway
const s3Client = new S3Client({
  region: process.env.STOCK_REGION, // Utilise la région Scaleway
  endpoint: process.env.STOCK_SERVER_URL, // Endpoint Scaleway
  credentials: {
    accessKeyId: process.env.STOCK_CLIENT_ID, // Clé d'accès depuis les variables d'environnement
    secretAccessKey: process.env.STOCK_SECRET, // Secret d'accès depuis les variables d'environnement
  },
  forcePathStyle: true, // Obligatoire pour compatibilité avec Scaleway
});

@Module({
  providers: [
    {
      provide: 's3Client',
      useValue: s3Client,
    },
  ],
  exports: ['s3Client'],
})
export class S3Module {}
