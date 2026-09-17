import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type SendReservationReminderCommand = Command<'SendReservationReminder', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
}, {
    // sentAt is `generated: true` on the event: the caller stamps it so `decide` stays
    // pure and the tests can assert an exact value.
    sentAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

type KnownReservation = {
    cancelled: boolean;
    reminded: boolean;
};

export type SendReservationReminderState = {
    reservations: Record<string, KnownReservation>;
};

export const SendReservationReminderInitialState = (): SendReservationReminderState => ({reservations: {}});

const known = (state: SendReservationReminderState, reservationCode: string): KnownReservation =>
    state.reservations[reservationCode] ?? {cancelled: false, reminded: false};

export const evolve = (
    state: SendReservationReminderState,
    event: Day7Events,
): SendReservationReminderState => {
    const patch = (reservationCode: string, changes: Partial<KnownReservation>) => ({
        reservations: {
            ...state.reservations,
            [reservationCode]: {...known(state, reservationCode), ...changes},
        },
    });

    switch (event.type) {
        case 'ReservationCancelled':
            return patch(event.data.reservationCode, {cancelled: true});
        case 'ReservationReminderSent':
            return patch(event.data.reservationCode, {reminded: true});
        default:
            return state;
    }
};

export const decide = (
    command: SendReservationReminderCommand,
    state: SendReservationReminderState,
): Day7Events[] => {
    const {reservationCode, eMail} = command.data;
    const reservation = known(state, reservationCode);

    // The automation delivers at least once, so a redelivery must not send a second
    // reminder — this check is what makes it idempotent.
    if (reservation.reminded) {
        throw {
            code: 'reminder_already_sent',
            message: `A reminder for ${reservationCode} has already been sent`,
        };
    }
    // The row may already have been in flight when the cancellation arrived.
    if (reservation.cancelled) {
        throw {
            code: 'reservation_cancelled',
            message: `Reservation ${reservationCode} was cancelled - no reminder is sent`,
        };
    }

    return [{
        type: 'ReservationReminderSent',
        data: {
            reservationCode,
            eMail,
            sentAt: command.metadata.sentAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const SendReservationReminderCommandHandler =
    CommandHandler<SendReservationReminderState, Day7Events>({
        evolve,
        initialState: SendReservationReminderInitialState,
    });

// The guest's Day6 stream — where the confirmation this reminder follows was appended,
// and where a cancellation would be visible.
export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleSendReservationReminder = async (
    eMail: string,
    command: SendReservationReminderCommand,
) => {
    const eventStore = await findEventstore();
    const result = await SendReservationReminderCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: SendReservationReminderState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
