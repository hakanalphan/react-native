import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
  });
  await app.listen(3000);
  // eslint-disable-next-line no-console
  console.log(`Signaling server running on http://localhost:3000`);
}

bootstrap();


