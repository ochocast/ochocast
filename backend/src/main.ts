import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { corsOrigins } from './common/cors';
import { RedisIoAdapter } from './chat/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: corsOrigins(),
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization',
    },
  });

  app.enableShutdownHooks();

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('ochocast API')
    .setDescription(
      'Be wary, all routes are prefixed by /api and are protected by Keycloak. You need to be authenticated to use them.',
    )
    .setVersion('1.0')
    .addTag('Events')
    .addTag('Tracks')
    .addTag('Users')
    .addTag('Videos')
    .addTag('Comments')
    .addTag('Tags')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  app.setGlobalPrefix('api');

  // Several backend replicas share chat rooms through Redis.
  if (process.env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app, process.env.REDIS_URL);
    await adapter.connect();
    app.useWebSocketAdapter(adapter);
  }

  // Lets Kubernetes stop the pod cleanly (SIGTERM): finish requests, close the database.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT);
}
bootstrap();
