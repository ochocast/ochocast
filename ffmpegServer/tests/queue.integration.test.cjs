const { test } = require('node:test');
const assert = require('node:assert/strict');
const amqp = require('amqplib');
const { randomUUID } = require('node:crypto');
const { QueueService } = require('../dist/services/queue.service');

test('broker disconnect invalidates readiness and old deliveries; redelivery can confirm result before ack', { skip: !process.env.UPLOAD_TEST_RABBITMQ_URL }, async () => {
  process.env.RABBITMQ_URL = process.env.UPLOAD_TEST_RABBITMQ_URL;
  const id = randomUUID();
  process.env.VIDEO_QUEUE_NAME = `upload-test-${id}`; process.env.VIDEO_RESULT_QUEUE_NAME = `result-test-${id}`;
  const producer = await amqp.connect(process.env.RABBITMQ_URL); const channel = await producer.createConfirmChannel();
  const queue = new QueueService();
  try {
    await queue.connect(); let delivery;
    const received = new Promise(resolve => { delivery = resolve; });
    await queue.consumeJobs(async (job, message) => delivery({ job, message }));
    assert.equal(queue.ready, true);
    const job = { jobId: randomUUID(), videoId: randomUUID() }; job.originalKey = `${job.videoId}/source/original`;
    channel.sendToQueue(process.env.VIDEO_QUEUE_NAME, Buffer.from(JSON.stringify(job)), { persistent: true }); await channel.waitForConfirms();
    const first = await received;
    let disconnected = false; queue.onDisconnect = () => { disconnected = true; };
    await queue.connection.close();
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(queue.ready, false); assert.equal(disconnected, true);
    await queue.connect();
    await assert.rejects(queue.publishResult({ ...job, success: true }, first.message), /connection lost/);
    const redelivered = new Promise(resolve => { delivery = resolve; });
    await queue.consumeJobs(async (job, message) => delivery({ job, message }));
    const second = await redelivered;
    assert.equal(second.message.fields.redelivered, true);
    await queue.publishResult({ ...job, success: true, duration: 12 }, second.message);
    queue.ackJob(second.message);
    assert.ok(await channel.get(process.env.VIDEO_RESULT_QUEUE_NAME, { noAck: true }));
    await queue.stopConsuming(); assert.equal(queue.ready, false);
  } finally {
    await queue.close();
    await channel.deleteQueue(process.env.VIDEO_QUEUE_NAME); await channel.deleteQueue(process.env.VIDEO_RESULT_QUEUE_NAME);
    await producer.close();
  }
});
