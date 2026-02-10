import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: [
        'http://localhost:3000',
        //'https://prod-frontend.s3-website.fr-par.scw.cloud',
        'https://demo.ochocast.fr',
      ],
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type, Authorization',
    },
  });

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
  await app.listen(process.env.PORT);
}
bootstrap();
