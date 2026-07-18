// This shape must match what notifications-service expects to receive on
// the 'reservation.confirmed' event pattern. Since these are two separate
// services with no shared package, this is duplicated intentionally on
// both sides — see the note in README.md about that trade-off.
export interface ReservationConfirmedEvent {
  reservationId: string;
  userId: string;
  userEmail: string;
  eventId: string;
  eventName: string;
  eventVenue: string;
  eventDate: string; // ISO string — dates don't survive JSON serialization as Date objects
  quantity: number;
  totalPrice: string;
  confirmedAt: string;
}
