// Must match ReservationConfirmedEvent in reservations-service exactly.
// Duplicated intentionally — see the note in README.md about why these
// services don't share a package.
export interface ReservationConfirmedEvent {
  reservationId: string;
  userId: string;
  userEmail: string;
  eventId: string;
  eventName: string;
  eventVenue: string;
  eventDate: string;
  quantity: number;
  totalPrice: string;
  confirmedAt: string;
}
