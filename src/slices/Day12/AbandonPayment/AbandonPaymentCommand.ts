import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The first five fields are exactly commands[0].fields. `abandonedAt` is below the line:
// PaymentAbandoned declares it `generated:now()` and the command does not carry it, so the
// route stamps it - the same shape as CloseTable's closedAt.
export type AbandonPaymentCommand = Command<'AbandonPayment', {
    tableNumber: string;
    orderNumber: string;
    paymentId: string;
    abandonReason: string;
    serverName: string;
    abandonedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as RetryPayment/RequestPayment: giving up on the
// card has to see the declined payment it gives up on and whether the order's card payment
// was already abandoned - both only live on the table's own stream.
type PaymentState = {
    declined: boolean;
};

type OrderState = {
    abandoned: boolean;
};

export type AbandonPaymentState = {
    payments: Record<string, PaymentState>;
    orders: Record<string, OrderState>;
};

export const AbandonPaymentInitialState = (): AbandonPaymentState => ({payments: {}, orders: {}});

export const evolve = (state: AbandonPaymentState, event: Day12Events): AbandonPaymentState => {
    switch (event.type) {
        case 'PaymentRequested':
            return {
                ...state,
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {declined: false},
                },
            };

        case 'PaymentDeclined': {
            const payment = state.payments[event.data.paymentId];
            if (!payment) return state;
            return {
                ...state,
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {...payment, declined: true},
                },
            };
        }

        case 'PaymentAbandoned':
            return {
                ...state,
                orders: {
                    ...state.orders,
                    [event.data.orderNumber]: {abandoned: true},
                },
            };

        default:
            return state;
    }
};

export const decide = (
    command: AbandonPaymentCommand,
    state: AbandonPaymentState,
): Day12Events[] => {
    const {tableNumber, orderNumber, paymentId, abandonReason, serverName, abandonedAt} = command.data;

    // Checked first: the double-abandon spec's given also contains the decline, so the
    // "already abandoned" answer has to win over every other guard.
    if (state.orders[orderNumber]?.abandoned) {
        throw {
            code: 'already_abandoned',
            message: `Card payment for order ${orderNumber} was already abandoned`,
        };
    }

    // A second or third decline is still abandonable - only a payment still waiting on the
    // provider blocks giving up.
    if (!state.payments[paymentId]?.declined) {
        throw {
            code: 'payment_not_declined',
            message: `Payment ${paymentId} has not been declined - wait for the provider's answer before abandoning`,
        };
    }

    if (!abandonReason || abandonReason.trim() === '') {
        throw {code: 'missing_abandon_reason', message: 'abandonReason must not be empty'};
    }

    return [{
        type: 'PaymentAbandoned',
        data: {
            tableNumber,
            orderNumber,
            paymentId,
            abandonReason,
            serverName,
            abandonedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const AbandonPaymentCommandHandler = CommandHandler<AbandonPaymentState, Day12Events>({
    evolve,
    initialState: AbandonPaymentInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleAbandonPayment = async (tableNumber: string, command: AbandonPaymentCommand) => {
    const eventStore = await findEventstore();
    const result = await AbandonPaymentCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: AbandonPaymentState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
