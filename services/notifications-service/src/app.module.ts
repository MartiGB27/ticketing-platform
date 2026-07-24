import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    // No `pinoHttp` config here on purpose: this service never receives
    // an HTTP request, so there's nothing for pino-http's automatic
    // request logging to attach to. This just gives every existing
    // `new Logger(ClassName.name)` call structured JSON output, same as
    // the other three services.
    LoggerModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    NotificationsModule,
  ],
})
export class AppModule {}
