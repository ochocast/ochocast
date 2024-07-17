import { Injectable, Module } from '@nestjs/common';
import { S3Client } from "@aws-sdk/client-s3";


const s3Client = new S3Client({
  region: "eu-west",
  endpoint: process.env.STOCK_SERVER_URL,
  credentials: {
    accessKeyId: process.env.STOCK_CLIENT_ID,
    secretAccessKey: process.env.STOCK_SECRET,
  },
  forcePathStyle: true,
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

