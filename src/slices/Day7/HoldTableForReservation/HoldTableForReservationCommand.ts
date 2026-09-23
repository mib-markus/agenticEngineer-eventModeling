import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type HoldTableForReservationCommand = Command<'HoldTableForReservation', {
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

type TimeRange = {
    date: string;
    startTime: string;
    endTime: string;
};

type Hold = {
    reservationCode: string;
    date: string;
    startTime: string;
    endTime: string;
    released: boolean;
};

export type HoldTableForReservationState = {
    blocks: TimeRange[];
    holds: Record<string, Hold>;
};

export const HoldTableForReservationInitialState = (): HoldTableForReservationState => ({
    blocks: [],
    holds: {},
});

export const evolve = (
    state: HoldTableForReservationState,
    event: Day7Events,
): HoldTableForReservationState => {
    switch (event.type) {
        case 'TableBlocked':
            return {
                ...state,
                blocks: [...state.blocks, {
                    date: event.data.date,
                    startTime: event.data.startTime,
                    endTime: event.data.endTime,
                }],
            };

        case 'TableHeldForReservation':
            return {
                ...state,
                holds: {
                    ...state.holds,
                    [event.data.reservationCode]: {
                        reservationCode: event.data.reservationCode,
                        date: event.data.date,
                        startTime: event.data.startTime,
                        endTime: event.data.endTime,
                        released: false,
                    },
                },
            };

        case 'TableHoldReleased': {
            const existing = state.holds[event.data.reservationCode];
            if (!existing) return state;
            return {
                ...state,
                holds: {...state.holds, [event.data.reservationCode]: {...existing, released: true}},
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
    return Number(match[1]) * 60 + Number(match[2]);
};

const overlaps = (a: {startTime: string; endTime: string}, b: {startTime: string; endTime: string}): boolean => {
    const startA = toMinutes(a.startTime);
    const endA = toMinutes(a.endTime);
    const startB = toMinutes(b.startTime);
    const endB = toMinutes(b.endTime);
    if (startA === null || endA === null || startB === null || endB === null) return false;
    return startA < endB && startB < endA;
};

const activeHolds = (state: HoldTableForReservationState): Hold[] =>
    Object.values(state.holds).filter((hold) => !hold.released);

export const decide = (
    command: HoldTableForReservationCommand,
    state: HoldTableForReservationState,
): Day7Events[] => {
    const {reservationCode, tableNumber, eMail, date, startTime, endTime} = command.data;

    const blockedBy = state.blocks.find((block) => block.date === date && overlaps(block, command.data));
    if (blockedBy) {
        throw {
            code: 'table_blocked',
            message: `Table ${tableNumber} is blocked between ${blockedBy.startTime} and`
                + ` ${blockedBy.endTime} on ${date} - a blocked table must not be held for a reservation`,
        };
    }

    const clash = activeHolds(state).find((hold) => hold.date === date && overlaps(hold, command.data));
    if (clash) {
        if (clash.reservationCode === reservationCode
            && clash.startTime === startTime
            && clash.endTime === endTime) {
            throw {
                code: 'hold_already_exists',
                message: `Table ${tableNumber} is already held for reservation ${reservationCode} -`
                    + ' replaying the same hold must not append a second one',
            };
        }

        throw {
            code: 'table_already_held',
            message: `Table ${tableNumber} is already held by reservation ${clash.reservationCode}`
                + ` between ${clash.startTime} and ${clash.endTime} on ${date}`,
        };
    }

    return [{
        type: 'TableHeldForReservation',
        data: {tableNumber, reservationCode, eMail, date, startTime, endTime},
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const HoldTableForReservationCommandHandler = CommandHandler<HoldTableForReservationState, Day7Events>({
    evolve,
    initialState: HoldTableForReservationInitialState,
});

// A hold belongs to a table, not a guest, so this slice keys its stream by table number -
// the same stream BlockTable uses, so a block and a hold on the same table see one another.
export const streamNameFor = (tableNumber: string) => `Day7-table-${tableNumber}`;

export const handleHoldTableForReservation = async (
    tableNumber: string,
    command: HoldTableForReservationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await HoldTableForReservationCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: HoldTableForReservationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
