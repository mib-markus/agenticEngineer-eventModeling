import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type AddOrderLineCommand = Command<'AddOrderLine', {
    orderNumber: string;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// The stream is keyed by tableNumber (same Day12-table-{tableNumber} stream
// OpenOrder and Submit Order To Kitchen use) because a line can only be
// written while its own orderNumber's pad is open on that table. lineNumber
// is `generated: true` but sequential per order, so it can't be stamped by
// the route like OpenOrder's random orderNumber — it is derived here from
// how many lines that order has already had appended.
type OrderLineState = {
    open: boolean;
    lineCount: number;
};

export type AddOrderLineState = {
    orders: Record<string, OrderLineState>;
};

export const AddOrderLineInitialState = (): AddOrderLineState => ({orders: {}});

export const evolve = (
    state: AddOrderLineState,
    event: Day12Events,
): AddOrderLineState => {
    switch (event.type) {
        case 'OrderOpened':
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {open: true, lineCount: 0},
                },
            };

        case 'OrderLineAdded': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, lineCount: existing.lineCount + 1},
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
    command: AddOrderLineCommand,
    state: AddOrderLineState,
): Day12Events[] => {
    const {orderNumber, itemNumber, quantity, specialWishes} = command.data;

    const order = state.orders[orderNumber];
    if (!order) {
        throw {code: 'unknown_order', message: `No open order found for ${orderNumber}`};
    }
    if (!order.open) {
        throw {code: 'order_already_submitted', message: `Order ${orderNumber} was already submitted to the kitchen`};
    }

    const lineNumber = order.lineCount + 1;

    return [{
        type: 'OrderLineAdded',
        data: {
            orderNumber,
            lineNumber,
            itemNumber,
            quantity,
            specialWishes,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const AddOrderLineCommandHandler = CommandHandler<AddOrderLineState, Day12Events>({
    evolve,
    initialState: AddOrderLineInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleAddOrderLine = async (tableNumber: string, command: AddOrderLineCommand) => {
    const eventStore = await findEventstore();
    const result = await AddOrderLineCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: AddOrderLineState) => decide(command, state),
    );
    const addedEvent = result.newEvents.find((event): event is Day12Events & {type: 'OrderLineAdded'} =>
        event.type === 'OrderLineAdded');
    return {
        lineNumber: addedEvent?.data.lineNumber,
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
