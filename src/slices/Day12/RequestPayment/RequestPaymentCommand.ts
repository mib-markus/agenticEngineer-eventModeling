import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// All ten data fields come from slice.json commands[0].fields. paymentId
// (`derived:uuid()`) and requestedAt (`derived:now()`) are `generated: true` but are still
// part of the command's data because the emitted event maps them from the command - the
// route stamps them, the same way PayOrder's route stamps paidAt.
export type RequestPaymentCommand = Command<'RequestPayment', {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    subtotal: string;
    serviceCharge: string;
    taxAmount: string;
    tipAmount: string;
    totalAmount: string;
    paymentType: string;
    requestedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// `aggregate:PaymentSummary.totalAmount + tipAmount`. PaymentSummary's own totalAmount is
// subtotal + serviceCharge + taxAmount, so the tipped total is those three plus the tip.
// Exported so the route and the tests agree on the arithmetic.
export const totalWithTip = (
    subtotal: string,
    serviceCharge: string,
    taxAmount: string,
    tipAmount: string,
): string =>
    (Number(subtotal) + Number(serviceCharge) + Number(taxAmount) + Number(tipAmount)).toFixed(2);

// Same Day12-table-{tableNumber} stream as PayOrder/ServeItem: requesting a payment has to
// see whether the order has any routed lines, whether a payment is already awaiting the
// provider's answer, and whether the order was already paid - all three only live on the
// table's own stream.
type OrderPaymentState = {
    routedLines: number;
    pending: boolean;
    paid: boolean;
};

export type RequestPaymentState = {
    orders: Record<string, OrderPaymentState>;
};

export const RequestPaymentInitialState = (): RequestPaymentState => ({orders: {}});

const orderOf = (state: RequestPaymentState, orderNumber: string): OrderPaymentState =>
    state.orders[orderNumber] ?? {routedLines: 0, pending: false, paid: false};

const withOrder = (
    state: RequestPaymentState,
    orderNumber: string,
    order: OrderPaymentState,
): RequestPaymentState => ({
    orders: {...state.orders, [orderNumber]: order},
});

export const evolve = (
    state: RequestPaymentState,
    event: Day12Events,
): RequestPaymentState => {
    switch (event.type) {
        case 'OrderLineRoutedToStation': {
            const order = orderOf(state, event.data.orderNumber);
            return withOrder(state, event.data.orderNumber, {
                ...order,
                routedLines: order.routedLines + 1,
            });
        }

        case 'PaymentRequested': {
            const order = orderOf(state, event.data.orderNumber);
            return withOrder(state, event.data.orderNumber, {...order, pending: true});
        }

        // The provider's answer. Either one ends the wait, so a fresh payment may be
        // requested again ("wait for the provider's answer before requesting another").
        case 'PaymentDeclined':
        case 'PaymentAbandoned': {
            const order = orderOf(state, event.data.orderNumber);
            return withOrder(state, event.data.orderNumber, {...order, pending: false});
        }

        case 'OrderPaid': {
            const order = orderOf(state, event.data.orderNumber);
            return withOrder(state, event.data.orderNumber, {...order, pending: false, paid: true});
        }

        default:
            return state;
    }
};

export const decide = (
    command: RequestPaymentCommand,
    state: RequestPaymentState,
): Day12Events[] => {
    const {
        paymentId,
        orderNumber,
        tableNumber,
        subtotal,
        serviceCharge,
        taxAmount,
        tipAmount,
        totalAmount,
        paymentType,
        requestedAt,
    } = command.data;

    const order = state.orders[orderNumber];

    if (order?.paid) {
        throw {code: 'already_paid', message: `Order ${orderNumber} is already paid`};
    }

    if (order?.pending) {
        throw {
            code: 'payment_pending',
            message: `A payment authorization for order ${orderNumber} is already pending`,
        };
    }

    if (!order || order.routedLines === 0) {
        throw {
            code: 'no_routed_lines',
            message: `Nothing has been ordered on table ${tableNumber} - there is nothing to pay`,
        };
    }

    if (Number(tipAmount) < 0) {
        throw {code: 'negative_tip', message: 'tipAmount must not be negative'};
    }

    return [{
        type: 'PaymentRequested',
        data: {
            paymentId,
            orderNumber,
            tableNumber,
            subtotal,
            serviceCharge,
            taxAmount,
            tipAmount,
            totalAmount,
            paymentType,
            requestedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RequestPaymentCommandHandler = CommandHandler<RequestPaymentState, Day12Events>({
    evolve,
    initialState: RequestPaymentInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRequestPayment = async (tableNumber: string, command: RequestPaymentCommand) => {
    const eventStore = await findEventstore();
    const result = await RequestPaymentCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RequestPaymentState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
