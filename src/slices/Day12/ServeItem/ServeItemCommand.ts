import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type ServeItemCommand = Command<'ServeItem', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    serverName: string;
}, {
    // servedAt is `generated: true`/`derived:now()` - stamped into metadata the same way
    // MarkItemReady's routes.ts stamps readyAt, since this command has no HTTP route field
    // for it.
    servedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as MarkItemReady/StartItemPreparation: serving a
// line has to see whether it was ever marked ready and whether it is already served, both
// of which only the table's own stream carries.
type OrderLineState = {
    ready: boolean;
    served: boolean;
};

type OrderState = {
    lines: Record<number, OrderLineState>;
};

export type ServeItemState = {
    orders: Record<string, OrderState>;
};

export const ServeItemInitialState = (): ServeItemState => ({orders: {}});

export const evolve = (
    state: ServeItemState,
    event: Day12Events,
): ServeItemState => {
    switch (event.type) {
        case 'ItemMarkedReady': {
            const existing = state.orders[event.data.orderNumber] ?? {lines: {}};
            const line = existing.lines[event.data.lineNumber] ?? {ready: false, served: false};
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

        case 'ItemServed': {
            const existing = state.orders[event.data.orderNumber];
            const line = existing?.lines[event.data.lineNumber];
            if (!existing || !line) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, served: true},
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
    command: ServeItemCommand,
    state: ServeItemState,
): Day12Events[] => {
    const {orderNumber, tableNumber, lineNumber, serverName} = command.data;

    const line = state.orders[orderNumber]?.lines[lineNumber];
    if (!line || !line.ready) {
        throw {code: 'item_not_ready', message: `Line ${lineNumber} of order ${orderNumber} has not been marked ready, so it cannot be served`};
    }
    if (line.served) {
        throw {code: 'already_served', message: `Line ${lineNumber} of order ${orderNumber} has already been served`};
    }

    return [{
        type: 'ItemServed',
        data: {
            orderNumber,
            tableNumber,
            lineNumber,
            serverName,
            servedAt: command.metadata.servedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const ServeItemCommandHandler = CommandHandler<ServeItemState, Day12Events>({
    evolve,
    initialState: ServeItemInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleServeItem = async (tableNumber: string, command: ServeItemCommand) => {
    const eventStore = await findEventstore();
    const result = await ServeItemCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: ServeItemState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
