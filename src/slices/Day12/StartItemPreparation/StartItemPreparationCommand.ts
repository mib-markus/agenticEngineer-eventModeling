import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type StartItemPreparationCommand = Command<'StartItemPreparation', {
    orderNumber: string;
    tableNumber: string;
    lineNumber: number;
    station: string;
}, {
    // startedAt is `generated: true` on the event but this command has no HTTP route (the
    // StationDisplay screen triggers it, but there is no commands[].fields entry for
    // startedAt) - stamped into metadata the same way RouteOrderLineToStation's processor
    // stamps routedAt.
    startedAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as RouteOrderLineToStation/AddOrderLine: starting
// preparation has to see whether the targeted line was ever routed to a station and
// whether preparation has already started, both of which only the table's own stream
// carries.
type OrderLineState = {
    routed: boolean;
    started: boolean;
};

type OrderState = {
    lines: Record<number, OrderLineState>;
};

export type StartItemPreparationState = {
    orders: Record<string, OrderState>;
};

export const StartItemPreparationInitialState = (): StartItemPreparationState => ({orders: {}});

export const evolve = (
    state: StartItemPreparationState,
    event: Day12Events,
): StartItemPreparationState => {
    switch (event.type) {
        case 'OrderLineRoutedToStation': {
            const existing = state.orders[event.data.orderNumber] ?? {lines: {}};
            const line = existing.lines[event.data.lineNumber] ?? {routed: false, started: false};
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

        case 'ItemPreparationStarted': {
            const existing = state.orders[event.data.orderNumber];
            const line = existing?.lines[event.data.lineNumber];
            if (!existing || !line) return state;
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

        default:
            return state;
    }
};

export const decide = (
    command: StartItemPreparationCommand,
    state: StartItemPreparationState,
): Day12Events[] => {
    const {orderNumber, tableNumber, lineNumber, station} = command.data;

    const line = state.orders[orderNumber]?.lines[lineNumber];
    if (!line || !line.routed) {
        throw {code: 'line_not_routed', message: `Order ${orderNumber} has no line ${lineNumber} routed to this station`};
    }
    if (line.started) {
        throw {code: 'already_started', message: `Preparation of line ${lineNumber} of order ${orderNumber} has already started`};
    }

    return [{
        type: 'ItemPreparationStarted',
        data: {
            orderNumber,
            tableNumber,
            lineNumber,
            station,
            startedAt: command.metadata.startedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const StartItemPreparationCommandHandler = CommandHandler<StartItemPreparationState, Day12Events>({
    evolve,
    initialState: StartItemPreparationInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleStartItemPreparation = async (tableNumber: string, command: StartItemPreparationCommand) => {
    const eventStore = await findEventstore();
    const result = await StartItemPreparationCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: StartItemPreparationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
