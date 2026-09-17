import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type ReleaseNoShowReservationCommand = Command<'ReleaseNoShowReservation', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    tableNumber: string;
}, {
    // The board generates releasedAt when the grace period expired, so the automation
    // supplies it rather than `decide` reading the clock.
    releasedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

type KnownReservation = {
    confirmed: boolean;
    cancelled: boolean;
    released: boolean;
};

export type ReleaseNoShowReservationState = {
    reservations: Record<string, KnownReservation>;
};

export const ReleaseNoShowReservationInitialState = (): ReleaseNoShowReservationState => ({reservations: {}});

const known = (state: ReleaseNoShowReservationState, reservationCode: string): KnownReservation =>
    state.reservations[reservationCode] ?? {confirmed: false, cancelled: false, released: false};

export const evolve = (
    state: ReleaseNoShowReservationState,
    event: Day7Events,
): ReleaseNoShowReservationState => {
    const patch = (reservationCode: string, changes: Partial<KnownReservation>) => ({
        reservations: {
            ...state.reservations,
            [reservationCode]: {...known(state, reservationCode), ...changes},
        },
    });

    switch (event.type) {
        case 'ReservationConfirmed':
            return patch(event.data.reservationCode, {confirmed: true});
        case 'ReservationCancelled':
            return patch(event.data.reservationCode, {cancelled: true});
        case 'ReservationReleasedAsNoShow':
            return patch(event.data.reservationCode, {released: true});
        default:
            return state;
    }
};

export const decide = (
    command: ReleaseNoShowReservationCommand,
    state: ReleaseNoShowReservationState,
): Day7Events[] => {
    const {reservationCode, eMail, date, startTime, tableNumber} = command.data;
    const reservation = known(state, reservationCode);

    if (reservation.released) {
        throw {
            code: 'already_released',
            message: `Reservation ${reservationCode} has already been released as a no-show`,
        };
    }
    if (reservation.cancelled) {
        throw {
            code: 'reservation_cancelled',
            message: `Reservation ${reservationCode} was cancelled - a cancelled reservation`
                + ' already freed its table, so there is no no-show to release',
        };
    }
    if (!reservation.confirmed) {
        throw {
            code: 'reservation_not_confirmed',
            message: `Reservation ${reservationCode} holds no table, so it cannot be released`,
        };
    }

    return [{
        type: 'ReservationReleasedAsNoShow',
        data: {
            reservationCode,
            eMail,
            date,
            startTime,
            tableNumber,
            releasedAt: command.metadata.releasedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const ReleaseNoShowReservationCommandHandler =
    CommandHandler<ReleaseNoShowReservationState, Day7Events>({
        evolve,
        initialState: ReleaseNoShowReservationInitialState,
    });

// The reservation aggregate lives on the guest's Day6 stream — the release has to be
// appended there, or the confirmation this command validates against is invisible and
// Day6's own read models never see the table being freed.
export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleReleaseNoShowReservation = async (
    eMail: string,
    command: ReleaseNoShowReservationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await ReleaseNoShowReservationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: ReleaseNoShowReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
