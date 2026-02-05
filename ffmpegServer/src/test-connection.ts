import 'dotenv/config';
import { createS3Client } from './config/s3.config';
import { QueueService } from './services/queue.service';

async function testConnections() {
  console.log('Testing connections...\n');

  // Test S3
  console.log('Testing S3/Minio connection...');
  try {
    const s3Client = createS3Client();
    const { ListBucketsCommand } = await import('@aws-sdk/client-s3');
    const result = await s3Client.send(new ListBucketsCommand({}));
    console.log(`S3 connected - Found ${result.Buckets?.length || 0} buckets`);
    result.Buckets?.forEach(bucket => {
      console.log(`   - ${bucket.Name}`);
    });
  } catch (error: unknown) {
    console.error('S3 connection failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('');

  // Test RabbitMQ
  console.log('Testing RabbitMQ connection...');
  try {
    const queueService = new QueueService();
    await queueService.connect();
    
    const stats = await queueService.getQueueStats();
    console.log('RabbitMQ connected');
    console.log(`   Queue: ${queueService.getQueueName()}`);
    console.log(`   Messages: ${stats.messageCount}`);
    console.log(`   Consumers: ${stats.consumerCount}`);
    
    await queueService.close();
  } catch (error: unknown) {
    console.error('RabbitMQ connection failed:', error instanceof Error ? error.message : String(error));
  }

  console.log('\nConnection tests completed');
}

testConnections();
