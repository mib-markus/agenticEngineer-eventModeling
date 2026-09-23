import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type RouteOrderLineToStationCommand = Command<'RouteOrderLineToStation', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    itemNumber: string;
    quantity: number;
    specialWishes: string;
    station: string;
}, {
    // routedAt is `generated: true` on the event but not a command field - this command is
    // only ever fired by the processor (no HTTP route), so the processor stamps it here the
    // same way SendReservationReminder's processor stamps `sentAt` into metadata.
    routedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as AddOrderLine/RemoveOrderLine/SubmitOrderToKitchen:
// routing has to see whether the targeted line still exists (wasn't struck off) and whether
// it has already been routed, both of which only the table's own stream carries.
const VALID_STATIONS = ['kitchen', 'bar', 'dessert'];

type OrderLineState = {
    removed: boolean;
    routed: boolean;
};

type OrderState = {
    lines: Record<number, OrderLineState>;
};

export type RouteOrderLineToStationState = {
    orders: Record<string, OrderState>;
};

export const RouteOrderLineToStationInitialState = (): RouteOrderLineToStationState => ({orders: {}});

export const evolve = (
    state: RouteOrderLineToStationState,
    event: Day12Events,
): RouteOrderLineToStationState => {
    switch (event.type) {
        case 'OrderLineAdded': {
            const existing = state.orders[event.data.orderNumber] ?? {lines: {}};
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {removed: false, routed: false},
                        },
                    },
                },
            };
        }

        case 'OrderLineRemoved': {
            const existing = state.orders[event.data.orderNumber];
            const line = existing?.lines[event.data.lineNumber];
            if (!existing || !line) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, removed: true},
                        },
                    },
                },
            };
        }

        case 'OrderLineRoutedToStation': {
            const existing = state.orders[event.data.orderNumber];
            const line = existing?.lines[event.data.lineNumber];
            if (!existing || !line) return state;
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {
                        lines: {
                            ...existing.lines,
                            [event.data.lineNumber]: {...line, routed: true},
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
    command: RouteOrderLineToStationCommand,
    state: RouteOrderLineToStationState,
): Day12Events[] => {
    const {orderNumber, tableNumber, lineNumber, itemNumber, quantity, specialWishes, station} = command.data;

    const line = state.orders[orderNumber]?.lines[lineNumber];
    if (!line || line.removed) {
        throw {code: 'line_not_found', message: `Order ${orderNumber} has no routable line ${lineNumber}`};
    }
    if (line.routed) {
        throw {code: 'already_routed', message: `Line ${lineNumber} of order ${orderNumber} was already routed`};
    }
    if (!VALID_STATIONS.includes(station)) {
        throw {code: 'station_not_determined', message: `No preparation station could be determined for item ${itemNumber}`};
    }

    return [{
        type: 'OrderLineRoutedToStation',
        data: {
            orderNumber,
            tableNumber,
            lineNumber,
            itemNumber,
            quantity,
            specialWishes,
            station,
            routedAt: command.metadata.routedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RouteOrderLineToStationCommandHandler = CommandHandler<RouteOrderLineToStationState, Day12Events>({
    evolve,
    initialState: RouteOrderLineToStationInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRouteOrderLineToStation = async (tableNumber: string, command: RouteOrderLineToStationCommand) => {
    const eventStore = await findEventstore();
    const result = await RouteOrderLineToStationCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RouteOrderLineToStationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
