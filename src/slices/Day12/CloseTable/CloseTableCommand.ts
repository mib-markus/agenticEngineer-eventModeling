import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type CloseTableCommand = Command<'CloseTable', {
    orderNumber: string;
    tableNumber: string;
}, {
    // closedAt is `generated: true`/`derived:now()` - stamped into metadata the same way
    // PayOrder's routes.ts stamps paidAt, since this command has no HTTP route field for it.
    closedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as PayOrder/ServeItem: closing a table has to see
// whether this order was paid and whether it was already closed, both of which only the
// table's own stream carries.
type OrderState = {
    paid: boolean;
    closed: boolean;
};

export type CloseTableState = {
    orders: Record<string, OrderState>;
};

export const CloseTableInitialState = (): CloseTableState => ({orders: {}});

export const evolve = (
    state: CloseTableState,
    event: Day12Events,
): CloseTableState => {
    switch (event.type) {
        case 'OrderPaid': {
            const existing = state.orders[event.data.orderNumber] ?? {paid: false, closed: false};
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, paid: true},
                },
            };
        }

        case 'TableClosed': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, closed: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: CloseTableCommand,
    state: CloseTableState,
): Day12Events[] => {
    const {orderNumber, tableNumber} = command.data;

    const order = state.orders[orderNumber];

    if (order?.closed) {
        throw {code: 'already_closed', message: `Order ${orderNumber} has already been closed`};
    }

    if (!order?.paid) {
        throw {code: 'unpaid_table', message: `Order ${orderNumber} has not been paid, so the table cannot be closed`};
    }

    return [{
        type: 'TableClosed',
        data: {
            orderNumber,
            tableNumber,
            closedAt: command.metadata.closedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const CloseTableCommandHandler = CommandHandler<CloseTableState, Day12Events>({
    evolve,
    initialState: CloseTableInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleCloseTable = async (tableNumber: string, command: CloseTableCommand) => {
    const eventStore = await findEventstore();
    const result = await CloseTableCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: CloseTableState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
