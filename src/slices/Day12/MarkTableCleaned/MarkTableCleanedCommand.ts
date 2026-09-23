import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type MarkTableCleanedCommand = Command<'MarkTableCleaned', {
    tableNumber: string;
    orderNumber: string;
}, {
    cleanedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

type OrderState = {
    closed: boolean;
    cleaned: boolean;
};

export type MarkTableCleanedState = {
    orders: Record<string, OrderState>;
};

export const MarkTableCleanedInitialState = (): MarkTableCleanedState => ({orders: {}});

export const evolve = (
    state: MarkTableCleanedState,
    event: Day12Events,
): MarkTableCleanedState => {
    switch (event.type) {
        case 'TableClosed': {
            const existing = state.orders[event.data.orderNumber] ?? {closed: false, cleaned: false};
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, closed: true},
                },
            };
        }

        case 'TableFreedForReassignment': {
            const existing = state.orders[event.data.orderNumber];
            if (!existing) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, cleaned: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: MarkTableCleanedCommand,
    state: MarkTableCleanedState,
): Day12Events[] => {
    const {tableNumber, orderNumber} = command.data;

    const order = state.orders[orderNumber];

    if (order?.cleaned) {
        throw {code: 'already_cleaned', message: `Order ${orderNumber} has already been marked cleaned`};
    }

    if (!order?.closed) {
        throw {code: 'table_not_closed', message: `Order ${orderNumber} has not been closed, so the table cannot be marked cleaned`};
    }

    return [{
        type: 'TableFreedForReassignment',
        data: {
            tableNumber,
            orderNumber,
            cleanedAt: command.metadata.cleanedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const MarkTableCleanedCommandHandler = CommandHandler<MarkTableCleanedState, Day12Events>({
    evolve,
    initialState: MarkTableCleanedInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleMarkTableCleaned = async (tableNumber: string, command: MarkTableCleanedCommand) => {
    const eventStore = await findEventstore();
    const result = await MarkTableCleanedCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: MarkTableCleanedState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
