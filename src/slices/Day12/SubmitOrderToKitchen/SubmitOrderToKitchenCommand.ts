import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type SubmitOrderToKitchenCommand = Command<'SubmitOrderToKitchen', {
    orderNumber: string;
    submittedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same stream as OpenOrder/AddOrderLine/ChangeOrderLine/RemoveOrderLine
// (Day12-table-{tableNumber}): whether the pad may go to the kitchen depends on the full
// history of its lines (any struck off?) and whether it was already submitted.
type OrderLineState = {
    removed: boolean;
};

type OrderState = {
    tableNumber: string;
    open: boolean;
    lines: Record<number, OrderLineState>;
};

export type SubmitOrderToKitchenState = {
    orders: Record<string, OrderState>;
};

export const SubmitOrderToKitchenInitialState = (): SubmitOrderToKitchenState => ({orders: {}});

export const evolve = (
    state: SubmitOrderToKitchenState,
    event: Day12Events,
): SubmitOrderToKitchenState => {
    switch (event.type) {
        case 'OrderOpened':
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        tableNumber: event.data.tableNumber,
                        open: true,
                        lines: {},
                    },
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
    command: SubmitOrderToKitchenCommand,
    state: SubmitOrderToKitchenState,
): Day12Events[] => {
    const {orderNumber, submittedAt} = command.data;

    const order = state.orders[orderNumber];
    if (!order) {
        throw {code: 'pad_never_opened', message: `No open order exists for ${orderNumber}`};
    }
    if (!order.open) {
        throw {code: 'pad_already_submitted', message: `Order ${orderNumber} was already submitted to the kitchen`};
    }
    const hasActiveLine = Object.values(order.lines).some((line) => !line.removed);
    if (!hasActiveLine) {
        throw {code: 'pad_is_empty', message: `Order ${orderNumber} has no lines left`};
    }

    return [{
        type: 'OrderSubmittedToKitchen',
        data: {
            orderNumber,
            tableNumber: order.tableNumber,
            submittedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const SubmitOrderToKitchenCommandHandler = CommandHandler<SubmitOrderToKitchenState, Day12Events>({
    evolve,
    initialState: SubmitOrderToKitchenInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleSubmitOrderToKitchen = async (tableNumber: string, command: SubmitOrderToKitchenCommand) => {
    const eventStore = await findEventstore();
    const result = await SubmitOrderToKitchenCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: SubmitOrderToKitchenState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
