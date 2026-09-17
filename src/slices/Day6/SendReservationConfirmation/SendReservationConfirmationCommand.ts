import type {Command} from '@event-driven-io/emmett';
import {CommandHandler} from '@event-driven-io/emmett';
import {type Day6Events} from '../Day6Events';
import {findEventstore} from '../../../common/loadPostgresEventstore';

export type SendReservationConfirmationCommand = Command<'SendReservationConfirmation', {
    reservationCode: string;
    eMail: string;
    date: string;
    startTime: string;
    endTime: string;
    numberOfPeople: string;
}, {
    // sentAt is `generated: true` on the event: the caller stamps it so `decide` stays
    // pure and the tests can assert an exact value.
    sentAt: string;
    correlation_id?: string;
    causation_id?: string;
}>;

export type SendReservationConfirmationState = {
    sent: Record<string, true>;
};

export const SendReservationConfirmationInitialState = (): SendReservationConfirmationState => ({sent: {}});

export const evolve = (
    state: SendReservationConfirmationState,
    event: Day6Events,
): SendReservationConfirmationState => {
    switch (event.type) {
        case 'ReservationConfirmationSent':
            return {sent: {...state.sent, [event.data.reservationCode]: true}};
        default:
            return state;
    }
};

export const decide = (
    command: SendReservationConfirmationCommand,
    state: SendReservationConfirmationState,
): Day6Events[] => {
    const {reservationCode, eMail} = command.data;

    // The reactor delivers at least once, so a redelivery must not send a second
    // e-mail — this check is what makes the automation idempotent.
    if (state.sent[reservationCode]) {
        throw {
            code: 'confirmation_already_sent',
            message: `A confirmation for ${reservationCode} has already been sent`,
        };
    }

    return [{
        type: 'ReservationConfirmationSent',
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

const SendReservationConfirmationCommandHandler =
    CommandHandler<SendReservationConfirmationState, Day6Events>({
        evolve,
        initialState: SendReservationConfirmationInitialState,
    });

export const streamNameFor = (eMail: string) => `Day6-${eMail}`;

export const handleSendReservationConfirmation = async (
    eMail: string,
    command: SendReservationConfirmationCommand,
) => {
    const eventStore = await findEventstore();
    const result = await SendReservationConfirmationCommandHandler(
        eventStore,
        streamNameFor(eMail),
        (state: SendReservationConfirmationState) => decide(command, state),
    );
    return {
        nextExpectedStreamVersion: result.nextExpectedStreamVersion,
        lastEventGlobalPosition: result.lastEventGlobalPosition,
    };
};
