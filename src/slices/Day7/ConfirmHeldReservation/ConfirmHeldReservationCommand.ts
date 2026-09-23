import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type ConfirmHeldReservationCommand = Command<'ConfirmHeldReservation', {
    reservationCode: string;
    tableNumber: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

type Hold = {
    released: boolean;
    confirmed: boolean;
};

export type ConfirmHeldReservationState = {
    holds: Record<string, Hold>;
};

export const ConfirmHeldReservationInitialState = (): ConfirmHeldReservationState => ({holds: {}});

export const evolve = (
    state: ConfirmHeldReservationState,
    event: Day7Events,
): ConfirmHeldReservationState => {
    switch (event.type) {
        case 'TableHeldForReservation':
            return {
                holds: {
                    ...state.holds,
                    [event.data.reservationCode]: {released: false, confirmed: false},
                },
            };

        case 'TableHoldReleased': {
            const existing = state.holds[event.data.reservationCode];
            if (!existing) return state;
            return {
                holds: {...state.holds, [event.data.reservationCode]: {...existing, released: true}},
            };
        }

        case 'ReservationConfirmed': {
            const existing = state.holds[event.data.reservationCode];
            if (!existing) return state;
            return {
                holds: {...state.holds, [event.data.reservationCode]: {...existing, confirmed: true}},
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: ConfirmHeldReservationCommand,
    state: ConfirmHeldReservationState,
): Day7Events[] => {
    const {reservationCode, tableNumber, eMail, date, startTime, endTime} = command.data;

    const hold = state.holds[reservationCode];
    if (!hold) {
        throw {
            code: 'hold_not_found',
            message: `Table ${tableNumber} is not held for reservation ${reservationCode} -`
                + ' a reservation is only ever confirmed automatically out of a hold',
        };
    }
    if (hold.released) {
        throw {
            code: 'hold_already_released',
            message: `Table ${tableNumber} is no longer held for reservation ${reservationCode} -`
                + ' the hold was released, so there is nothing to confirm',
        };
    }
    if (hold.confirmed) {
        throw {
            code: 'already_confirmed',
            message: `Reservation ${reservationCode} is already confirmed for table ${tableNumber}`,
        };
    }

    return [{
        type: 'ReservationConfirmed',
        data: {reservationCode, tableNumber, eMail, date, startTime, endTime},
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const ConfirmHeldReservationCommandHandler = CommandHandler<ConfirmHeldReservationState, Day7Events>({
    evolve,
    initialState: ConfirmHeldReservationInitialState,
});

// A held reservation's checks depend on TableHeldForReservation/TableHoldReleased, which
// live on the table stream - so this command replays and appends there too, the same
// stream BlockTable/HoldTableForReservation already use.
export const streamNameFor = (tableNumber: string) => `Day7-table-${tableNumber}`;

export const handleConfirmHeldReservation = async (
    tableNumber: string,
    command: ConfirmHeldReservationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await ConfirmHeldReservationCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: ConfirmHeldReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
