import {DeciderSpecification} from '@event-driven-io/emmett';
import {describe, it} from 'node:test';
import {
    SendReservationConfirmationCommand,
    SendReservationConfirmationInitialState,
    decide,
    evolve,
} from './SendReservationConfirmationCommand';

describe('SendReservationConfirmation Specification', () => {
    const given = DeciderSpecification.for({
        decide,
        evolve,
        initialState: SendReservationConfirmationInitialState,
    });

    const SENT_AT = '10.09.2026 14:32';

    const command = (): SendReservationConfirmationCommand => ({
        type: 'SendReservationConfirmation',
        data: {
            reservationCode: 'R-7K2Q',
            eMail: 'max.mustermann@gmx.de',
            date: '15.04.2026',
            startTime: '19:00',
            endTime: '21:00',
            numberOfPeople: '4',
        },
        metadata: {sentAt: SENT_AT},
    });

    const placed = {
        type: 'ReservationPlaced' as const,
        data: {
            reservationCode: 'R-7K2Q',
            eMail: 'max.mustermann@gmx.de',
            date: '15.04.2026',
            startTime: '19:00',
            endTime: '21:00',
            numberOfPeople: '4',
        },
        metadata: {},
    };

    it('spec: Send the confirmation e-mail', () => {
        given([placed])
            .when(command())
            .then([{
                type: 'ReservationConfirmationSent',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    sentAt: SENT_AT,
                },
                metadata: {},
            }]);
    });

    it('spec: Reject sending a confirmation twice', () => {
        given([
            placed,
            {
                type: 'ReservationConfirmationSent',
                data: {
                    reservationCode: 'R-7K2Q',
                    eMail: 'max.mustermann@gmx.de',
                    sentAt: SENT_AT,
                },
                metadata: {},
            },
        ])
            .when(command())
            .thenThrows((error: any) => error.code === 'confirmation_already_sent');
    });
});
