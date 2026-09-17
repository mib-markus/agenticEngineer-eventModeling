import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day6Events} from '../Day6Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type CancelReservationCommand = Command<'CancelReservation', {
    reservationCode: string;
}, {
    // The cancellation deadline is relative to the reservation's start, so `decide`
    // needs a clock. It arrives from the caller to keep `decide` pure and its tests
    // anchored to the board's 2026 example dates.
    now: Date;
    correlation_id?: string;
    causation_id?: string;
}>;

type KnownReservation = {
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
    cancelled: boolean;
};

export type CancelReservationState = {
    reservations: Record<string, KnownReservation>;
};

export const CancelReservationInitialState = (): CancelReservationState => ({reservations: {}});

export const evolve = (
    state: CancelReservationState,
    event: Day6Events,
): CancelReservationState => {
    switch (event.type) {
        case 'ReservationPlaced':
            return {
                reservations: {
                    ...state.reservations,
                    [event.data.reservationCode]: {
                        eMail: event.data.eMail,
                        date: event.data.date,
                        startTime: event.data.startTime,
                        tableNumber: '',
                        cancelled: false,
                    },
                },
            };

        case 'ReservationConfirmed': {
            const existing = state.reservations[event.data.reservationCode];
            if (!existing) return state;
            return {
                reservations: {
                    ...state.reservations,
                    [event.data.reservationCode]: {...existing, tableNumber: event.data.tableNumber},
                },
            };
        }

        case 'ReservationCancelled': {
            const existing = state.reservations[event.data.reservationCode];
            if (!existing) return state;
            return {
                reservations: {
                    ...state.reservations,
                    [event.data.reservationCode]: {...existing, cancelled: true},
                },
            };
        }

        default:
            return state;
    }
};

const DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const CANCELLATION_NOTICE_MINUTES = 120;

// Both sides of the deadline comparison are wall-clock readings, so they are projected
// into one fixed frame rather than a real timezone — this keeps the arithmetic correct
// across month and year boundaries without importing a date library.
const wallClock = (year: number, month: number, day: number, hours: number, minutes: number): number =>
    Date.UTC(year, month - 1, day, hours, minutes);

const reservationStart = (date: string, startTime: string): number | null => {
    const day = DATE_PATTERN.exec(date);
    const time = TIME_PATTERN.exec(startTime);
    if (!day || !time) return null;
    return wallClock(Number(day[3]), Number(day[2]), Number(day[1]), Number(time[1]), Number(time[2]));
};

const asWallClock = (now: Date): number =>
    wallClock(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());

export const decide = (
    command: CancelReservationCommand,
    state: CancelReservationState,
): Day6Events[] => {
    const {reservationCode} = command.data;

    const reservation = state.reservations[reservationCode];
    if (!reservation) {
        throw {code: 'unknown_reservation_code', message: `No reservation exists for code ${reservationCode}`};
    }
    if (reservation.cancelled) {
        throw {code: 'already_cancelled', message: `Reservation ${reservationCode} has already been cancelled`};
    }

    const start = reservationStart(reservation.date, reservation.startTime);
    if (start === null) {
        throw {code: 'unknown_reservation_code', message: `Reservation ${reservationCode} has no usable start time`};
    }

    // One rule, not two: cancelling after the reservation has started is simply further
    // past the same deadline, which is why the board gives both scenarios the same
    // "cancellation closed at 17:00" description.
    const deadline = start - CANCELLATION_NOTICE_MINUTES * 60 * 1000;
    if (asWallClock(command.metadata.now) > deadline) {
        throw {
            code: 'cancellation_window_closed',
            message: `${reservationCode} starts at ${reservation.startTime} on ${reservation.date}`
                + ` - cancellation closed ${CANCELLATION_NOTICE_MINUTES} minutes before that`,
        };
    }

    return [{
        type: 'ReservationCancelled',
        data: {
            reservationCode,
            eMail: reservation.eMail,
            date: reservation.date,
            startTime: reservation.startTime,
            tableNumber: reservation.tableNumber,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const CancelReservationCommandHandler = CommandHandler<CancelReservationState, Day6Events>({
    evolve,
    initialState: CancelReservationInitialState,
});

export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleCancelReservation = async (eMail: string, command: CancelReservationCommand) => {
    const eventStore = await findEventstore();
    const result = await CancelReservationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: CancelReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
