import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type RemoveOrderLineCommand = Command<'RemoveOrderLine', {
    orderNumber: string;
    lineNumber: number;
    reason: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same stream as AddOrderLine/ChangeOrderLine (Day12-table-{tableNumber}): a line can only
// be struck off while its own order's pad is still open, and only while that specific line
// hasn't already been removed — both guards need the full history of the order's lines.
type OrderLineState = {
    removed: boolean;
};

type OrderState = {
    open: boolean;
    lines: Record<number, OrderLineState>;
};

export type RemoveOrderLineState = {
    orders: Record<string, OrderState>;
};

export const RemoveOrderLineInitialState = (): RemoveOrderLineState => ({orders: {}});

export const evolve = (
    state: RemoveOrderLineState,
    event: Day12Events,
): RemoveOrderLineState => {
    switch (event.type) {
        case 'OrderOpened':
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {open: true, lines: {}},
                },
            };

        case 'OrderLineAdded': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        ...existing,
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {removed: false},
                        },
                    },
                },
            };
        }

        case 'OrderLineRemoved': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            const line = existing.lines[event.data.lineNumber];
            if (!line) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        ...existing,
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, removed: true},
                        },
                    },
                },
            };
        }

        case 'OrderSubmittedToKitchen': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, open: false},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: RemoveOrderLineCommand,
    state: RemoveOrderLineState,
): Day12Events[] => {
    const {orderNumber, lineNumber, reason} = command.data;

    const order = state.orders[orderNumber];
    const line = order?.lines[lineNumber];
    if (!line) {
        throw {code: 'line_not_found', message: `Order ${orderNumber} has no line ${lineNumber}`};
    }
    if (!order.open) {
        throw {code: 'order_already_submitted', message: `Order ${orderNumber} was already submitted to the kitchen`};
    }
    if (line.removed) {
        throw {code: 'line_already_removed', message: `Line ${lineNumber} of order ${orderNumber} was already removed`};
    }

    return [{
        type: 'OrderLineRemoved',
        data: {
            orderNumber,
            lineNumber,
            reason,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RemoveOrderLineCommandHandler = CommandHandler<RemoveOrderLineState, Day12Events>({
    evolve,
    initialState: RemoveOrderLineInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRemoveOrderLine = async (tableNumber: string, command: RemoveOrderLineCommand) => {
    const eventStore = await findEventstore();
    const result = await RemoveOrderLineCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RemoveOrderLineState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
