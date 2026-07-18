import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * Talks to Resend's HTTP API directly (https://resend.com/docs/api-reference/emails/send-email).
 * Uses the built-in `fetch` (Node 18+) rather than pulling in an SDK or
 * axios for a single POST request.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey: string;
  private readonly fromAddress: string;

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('RESEND_API_KEY', '');
    this.fromAddress = configService.get<string>(
      'NOTIFICATION_FROM_EMAIL',
      'onboarding@resend.dev',
    );
  }

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Resend API responded with ${response.status}: ${body}`,
      );
    }

    this.logger.log(`Email sent via Resend to ${message.to}`);
  }
}
