import 'dotenv/config'; // loads .env into process.env before we read it below
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as NestLogger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const rabbitmqUrl = process.env.RABBITMQ_URL ?? 'amqp://localhost:5672';

  // This service never opens an HTTP port. It is a pure message
  // consumer: no controller here can be reached by a browser or Postman,
  // only by messages arriving on the RabbitMQ queue below.
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [rabbitmqUrl],
        queue: 'reservations_events_queue',
        queueOptions: { durable: true },
        noAck: false, // manual ack — see NotificationsController
      },
      bufferLogs: true,
    },
  );

  app.useLogger(app.get(Logger));

  await app.listen();
  new NestLogger('Bootstrap').log(
    'notifications-service listening on RabbitMQ queue "reservations_events_queue"',
  );
}
bootstrap();
