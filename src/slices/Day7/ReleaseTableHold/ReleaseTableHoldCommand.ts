import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type ReleaseTableHoldCommand = Command<'ReleaseTableHold', {
    tableNumber: string;
    reservationCode: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

type Hold = {
    released: boolean;
    confirmed: boolean;
};

export type ReleaseTableHoldState = {
    holds: Record<string, Hold>;
};

export const ReleaseTableHoldInitialState = (): ReleaseTableHoldState => ({holds: {}});

export const evolve = (
    state: ReleaseTableHoldState,
    event: Day7Events,
): ReleaseTableHoldState => {
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
    command: ReleaseTableHoldCommand,
    state: ReleaseTableHoldState,
): Day7Events[] => {
    const {tableNumber, reservationCode, date, startTime, endTime, reason} = command.data;

    const hold = state.holds[reservationCode];
    if (!hold) {
        throw {
            code: 'hold_not_found',
            message: `Table ${tableNumber} is not held for reservation ${reservationCode} -`
                + ' there is no hold to release',
        };
    }
    if (hold.released) {
        throw {
            code: 'hold_already_released',
            message: `The hold on table ${tableNumber} for reservation ${reservationCode} was`
                + ' already released - re-running the processor must not release it twice',
        };
    }
    if (hold.confirmed) {
        throw {
            code: 'reservation_already_confirmed',
            message: `Reservation ${reservationCode} is already confirmed for table ${tableNumber} -`
                + ' the hold has been turned into a seating and must not be released underneath'
                + ' a guest who has been told their table is booked',
        };
    }

    return [{
        type: 'TableHoldReleased',
        data: {tableNumber, reservationCode, date, startTime, endTime, reason},
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const ReleaseTableHoldCommandHandler = CommandHandler<ReleaseTableHoldState, Day7Events>({
    evolve,
    initialState: ReleaseTableHoldInitialState,
});

// Keyed by tableNumber and appended to the same table stream the hold and the TableBlocked
// events use, so releasing a hold makes the table takeable again - same stream
// BlockTable/HoldTableForReservation/ConfirmHeldReservation already use.
export const streamNameFor = (tableNumber: string) => `Day7-table-${tableNumber}`;

export const handleReleaseTableHold = async (
    tableNumber: string,
    command: ReleaseTableHoldCommand,
) => {
    const eventStore = await findEventstore();
    const result = await ReleaseTableHoldCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: ReleaseTableHoldState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
