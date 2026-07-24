import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableCors();

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new NestLogger('Bootstrap').log(`events-service listening on port ${port}`);
}
bootstrap();
