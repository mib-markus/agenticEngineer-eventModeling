import type {Event} from '@event-driven-io/emmett';
import type {
    ReservationCancelled,
    ReservationConfirmed,
    ReservationPlaced,
} from '../Day6/Day6Events';

type CommonMeta = {
    stream_name?: string;
    userId?: string;
    correlation_id?: string;
    causation_id?: string;
};

export type TableBlocked = Event<'TableBlocked', {
    tableNumber: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
}, CommonMeta>;

export type ReservationReleasedAsNoShow = Event<'ReservationReleasedAsNoShow', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
    releasedAt: string;
}, CommonMeta>;

export type NoShowNotificationSent = Event<'NoShowNotificationSent', {
    reservationCode: string;
    eMail: string;
    sentAt: string;
}, CommonMeta>;

export type ReservationReminderSent = Event<'ReservationReminderSent', {
    reservationCode: string;
    eMail: string;
    sentAt: string;
}, CommonMeta>;

// The reservation lifecycle events are Day6's, imported rather than redeclared: Day7's
// rules react to the very events Day6 appends, so the shapes have to stay identical.
export type Day7Events =
    | TableBlocked
    | ReservationReleasedAsNoShow
    | NoShowNotificationSent
    | ReservationReminderSent
    | ReservationPlaced
    | ReservationConfirmed
    | ReservationCancelled;

export type {ReservationPlaced, ReservationConfirmed, ReservationCancelled};
