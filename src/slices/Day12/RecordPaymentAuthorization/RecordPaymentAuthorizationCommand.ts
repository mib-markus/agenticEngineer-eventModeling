import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The eight data fields are exactly commands[0].fields, every one mapped off the
// AuthorizationsToRecord read model the processor drains. Note the renames slice.json
// asks for: amountPaid <- AuthorizationsToRecord.totalAmount, paymentMethod <-
// .paymentType, paidAt <- .approvedAt.
export type RecordPaymentAuthorizationCommand = Command<'RecordPaymentAuthorization', {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    amountPaid: string;
    tipAmount: string;
    paymentMethod: string;
    authorizationCode: string;
    paidAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// The read/write split of this automation: the processor *reads* the
// AuthorizationsToRecord read model (fed by AuthorizationApproved), but the command
// *writes* to the order's own Day12-table-{tableNumber} stream - the same stream
// PayOrder/OpenOrder append to, character for character - because OrderPaid has to be
// visible to every existing Day12/Day13 decider and projection keyed on the table.
// That stream is also the only place the matching PaymentRequested and any earlier
// OrderPaid live, which is what both guards below need.
type OrderPaymentState = {
    requested: boolean;
    paid: boolean;
};

export type RecordPaymentAuthorizationState = {
    orders: Record<string, OrderPaymentState>;
};

export const RecordPaymentAuthorizationInitialState = (): RecordPaymentAuthorizationState => ({
    orders: {},
});

export const evolve = (
    state: RecordPaymentAuthorizationState,
    event: Day12Events,
): RecordPaymentAuthorizationState => {
    switch (event.type) {
        case 'PaymentRequested': {
            const existing = state.orders[event.data.orderNumber] ?? {requested: false, paid: false};
            return {
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {...existing, requested: true},
                },
            };
        }

        case 'OrderPaid': {
            const existing = state.orders[event.data.orderNumber] ?? {requested: false, paid: false};
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
    command: RecordPaymentAuthorizationCommand,
    state: RecordPaymentAuthorizationState,
): Day12Events[] => {
    const {
        paymentId,
        orderNumber,
        tableNumber,
        amountPaid,
        tipAmount,
        paymentMethod,
        paidAt,
    } = command.data;

    const order = state.orders[orderNumber];

    if (order?.paid) {
        throw {
            code: 'already_recorded',
            message: `Order ${orderNumber} is already paid - the authorization was already recorded`,
        };
    }

    if (!order?.requested) {
        throw {
            code: 'payment_not_requested',
            message: `No payment was requested for table ${tableNumber} - the provider's authorization cannot be matched`,
        };
    }

    // authorizationCode is a command field with no field on OrderPaid to carry it -
    // slice.json's events[] does not list it, so it is deliberately not written.
    return [{
        type: 'OrderPaid',
        data: {
            orderNumber,
            tableNumber,
            amountPaid,
            paymentMethod,
            paidAt,
            paymentId,
            tipAmount,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RecordPaymentAuthorizationCommandHandler = CommandHandler<
    RecordPaymentAuthorizationState,
    Day12Events
>({
    evolve,
    initialState: RecordPaymentAuthorizationInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRecordPaymentAuthorization = async (
    tableNumber: string,
    command: RecordPaymentAuthorizationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await RecordPaymentAuthorizationCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RecordPaymentAuthorizationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
