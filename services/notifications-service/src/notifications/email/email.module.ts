import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER } from './email-provider.interface';
import { ResendEmailProvider } from './resend-email.provider';
import { ConsoleEmailProvider } from './console-email.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: EMAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const apiKey = configService.get<string>('RESEND_API_KEY', '');
        if (apiKey) {
          return new ResendEmailProvider(configService);
        }
        return new ConsoleEmailProvider();
      },
    },
  ],
  exports: [EMAIL_PROVIDER],
})
export class EmailModule {}
