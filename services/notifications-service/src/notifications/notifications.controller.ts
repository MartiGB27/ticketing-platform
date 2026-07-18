import { Controller, Inject, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { EMAIL_PROVIDER, EmailProvider } from './email/email-provider.interface';
import { ReservationConfirmedEvent } from './reservation-confirmed.event';

@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
  ) {}

  @EventPattern('reservation.confirmed')
  async handleReservationConfirmed(
    @Payload() data: ReservationConfirmedEvent,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMessage = context.getMessage();

    try {
      this.logger.log(
        `Received reservation.confirmed for reservation ${data.reservationId}`,
      );

      const eventDateFormatted = data.eventDate
        ? new Date(data.eventDate).toLocaleString('en-US', {
            dateStyle: 'full',
            timeStyle: 'short',
          })
        : 'TBD';

      await this.emailProvider.send({
        to: data.userEmail,
        subject: `Your tickets for ${data.eventName} are confirmed!`,
        text: [
          'Hi,',
          '',
          'Your reservation is confirmed. Here are the details:',
          '',
          `Event: ${data.eventName}`,
          `Venue: ${data.eventVenue}`,
          `Date: ${eventDateFormatted}`,
          `Tickets: ${data.quantity}`,
          `Total paid: $${data.totalPrice}`,
          `Reservation ID: ${data.reservationId}`,
          '',
          'See you there!',
        ].join('\n'),
        html: `
          <h2>Your tickets are confirmed!</h2>
          <p><strong>Event:</strong> ${data.eventName}</p>
          <p><strong>Venue:</strong> ${data.eventVenue}</p>
          <p><strong>Date:</strong> ${eventDateFormatted}</p>
          <p><strong>Tickets:</strong> ${data.quantity}</p>
          <p><strong>Total paid:</strong> $${data.totalPrice}</p>
          <p><strong>Reservation ID:</strong> ${data.reservationId}</p>
        `,
      });

      // Only ack once the email attempt succeeds. RabbitMQ holds the
      // message until then — if this process crashes mid-send, the
      // message goes back on the queue for another consumer/retry
      // instead of silently vanishing.
      channel.ack(originalMessage);
    } catch (err) {
      this.logger.error(
        `Failed to process reservation.confirmed for ${data.reservationId}: ${(err as Error).message}`,
      );
      // Explicit nack + requeue, so a transient failure (e.g. the email
      // API being briefly down) isn't silently dropped.
      channel.nack(originalMessage, false, true);
    }
  }
}
