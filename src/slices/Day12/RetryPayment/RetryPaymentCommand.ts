import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The seven fields above `requestedAt` are exactly commands[0].fields. Note what the
// command does *not* carry: PaymentRequested needs subtotal, serviceCharge and taxAmount,
// and none of the three is a command field - the server retrying a declined card re-sends
// the same bill, so they are read back off the declined PaymentRequested during replay
// rather than invented here or re-entered by the caller.
//
// `requestedAt` is the one exception below the line: PaymentRequested declares it
// (`derived:now()` on the original Request Payment command) but this slice's commands[0]
// omits it, so the route stamps it exactly the way RequestPayment's route does.
export type RetryPaymentCommand = Command<'RetryPayment', {
    tableNumber: string;
    orderNumber: string;
    paymentId: string;
    totalAmount: string;
    tipAmount: string;
    paymentMethod: string;
    previousPaymentId: string;
    requestedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as RequestPayment/PayOrder: the retry has to see the
// declined payment it replaces, its money breakdown, and whether the card payment for this
// order was since abandoned - all of which only live on the table's own stream.
type PaymentState = {
    declined: boolean;
    subtotal: string;
    serviceCharge: string;
    taxAmount: string;
};

type OrderState = {
    abandoned: boolean;
};

export type RetryPaymentState = {
    payments: Record<string, PaymentState>;
    orders: Record<string, OrderState>;
};

export const RetryPaymentInitialState = (): RetryPaymentState => ({payments: {}, orders: {}});

export const evolve = (state: RetryPaymentState, event: Day12Events): RetryPaymentState => {
    switch (event.type) {
        case 'PaymentRequested':
            return {
                ...state,
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {
                        declined: false,
                        subtotal: event.data.subtotal,
                        serviceCharge: event.data.serviceCharge,
                        taxAmount: event.data.taxAmount,
                    },
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
    command: RetryPaymentCommand,
    state: RetryPaymentState,
): Day12Events[] => {
    const {
        tableNumber,
        orderNumber,
        paymentId,
        totalAmount,
        tipAmount,
        paymentMethod,
        previousPaymentId,
        requestedAt,
    } = command.data;

    const previous = state.payments[previousPaymentId];

    if (!previous) {
        throw {
            code: 'nothing_requested',
            message: `No payment was requested for table ${tableNumber} - there is nothing to retry`,
        };
    }

    // Checked before the decline guard: the abandon spec's given has the decline in it too,
    // and giving up on the card is final.
    if (state.orders[orderNumber]?.abandoned) {
        throw {
            code: 'payment_abandoned',
            message: `Card payment for order ${orderNumber} was abandoned - it cannot be retried`,
        };
    }

    // A second or third decline is still retryable - only a payment still waiting on the
    // provider blocks a retry.
    if (!previous.declined) {
        throw {
            code: 'payment_not_declined',
            message: `Payment ${previousPaymentId} has not been declined - wait for the provider's answer before retrying`,
        };
    }

    // previousPaymentId is a command field with no field on PaymentRequested to carry it -
    // slice.json's events[] does not list it, so it is deliberately not written. The retry
    // re-sends the declined bill under the freshly generated paymentId.
    return [{
        type: 'PaymentRequested',
        data: {
            paymentId,
            orderNumber,
            tableNumber,
            subtotal: previous.subtotal,
            serviceCharge: previous.serviceCharge,
            taxAmount: previous.taxAmount,
            tipAmount,
            totalAmount,
            paymentType: paymentMethod,
            requestedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RetryPaymentCommandHandler = CommandHandler<RetryPaymentState, Day12Events>({
    evolve,
    initialState: RetryPaymentInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRetryPayment = async (tableNumber: string, command: RetryPaymentCommand) => {
    const eventStore = await findEventstore();
    const result = await RetryPaymentCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RetryPaymentState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
