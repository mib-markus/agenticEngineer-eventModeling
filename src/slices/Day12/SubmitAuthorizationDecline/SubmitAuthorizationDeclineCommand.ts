import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The six data fields are exactly commands[0].fields, every one
// `external:PSP webhook payload.*` - this is the provider's decline callback, so
// `routes.ts` maps them straight off the webhook body and stamps nothing itself.
export type SubmitAuthorizationDeclineCommand = Command<'SubmitAuthorizationDecline', {
    paymentId: string;
    declineReason: string;
    declineCode: string;
    cardBrand: string;
    maskedCardNumber: string;
    declinedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as SubmitAuthorizationApproval: the callback has
// to see the PaymentRequested it answers and whether this paymentId was already declined.
// The command carries only paymentId, so routes.ts resolves the table through the shared
// PaymentLookupProjection before this handler runs.
type PaymentState = {
    declined: boolean;
};

export type SubmitAuthorizationDeclineState = {
    payments: Record<string, PaymentState>;
};

export const SubmitAuthorizationDeclineInitialState = (): SubmitAuthorizationDeclineState => ({
    payments: {},
});

export const evolve = (
    state: SubmitAuthorizationDeclineState,
    event: Day12Events,
): SubmitAuthorizationDeclineState => {
    switch (event.type) {
        case 'PaymentRequested':
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {declined: false},
                },
            };

        case 'AuthorizationDeclined': {
            const payment = state.payments[event.data.paymentId];
            if (!payment) return state;
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {...payment, declined: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: SubmitAuthorizationDeclineCommand,
    state: SubmitAuthorizationDeclineState,
): Day12Events[] => {
    const {paymentId, declineReason, declineCode, cardBrand, maskedCardNumber, declinedAt} = command.data;

    const payment = state.payments[paymentId];

    if (!payment) {
        throw {
            code: 'unknown_payment',
            message: `No payment was requested with paymentId ${paymentId} - the callback cannot be matched`,
        };
    }

    if (payment.declined) {
        throw {
            code: 'decline_replayed',
            message: `Payment ${paymentId} was already declined`,
        };
    }

    return [{
        type: 'AuthorizationDeclined',
        data: {
            paymentId,
            declineReason,
            declineCode,
            cardBrand,
            maskedCardNumber,
            declinedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const SubmitAuthorizationDeclineCommandHandler = CommandHandler<
    SubmitAuthorizationDeclineState,
    Day12Events
>({
    evolve,
    initialState: SubmitAuthorizationDeclineInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleSubmitAuthorizationDecline = async (
    tableNumber: string,
    command: SubmitAuthorizationDeclineCommand,
) => {
    const eventStore = await findEventstore();
    const result = await SubmitAuthorizationDeclineCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: SubmitAuthorizationDeclineState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
