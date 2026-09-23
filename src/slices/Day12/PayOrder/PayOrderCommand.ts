import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type PayOrderCommand = Command<'PayOrder', {
    orderNumber: string;
    tableNumber: string;
    amountPaid: string;
    paymentMethod: string;
}, {
    // paidAt is `generated: true`/`derived:now()` - stamped into metadata the same way
    // ServeItem's routes.ts stamps servedAt, since this command has no HTTP route field
    // for it.
    paidAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as ServeItem/MarkItemReady: paying an order has
// to see every routed line and whether it was served, plus whether the order was already
// paid, all of which only the table's own stream carries.
type OrderState = {
    lines: Record<number, {served: boolean}>;
    paid: boolean;
};

export type PayOrderState = {
    orders: Record<string, OrderState>;
};

export const PayOrderInitialState = (): PayOrderState => ({orders: {}});

export const evolve = (
    state: PayOrderState,
    event: Day12Events,
): PayOrderState => {
    switch (event.type) {
        case 'OrderLineRoutedToStation': {
            const existing = state.orders[event.data.orderNumber] ?? {lines: {}, paid: false};
            if (existing.lines[event.data.lineNumber]) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        ...existing,
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {served: false},
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
                        ...existing,
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {served: true},
                        },
                    },
                },
            };
        }

        case 'OrderPaid': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, paid: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: PayOrderCommand,
    state: PayOrderState,
): Day12Events[] => {
    const {orderNumber, tableNumber, amountPaid, paymentMethod} = command.data;

    const order = state.orders[orderNumber];

    if (order?.paid) {
        throw {code: 'already_paid', message: `Order ${orderNumber} has already been paid`};
    }

    const hasUnservedLine = Object.values(order?.lines ?? {}).some((line) => !line.served);
    if (hasUnservedLine) {
        throw {code: 'unprepared_item', message: `Order ${orderNumber} has at least one item that has not been served yet, so it cannot be paid`};
    }

    return [{
        type: 'OrderPaid',
        data: {
            orderNumber,
            tableNumber,
            amountPaid,
            paymentMethod,
            paidAt: command.metadata.paidAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const PayOrderCommandHandler = CommandHandler<PayOrderState, Day12Events>({
    evolve,
    initialState: PayOrderInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handlePayOrder = async (tableNumber: string, command: PayOrderCommand) => {
    const eventStore = await findEventstore();
    const result = await PayOrderCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: PayOrderState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
