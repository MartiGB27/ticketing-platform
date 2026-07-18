import { Injectable, Logger } from '@nestjs/common';
import { EmailMessage, EmailProvider } from './email-provider.interface';

/**
 * Fallback used whenever RESEND_API_KEY isn't configured. Lets the whole
 * pipeline (RabbitMQ -> consume -> "send" email) be tested end-to-end
 * with zero external accounts or network access. Swap in
 * ResendEmailProvider by just setting the env var — no code change.
 */
@Injectable()
export class ConsoleEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ConsoleEmailProvider.name);

  async send(message: EmailMessage): Promise<void> {
    this.logger.log(
      [
        '📧 [DRY RUN — no RESEND_API_KEY configured, not sending for real]',
        `To: ${message.to}`,
        `Subject: ${message.subject}`,
        '---',
        message.text,
        '---',
      ].join('\n'),
    );
  }
}
