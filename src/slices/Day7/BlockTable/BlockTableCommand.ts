import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type TableHold = {
    reservationCode: string;
    tableNumber: string;
    date: string;
    startTime: string;
    endTime: string;
};

export type BlockTableCommand = Command<'BlockTable', {
    tableNumber: string;
    date: string;
    startTime: string;
    endTime: string;
    reason: string;
}, {
    // Reservations are appended to per-guest streams, so this table's stream cannot see
    // who holds it. The route reads the holds from TableStatus and passes them in, which
    // keeps `decide` pure — the same arrangement ConfirmReservation uses.
    tableHolds?: TableHold[];
    correlation_id?: string;
    causation_id?: string;
}>;

type TimeRange = {
    date: string;
    startTime: string;
    endTime: string;
};

export type BlockTableState = {
    blocks: TimeRange[];
    holds: Record<string, TableHold & {cancelled: boolean}>;
};

export const BlockTableInitialState = (): BlockTableState => ({blocks: [], holds: {}});

export const evolve = (
    state: BlockTableState,
    event: Day7Events,
): BlockTableState => {
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

        case 'ReservationConfirmed':
            return {
                ...state,
                holds: {
                    ...state.holds,
                    [event.data.reservationCode]: {
                        reservationCode: event.data.reservationCode,
                        tableNumber: event.data.tableNumber,
                        date: event.data.date,
                        startTime: event.data.startTime,
                        endTime: event.data.endTime,
                        cancelled: false,
                    },
                },
            };

        case 'ReservationCancelled': {
            const existing = state.holds[event.data.reservationCode];
            if (!existing) return state;
            return {
                ...state,
                holds: {...state.holds, [event.data.reservationCode]: {...existing, cancelled: true}},
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
    // Touching at the edges is not an overlap: a 14:00-17:00 block leaves 17:00-19:00 free.
    return startA < endB && startB < endA;
};

const activeHolds = (state: BlockTableState): TableHold[] =>
    Object.values(state.holds).filter((hold) => !hold.cancelled);

export const decide = (
    command: BlockTableCommand,
    state: BlockTableState,
): Day7Events[] => {
    const {tableNumber, date, startTime, endTime, reason} = command.data;

    const clash = state.blocks.find((block) => block.date === date && overlaps(block, command.data));
    if (clash) {
        throw {
            code: 'table_already_blocked',
            message: `Table ${tableNumber} is already blocked between ${clash.startTime}`
                + ` and ${clash.endTime} on ${date}`,
        };
    }

    const candidateHolds = [...activeHolds(state), ...(command.metadata?.tableHolds ?? [])];
    const held = candidateHolds.find((hold) =>
        hold.tableNumber === tableNumber
        && hold.date === date
        && overlaps(hold, command.data));

    if (held) {
        throw {
            code: 'table_held_by_reservation',
            message: `Table ${tableNumber} is held by reservation ${held.reservationCode} between`
                + ` ${held.startTime} and ${held.endTime} on ${date} - only tables with no active`
                + ' reservation can be blocked',
        };
    }

    return [{
        type: 'TableBlocked',
        data: {tableNumber, date, startTime, endTime, reason},
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const BlockTableCommandHandler = CommandHandler<BlockTableState, Day7Events>({
    evolve,
    initialState: BlockTableInitialState,
});

// Blocks belong to a table, not a guest, so this slice keys its stream by table number.
export const streamNameFor = (tableNumber: string) => `Day7-table-${tableNumber}`;

export const handleBlockTable = async (tableNumber: string, command: BlockTableCommand) => {
    const eventStore = await findEventstore();
    const result = await BlockTableCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: BlockTableState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
