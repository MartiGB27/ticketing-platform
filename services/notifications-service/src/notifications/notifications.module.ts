import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsController } from './notifications.controller';
import { EmailModule } from './email/email.module';

@Module({
  imports: [ConfigModule, EmailModule],
  controllers: [NotificationsController],
})
export class NotificationsModule {}
