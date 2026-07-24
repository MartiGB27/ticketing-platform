import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger, ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  // bufferLogs holds any log calls made before app.useLogger() runs
  // below, so nothing from early bootstrap is lost or printed in
  // Nest's default text format before pino takes over.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Hands the app's logging over to pino. From this point on, every
  // `new Logger(ClassName.name)` call anywhere in the codebase — no
  // changes needed to those files — outputs structured JSON instead of
  // the default colored text.
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
  new NestLogger('Bootstrap').log(`users-service listening on port ${port}`);
}
bootstrap();
