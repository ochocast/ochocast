import { Injectable, Module } from '@nestjs/common';
import { S3Client } from "@aws-sdk/client-s3";


// Configuration du client S3 pour Scaleway
const s3Client = new S3Client({
  region: 'fr-par', //process.env.STOCK_REGION || "fr-par", // Utilise la région Scaleway
  endpoint: 'https://s3.fr-par.scw.cloud', // process.env.STOCK_SERVER_URL, // Endpoint Scaleway
  credentials: {
    accessKeyId: "SCWR21H6KS2BCEWGRYDE", //process.env.STOCK_CLIENT_ID, // Clé d'accès depuis les variables d'environnement
    secretAccessKey: "215ab8da-3e3e-4789-898e-31ded4f5ad73" //process.env.STOCK_SECRET, // Secret d'accès depuis les variables d'environnement
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

