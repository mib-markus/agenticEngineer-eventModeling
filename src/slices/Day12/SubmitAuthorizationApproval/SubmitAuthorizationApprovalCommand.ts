import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day12Events} from '../Day12Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

// The five data fields are exactly commands[0].fields. Every one is
// `external:PSP webhook payload.*` — this command is the payment provider's
// callback, not a user action, so `routes.ts` maps them straight off the webhook
// body and stamps nothing itself.
export type SubmitAuthorizationApprovalCommand = Command<'SubmitAuthorizationApproval', {
    paymentId: string;
    authorizationCode: string;
    cardBrand: string;
    maskedCardNumber: string;
    approvedAt: string;
}, {
    correlation_id?: string;
    causation_id?: string;
}>;

// Same Day12-table-{tableNumber} stream as RequestPayment/PayOrder: the callback has
// to see the PaymentRequested it answers, and whether that same paymentId was already
// authorized. The command itself carries only paymentId, so routes.ts resolves the
// table via PaymentLookupProjection before this handler runs.
type PaymentState = {
    // From the PaymentRequested this callback answers. The emitted event's
    // `authorizedAmount` is not a command field, so it is read back off replayed
    // state — the amount the provider authorized is the total that was requested.
    requestedTotal: string;
    approved: boolean;
};

export type SubmitAuthorizationApprovalState = {
    payments: Record<string, PaymentState>;
};

export const SubmitAuthorizationApprovalInitialState = (): SubmitAuthorizationApprovalState => ({
    payments: {},
});

export const evolve = (
    state: SubmitAuthorizationApprovalState,
    event: Day12Events,
): SubmitAuthorizationApprovalState => {
    switch (event.type) {
        case 'PaymentRequested':
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {
                        requestedTotal: event.data.totalAmount,
                        approved: false,
                    },
                },
            };

        case 'AuthorizationApproved': {
            const payment = state.payments[event.data.paymentId];
            if (!payment) return state;
            return {
                payments: {
                    ...state.payments,
                    [event.data.paymentId]: {...payment, approved: true},
                },
            };
        }

        default:
            return state;
    }
};

export const decide = (
    command: SubmitAuthorizationApprovalCommand,
    state: SubmitAuthorizationApprovalState,
): Day12Events[] => {
    const {paymentId, authorizationCode, cardBrand, maskedCardNumber, approvedAt} = command.data;

    const payment = state.payments[paymentId];

    if (!payment) {
        throw {
            code: 'unknown_payment',
            message: `No payment was requested with paymentId ${paymentId} - the callback cannot be matched`,
        };
    }

    if (payment.approved) {
        throw {
            code: 'authorization_replayed',
            message: `Payment ${paymentId} was already authorized`,
        };
    }

    return [{
        type: 'AuthorizationApproved',
        data: {
            paymentId,
            authorizationCode,
            cardBrand,
            maskedCardNumber,
            authorizedAmount: payment.requestedTotal,
            approvedAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const SubmitAuthorizationApprovalCommandHandler = CommandHandler<
    SubmitAuthorizationApprovalState,
    Day12Events
>({
    evolve,
    initialState: SubmitAuthorizationApprovalInitialState,
});

export const streamNameFor = (tableNumber: string) => `Day12-table-${tableNumber}`;

export const handleSubmitAuthorizationApproval = async (
    tableNumber: string,
    command: SubmitAuthorizationApprovalCommand,
) => {
    const eventStore = await findEventstore();
    const result = await SubmitAuthorizationApprovalCommandHandler(
        eventStore,
        streamNameFor(tableNumber),
        (state: SubmitAuthorizationApprovalState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
