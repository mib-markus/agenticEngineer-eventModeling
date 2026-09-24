import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The six data fields are exactly commands[0].fields, every one mapped straight off the
// DeclinesToRecord read model the processor drains - no renames on this side, unlike the
// sibling authorization automation.
export type RecordPaymentDeclineCommand = Command<'RecordPaymentDecline', {
    paymentId: string;
    orderNumber: string;
    tableNumber: string;
    declineReason: string;
    declineCode: string;
    declinedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// The read/write split of this automation, same as RecordPaymentAuthorization: the
// processor *reads* the DeclinesToRecord read model (fed by AuthorizationDeclined), but the
// command *writes* to the order's own Day12-table-{tableNumber} stream - the same stream
// PayOrder/OpenOrder append to, character for character. That stream is also where the
// matching PaymentRequested and any earlier PaymentDeclined for this paymentId live, which
// is exactly what both guards below need.
//
// The guards are keyed on paymentId, not orderNumber: slice.json's second spec ("A second
// decline on a retried payment is recorded too") has a prior PaymentDeclined in the given
// and still expects a new PaymentDeclined - a retry issues a *new* paymentId on the same
// order, so per-order de-duplication would wrongly reject it. Only the *same* paymentId
// declining twice is a replay.
type PaymentState = {
    requested: boolean;
    declined: boolean;
};

export type RecordPaymentDeclineState = {
    payments: Record<string, PaymentState>;
};

export const RecordPaymentDeclineInitialState = (): RecordPaymentDeclineState => ({
    payments: {},
});

export const evolve = (
    state: RecordPaymentDeclineState,
    event: Day12Events,
): RecordPaymentDeclineState => {
    switch (event.type) {
        case 'PaymentRequested': {
            const existing = state.payments[event.data.paymentId] ?? {requested: false, declined: false};
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {...existing, requested: true},
                },
            };
        }

        case 'PaymentDeclined': {
            const existing = state.payments[event.data.paymentId] ?? {requested: false, declined: false};
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {...existing, declined: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: RecordPaymentDeclineCommand,
    state: RecordPaymentDeclineState,
): Day12Events[] => {
    const {paymentId, orderNumber, tableNumber, declineReason, declineCode, declinedAt} = command.data;

    const payment = state.payments[paymentId];

    if (payment?.declined) {
        throw {
            code: 'decline_already_recorded',
            message: `Payment ${paymentId} was already declined - the decline was already recorded`,
        };
    }

    if (!payment?.requested) {
        throw {
            code: 'payment_not_requested',
            message: `No payment was requested for table ${tableNumber} - the provider's decline cannot be matched`,
        };
    }

    return [{
        type: 'PaymentDeclined',
        data: {
            paymentId,
            orderNumber,
            tableNumber,
            declineReason,
            declineCode,
            declinedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const RecordPaymentDeclineCommandHandler = CommandHandler<
    RecordPaymentDeclineState,
    Day12Events
>({
    evolve,
    initialState: RecordPaymentDeclineInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleRecordPaymentDecline = async (
    tableNumber: string,
    command: RecordPaymentDeclineCommand,
) => {
    const eventStore = await findEventstore();
    const result = await RecordPaymentDeclineCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: RecordPaymentDeclineState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
