import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day7Events} from '../Day7Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type SendNoShowNotificationCommand = Command<'SendNoShowNotification', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
}, {
    // sentAt is `generated: true` on the event: the caller stamps it so `decide` stays
    // pure and the tests can assert an exact value.
    sentAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

export type SendNoShowNotificationState = {
    sent: Record<string, true>;
};

export const SendNoShowNotificationInitialState = (): SendNoShowNotificationState => ({sent: {}});

export const evolve = (
    state: SendNoShowNotificationState,
    event: Day7Events,
): SendNoShowNotificationState => {
    switch (event.type) {
        case 'NoShowNotificationSent':
            return {sent: {...state.sent, [event.data.reservationCode]: true}};
        default:
            return state;
    }
};

export const decide = (
    command: SendNoShowNotificationCommand,
    state: SendNoShowNotificationState,
): Day7Events[] => {
    const {reservationCode, eMail} = command.data;

    // The reactor delivers at least once, so a redelivery must not send a second e-mail —
    // this check is what makes the automation idempotent.
    if (state.sent[reservationCode]) {
        throw {
            code: 'notification_already_sent',
            message: `A no-show notification for ${reservationCode} has already been sent`,
        };
    }

    return [{
        type: 'NoShowNotificationSent',
        data: {
            reservationCode,
            eMail,
            sentAt: command.metadata.sentAt,
        },
        metadata: {
            correlation_id: command.metadata?.correlation_id,
            causation_id: command.metadata?.causation_id,
        },
    }];
};

const SendNoShowNotificationCommandHandler =
    CommandHandler<SendNoShowNotificationState, Day7Events>({
        evolve,
        initialState: SendNoShowNotificationInitialState,
    });

// The guest's Day6 stream — where the release this notice follows was appended.
export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleSendNoShowNotification = async (
    eMail: string,
    command: SendNoShowNotificationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await SendNoShowNotificationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: SendNoShowNotificationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
