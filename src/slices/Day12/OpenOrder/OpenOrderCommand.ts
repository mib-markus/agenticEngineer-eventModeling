import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type OpenOrderCommand = Command<'OpenOrder', {
    orderNumber: string;
    tableNumber: string;
    serverName: string;
    openedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// A waiter carries one pad per table: an order is "open" from OrderOpened until it is
// submitted to the kitchen. The guard has to see every order ever opened for this table,
// so the stream is keyed by tableNumber (same shape as Day7's BlockTable/
// HoldTableForReservation, which both key by tableNumber for the same reason), not by the
// new order's own orderNumber.
export type OpenOrderState = {
    openOrderNumbers: Set<string>;
};

export const OpenOrderInitialState = (): OpenOrderState => ({
    openOrderNumbers: new Set(),
});

export const evolve = (
    state: OpenOrderState,
    event: Day12Events,
): OpenOrderState => {
    switch (event.type) {
        case 'OrderOpened':
            return {
                openOrderNumbers: new Set(state.openOrderNumbers).add(event.data.orderNumber),
            };

        case 'OrderSubmittedToKitchen': {
            const openOrderNumbers = new Set(state.openOrderNumbers);
            openOrderNumbers.delete(event.data.orderNumber);
            return {openOrderNumbers};
        }

        default:
            return state;
    }
};

export const decide = (
    command: OpenOrderCommand,
    state: OpenOrderState,
): Day12Events[] => {
    const {orderNumber, tableNumber, serverName, openedAt} = command.data;

    if (state.openOrderNumbers.size > 0) {
        throw {
            code: 'table_already_has_open_order',
            message: `Table ${tableNumber} already has an open, not yet submitted order`,
        };
    }

    return [{
        type: 'OrderOpened',
        data: {
            orderNumber,
            tableNumber,
            serverName,
            openedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const OpenOrderCommandHandler = CommandHandler<OpenOrderState, Day12Events>({
    evolve,
    initialState: OpenOrderInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleOpenOrder = async (tableNumber: string, command: OpenOrderCommand) => {
    const eventStore = await findEventstore();
    const result = await OpenOrderCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: OpenOrderState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
