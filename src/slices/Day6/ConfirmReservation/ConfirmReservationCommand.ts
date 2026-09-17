import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day6Events} from '../Day6Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type TableHold = {
    tableNumber: string;
    date: string;
    startTime: string;
    endTime: string;
    reservationCode: string;
};

export type ConfirmReservationCommand = Command<'ConfirmReservation', {
    reservationCode: string;
    tableNumber: string;
}, {
    // The overlap rule spans every guest's reservations, but this command's stream
    // holds only one guest's. The route supplies the table holds it read from
    // TableStatus so `decide` stays pure; holds already visible on this stream are
    // merged in below.
    tableHolds?: TableHold[];
    correlation_id?: string;
    causation_id?: string;
}>;

type KnownReservation = {
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    tableNumber: string | null;
    cancelled: boolean;
};

export type ConfirmReservationState = {
    reservations: Record<string, KnownReservation>;
};

export const ConfirmReservationInitialState = (): ConfirmReservationState => ({reservations: {}});

export const evolve = (
    state: ConfirmReservationState,
    event: Day6Events,
): ConfirmReservationState => {
    switch (event.type) {
        case 'ReservationPlaced':
            return {
                reservations: {
                    ...state.reservations,
                    [event.data.reservationCode]: {
                        eMail: event.data.eMail,
                        date: event.data.date,
                        startTime: event.data.startTime,
                        endTime: event.data.endTime,
                        tableNumber: null,
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

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

const toMinutes = (time: string): number | null => {
    const match = TIME_PATTERN.exec(time);
    if (!match) return null;
    const [, hours, minutes] = match;
    return Number(hours) * 60 + Number(minutes);
};

const overlaps = (a: {startTime: string; endTime: string}, b: {startTime: string; endTime: string}): boolean => {
    const startA = toMinutes(a.startTime);
    const endA = toMinutes(a.endTime);
    const startB = toMinutes(b.startTime);
    const endB = toMinutes(b.endTime);
    if (startA === null || endA === null || startB === null || endB === null) return false;
    // Touching at the edges is not an overlap: 19:00-21:00 and 21:00-23:00 both fit.
    return startA < endB && startB < endA;
};

const holdsFromState = (state: ConfirmReservationState): TableHold[] =>
    Object.entries(state.reservations)
        .filter(([, r]) => r.tableNumber !== null && !r.cancelled)
        .map(([reservationCode, r]) => ({
            reservationCode,
            tableNumber: r.tableNumber as string,
            date: r.date,
            startTime: r.startTime,
            endTime: r.endTime,
        }));

export const decide = (
    command: ConfirmReservationCommand,
    state: ConfirmReservationState,
): Day6Events[] => {
    const {reservationCode, tableNumber} = command.data;

    const reservation = state.reservations[reservationCode];
    if (!reservation) {
        throw {code: 'unknown_reservation_code', message: `No reservation found for ${reservationCode}`};
    }
    if (reservation.cancelled) {
        throw {code: 'reservation_cancelled', message: `Reservation ${reservationCode} was cancelled`};
    }
    if (reservation.tableNumber !== null) {
        throw {code: 'already_confirmed', message: `Reservation ${reservationCode} is already confirmed`};
    }

    const candidateHolds = [...holdsFromState(state), ...(command.metadata?.tableHolds ?? [])];
    const conflict = candidateHolds.find((hold) =>
        hold.reservationCode !== reservationCode
        && hold.tableNumber === tableNumber
        && hold.date === reservation.date
        && overlaps(hold, reservation));

    if (conflict) {
        throw {
            code: 'table_already_held',
            message: `Table ${tableNumber} is already held by ${conflict.reservationCode} on ${reservation.date}`,
        };
    }

    return [{
        type: 'ReservationConfirmed',
        data: {
            reservationCode,
            tableNumber,
            eMail: reservation.eMail,
            date: reservation.date,
            startTime: reservation.startTime,
            endTime: reservation.endTime,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const ConfirmReservationCommandHandler = CommandHandler<ConfirmReservationState, Day6Events>({
    evolve,
    initialState: ConfirmReservationInitialState,
});

export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleConfirmReservation = async (eMail: string, command: ConfirmReservationCommand) => {
    const eventStore = await findEventstore();
    const result = await ConfirmReservationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: ConfirmReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
