import type {Event} from '@event-driven-io/emmett';

type CommonMeta = {
    stream_name?: string;
    userId?: string;
    correlation_id?: string;
    causation_id?: string;
};

export type ReservationPlaced = Event<'ReservationPlaced', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
}, CommonMeta>;

export type ReservationConfirmed = Event<'ReservationConfirmed', {
    reservationCode: string;
    tableNumber: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
}, CommonMeta>;

export type ReservationCancelled = Event<'ReservationCancelled', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
}, CommonMeta>;

export type ReservationConfirmationSent = Event<'ReservationConfirmationSent', {
    reservationCode: string;
    eMail: string;
    sentAt: string;
}, CommonMeta>;

export type Day6Events =
    | ReservationPlaced
    | ReservationConfirmed
    | ReservationCancelled
    | ReservationConfirmationSent;
