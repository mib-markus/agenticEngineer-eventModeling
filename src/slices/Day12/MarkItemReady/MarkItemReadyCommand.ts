import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type MarkItemReadyCommand = Command<'MarkItemReady', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    station: string;
}, {
    // readyAt is `generated: true` on the event but this command has no HTTP route field
    // for it (the StationDisplay screen triggers it, but there is no commands[].fields
    // entry for readyAt) - stamped into metadata the same way StartItemPreparation's
    // routes.ts stamps startedAt.
    readyAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as StartItemPreparation/RouteOrderLineToStation:
// marking a line ready has to see whether it was ever started and whether it is already
// ready, both of which only the table's own stream carries.
type OrderLineState = {
    started: boolean;
    ready: boolean;
};

type OrderState = {
    lines: Record<number, OrderLineState>;
};

export type MarkItemReadyState = {
    orders: Record<string, OrderState>;
};

export const MarkItemReadyInitialState = (): MarkItemReadyState => ({orders: {}});

export const evolve = (
    state: MarkItemReadyState,
    event: Day12Events,
): MarkItemReadyState => {
    switch (event.type) {
        case 'ItemPreparationStarted': {
            const existing = state.orders[event.data.orderNumber] ?? {lines: {}};
            const line = existing.lines[event.data.lineNumber] ?? {started: false, ready: false};
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, started: true},
                        },
                    },
                },
            };
        }

        case 'ItemMarkedReady': {
            const existing = state.orders[event.data.orderNumber];
            const line = existing?.lines[event.data.lineNumber];
            if (!existing || !line) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, ready: true},
                        },
                    },
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: MarkItemReadyCommand,
    state: MarkItemReadyState,
): Day12Events[] => {
    const {orderNumber, tableNumber, lineNumber, station} = command.data;

    const line = state.orders[orderNumber]?.lines[lineNumber];
    if (!line || !line.started) {
        throw {code: 'line_not_started', message: `Preparation of line ${lineNumber} of order ${orderNumber} has not started, so it cannot be ready`};
    }
    if (line.ready) {
        throw {code: 'already_ready', message: `Line ${lineNumber} of order ${orderNumber} is already marked ready`};
    }

    return [{
        type: 'ItemMarkedReady',
        data: {
            orderNumber,
            tableNumber,
            lineNumber,
            station,
            readyAt: command.metadata.readyAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const MarkItemReadyCommandHandler = CommandHandler<MarkItemReadyState, Day12Events>({
    evolve,
    initialState: MarkItemReadyInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleMarkItemReady = async (tableNumber: string, command: MarkItemReadyCommand) => {
    const eventStore = await findEventstore();
    const result = await MarkItemReadyCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: MarkItemReadyState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
