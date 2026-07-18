import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';

export const NOTIFICATIONS_CLIENT = 'NOTIFICATIONS_CLIENT';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: NOTIFICATIONS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
            queue: 'reservations_events_queue',
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class MessagingModule {}
